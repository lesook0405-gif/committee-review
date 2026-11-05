// Design Ref: §3.2 ⑤ 집계 결과 / §7 "결과 조회 | 담당 팀원·팀장 | 마감 후만. 위원 링크로는 거부"
// PRD: 결과는 담당 팀원과 팀장만 보며, 평가를 마감한 뒤에만 열린다.
// 마감 전에는 평가 점수를 읽는 조회 자체를 하지 않는다(화면에서 숨기는 것만으로 끝내지 않고, 점수가 이 함수 밖으로 나가지 않게 한다).
// 호출하는 화면(app/admin/...)이 로그인한 담당 팀원·팀장인지 먼저 확인한다. 위원 링크 화면(app/m/...)은 이 함수를 부르지 않는다.
import "server-only";

import { buildAgendaResult, type AgendaResult } from "@/lib/rules/results";

import { getCommittee } from "./committees";
import { getMeeting } from "./meetings";
import { createAdminClient } from "./supabase";

export type AgendaResultView = { agendaId: string; position: number; title: string; result: AgendaResult };

export type MeetingResults =
  | { kind: "not-found" }
  | { kind: "not-closed" }
  | {
      kind: "ok";
      meeting: { id: string; title: string; startsAt: string; closedAt: string | null; committeeName: string };
      criteria: { name: string; maxScore: number }[];
      passScore: number;
      excludeExtremes: boolean;
      agendas: AgendaResultView[];
    };

export async function getMeetingResults(meetingId: string): Promise<MeetingResults> {
  const meeting = await getMeeting(meetingId);
  if (!meeting) return { kind: "not-found" };
  if (meeting.status !== "closed") return { kind: "not-closed" }; // 여기서 끝 — 점수는 읽지 않는다

  const committee = await getCommittee(meeting.committeeId);
  if (!committee) return { kind: "not-found" };

  const db = createAdminClient();
  const { data: agendas, error: e1 } = await db.from("agendas").select("id, position, title").eq("meeting_id", meetingId).order("position");
  if (e1) throw new Error(`안건을 불러오지 못했습니다. (${e1.message})`);
  const ids = (agendas ?? []).map((a) => a.id);

  const [참석, 제척, 평가] = await Promise.all([
    db.from("meeting_members").select("member_id, removed_at, members(name)").eq("meeting_id", meetingId),
    ids.length ? db.from("recusals").select("agenda_id, member_id").in("agenda_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? db.from("evaluations").select("agenda_id, member_id, scores, total, is_proxy").in("agenda_id", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  const 오류 = 참석.error ?? 제척.error ?? 평가.error;
  if (오류) throw new Error(`집계 결과를 불러오지 못했습니다. (${오류.message})`);

  const participants = (참석.data ?? []).map((p) => ({ memberId: p.member_id, name: p.members?.name ?? "", removed: p.removed_at !== null }));

  return {
    kind: "ok",
    meeting: { id: meeting.id, title: meeting.title, startsAt: meeting.startsAt, closedAt: meeting.closedAt, committeeName: meeting.committeeName },
    criteria: committee.criteria,
    passScore: committee.passScore,
    excludeExtremes: committee.excludeExtremes,
    agendas: (agendas ?? []).map((a) => ({
      agendaId: a.id,
      position: a.position,
      title: a.title,
      result: buildAgendaResult({
        participants,
        recusedMemberIds: (제척.data ?? []).filter((r) => r.agenda_id === a.id).map((r) => r.member_id),
        evaluations: (평가.data ?? [])
          .filter((e) => e.agenda_id === a.id)
          .map((e) => ({
            memberId: e.member_id,
            scores: Array.isArray(e.scores) ? e.scores.filter((v): v is number => typeof v === "number") : [],
            total: e.total,
            isProxy: e.is_proxy,
          })),
        passScore: committee.passScore,
        excludeExtremes: committee.excludeExtremes,
      }),
    })),
  };
}
