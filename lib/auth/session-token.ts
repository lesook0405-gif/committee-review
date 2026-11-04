// Design Ref: §8 보안 설계 — 담당 팀원·팀장의 로그인 상태를 담는 서명된 값(토큰)
// 쿠키 안에 "누구인지·역할·만료 시각"을 넣고, SESSION_SECRET으로 서명해 위조를 막는다.
// 화면·데이터베이스와 분리된 순수 함수라 proxy와 서버 코드 양쪽에서 쓰고, 자동 테스트로 확인한다.
import { createHmac, timingSafeEqual } from "node:crypto";

export type StaffRole = "staff" | "lead"; // staff = 담당 팀원, lead = 팀장(열람만)

export type SessionPayload = {
  /** 담당 팀원·팀장 계정 ID */
  sub: string;
  role: StaffRole;
  /** 만료 시각 (초 단위 시간값) */
  exp: number;
};

/** 로그인 유지 시간: 8시간 (업무 하루) */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** 로그인 토큰 만들기 */
export function createSessionToken(
  sub: string,
  role: StaffRole,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  if (!secret) throw new Error("SESSION_SECRET이 없습니다.");
  const payload: SessionPayload = { sub, role, exp: nowSeconds + SESSION_MAX_AGE_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** 로그인 토큰 확인하기 — 위조·변조·만료·형식 오류면 null */
export function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SessionPayload | null {
  if (!token || !secret) return null;
  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length > 0) return null;

  // 서명 비교는 걸린 시간으로 값을 짐작할 수 없도록 일정한 시간에 비교한다
  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Partial<SessionPayload>;
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    if (payload.role !== "staff" && payload.role !== "lead") return null;
    if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) return null;
    return { sub: payload.sub, role: payload.role, exp: payload.exp };
  } catch {
    return null;
  }
}
