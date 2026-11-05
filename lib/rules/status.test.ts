// 열람 현황 숫자 테스트 — PRD "열람 N / M", "회의 전 열람 N / M" (M = 평가 대상 수)
import { describe, expect, it } from "vitest";

import { agendaViewCounts, eligibleMemberIds } from "./status";

const 시작 = "2026-11-20T05:00:00.000Z"; // 한국 시간 14:00

describe("평가 대상", () => {
  it("참석 위원에서 그 안건 제척 위원을 뺀다", () => {
    expect(eligibleMemberIds(["가", "나", "다"], ["나"])).toEqual(["가", "다"]);
  });
  it("제척이 없으면 참석 위원 전원", () => {
    expect(eligibleMemberIds(["가", "나"], [])).toEqual(["가", "나"]);
  });
});

describe("열람 N / M · 회의 전 열람 N / M", () => {
  it("일부는 회의 전, 일부는 회의 후에 열람", () => {
    const 결과 = agendaViewCounts({
      eligibleMemberIds: ["가", "나", "다", "라", "마"],
      views: [
        { memberId: "가", firstViewedAt: "2026-11-18T01:00:00.000Z" },
        { memberId: "나", firstViewedAt: "2026-11-20T04:59:59.999Z" },
        { memberId: "다", firstViewedAt: "2026-11-20T06:00:00.000Z" },
      ],
      startsAt: 시작,
    });
    expect(결과).toEqual({ eligible: 5, viewed: 3, viewedBeforeStart: 2 });
  });

  it("회의 시작 시각과 똑같은 시각에 연 것은 '회의 전'이 아니다", () => {
    const 결과 = agendaViewCounts({ eligibleMemberIds: ["가"], views: [{ memberId: "가", firstViewedAt: 시작 }], startsAt: 시작 });
    expect(결과).toEqual({ eligible: 1, viewed: 1, viewedBeforeStart: 0 });
  });

  it("제외·제척된 위원의 열람 기록은 분자·분모 모두에서 빠진다", () => {
    const 결과 = agendaViewCounts({
      eligibleMemberIds: ["가", "나"],
      views: [
        { memberId: "가", firstViewedAt: "2026-11-18T01:00:00.000Z" },
        { memberId: "제외된위원", firstViewedAt: "2026-11-18T01:00:00.000Z" },
      ],
      startsAt: 시작,
    });
    expect(결과).toEqual({ eligible: 2, viewed: 1, viewedBeforeStart: 1 });
  });

  it("평가 대상 0명이면 0 / 0", () => {
    expect(agendaViewCounts({ eligibleMemberIds: [], views: [], startsAt: 시작 })).toEqual({ eligible: 0, viewed: 0, viewedBeforeStart: 0 });
  });

  it("같은 위원 기록이 겹쳐도 1명으로 센다", () => {
    const 결과 = agendaViewCounts({
      eligibleMemberIds: ["가"],
      views: [
        { memberId: "가", firstViewedAt: "2026-11-20T06:00:00.000Z" },
        { memberId: "가", firstViewedAt: "2026-11-18T01:00:00.000Z" },
      ],
      startsAt: 시작,
    });
    expect(결과).toEqual({ eligible: 1, viewed: 1, viewedBeforeStart: 1 });
  });
});
