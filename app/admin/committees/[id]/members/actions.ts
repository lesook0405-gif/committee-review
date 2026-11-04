"use server";
// Design Ref: §7 서버 처리 — "위원 추가·수정 | 담당 팀원 | 이름·메일·휴대폰 형식"
import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { editorDenial } from "@/lib/auth/session";
import { createMember, updateMember } from "@/lib/db/members";
import { issueMessages } from "@/lib/rules/committee";
import { isUuid } from "@/lib/rules/ids";
import { memberSchema, readMemberForm } from "@/lib/rules/member";

export type MemberFormState = { errors: string[]; saved?: boolean; savedAt?: number };

/** 위원 추가 — 성공하면 명단을 새로 그린다 */
export async function addMemberAction(committeeId: string, _prev: MemberFormState, formData: FormData): Promise<MemberFormState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };
  if (!isUuid(committeeId)) return { errors: ["위원회를 찾을 수 없습니다."] };

  const parsed = memberSchema.safeParse(readMemberForm(formData));
  if (!parsed.success) return { errors: issueMessages(parsed.error) };

  await createMember(committeeId, parsed.data);
  refresh();
  // savedAt: 화면이 "새로 저장됨"을 알아채 입력칸을 비우는 데 쓴다
  return { errors: [], saved: true, savedAt: Date.now() };
}

/** 위원 정보 수정 — 성공하면 명단 탭으로 돌아간다 */
export async function updateMemberAction(
  committeeId: string,
  memberId: string,
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };
  if (!isUuid(committeeId) || !isUuid(memberId)) return { errors: ["위원을 찾을 수 없습니다."] };

  const parsed = memberSchema.safeParse(readMemberForm(formData));
  if (!parsed.success) return { errors: issueMessages(parsed.error) };

  const updated = await updateMember(committeeId, memberId, parsed.data);
  if (!updated) return { errors: ["위원을 찾을 수 없습니다."] };
  redirect(`/admin/committees/${committeeId}?tab=members`);
}
