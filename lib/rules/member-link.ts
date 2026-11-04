// Design Ref: §8 보안 — "위원 링크값은 추측할 수 없는 긴 무작위 값으로 만들고, MEMBER_LINK_SECRET으로 암호화해 저장한다.
//   담당 팀원은 [링크 복사]로 언제든 원래 값을 다시 볼 수 있고, 접속 확인은 같은 비밀 값으로 만든 별도 지문 값(HMAC)으로 한다."
// PRD 7번: 링크는 회의마다 위원별로 다르고, 평가 마감 7일 뒤 만료. 재발급하면 기존 링크는 즉시 못 쓴다.
//
// 용어 풀이
// - 암호화(AES-256-GCM): 비밀 값이 있어야만 원래 링크값으로 되돌릴 수 있게 잠가 두는 방법. 데이터베이스가 유출돼도 링크값을 알 수 없다.
// - 지문(HMAC): 링크값으로 만든 고정 길이 확인 값. 되돌릴 수 없고, 접속한 링크값이 맞는지 빠르게 찾는 데 쓴다.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

/** 링크 만료: 평가 마감 7일 뒤 */
export const LINK_VALID_DAYS_AFTER_CLOSE = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 링크값: 32바이트(256비트) 무작위 값을 주소에 쓸 수 있는 글자 43자로 만든다 */
export function generateLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 주소에 들어온 값이 링크값 모양(43자, 영문·숫자·-·_)인지 */
export function isLinkTokenShape(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

// 비밀 값 하나에서 용도별 열쇠를 따로 만든다 (암호화용과 지문용을 섞어 쓰지 않기 위해)
const 열쇠 = (secret: string, 용도: "encrypt" | "fingerprint") => createHash("sha256").update(`${용도}:${secret}`).digest();

/** 링크값 → 암호문 ("iv.tag.본문", 매번 다른 값이 나온다) */
export function encryptLinkToken(token: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", 열쇠(secret, "encrypt"), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

/** 암호문 → 링크값. 비밀 값이 다르거나 암호문이 손상됐으면 null */
export function decryptLinkToken(ciphertext: string, secret: string): string | null {
  try {
    const [iv, tag, body] = ciphertext.split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !body) return null;
    const decipher = createDecipheriv("aes-256-gcm", 열쇠(secret, "encrypt"), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** 링크값 → 지문 (접속 확인용, 되돌릴 수 없음) */
export function linkFingerprint(token: string, secret: string): string {
  return createHmac("sha256", 열쇠(secret, "fingerprint")).update(token).digest("hex");
}

/** 링크 만료 시각 = 마감 시각 + 7일 (마감 전이면 null = 아직 만료 없음) */
export function linkExpiresAt(closedAt: string | null): Date | null {
  if (!closedAt) return null;
  return new Date(new Date(closedAt).getTime() + LINK_VALID_DAYS_AFTER_CLOSE * DAY_MS);
}

/** 지금 링크가 만료됐는지 (만료 시각이 되는 순간부터 만료) */
export function isLinkExpired(closedAt: string | null, now: Date): boolean {
  const expires = linkExpiresAt(closedAt);
  return expires !== null && now.getTime() >= expires.getTime();
}

/** 링크 상태: 사용 가능 / 아직 없음 / 차단됨 / 회의에서 제외됨 / 만료됨 */
export type LinkState = "active" | "none" | "blocked" | "removed" | "expired";

export function linkState(
  row: { hasLink: boolean; blockedAt: string | null; removedAt: string | null },
  closedAt: string | null,
  now: Date,
): LinkState {
  if (row.removedAt) return "removed";
  if (isLinkExpired(closedAt, now)) return "expired";
  if (!row.hasLink) return "none";
  if (row.blockedAt) return "blocked";
  return "active";
}
