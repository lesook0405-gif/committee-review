"use server";
// Design Ref: §7 서버 처리 — "평가 제출·수정 | 위원(링크) | 링크 유효, 제척 아님, 회의 시작 후, 마감 전, 대리 입력 기록 아님, 정수·범위·빈칸"
// 위원은 로그인하지 않으므로, 제출할 때마다 링크값으로 위원 본인을 다시 확인한다. 위원 ID는 화면이 보낸 값이 아니라 링크에서 얻는다.
// (그래서 다른 위원 이름으로 점수를 낼 수 없다.)
import { refresh } from "next/cache";

import { resolveMemberLink, LINK_DENIAL_MESSAGE } from "@/lib/auth/member-link";
import { getMeetingAgenda } from "@/lib/db/agendas";
import { getCommittee } from "@/lib/db/committees";
import { submitEvaluation, type SubmitResult } from "@/lib/db/evaluations";
import { checkScores, readScoreTexts } from "@/lib/rules/evaluation";
import { isUuid } from "@/lib/rules/ids";

export type EvaluationState = {
  errors: string[];
  /** 칸별 안내 (항목 순서, 문제 없는 칸은 null) */
  fieldErrors?: (string | null)[];
  saved?: boolean;
  total?: number;
};

const 안내: Record<Exclude<SubmitResult, "ok">, string> = {
  "not-found": "이 회의의 안건을 찾을 수 없습니다.",
  closed: "마감된 회의라 점수를 바꿀 수 없습니다.",
  "not-started": "회의가 시작된 뒤에 평가할 수 있습니다.",
  "not-participant": "이 회의에 참석하지 않는 것으로 변경되어 평가할 수 없습니다.",
  recused: "이 안건은 제척되어 평가할 수 없습니다.",
  proxy: "담당자가 대리 입력한 평가라 직접 고칠 수 없습니다. 고쳐야 하면 담당자에게 요청하세요.",
  "invalid-scores": "점수가 올바르지 않습니다. 각 항목의 점수를 다시 확인해 주세요.",
};

export async function submitEvaluationAction(
  token: string,
  agendaId: string,
  _prev: EvaluationState,
  formData: FormData,
): Promise<EvaluationState> {
  if (typeof token !== "string" || !isUuid(agendaId)) return { errors: [안내["not-found"]] };
  const check = await resolveMemberLink(token);
  if (!check.ok) return { errors: [LINK_DENIAL_MESSAGE[check.reason]] };
  const { meeting, memberId } = check.access;

  const agenda = await getMeetingAgenda(meeting.id, agendaId);
  if (!agenda) return { errors: [안내["not-found"]] };
  const committee = await getCommittee(meeting.committeeId);
  if (!committee) return { errors: [안내["not-found"]] };

  // 점수 검사 (화면의 실시간 검사와 같은 규칙, 서버에서 다시)
  const parsed = checkScores(committee.criteria, readScoreTexts(formData, committee.criteria.length));
  if (!parsed.ok) return { errors: parsed.messages, fieldErrors: parsed.fieldErrors };

  const result = await submitEvaluation(meeting.id, agenda.id, memberId, parsed.scores);
  if (result !== "ok") return { errors: [안내[result]] };
  refresh();
  return { errors: [], saved: true, total: parsed.total };
}
