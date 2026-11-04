// Design Ref: §9.1 계산 규칙 테스트 예시 (1~7번) + 경계 사례
// Plan SC: S2 — 집계 결과가 손으로 계산한 값과 100% 같아야 한다.
import { describe, expect, it } from "vitest";

import { aggregateAgenda, formatTenths, type EvaluationTotal } from "./aggregate";

// 합계 목록으로 평가 데이터를 만든다 (위원 ID는 m1, m2, ... 순서)
function evaluationsOf(totals: number[]): EvaluationTotal[] {
  return totals.map((total, i) => ({ memberId: `m${i + 1}`, total }));
}
const idsOf = (evaluations: EvaluationTotal[]) => evaluations.map((e) => e.memberId);

describe("DESIGN 9.1 계산 규칙 테스트 예시", () => {
  it("1번: 98·80·70·45·82, 제외 켜짐, 기준 70 → 98과 45를 빼고 77.3, 가결", () => {
    const evaluations = evaluationsOf([98, 80, 70, 45, 82]);
    const result = aggregateAgenda({ evaluations, eligibleMemberIds: idsOf(evaluations), passScore: 70, excludeExtremes: true });
    expect(result).toMatchObject({
      kind: "result", submittedCount: 5, usedCount: 3, sum: 232,
      averageText: "77.3", passed: true,
      excludedHighMemberId: "m1", excludedLowMemberId: "m4",
    });
  });

  it("2번: 80·70·60·90 (4명), 제외 켜짐, 기준 75 → 5명 미만이라 제외 안 함, 75.0, 가결 (기준과 같으면 가결)", () => {
    const evaluations = evaluationsOf([80, 70, 60, 90]);
    const result = aggregateAgenda({ evaluations, eligibleMemberIds: idsOf(evaluations), passScore: 75, excludeExtremes: true });
    expect(result).toMatchObject({
      kind: "result", usedCount: 4, averageText: "75.0", passed: true,
      excludedHighMemberId: null, excludedLowMemberId: null,
    });
  });

  it("3번: 90·90·50·50·70, 제외 켜짐, 기준 70 → 같은 점수여도 90·50을 1개씩만 빼고 70.0, 가결", () => {
    const evaluations = evaluationsOf([90, 90, 50, 50, 70]);
    const result = aggregateAgenda({ evaluations, eligibleMemberIds: idsOf(evaluations), passScore: 70, excludeExtremes: true });
    expect(result).toMatchObject({ kind: "result", usedCount: 3, sum: 210, averageText: "70.0", passed: true });
  });

  it("4번: 70·69·70 (평균 69.666…), 제외 꺼짐, 기준 70 → 표시 69.7, 부결", () => {
    const evaluations = evaluationsOf([70, 69, 70]);
    const result = aggregateAgenda({ evaluations, eligibleMemberIds: idsOf(evaluations), passScore: 70, excludeExtremes: false });
    expect(result).toMatchObject({ kind: "result", averageText: "69.7", passed: false });
  });

  it("5번: 참석 5명 중 1명 제척 → 제척 위원이 이미 낸 평가는 빼고 4명으로 계산, 제외 안 함, 73.25 → 73.3, 가결", () => {
    // m5는 평가를 낸 뒤 제척됨 — 기록은 남아 있지만 집계에서는 빠져야 한다
    const evaluations = evaluationsOf([98, 80, 70, 45, 82]);
    const result = aggregateAgenda({
      evaluations,
      eligibleMemberIds: ["m1", "m2", "m3", "m4"],
      passScore: 70,
      excludeExtremes: true,
    });
    expect(result).toMatchObject({
      kind: "result", submittedCount: 4, usedCount: 4, sum: 293,
      averageText: "73.3", passed: true,
      excludedHighMemberId: null, excludedLowMemberId: null,
    });
  });

  it("6번: 1점 17명 + 2점 3명 (평균 1.15), 제외 꺼짐, 기준 1 → 정수 연산으로 1.2, 가결", () => {
    const evaluations = evaluationsOf([...Array(17).fill(1), 2, 2, 2]);
    const result = aggregateAgenda({ evaluations, eligibleMemberIds: idsOf(evaluations), passScore: 1, excludeExtremes: false });
    expect(result).toMatchObject({ kind: "result", usedCount: 20, sum: 23, averageText: "1.2", passed: true });

    // 참고: 흔히 쓰는 소수 반올림(toFixed)은 1.15를 1.1로 잘못 내린다 (이 함수가 정수 연산을 쓰는 이유)
    expect((23 / 20).toFixed(1)).toBe("1.1");
  });

  it("7번: 평가 대상 0명 (모두 제척) → 평가 없음, 가결·부결 없음", () => {
    const evaluations = evaluationsOf([80, 70, 60, 90, 75]);
    const result = aggregateAgenda({ evaluations, eligibleMemberIds: [], passScore: 70, excludeExtremes: true });
    expect(result).toEqual({ kind: "no-evaluations" });
  });
});

