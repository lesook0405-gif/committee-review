// 회의 일시 — 한국 시간으로 입력·저장·표시되는지, 시작 전 판단이 맞는지 (DESIGN 9.2 #20)
import { describe, expect, it } from "vitest";

import { issueMessages } from "./committee";
import { isBeforeStart, isoToKstInput, kstInputToIso, meetingSchema } from "./meeting";

describe("한국 시간 변환", () => {
  it("화면 값 14:00(한국 시간)은 UTC 05:00과 같은 시각으로 저장된다", () => {
    const iso = kstInputToIso("2026-11-20T14:00");
    expect(iso).toBe("2026-11-20T14:00:00+09:00");
    expect(new Date(iso!).toISOString()).toBe("2026-11-20T05:00:00.000Z");
  });

  it("저장된 시각을 다시 화면 값으로 바꾸면 한국 시간으로 나온다 (서버가 UTC여도)", () => {
    expect(isoToKstInput("2026-11-20T05:00:00+00:00")).toBe("2026-11-20T14:00");
    expect(isoToKstInput("2026-11-20T14:00:00+09:00")).toBe("2026-11-20T14:00");
  });

  it("한국 시간 자정 무렵도 날짜가 맞게 바뀐다 (UTC로는 전날)", () => {
    expect(new Date(kstInputToIso("2026-12-01T08:30")!).toISOString()).toBe("2026-11-30T23:30:00.000Z");
    expect(isoToKstInput("2026-11-30T23:30:00Z")).toBe("2026-12-01T08:30");
  });

  it("형식이 틀리거나 달력에 없는 날짜는 거부", () => {
    expect(kstInputToIso("")).toBeNull();
    expect(kstInputToIso("2026-11-20 14:00")).toBeNull();
    expect(kstInputToIso("2026-02-30T10:00")).toBeNull();
    expect(kstInputToIso("2026-11-20T25:00")).toBeNull();
  });
});

describe("회의 시작 전 판단", () => {
  const 시작 = "2026-11-20T14:00:00+09:00";
  it("13:59(한국 시간)는 시작 전, 14:00부터는 시작 후", () => {
    expect(isBeforeStart(시작, new Date("2026-11-20T13:59:00+09:00"))).toBe(true);
    expect(isBeforeStart(시작, new Date("2026-11-20T14:00:00+09:00"))).toBe(false);
    expect(isBeforeStart(시작, new Date("2026-11-20T14:01:00+09:00"))).toBe(false);
  });
});

describe("회의 입력 검사", () => {
  it("올바른 값은 통과하고 일시는 한국 시간 형식으로 바뀐다", () => {
    const result = meetingSchema.safeParse({ title: " 제1차 회의 ", startsAt: "2026-11-20T14:00" });
    expect(result.data).toEqual({ title: "제1차 회의", startsAt: "2026-11-20T14:00:00+09:00" });
  });

  it("회차 이름 빈칸, 일시 빈칸은 한국어로 안내", () => {
    const result = meetingSchema.safeParse({ title: " ", startsAt: "" });
    expect(result.success).toBe(false);
    const messages = issueMessages(result.error!);
    expect(messages).toContain("회차 이름을 입력해 주세요.");
    expect(messages).toContain("회의 일시를 올바르게 입력해 주세요. (한국 시간)");
  });
});
