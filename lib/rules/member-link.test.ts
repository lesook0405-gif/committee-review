// 위원 링크 규칙 테스트 — 추측 불가, 암호화 저장, 지문 확인, 마감 7일 뒤 만료
import { describe, expect, it } from "vitest";

import {
  decryptLinkToken,
  encryptLinkToken,
  generateLinkToken,
  isLinkExpired,
  isLinkTokenShape,
  linkExpiresAt,
  linkFingerprint,
  linkState,
} from "./member-link";

const 비밀 = "test-secret-only-for-unit-tests";

describe("링크값 만들기", () => {
  it("43자 무작위 값이고, 만들 때마다 다르다", () => {
    const 값들 = new Set(Array.from({ length: 100 }, generateLinkToken));
    expect(값들.size).toBe(100);
    for (const v of 값들) expect(isLinkTokenShape(v)).toBe(true);
  });
  it("모양이 다른 값(짧은 값, 경로 이동 글자)은 링크값이 아님", () => {
    expect(isLinkTokenShape("abc")).toBe(false);
    expect(isLinkTokenShape("../".padEnd(43, "a"))).toBe(false);
  });
});

describe("암호화 저장", () => {
  it("같은 비밀 값으로 원래 링크값을 되찾는다", () => {
    const 링크 = generateLinkToken();
    const 암호문 = encryptLinkToken(링크, 비밀);
    expect(암호문).not.toContain(링크);
    expect(decryptLinkToken(암호문, 비밀)).toBe(링크);
  });
  it("같은 링크값도 암호문은 매번 다르다", () => {
    const 링크 = generateLinkToken();
    expect(encryptLinkToken(링크, 비밀)).not.toBe(encryptLinkToken(링크, 비밀));
  });
  it("비밀 값이 다르거나 암호문이 손상되면 되찾지 못한다", () => {
    const 암호문 = encryptLinkToken(generateLinkToken(), 비밀);
    expect(decryptLinkToken(암호문, "other-secret")).toBeNull();
    expect(decryptLinkToken(암호문.slice(0, -2) + "AA", 비밀)).toBeNull();
    expect(decryptLinkToken("garbage", 비밀)).toBeNull();
  });
});

describe("지문", () => {
  it("같은 링크값·비밀 값이면 같은 지문, 다르면 다른 지문", () => {
    const 링크 = generateLinkToken();
    expect(linkFingerprint(링크, 비밀)).toBe(linkFingerprint(링크, 비밀));
    expect(linkFingerprint(링크, 비밀)).not.toBe(linkFingerprint(generateLinkToken(), 비밀));
    expect(linkFingerprint(링크, 비밀)).not.toBe(linkFingerprint(링크, "other-secret"));
  });
});

describe("만료 (마감 7일 뒤)", () => {
  const 마감 = "2026-11-20T08:00:00.000Z";
  it("마감 전에는 만료 없음", () => {
    expect(linkExpiresAt(null)).toBeNull();
    expect(isLinkExpired(null, new Date("2099-01-01T00:00:00Z"))).toBe(false);
  });
  it("마감 + 7일 1밀리초 전까지 사용 가능, 그 순간부터 만료", () => {
    expect(linkExpiresAt(마감)?.toISOString()).toBe("2026-11-27T08:00:00.000Z");
    expect(isLinkExpired(마감, new Date("2026-11-27T07:59:59.999Z"))).toBe(false);
    expect(isLinkExpired(마감, new Date("2026-11-27T08:00:00.000Z"))).toBe(true);
  });
});

describe("링크 상태", () => {
  const 지금 = new Date("2026-11-21T00:00:00Z");
  const 기본 = { hasLink: true, blockedAt: null, removedAt: null };
  it("사용 가능 / 차단 / 제외 / 아직 없음", () => {
    expect(linkState(기본, null, 지금)).toBe("active");
    expect(linkState({ ...기본, blockedAt: "2026-11-20T00:00:00Z" }, null, 지금)).toBe("blocked");
    expect(linkState({ ...기본, removedAt: "2026-11-20T00:00:00Z" }, null, 지금)).toBe("removed");
    expect(linkState({ ...기본, hasLink: false }, null, 지금)).toBe("none");
  });
  it("마감 7일이 지나면 차단 여부와 상관없이 만료", () => {
    expect(linkState({ ...기본, blockedAt: "2026-11-01T00:00:00Z" }, "2026-11-01T00:00:00Z", 지금)).toBe("expired");
  });
});
