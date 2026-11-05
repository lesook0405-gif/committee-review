// Design Ref: §5.3 제출 현황 — "제출 N / M"(안건별)과 "미제출 N명"(회의 전체).
// 기록을 모아 lib/rules/status.ts의 규칙으로 센다. 마감 가능 여부는 데이터베이스 함수 close_meeting이 같은 정의로 다시 확인한다.
import "server-only";

import { agendaSubmissionCounts, eligibleMemberIds, missingMemberIds, type SubmissionCounts } from "@/lib/rules/status";

import { createAdminClient } from "./supabase";

export type SubmissionStatus = {
  /** 안건 ID → 제출 N / M */
  perAgenda: Map<string, SubmissionCounts>;
  /** 한 안건이라도 제출하지 않은 평가 대상 위원 (이름순) */
  missing: { memberId: string; name: string }[];
};

export async function getSubmissionStatus(meetingId: string, agendaIds: readonly string[]): Promise<SubmissionStatus> {
  const perAgenda = new Map<string, SubmissionCounts>();
  if (agendaIds.length === 0) return { perAgenda, missing: [] };

  const db = createAdminClient();
  const [참석, 제척, 평가] = await Promise.all([
    db.from("meeting_members").select("member_id, members(name)").eq("meeting_id", meetingId).is("removed_at", null),
    db.from("recusals").select("agenda_id, member_id").in("agenda_id", agendaIds),
    db.from("evaluations").select("agenda_id, member_id").in("agenda_id", agendaIds),
  ]);
  const 오류 = 참석.error ?? 제척.error ?? 평가.error;
  if (오류) throw new Error(`제출 현황을 불러오지 못했습니다. (${오류.message})`);

  const 이름 = new Map((참석.data ?? []).map((p) => [p.member_id, p.members?.name ?? ""]));
  const 참석_위원 = [...이름.keys()];
  const 안건별 = agendaIds.map((agendaId) => ({
    agendaId,
    eligibleMemberIds: eligibleMemberIds(
      참석_위원,
      (제척.data ?? []).filter((r) => r.agenda_id === agendaId).map((r) => r.member_id),
    ),
    evaluatedMemberIds: (평가.data ?? []).filter((e) => e.agenda_id === agendaId).map((e) => e.member_id),
  }));
  for (const a of 안건별) perAgenda.set(a.agendaId, agendaSubmissionCounts(a));

  const missing = missingMemberIds(안건별)
    .map((memberId) => ({ memberId, name: 이름.get(memberId) ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return { perAgenda, missing };
}
