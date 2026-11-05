// Design Ref: §5.2 위원 접속 — "링크 확인(사용 가능, 회의에서 제외되지 않음, 만료 전) → 그 회의만 조회"
// Design Ref: §8 — 접속 확인은 링크값으로 만든 지문(HMAC)으로 찾는다. 링크값 자체는 저장돼 있지 않다.
// 위원 화면(/m/...)의 모든 화면과 서버 처리는 이 함수로 먼저 링크를 확인한다.
import "server-only";

import { connection } from "next/server";

import { memberLinkSecret } from "@/lib/db/link-fields";
import { createAdminClient } from "@/lib/db/supabase";
import { isLinkExpired, isLinkTokenShape, linkFingerprint } from "@/lib/rules/member-link";

export type MemberAccess = {
  meetingMemberId: string;
  memberId: string;
  memberName: string;
  meeting: { id: string; title: string; startsAt: string; status: "open" | "closed"; closedAt: string | null; committeeId: string; committeeName: string };
};

/** 링크로 들어올 수 없는 이유 — 없는 값·재발급 전 값 / 차단 / 회의에서 제외 / 마감 7일 지남 */
export type LinkDenial = "invalid" | "blocked" | "removed" | "expired";

export type LinkCheck = { ok: true; access: MemberAccess } | { ok: false; reason: LinkDenial };

/** 링크값 확인 — 매 요청마다 데이터베이스에서 다시 확인한다 (차단·재발급이 바로 반영되도록) */
export async function resolveMemberLink(token: string): Promise<LinkCheck> {
  await connection(); // 지금 시각으로 만료를 판단하므로, 미리 만들어 둔 화면을 쓰지 않는다
  if (!isLinkTokenShape(token)) return { ok: false, reason: "invalid" };

  const { data, error } = await createAdminClient()
    .from("meeting_members")
    .select("id, member_id, blocked_at, removed_at, members(name), meetings(id, committee_id, title, starts_at, status, closed_at, committees(name))")
    .eq("link_fingerprint", linkFingerprint(token, memberLinkSecret()))
    .maybeSingle();
  if (error) throw new Error(`링크를 확인하지 못했습니다. (${error.message})`);
  if (!data || !data.meetings) return { ok: false, reason: "invalid" };

  const m = data.meetings;
  if (data.removed_at) return { ok: false, reason: "removed" };
  if (isLinkExpired(m.closed_at, new Date())) return { ok: false, reason: "expired" };
  if (data.blocked_at) return { ok: false, reason: "blocked" };

  return {
    ok: true,
    access: {
      meetingMemberId: data.id,
      memberId: data.member_id,
      memberName: data.members?.name ?? "",
      meeting: {
        id: m.id,
        title: m.title,
        startsAt: m.starts_at,
        status: m.status === "closed" ? "closed" : "open",
        closedAt: m.closed_at,
        committeeId: m.committee_id,
        committeeName: m.committees?.name ?? "",
      },
    },
  };
}

/** 위원에게 보여 줄 한국어 안내 (어떤 이유든 담당자에게 새 링크를 받으면 된다) */
export const LINK_DENIAL_MESSAGE: Record<LinkDenial, string> = {
  invalid: "사용할 수 없는 링크입니다. 링크가 새로 발급되었을 수 있으니 담당자에게 새 링크를 요청하세요.",
  blocked: "사용이 중지된 링크입니다. 담당자에게 새 링크를 요청하세요.",
  removed: "이 회의에 참석하지 않는 것으로 변경되어 링크를 사용할 수 없습니다. 담당자에게 문의하세요.",
  expired: "링크가 만료되었습니다. 담당자에게 새 링크를 요청하세요.",
};
