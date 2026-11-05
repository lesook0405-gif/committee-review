// 열람 현황 숫자 테스트 — PRD "열람 N / M", "회의 전 열람 N / M" (M = 평가 대상 수)
import { describe, expect, it } from "vitest";

import { agendaSubmissionCounts, agendaViewCounts, eligibleMemberIds, missingMemberIds } from "./status";

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

describe("제출 N / M", () => {
  it("평가 대상 중 평가를 낸 위원만 센다 (대리 입력 포함)", () => {
    expect(agendaSubmissionCounts({ eligibleMemberIds: ["가", "나", "다"], evaluatedMemberIds: ["가", "나"] })).toEqual({ eligible: 3, submitted: 2 });
  });
  it("제외·제척된 위원이 낸 평가는 분자에서 뺀다 (분모에도 없음)", () => {
    expect(agendaSubmissionCounts({ eligibleMemberIds: ["가", "나"], evaluatedMemberIds: ["가", "제외된위원"] })).toEqual({ eligible: 2, submitted: 1 });
  });
  it("같은 위원 기록이 겹쳐도 1명", () => {
    expect(agendaSubmissionCounts({ eligibleMemberIds: ["가"], evaluatedMemberIds: ["가", "가"] })).toEqual({ eligible: 1, submitted: 1 });
  });
  it("평가 대상 0명이면 0 / 0", () => {
    expect(agendaSubmissionCounts({ eligibleMemberIds: [], evaluatedMemberIds: ["가"] })).toEqual({ eligible: 0, submitted: 0 });
  });
});

describe("미제출 N명 (한 안건이라도 안 낸 평가 대상 위원)", () => {
  it("안건마다 빠진 사람이 달라도 사람 수로 한 번씩만 센다", () => {
    const 결과 = missingMemberIds([
      { eligibleMemberIds: ["가", "나", "다"], evaluatedMemberIds: ["가", "나"] }, // 다 미제출
      { eligibleMemberIds: ["가", "나", "다"], evaluatedMemberIds: ["가", "다"] }, // 나 미제출
    ]);
    expect(결과.sort()).toEqual(["나", "다"]);
  });
  it("같은 위원이 두 안건 모두 안 냈어도 1명", () => {
    expect(
      missingMemberIds([
        { eligibleMemberIds: ["가"], evaluatedMemberIds: [] },
        { eligibleMemberIds: ["가"], evaluatedMemberIds: [] },
      ]),
    ).toEqual(["가"]);
  });
  it("전원이 모든 안건에 냈으면 0명", () => {
    expect(
      missingMemberIds([
        { eligibleMemberIds: ["가", "나"], evaluatedMemberIds: ["가", "나"] },
        { eligibleMemberIds: ["가", "나"], evaluatedMemberIds: ["나", "가"] },
      ]),
    ).toEqual([]);
  });
  it("한 안건에서 제척된 위원은 그 안건을 안 냈어도 미제출이 아니다", () => {
    expect(
      missingMemberIds([
        { eligibleMemberIds: ["가", "나"], evaluatedMemberIds: ["가", "나"] },
        { eligibleMemberIds: ["가"], evaluatedMemberIds: ["가"] }, // 나는 안건 2에서 제척
      ]),
    ).toEqual([]);
  });
  it("모든 안건에서 제척된 위원은 세지 않는다", () => {
    expect(missingMemberIds([{ eligibleMemberIds: ["가"], evaluatedMemberIds: ["가"] }, { eligibleMemberIds: ["가"], evaluatedMemberIds: ["가"] }])).toEqual([]);
  });
  it("안건이 없으면 0명", () => {
    expect(missingMemberIds([])).toEqual([]);
  });
});
