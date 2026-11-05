// 집계 결과표 만들기 테스트 — DESIGN §5.3의 손 계산 예시와 §3.2 ⑤의 화면 예시를 그대로 시험한다
import { describe, expect, it } from "vitest";

import { buildAgendaResult } from "./results";

const 위원 = (id: string, removed = false) => ({ memberId: id, name: id, removed });
const 평가 = (id: string, scores: number[], isProxy = false) => ({ memberId: id, scores, total: scores.reduce((a, b) => a + b, 0), isProxy });

describe("DESIGN 손 계산 예시: 합계 98·80·70·45·82, 제외 켜짐, 기준 70점", () => {
  const 결과 = buildAgendaResult({
    participants: ["가", "나", "다", "라", "마"].map((n) => 위원(n)),
    recusedMemberIds: [],
    evaluations: [평가("가", [98]), 평가("나", [80]), 평가("다", [70]), 평가("라", [45]), 평가("마", [82])],
    passScore: 70,
    excludeExtremes: true,
  });
  it("최고점(98)과 최저점(45)을 빼고 S=232, n=3 → 가결, 표시 77.3", () => {
    expect(결과.aggregate.kind).toBe("result");
    if (결과.aggregate.kind === "result") {
      expect(결과.aggregate).toMatchObject({ usedCount: 3, sum: 232, averageText: "77.3", passed: true, submittedCount: 5 });
    }
  });
  it("비고: 98은 최고점 제외, 45는 최저점 제외, 나머지는 없음", () => {
    const 제외 = Object.fromEntries(결과.rows.map((r) => [r.memberId, r.excluded]));
    expect(제외).toEqual({ 가: "high", 나: null, 다: null, 라: "low", 마: null });
    expect(결과.excludeSkippedBecauseFew).toBe(false);
  });
});

describe("DESIGN 화면 예시: 4명 제출 + 대리 입력 1명 + 제척 1명", () => {
  const 결과 = buildAgendaResult({
    participants: ["홍", "김", "이", "박", "최"].map((n) => 위원(n)),
    recusedMemberIds: ["최"],
    evaluations: [평가("홍", [25, 35, 20]), 평가("김", [30, 40, 28]), 평가("이", [10, 20, 15]), 평가("박", [22, 30, 18], true)],
    passScore: 70,
    excludeExtremes: true,
  });
  it("평균 73.3점(293÷4=73.25를 올림), 가결, 제출 4명", () => {
    expect(결과.aggregate).toMatchObject({ kind: "result", sum: 293, usedCount: 4, submittedCount: 4, averageText: "73.3", passed: true });
  });
  it("5명 미만이라 최고·최저점 제외를 하지 않았다는 안내가 필요하다", () => {
    expect(결과.excludeSkippedBecauseFew).toBe(true);
    expect(결과.rows.every((r) => r.excluded === null)).toBe(true);
  });
  it("대리 입력 표시와 제척 줄", () => {
    const 박 = 결과.rows.find((r) => r.memberId === "박")!;
    const 최 = 결과.rows.find((r) => r.memberId === "최")!;
    expect(박).toMatchObject({ kind: "counted", isProxy: true, scores: [22, 30, 18], total: 70 });
    expect(최).toMatchObject({ kind: "recused", scores: null, total: null });
  });
});

