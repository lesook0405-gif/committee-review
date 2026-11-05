"use server";
// Design Ref: §7 서버 처리 — "대리 입력 | 담당 팀원 | 평가 대상·미제출, 회의 시작 후·마감 전, 같은 점수 검사" / "대리 입력 수정 | 담당 팀원 | 대리 입력 기록만, 마감 전"
// 화면에서 버튼을 숨기는 것과 별도로, 서버에서 담당 팀원인지 다시 확인한다(팀장·위원 링크·로그인 안 한 사람 거부).
import { refresh } from "next/cache";

import { editorDenial } from "@/lib/auth/session";
import { getCommittee } from "@/lib/db/committees";
import { saveProxyEvaluation, type ProxyResult } from "@/lib/db/evaluations";
import { getMeeting } from "@/lib/db/meetings";
import { checkScores, readScoreTexts } from "@/lib/rules/evaluation";
import { isUuid } from "@/lib/rules/ids";

export type ProxyState = {
  errors: string[];
  fieldErrors?: (string | null)[];
  saved?: boolean;
  total?: number;
};

const 안내: Record<Exclude<ProxyResult, "ok">, string> = {
  "not-found": "회의나 안건을 찾을 수 없습니다.",
  closed: "마감된 회의라 대리 입력할 수 없습니다.",
  "not-started": "회의가 시작된 뒤에 입력할 수 있습니다.",
  "not-participant": "이 회의에 참석하지 않는 위원입니다.",
  recused: "이 안건에서 제척된 위원입니다.",
  submitted: "이 위원이 앱에서 직접 제출한 평가가 있어 대리 입력할 수 없습니다.",
  "invalid-scores": "점수가 올바르지 않습니다. 각 항목의 점수를 다시 확인해 주세요.",
};

/** 대리 입력(처음) 또는 대리 입력 기록 수정 — 점수 검사는 위원 제출과 같은 규칙 */
export async function saveProxyAction(
  meetingId: string,
  agendaId: string,
  memberId: string,
  _prev: ProxyState,
  formData: FormData,
): Promise<ProxyState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };
  if (!isUuid(meetingId) || !isUuid(agendaId) || !isUuid(memberId)) return { errors: [안내["not-found"]] };

  const meeting = await getMeeting(meetingId);
  if (!meeting) return { errors: [안내["not-found"]] };
  const committee = await getCommittee(meeting.committeeId);
  if (!committee) return { errors: [안내["not-found"]] };

  const parsed = checkScores(committee.criteria, readScoreTexts(formData, committee.criteria.length));
  if (!parsed.ok) return { errors: parsed.messages, fieldErrors: parsed.fieldErrors };

  const r = await saveProxyEvaluation(meetingId, agendaId, memberId, parsed.scores);
  if (r.result !== "ok") return { errors: [안내[r.result]] };
  refresh();
  return { errors: [], saved: true, total: parsed.total };
}
