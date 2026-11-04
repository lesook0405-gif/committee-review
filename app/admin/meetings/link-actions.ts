"use server";
// Design Ref: §7 서버 처리 — "링크값 조회(복사) | 담당 팀원 | 팀장 거부" / "링크 발급·재발급·차단 | 담당 팀원 | 링크 만료(마감 + 7일) 전까지"
// PRD 7번: 팀장은 위원 링크를 보거나 복사할 수 없다 → 화면에서 숨기고, 여기서도 담당 팀원인지 다시 확인한다.
import { refresh } from "next/cache";

import { editorDenial } from "@/lib/auth/session";
import { blockLink, reissueLink, revealLink, type LinkChangeResult } from "@/lib/db/member-links";
import { isUuid } from "@/lib/rules/ids";

export type LinkActionState = { errors: string[]; saved?: boolean };
export type RevealState = { errors: string[]; path?: string };

const 안내: Record<Exclude<LinkChangeResult, "ok">, string> = {
  "not-found": "회의를 찾을 수 없습니다.",
  "not-member": "이 회의의 참석 위원이 아닙니다.",
  removed: "회의에서 제외된 위원이라 링크를 발급할 수 없습니다. 먼저 회의에 다시 추가해 주세요.",
  expired: "평가 마감 후 7일이 지나 링크가 만료되었습니다.",
  blocked: "이미 차단된 링크입니다. [재발급]하면 새 링크를 쓸 수 있습니다.",
  "no-link": "아직 발급된 링크가 없습니다. [링크 발급]을 눌러 주세요.",
};

/** 링크 발급·재발급 (기존 링크는 즉시 못 쓰게 되고 차단도 풀림) */
export async function reissueLinkAction(meetingId: string, memberId: string): Promise<LinkActionState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };
  if (!isUuid(meetingId) || !isUuid(memberId)) return { errors: [안내["not-found"]] };

  const result = await reissueLink(meetingId, memberId);
  if (result !== "ok") return { errors: [안내[result]] };
  refresh();
  return { errors: [], saved: true };
}

/** 링크 차단 */
export async function blockLinkAction(meetingId: string, memberId: string): Promise<LinkActionState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };
  if (!isUuid(meetingId) || !isUuid(memberId)) return { errors: [안내["not-found"]] };

  const result = await blockLink(meetingId, memberId);
  if (result !== "ok") return { errors: [안내[result]] };
  refresh();
  return { errors: [], saved: true };
}

/** 링크 복사용으로 링크 주소(/m/링크값)를 돌려준다. 화면에 미리 넣어 두지 않고 누를 때만 보낸다 */
export async function revealLinkAction(meetingId: string, memberId: string): Promise<RevealState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };
  if (!isUuid(meetingId) || !isUuid(memberId)) return { errors: [안내["not-found"]] };

  const result = await revealLink(meetingId, memberId);
  if (result.kind !== "ok") return { errors: [안내[result.kind]] };
  return { errors: [], path: `/m/${result.token}` };
}
