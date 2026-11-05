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

// ─────────────────────────────────────────────
// 담당 팀원의 대리 입력·수정 (PLAN 작업 19)
// PRD 5번: 아직 제출하지 않은 평가 대상 위원에게만, 대리 입력 기록은 담당 팀원만 마감 전까지 고칠 수 있다.
// 권한(담당 팀원) 확인은 이 함수를 부르는 서버 처리(app/admin/meetings/proxy-actions.ts)에서 먼저 한다.
// ─────────────────────────────────────────────

export type ProxyResult = "ok" | "not-found" | "closed" | "not-started" | "not-participant" | "recused" | "submitted" | "invalid-scores";

/** 대리 입력(기록이 없을 때)·수정(대리 입력 기록일 때). 위원이 직접 제출한 기록이 있으면 "submitted"로 거부된다 */
export async function saveProxyEvaluation(
  meetingId: string,
  agendaId: string,
  memberId: string,
  scores: readonly number[],
): Promise<{ result: ProxyResult; created?: boolean; total?: number }> {
  const { data, error } = await createAdminClient().rpc("save_proxy_evaluation", {
    p_meeting_id: meetingId,
    p_agenda_id: agendaId,
    p_member_id: memberId,
    p_scores: [...scores],
  });
  if (error) throw new Error(`대리 입력을 저장하지 못했습니다. (${error.message})`);
  return data as { result: ProxyResult; created?: boolean; total?: number };
}

/** 대리 입력 화면의 칸 하나: 위원이 이 안건에 낸 평가 상태 */
export type ProxyCell = {
  memberId: string;
  name: string;
  /** none = 아직 안 냄(대리 입력 가능) / submitted = 위원이 앱에서 직접 제출 / proxy = 대리 입력됨 */
  state: "none" | "submitted" | "proxy";
  /** 대리 입력 기록의 합계 (위원이 직접 낸 점수는 마감 전에 보여 주지 않으므로 null) */
  proxyTotal: number | null;
};
export type ProxyBoardAgenda = { agendaId: string; position: number; title: string; cells: ProxyCell[] };

/**
 * 안건별로 평가 대상 위원(참석 중이고 그 안건에서 제척되지 않은 위원)의 제출 상태.
 * 위원이 직접 낸 점수는 담당 팀원에게도 마감 전에는 보여 주지 않는다(결과는 마감 후에만 열린다) — 냈는지 여부만 알려 준다.
 */
export async function getProxyBoard(meetingId: string): Promise<ProxyBoardAgenda[]> {
  const db = createAdminClient();
  const { data: agendas, error: e1 } = await db.from("agendas").select("id, position, title").eq("meeting_id", meetingId).order("position");
  if (e1) throw new Error(`안건을 불러오지 못했습니다. (${e1.message})`);
  if (!agendas?.length) return [];
  const ids = agendas.map((a) => a.id);
  const [참석, 제척, 평가] = await Promise.all([
    db.from("meeting_members").select("member_id, members(name)").eq("meeting_id", meetingId).is("removed_at", null),
    db.from("recusals").select("agenda_id, member_id").in("agenda_id", ids),
    db.from("evaluations").select("agenda_id, member_id, is_proxy, total").in("agenda_id", ids),
  ]);
  const 오류 = 참석.error ?? 제척.error ?? 평가.error;
  if (오류) throw new Error(`제출 상태를 불러오지 못했습니다. (${오류.message})`);

  const 위원들 = (참석.data ?? [])
    .map((p) => ({ memberId: p.member_id, name: p.members?.name ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return agendas.map((a) => ({
    agendaId: a.id,
    position: a.position,
    title: a.title,
    cells: 위원들
      .filter((m) => !(제척.data ?? []).some((r) => r.agenda_id === a.id && r.member_id === m.memberId))
      .map((m) => {
        const e = (평가.data ?? []).find((x) => x.agenda_id === a.id && x.member_id === m.memberId);
        return {
          memberId: m.memberId,
          name: m.name,
          state: !e ? ("none" as const) : e.is_proxy ? ("proxy" as const) : ("submitted" as const),
          proxyTotal: e?.is_proxy ? e.total : null,
        };
      }),
  }));
}

/** 대리 입력 기록의 점수 (고치기 화면용). 위원이 직접 낸 기록은 돌려주지 않는다 */
export async function getProxyScores(agendaId: string, memberId: string): Promise<number[] | null> {
  const { data, error } = await createAdminClient()
    .from("evaluations")
    .select("scores, is_proxy")
    .eq("agenda_id", agendaId)
    .eq("member_id", memberId)
    .maybeSingle();
  if (error) throw new Error(`대리 입력 기록을 불러오지 못했습니다. (${error.message})`);
  if (!data || !data.is_proxy || !Array.isArray(data.scores)) return null;
  return data.scores.filter((v): v is number => typeof v === "number");
}
