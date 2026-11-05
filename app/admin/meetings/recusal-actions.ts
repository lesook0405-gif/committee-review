"use server";
// Design Ref: §7 서버 처리 — "제척·제척 해제 | 담당 팀원 | 마감 전만"
// 화면에서 버튼을 숨기는 것과 별도로, 서버에서 담당 팀원인지 다시 확인한다(팀장·로그인 안 한 사람 거부).
import { refresh } from "next/cache";

import { editorDenial } from "@/lib/auth/session";
import { setRecusal, type RecusalResult } from "@/lib/db/recusals";
import { isUuid } from "@/lib/rules/ids";

export type RecusalState = { errors: string[] };

const 안내: Record<Exclude<RecusalResult, "ok">, string> = {
  "not-found": "회의나 안건을 찾을 수 없습니다.",
  closed: "마감된 회의라 제척 상태를 바꿀 수 없습니다.",
  "not-participant": "이 회의에 참석 중인 위원만 제척할 수 있습니다.",
};

/** 안건에서 위원 제척(recused = true) 또는 제척 해제(false) */
export async function setRecusalAction(meetingId: string, agendaId: string, memberId: string, recused: boolean): Promise<RecusalState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };
  if (!isUuid(meetingId) || !isUuid(agendaId) || !isUuid(memberId) || typeof recused !== "boolean") {
    return { errors: [안내["not-found"]] };
  }

  const result = await setRecusal(meetingId, agendaId, memberId, recused);
  if (result !== "ok") return { errors: [안내[result]] };
  refresh();
  return { errors: [] };
}
