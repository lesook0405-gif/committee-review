// Design Ref: §6.2 evaluations — 위원 1명당 안건 1건에 기록 1개 / §5.2 평가 입력
// 위원 화면에서 쓰는 읽기·쓰기. 자기 기록만 다룬다 (다른 위원의 점수는 이 파일의 어떤 함수도 돌려주지 않는다).
// 권한(링크 확인)은 이 함수를 부르는 위원 화면·서버 처리(app/m/...)에서 먼저 한다.
import "server-only";

import { createAdminClient } from "./supabase";

/** 위원이 자기 안건 평가를 낼 때의 결과 (데이터베이스 함수 submit_evaluation 참고) */
export type SubmitResult = "ok" | "not-found" | "closed" | "not-started" | "not-participant" | "recused" | "proxy" | "invalid-scores";

/** 평가 제출·수정 — 시작 시각·마감·제척·대리 입력·점수 검사와 평가 방식 잠금까지 데이터베이스 함수가 한 번에 처리한다 */
export async function submitEvaluation(
  meetingId: string,
  agendaId: string,
  memberId: string,
  scores: readonly number[],
): Promise<SubmitResult> {
  const { data, error } = await createAdminClient().rpc("submit_evaluation", {
    p_meeting_id: meetingId,
    p_agenda_id: agendaId,
    p_member_id: memberId,
    p_scores: [...scores],
  });
  if (error) throw new Error(`평가를 저장하지 못했습니다. (${error.message})`);
  return (data as { result: SubmitResult }).result;
}

export type MyEvaluation = { scores: number[]; total: number; isProxy: boolean; updatedAt: string };

/** 내가 낸 평가 (없으면 null) */
export async function getMyEvaluation(agendaId: string, memberId: string): Promise<MyEvaluation | null> {
  const { data, error } = await createAdminClient()
    .from("evaluations")
    .select("scores, total, is_proxy, updated_at")
    .eq("agenda_id", agendaId)
    .eq("member_id", memberId)
    .maybeSingle();
  if (error) throw new Error(`내 평가를 불러오지 못했습니다. (${error.message})`);
  if (!data) return null;
  const scores = Array.isArray(data.scores) ? data.scores.filter((v): v is number => typeof v === "number") : [];
  return { scores, total: data.total, isProxy: data.is_proxy, updatedAt: data.updated_at };
}

/** 안건 목록에서 쓰는 내 상태: 안건별로 낸 적 있는지(대리 입력인지)와 제척 여부 */
export type MyAgendaState = { submitted: boolean; isProxy: boolean; recused: boolean };

export async function listMyAgendaStates(memberId: string, agendaIds: readonly string[]): Promise<Map<string, MyAgendaState>> {
  const states = new Map<string, MyAgendaState>(agendaIds.map((id) => [id, { submitted: false, isProxy: false, recused: false }]));
  if (agendaIds.length === 0) return states;
  const db = createAdminClient();
  const [평가, 제척] = await Promise.all([
    db.from("evaluations").select("agenda_id, is_proxy").eq("member_id", memberId).in("agenda_id", agendaIds),
    db.from("recusals").select("agenda_id").eq("member_id", memberId).in("agenda_id", agendaIds),
  ]);
  const 오류 = 평가.error ?? 제척.error;
  if (오류) throw new Error(`내 평가 상태를 불러오지 못했습니다. (${오류.message})`);
  for (const e of 평가.data ?? []) {
    const s = states.get(e.agenda_id);
    if (s) {
      s.submitted = true;
      s.isProxy = e.is_proxy;
    }
  }
  for (const r of 제척.data ?? []) {
    const s = states.get(r.agenda_id);
    if (s) s.recused = true;
  }
  return states;
}