describe("경계 사례", () => {
  it("평가가 하나도 없으면 평가 없음", () => {
    const result = aggregateAgenda({ evaluations: [], eligibleMemberIds: ["m1", "m2"], passScore: 70, excludeExtremes: false });
    expect(result).toEqual({ kind: "no-evaluations" });
  });

  it("제외 옵션이 꺼져 있으면 5명 이상이어도 제외하지 않는다", () => {
    const evaluations = evaluationsOf([98, 80, 70, 45, 82]);
    const result = aggregateAgenda({ evaluations, eligibleMemberIds: idsOf(evaluations), passScore: 70, excludeExtremes: false });
    // 375 ÷ 5 = 75.0
    expect(result).toMatchObject({ kind: "result", usedCount: 5, sum: 375, averageText: "75.0", excludedHighMemberId: null });
  });

  it("회의에서 빠진 위원의 평가도 평가 대상이 아니면 집계에서 뺀다 (5명 → 4명이 되면 제외도 안 함)", () => {
    const evaluations = evaluationsOf([100, 80, 70, 60, 0]);
    const result = aggregateAgenda({ evaluations, eligibleMemberIds: ["m1", "m2", "m3", "m4"], passScore: 70, excludeExtremes: true });
    // 310 ÷ 4 = 77.5
    expect(result).toMatchObject({ kind: "result", usedCount: 4, sum: 310, averageText: "77.5", passed: true });
  });

  it("기준 점수와 평균이 정확히 같으면 가결, 아주 조금이라도 낮으면 부결", () => {
    const exact = evaluationsOf([70, 70, 70]);
    expect(aggregateAgenda({ evaluations: exact, eligibleMemberIds: idsOf(exact), passScore: 70, excludeExtremes: false }))
      .toMatchObject({ passed: true, averageText: "70.0" });
    const justBelow = evaluationsOf([70, 70, 69]); // 69.666… → 표시는 69.7
    expect(aggregateAgenda({ evaluations: justBelow, eligibleMemberIds: idsOf(justBelow), passScore: 70, excludeExtremes: false }))
      .toMatchObject({ passed: false, averageText: "69.7" });
  });

  it("평균이 0점이어도 계산된다", () => {
    const evaluations = evaluationsOf([0, 0]);
    expect(aggregateAgenda({ evaluations, eligibleMemberIds: idsOf(evaluations), passScore: 0, excludeExtremes: false }))
      .toMatchObject({ kind: "result", averageText: "0.0", passed: true });
  });

  it("평가 합계가 음수나 소수면 계산하지 않고 오류를 낸다", () => {
    expect(() => aggregateAgenda({ evaluations: [{ memberId: "m1", total: -1 }], eligibleMemberIds: ["m1"], passScore: 70, excludeExtremes: false }))
      .toThrow("평가 합계");
    expect(() => aggregateAgenda({ evaluations: [{ memberId: "m1", total: 70.5 }], eligibleMemberIds: ["m1"], passScore: 70, excludeExtremes: false }))
      .toThrow("평가 합계");
  });

  it("가결 기준 점수가 정수가 아니면 오류를 낸다", () => {
    expect(() => aggregateAgenda({ evaluations: [], eligibleMemberIds: [], passScore: 69.7, excludeExtremes: false }))
      .toThrow("가결 기준 점수");
  });

  it("표시 글자 변환: 773 → 77.3, 700 → 70.0, 5 → 0.5", () => {
    expect(formatTenths(773)).toBe("77.3");
    expect(formatTenths(700)).toBe("70.0");
    expect(formatTenths(5)).toBe("0.5");
  });
});
