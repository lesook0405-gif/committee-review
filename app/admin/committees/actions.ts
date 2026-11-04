"use server";
// Design Ref: §7 서버 처리 — "위원회 등록·평가 방식 수정 | 담당 팀원 | 잠김이면 거부, 항목 ≤10, 배점 양의 정수, 기준 점수 0~합계 정수"
// 모든 처리는 첫 줄에서 담당 팀원인지 확인한다. (팀장은 열람만)
import { redirect } from "next/navigation";

import { editorDenial } from "@/lib/auth/session";
import { createCommittee, updateScoring } from "@/lib/db/committees";
import { committeeCreateSchema, issueMessages, readScoringForm, scoringSchema } from "@/lib/rules/committee";

export type FormState = { errors: string[]; saved?: boolean };

/** 위원회 등록 */
export async function createCommitteeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };

  const parsed = committeeCreateSchema.safeParse(readScoringForm(formData));
  if (!parsed.success) return { errors: issueMessages(parsed.error) };

  const id = await createCommittee(parsed.data);
  redirect(`/admin/committees/${id}`);
}

/** 평가 방식 수정 (잠기지 않은 위원회만) */
export async function updateScoringAction(committeeId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };

  const parsed = scoringSchema.safeParse(readScoringForm(formData));
  if (!parsed.success) return { errors: issueMessages(parsed.error) };

  const result = await updateScoring(committeeId, parsed.data);
  if (result === "locked") {
    return { errors: ["이 위원회는 첫 평가가 제출되어 평가 방식이 잠겼습니다. 더 이상 바꿀 수 없습니다."] };
  }
  if (result === "not-found") return { errors: ["위원회를 찾을 수 없습니다."] };
  return { errors: [], saved: true };
}
