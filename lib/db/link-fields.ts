// 새 위원 링크를 만들어 데이터베이스에 넣을 칸(암호문·지문·발급 시각)으로 바꾼다.
// 링크값 자체는 저장하지 않고, MEMBER_LINK_SECRET으로 잠근 암호문과 확인용 지문만 저장한다.
import "server-only";

import { encryptLinkToken, generateLinkToken, linkFingerprint } from "@/lib/rules/member-link";

/** 서버에만 있는 링크 비밀 값 (값은 어디에도 출력하지 않는다) */
export function memberLinkSecret(): string {
  const secret = process.env.MEMBER_LINK_SECRET;
  if (!secret) throw new Error("MEMBER_LINK_SECRET 값이 없습니다. .env.local을 확인해 주세요.");
  return secret;
}

/** 새 링크 칸 — 재발급하면 지문이 바뀌어 기존 링크는 즉시 맞지 않게 되고, 차단 시각은 지운다 */
export function newLinkFields(now: Date = new Date()) {
  const secret = memberLinkSecret();
  const token = generateLinkToken();
  return {
    link_ciphertext: encryptLinkToken(token, secret),
    link_fingerprint: linkFingerprint(token, secret),
    link_issued_at: now.toISOString(),
    blocked_at: null,
  };
}
