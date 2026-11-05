// Design Ref: §6.2 recusals — 안건 + 위원 조합당 1개, 해제 = 행 삭제 (마감 전까지)
// 권한 확인은 이 함수를 부르는 서버 처리(app/admin/meetings/recusal-actions.ts)에서 먼저 한다.
import "server-only";

import { createAdminClient } from "./supabase";

export type RecusalResult = "ok" | "not-found" | "closed" | "not-participant";

/**
 * 제척 표시(recused = true) 또는 해제(false).
 * 마감 전인지·참석 중인 위원인지 확인과 저장을 데이터베이스 함수 set_recusal이 한 번에 처리한다.
 * 이미 낸 평가는 지우지 않는다 (집계에서만 빠지고, 해제하면 다시 반영된다).
 */
export async function setRecusal(meetingId: string, agendaId: string, memberId: string, recused: boolean): Promise<RecusalResult> {
  const { data, error } = await createAdminClient().rpc("set_recusal", {
    p_meeting_id: meetingId,
    p_agenda_id: agendaId,
    p_member_id: memberId,
    p_recused: recused,
  });
  if (error) throw new Error(`제척 상태를 저장하지 못했습니다. (${error.message})`);
  return (data as { result: RecusalResult }).result;
}

/** 안건별로 제척된 위원 ID 모음 (안건 ID → 위원 ID 집합) */
export async function listAgendaRecusals(agendaIds: readonly string[]): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>(agendaIds.map((id) => [id, new Set<string>()]));
  if (agendaIds.length === 0) return map;
  const { data, error } = await createAdminClient().from("recusals").select("agenda_id, member_id").in("agenda_id", agendaIds);
  if (error) throw new Error(`제척 목록을 불러오지 못했습니다. (${error.message})`);
  for (const r of data ?? []) map.get(r.agenda_id)?.add(r.member_id);
  return map;
}
