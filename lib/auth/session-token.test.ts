// 로그인 토큰이 위조·변조·만료를 제대로 막는지 확인한다
import { describe, expect, it } from "vitest";

import { createSessionToken, SESSION_MAX_AGE_SECONDS, verifySessionToken } from "./session-token";

const SECRET = "test-secret-for-unit-tests";
const NOW = 1_800_000_000;

describe("로그인 토큰", () => {
  it("만든 토큰은 같은 비밀 값으로 확인되고, 계정·역할이 그대로 나온다", () => {
    const token = createSessionToken("user-1", "staff", SECRET, NOW);
    expect(verifySessionToken(token, SECRET, NOW)).toEqual({
      sub: "user-1", role: "staff", exp: NOW + SESSION_MAX_AGE_SECONDS,
    });
  });

  it("팀장 역할도 그대로 유지된다", () => {
    const token = createSessionToken("user-2", "lead", SECRET, NOW);
    expect(verifySessionToken(token, SECRET, NOW)?.role).toBe("lead");
  });

  it("다른 비밀 값으로 만든 토큰은 거부한다", () => {
    const token = createSessionToken("user-1", "staff", "other-secret", NOW);
    expect(verifySessionToken(token, SECRET, NOW)).toBeNull();
  });

  it("내용을 바꾼 토큰은 거부한다 (팀장이 담당 팀원으로 바꿔치기 시도)", () => {
    const token = createSessionToken("user-2", "lead", SECRET, NOW);
    const [, signature] = token.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ sub: "user-2", role: "staff", exp: NOW + 999 })).toString("base64url");
    expect(verifySessionToken(`${forgedBody}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it("8시간이 지나면 만료되어 거부한다", () => {
    const token = createSessionToken("user-1", "staff", SECRET, NOW);
    expect(verifySessionToken(token, SECRET, NOW + SESSION_MAX_AGE_SECONDS - 1)).not.toBeNull();
    expect(verifySessionToken(token, SECRET, NOW + SESSION_MAX_AGE_SECONDS)).toBeNull();
  });

  it("비어 있거나 형식이 틀린 값은 거부한다", () => {
    expect(verifySessionToken(undefined, SECRET, NOW)).toBeNull();
    expect(verifySessionToken("", SECRET, NOW)).toBeNull();
    expect(verifySessionToken("abc", SECRET, NOW)).toBeNull();
    expect(verifySessionToken("a.b.c", SECRET, NOW)).toBeNull();
    expect(verifySessionToken(createSessionToken("user-1", "staff", SECRET, NOW), undefined, NOW)).toBeNull();
  });

  it("비밀 값이 없으면 토큰을 만들지 않는다", () => {
    expect(() => createSessionToken("user-1", "staff", "", NOW)).toThrow("SESSION_SECRET");
  });
});
