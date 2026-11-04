// Design Ref: §6.2 meetings · meeting_members 읽기·쓰기 / §5.2 회의 등록·일시 수정·위원 제외·다시 추가
// 권한 확인은 이 함수를 부르는 서버 처리(app/admin/meetings/actions.ts)에서 먼저 한다.
import "server-only";

import type { MeetingInput } from "@/lib/rules/meeting";

import { createAdminClient } from "./supabase";

export type MeetingStatus = "open" | "closed";

export type MeetingSummary = {
  id: string;
  title: string;
  startsAt: string;
  status: MeetingStatus;
  participantCount: number;
};

export type MeetingDetail = {
  id: string;
  committeeId: string;
  committeeName: string;
  title: string;
  startsAt: string;
  status: MeetingStatus;
  closedAt: string | null;
};

/** 회의 참석 상태: 참석 / 이 회의에서 제외됨 / 아직 추가 안 함 */
export type ParticipantState = "participating" | "removed" | "not-added";

export type ParticipantRow = {
  memberId: string;
  name: string;
  email: string;
  state: ParticipantState;
};

const asStatus = (value: string): MeetingStatus => (value === "closed" ? "closed" : "open");

/** 위원회의 회의 목록 (일시 순) */
export async function listMeetings(committeeId: string): Promise<MeetingSummary[]> {
  const { data, error } = await createAdminClient()
    .from("meetings")
    .select("id, title, starts_at, status, meeting_members(removed_at)")
    .eq("committee_id", committeeId)
    .order("starts_at");
  if (error) throw new Error(`회의 목록을 불러오지 못했습니다. (${error.message})`);
  return data.map((m) => ({
    id: m.id,
    title: m.title,
    startsAt: m.starts_at,
    status: asStatus(m.status),
    participantCount: (m.meeting_members ?? []).filter((p) => p.removed_at === null).length,
  }));
}

/** 회의 하나 (없으면 null) */
export async function getMeeting(meetingId: string): Promise<MeetingDetail | null> {
  const { data, error } = await createAdminClient()
    .from("meetings")
    .select("id, committee_id, title, starts_at, status, closed_at, committees(name)")
    .eq("id", meetingId)
    .maybeSingle();
  if (error) throw new Error(`회의를 불러오지 못했습니다. (${error.message})`);
  if (!data) return null;
  return {
    id: data.id,
    committeeId: data.committee_id,
    committeeName: data.committees?.name ?? "",
    title: data.title,
    startsAt: data.starts_at,
    status: asStatus(data.status),
    closedAt: data.closed_at,
  };
}

/** 위원회 위원 전체와, 이 회의에서의 참석 상태 */
export async function listParticipants(meeting: Pick<MeetingDetail, "id" | "committeeId">): Promise<ParticipantRow[]> {
  const db = createAdminClient();
  const [{ data: members, error: e1 }, { data: links, error: e2 }] = await Promise.all([
    db.from("members").select("id, name, email").eq("committee_id", meeting.committeeId).order("name"),
    db.from("meeting_members").select("member_id, removed_at").eq("meeting_id", meeting.id),
  ]);
  if (e1 || e2) throw new Error(`참석 위원을 불러오지 못했습니다. (${(e1 ?? e2)!.message})`);
  const byMember = new Map(links.map((l) => [l.member_id, l]));
  return members.map((m) => {
    const link = byMember.get(m.id);
    const state: ParticipantState = !link ? "not-added" : link.removed_at ? "removed" : "participating";
    return { memberId: m.id, name: m.name, email: m.email, state };
  });
}