describe("집계에서 빠지는 위원", () => {
  it("이미 평가를 낸 위원을 제척해도 줄에는 '제척'으로 나오고 평균에는 안 들어간다", () => {
    const 결과 = buildAgendaResult({
      participants: [위원("가"), 위원("나")],
      recusedMemberIds: ["나"],
      evaluations: [평가("가", [60]), 평가("나", [100])],
      passScore: 70,
      excludeExtremes: false,
    });
    expect(결과.aggregate).toMatchObject({ kind: "result", sum: 60, usedCount: 1, passed: false, averageText: "60.0" });
    expect(결과.rows.find((r) => r.memberId === "나")).toMatchObject({ kind: "recused", total: null });
  });
  it("회의에서 제외된 위원은 평가 기록이 있을 때만 줄에 나오고 평균에는 안 들어간다", () => {
    const 결과 = buildAgendaResult({
      participants: [위원("가"), 위원("나", true), 위원("다", true)],
      recusedMemberIds: [],
      evaluations: [평가("가", [80]), 평가("나", [10])],
      passScore: 70,
      excludeExtremes: false,
    });
    expect(결과.rows.map((r) => [r.memberId, r.kind])).toEqual([["가", "counted"], ["나", "removed"]]);
    expect(결과.aggregate).toMatchObject({ kind: "result", sum: 80, usedCount: 1, passed: true });
  });
  it("제외됐다가 다시 추가된 위원은 기존 평가가 다시 반영된다", () => {
    const 결과 = buildAgendaResult({
      participants: [위원("가"), 위원("나", false)],
      recusedMemberIds: [],
      evaluations: [평가("가", [80]), 평가("나", [60])],
      passScore: 70,
      excludeExtremes: false,
    });
    expect(결과.aggregate).toMatchObject({ kind: "result", sum: 140, usedCount: 2, averageText: "70.0", passed: true });
  });
});

describe("평가 없음", () => {
  it("평가 대상이 모두 제척되면 '평가 없음'(가결·부결 없음)", () => {
    const 결과 = buildAgendaResult({
      participants: [위원("가"), 위원("나")],
      recusedMemberIds: ["가", "나"],
      evaluations: [평가("가", [90]), 평가("나", [90])],
      passScore: 70,
      excludeExtremes: false,
    });
    expect(결과.aggregate).toEqual({ kind: "no-evaluations" });
    expect(결과.excludeSkippedBecauseFew).toBe(false);
  });
  it("평가 대상이 없는 회의도 '평가 없음'", () => {
    expect(buildAgendaResult({ participants: [], recusedMemberIds: [], evaluations: [], passScore: 0, excludeExtremes: true }).aggregate).toEqual({ kind: "no-evaluations" });
  });
});

describe("미제출 줄과 동점", () => {
  it("평가 대상인데 기록이 없으면 '미제출' 줄 (마감 전 상태를 보여 줄 때를 대비)", () => {
    const 결과 = buildAgendaResult({ participants: [위원("가"), 위원("나")], recusedMemberIds: [], evaluations: [평가("가", [50])], passScore: 70, excludeExtremes: false });
    expect(결과.rows.find((r) => r.memberId === "나")?.kind).toBe("missing");
  });
  it("같은 점수가 여러 개여도 최고·최저 1개씩만 뺀다 (5명, 90·90·70·50·50)", () => {
    const 결과 = buildAgendaResult({
      participants: ["가", "나", "다", "라", "마"].map((n) => 위원(n)),
      recusedMemberIds: [],
      evaluations: [평가("가", [90]), 평가("나", [90]), 평가("다", [70]), 평가("라", [50]), 평가("마", [50])],
      passScore: 70,
      excludeExtremes: true,
    });
    expect(결과.rows.filter((r) => r.excluded === "high")).toHaveLength(1);
    expect(결과.rows.filter((r) => r.excluded === "low")).toHaveLength(1);
    expect(결과.aggregate).toMatchObject({ kind: "result", usedCount: 3, sum: 210 }); // 90 + 70 + 50
  });
  it("제외 옵션이 꺼져 있으면 5명이어도 제외 안내가 없다", () => {
    const 결과 = buildAgendaResult({
      participants: ["가", "나", "다", "라", "마"].map((n) => 위원(n)),
      recusedMemberIds: [],
      evaluations: ["가", "나", "다", "라", "마"].map((n, i) => 평가(n, [i * 10])),
      passScore: 10,
      excludeExtremes: false,
    });
    expect(결과.rows.every((r) => r.excluded === null)).toBe(true);
    expect(결과.excludeSkippedBecauseFew).toBe(false);
  });
});
