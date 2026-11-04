"use server";
// Design Ref: §7 서버 처리 — "회의 등록, 회의별 위원 추가·제외·재추가 | 담당 팀원 | 마감 전만" / "회의 일시 수정 | 담당 팀원 | 회의 시작 전만"
import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { editorDenial } from "@/lib/auth/session";
import { addParticipant, createMeeting, removeParticipant, updateStartsAt, type ChangeResult } from "@/lib/db/meetings";
import { issueMessages } from "@/lib/rules/committee";
import { isUuid } from "@/lib/rules/ids";
import { meetingSchema, startsAtSchema } from "@/lib/rules/meeting";

export type ActionState = { errors: string[]; saved?: boolean };

const 안내: Record<Exclude<ChangeResult, "ok">, string> = {
  "not-found": "회의를 찾을 수 없습니다.",
  closed: "마감된 회의라 바꿀 수 없습니다.",
  started: "회의가 이미 시작되어 일시를 바꿀 수 없습니다.",
  "not-member": "이 위원회 소속 위원이 아닙니다.",
};

/** 회의 등록 → 회의 상세 화면으로 */
export async function createMeetingAction(committeeId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };
  if (!isUuid(committeeId)) return { errors: ["위원회를 찾을 수 없습니다."] };

  const parsed = meetingSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
  });
  if (!parsed.success) return { errors: issueMessages(parsed.error) };

  const memberIds = formData.getAll("memberIds").map(String).filter(isUuid);
  const id = await createMeeting(committeeId, parsed.data, memberIds);
  redirect(`/admin/meetings/${id}`);
}

/** 회의 일시 수정 (회의 시작 전만) */
export async function updateStartsAtAction(meetingId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };
  if (!isUuid(meetingId)) return { errors: [안내["not-found"]] };

  const parsed = startsAtSchema.safeParse({ startsAt: String(formData.get("startsAt") ?? "") });
  if (!parsed.success) return { errors: issueMessages(parsed.error) };

  const result = await updateStartsAt(meetingId, parsed.data.startsAt, new Date());
  if (result !== "ok") return { errors: [안내[result]] };
  refresh();
  return { errors: [], saved: true };
}

/** 회의에 위원 추가 (처음 추가 또는 제외했던 위원 다시 추가) */
export async function addParticipantAction(meetingId: string, memberId: string): Promise<ActionState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };
  if (!isUuid(meetingId) || !isUuid(memberId)) return { errors: [안내["not-found"]] };

  const result = await addParticipant(meetingId, memberId);
  if (result !== "ok") return { errors: [안내[result]] };
  refresh();
  return { errors: [] };
}

/** 회의에서 위원 제외 */
export async function removeParticipantAction(meetingId: string, memberId: string): Promise<ActionState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };
  if (!isUuid(meetingId) || !isUuid(memberId)) return { errors: [안내["not-found"]] };

  const result = await removeParticipant(meetingId, memberId);
  if (result !== "ok") return { errors: [안내[result]] };
  refresh();
  return { errors: [] };
}