/** 회의 등록 — 고른 위원(그 위원회 소속만)을 참석 위원으로 함께 넣는다. 새 회의 ID */
export async function createMeeting(committeeId: string, input: MeetingInput, memberIds: string[]): Promise<string> {
  const db = createAdminClient();
  const { data: meeting, error } = await db
    .from("meetings")
    .insert({ committee_id: committeeId, title: input.title, starts_at: input.startsAt })
    .select("id")
    .single();
  if (error) throw new Error(`회의를 저장하지 못했습니다. (${error.message})`);

  if (memberIds.length > 0) {
    // 다른 위원회 위원 ID가 섞여 들어와도 이 위원회 소속만 남긴다
    const { data: valid } = await db.from("members").select("id").eq("committee_id", committeeId).in("id", memberIds);
    const rows = (valid ?? []).map((m) => ({ meeting_id: meeting.id, member_id: m.id }));
    if (rows.length > 0) {
      const { error: e2 } = await db.from("meeting_members").insert(rows);
      if (e2) throw new Error(`참석 위원을 저장하지 못했습니다. (${e2.message})`);
    }
  }
  return meeting.id;
}

export type ChangeResult = "ok" | "not-found" | "closed" | "started" | "not-member";

/**
 * 회의 일시 수정 — 진행 중이고 아직 시작 전인 회의만.
 * "시작 전·진행 중일 때만" 조건을 저장 명령에 넣어, 확인과 저장 사이에 시각이 지나도 바뀌지 않게 한다.
 */
export async function updateStartsAt(meetingId: string, startsAt: string, now: Date): Promise<ChangeResult> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("meetings")
    .update({ starts_at: startsAt })
    .eq("id", meetingId)
    .eq("status", "open")
    .gt("starts_at", now.toISOString())
    .select("id");
  if (error) throw new Error(`회의 일시를 저장하지 못했습니다. (${error.message})`);
  if (data.length > 0) return "ok";

  const meeting = await getMeeting(meetingId);
  if (!meeting) return "not-found";
  return meeting.status === "closed" ? "closed" : "started";
}

// 진행 중인 회의인지, 그 위원이 같은 위원회 소속인지 확인
async function 바꿀_수_있는지(meetingId: string, memberId: string): Promise<ChangeResult> {
  const meeting = await getMeeting(meetingId);
  if (!meeting) return "not-found";
  if (meeting.status === "closed") return "closed";
  const { data: member } = await createAdminClient()
    .from("members")
    .select("id")
    .eq("id", memberId)
    .eq("committee_id", meeting.committeeId)
    .maybeSingle();
  return member ? "ok" : "not-member";
}

/**
 * 회의에 위원 추가 — 처음이면 새로 넣고, 제외했던 위원이면 같은 기록을 되살린다(제외 시각을 지움).
 * 되살리면 그 위원이 이미 낸 평가는 다시 집계에 반영된다. (링크 새로 발급은 작업 11에서 연결)
 */
export async function addParticipant(meetingId: string, memberId: string): Promise<ChangeResult> {
  const check = await 바꿀_수_있는지(meetingId, memberId);
  if (check !== "ok") return check;
  const { error } = await createAdminClient()
    .from("meeting_members")
    .upsert({ meeting_id: meetingId, member_id: memberId, removed_at: null }, { onConflict: "meeting_id,member_id" });
  if (error) throw new Error(`참석 위원을 추가하지 못했습니다. (${error.message})`);
  return "ok";
}

/**
 * 회의에서 위원 제외 — 기록은 지우지 않고 제외 시각만 남긴다.
 * 이미 낸 평가는 남아 있지만 집계·분모에서 빠지고, 링크 접속은 막힌다. (접속 확인은 작업 12)
 */
export async function removeParticipant(meetingId: string, memberId: string): Promise<ChangeResult> {
  const check = await 바꿀_수_있는지(meetingId, memberId);
  if (check !== "ok") return check;
  const { data, error } = await createAdminClient()
    .from("meeting_members")
    .update({ removed_at: new Date().toISOString() })
    .eq("meeting_id", meetingId)
    .eq("member_id", memberId)
    .is("removed_at", null)
    .select("id");
  if (error) throw new Error(`참석 위원을 제외하지 못했습니다. (${error.message})`);
  return data.length > 0 ? "ok" : "not-member";
}
