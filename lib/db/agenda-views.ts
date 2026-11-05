// Design Ref: §6.2 agenda_views — 안건 + 위원 조합당 1개, 처음 연 시각만 남긴다 (안건 교체 시 삭제는 PLAN 작업 14)
// Design Ref: §5.3 — "열람 N / M", "회의 전 열람 N / M" 계산에 필요한 기록을 모아 lib/rules/status.ts로 넘긴다.
import "server-only";

import { agendaViewCounts, eligibleMemberIds, type ViewCounts } from "@/lib/rules/status";

import { createAdminClient } from "./supabase";

/** 첫 열람 기록 — 이미 연 적이 있으면 처음 시각을 그대로 둔다 (다시 열어도 바뀌지 않음) */
export async function recordFirstView(agendaId: string, memberId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("agenda_views")
    .upsert({ agenda_id: agendaId, member_id: memberId }, { onConflict: "agenda_id,member_id", ignoreDuplicates: true });
  if (error) throw new Error(`열람 기록을 남기지 못했습니다. (${error.message})`);
}

/** 회의의 안건별 열람 현황 (안건 ID → 열람 N / 회의 전 열람 N / M) */
export async function listAgendaViewCounts(meetingId: string, startsAt: string, agendaIds: readonly string[]): Promise<Map<string, ViewCounts>> {
  const result = new Map<string, ViewCounts>();
  if (agendaIds.length === 0) return result;

  const db = createAdminClient();
  const [참석, 제척, 열람] = await Promise.all([
    db.from("meeting_members").select("member_id").eq("meeting_id", meetingId).is("removed_at", null),
    db.from("recusals").select("agenda_id, member_id").in("agenda_id", agendaIds),
    db.from("agenda_views").select("agenda_id, member_id, first_viewed_at").in("agenda_id", agendaIds),
  ]);
  const 오류 = 참석.error ?? 제척.error ?? 열람.error;
  if (오류) throw new Error(`열람 현황을 불러오지 못했습니다. (${오류.message})`);

  const 참석_위원 = (참석.data ?? []).map((p) => p.member_id);
  for (const agendaId of agendaIds) {
    const 대상 = eligibleMemberIds(
      참석_위원,
      (제척.data ?? []).filter((r) => r.agenda_id === agendaId).map((r) => r.member_id),
    );
    result.set(
      agendaId,
      agendaViewCounts({
        eligibleMemberIds: 대상,
        views: (열람.data ?? []).filter((v) => v.agenda_id === agendaId).map((v) => ({ memberId: v.member_id, firstViewedAt: v.first_viewed_at })),
        startsAt,
      }),
    );
  }
  return result;
}
