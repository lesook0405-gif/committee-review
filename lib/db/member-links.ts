// Design Ref: §5.2 링크 재발급·차단 — "담당 팀원·링크 만료 전(마감 + 7일 이내) 확인 → 재발급: 회의에서 제외된 위원이면 거부,
//   새 값 생성 후 기존 값 무효, 차단 시각 지움 / 차단: 차단 시각 기록"
// Design Ref: §7 — 링크값 조회(복사)는 담당 팀원만. 권한 확인은 이 함수를 부르는 서버 처리에서 먼저 한다.
import "server-only";

import { decryptLinkToken, isLinkExpired } from "@/lib/rules/member-link";

import { memberLinkSecret, newLinkFields } from "./link-fields";
import { getMeeting } from "./meetings";
import { createAdminClient } from "./supabase";

export type LinkChangeResult = "ok" | "not-found" | "not-member" | "removed" | "expired" | "blocked" | "no-link";

// 회의가 있고 링크 만료 전인지, 그 위원이 이 회의 참석 기록이 있는지
async function 링크_기록(meetingId: string, memberId: string) {
  const meeting = await getMeeting(meetingId);
  if (!meeting) return { result: "not-found" as const };
  if (isLinkExpired(meeting.closedAt, new Date())) return { result: "expired" as const };
  const { data: row } = await createAdminClient()
    .from("meeting_members")
    .select("id, link_ciphertext, blocked_at, removed_at")
    .eq("meeting_id", meetingId)
    .eq("member_id", memberId)
    .maybeSingle();
  if (!row) return { result: "not-member" as const };
  if (row.removed_at) return { result: "removed" as const };
  return { result: "ok" as const, row };
}

/** 링크 발급·재발급 — 새 값으로 바꾸므로 기존 링크는 바로 못 쓰고, 차단도 풀린다. 회의에서 제외된 위원은 거부 */
export async function reissueLink(meetingId: string, memberId: string): Promise<LinkChangeResult> {
  const check = await 링크_기록(meetingId, memberId);
  if (check.result !== "ok") return check.result;
  const { data, error } = await createAdminClient()
    .from("meeting_members")
    .update(newLinkFields())
    .eq("id", check.row.id)
    .is("removed_at", null) // 확인과 저장 사이에 제외됐으면 바꾸지 않는다
    .select("id");
  if (error) throw new Error(`링크를 발급하지 못했습니다. (${error.message})`);
  return data.length > 0 ? "ok" : "removed";
}

/** 링크 차단 — 차단 시각을 남겨 그 링크로 접속하지 못하게 한다 (재발급하면 새 링크는 쓸 수 있음) */
export async function blockLink(meetingId: string, memberId: string): Promise<LinkChangeResult> {
  const check = await 링크_기록(meetingId, memberId);
  if (check.result !== "ok") return check.result;
  if (!check.row.link_ciphertext) return "no-link";
  if (check.row.blocked_at) return "blocked";
  const { error } = await createAdminClient()
    .from("meeting_members")
    .update({ blocked_at: new Date().toISOString() })
    .eq("id", check.row.id);
  if (error) throw new Error(`링크를 차단하지 못했습니다. (${error.message})`);
  return "ok";
}

export type RevealResult = { kind: "ok"; token: string } | { kind: Exclude<LinkChangeResult, "ok"> };

/** 링크값 다시 보기(복사용) — 지금 쓸 수 있는 링크만 돌려준다 (차단·제외·만료된 링크는 보여 주지 않음) */
export async function revealLink(meetingId: string, memberId: string): Promise<RevealResult> {
  const check = await 링크_기록(meetingId, memberId);
  if (check.result !== "ok") return { kind: check.result };
  if (!check.row.link_ciphertext) return { kind: "no-link" };
  if (check.row.blocked_at) return { kind: "blocked" };
  const token = decryptLinkToken(check.row.link_ciphertext, memberLinkSecret());
  // 비밀 값을 바꾼 뒤라 되찾을 수 없으면 재발급이 필요하다 (Design §8)
  if (!token) return { kind: "no-link" };
  return { kind: "ok", token };
}
