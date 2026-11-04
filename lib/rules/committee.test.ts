// PRD 평가 방식 규칙(항목 1~10개, 배점 양의 정수, 기준 점수 0~합계 정수)을 서버 검사가 지키는지 확인한다
import { describe, expect, it } from "vitest";

import { committeeCreateSchema, issueMessages, readScoringForm, scoringSchema, totalMaxScore } from "./committee";

const 샘플 = {
  name: "투자심사위원회",
  criteria: [
    { name: "적정성", maxScore: 30 },
    { name: "효과성", maxScore: 40 },
    { name: "시급성", maxScore: 30 },
  ],
  passScore: 70,
  excludeExtremes: true,
};

function 메시지(input: unknown) {
  const result = committeeCreateSchema.safeParse(input);
  return result.success ? [] : issueMessages(result.error);
}

describe("위원회 등록 입력 검사", () => {
  it("올바른 값은 통과하고, 앞뒤 공백은 지운다", () => {
    const result = committeeCreateSchema.safeParse({ ...샘플, name: "  투자심사위원회  " });
    expect(result.success).toBe(true);
    expect(result.data?.name).toBe("투자심사위원회");
  });

  it("위원회 이름이 비어 있으면 거부", () => {
    expect(메시지({ ...샘플, name: "   " })).toContain("위원회 이름을 입력해 주세요.");
  });

  it("평가 항목 0개, 11개는 거부 / 10개는 통과", () => {
    expect(메시지({ ...샘플, criteria: [], passScore: 0 })).toContain("평가 항목을 1개 이상 입력해 주세요.");
    const 항목 = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `항목${i + 1}`, maxScore: 10 }));
    expect(메시지({ ...샘플, criteria: 항목(11), passScore: 50 })).toContain("평가 항목은 최대 10개까지 둘 수 있습니다.");
    expect(committeeCreateSchema.safeParse({ ...샘플, criteria: 항목(10), passScore: 100 }).success).toBe(true);
  });

  it("배점이 소수·0·빈칸이면 거부", () => {
    expect(메시지({ ...샘플, criteria: [{ name: "적정성", maxScore: 30.5 }], passScore: 10 })).toContain("배점은 정수로 입력해 주세요.");
    expect(메시지({ ...샘플, criteria: [{ name: "적정성", maxScore: 0 }], passScore: 0 })).toContain("배점은 1점 이상이어야 합니다.");
    expect(메시지({ ...샘플, criteria: [{ name: "적정성", maxScore: Number.NaN }], passScore: 0 })).toContain("배점은 숫자로 입력해 주세요.");
  });

  it("항목 이름이 비어 있으면 거부", () => {
    expect(메시지({ ...샘플, criteria: [{ name: " ", maxScore: 30 }], passScore: 10 })).toContain("평가 항목 이름을 입력해 주세요.");
  });

  it("가결 기준 점수: 합계와 같으면 통과, 합계 초과·음수·소수는 거부", () => {
    expect(committeeCreateSchema.safeParse({ ...샘플, passScore: 100 }).success).toBe(true);
    expect(committeeCreateSchema.safeParse({ ...샘플, passScore: 0 }).success).toBe(true);
    expect(메시지({ ...샘플, passScore: 101 })).toContain("가결 기준 점수는 배점 합계(100점) 이하여야 합니다.");
    expect(메시지({ ...샘플, passScore: -1 })).toContain("가결 기준 점수는 0점 이상이어야 합니다.");
    expect(메시지({ ...샘플, passScore: 69.7 })).toContain("가결 기준 점수는 정수로 입력해 주세요.");
  });

  it("평가 방식만 고칠 때도 같은 규칙", () => {
    const scoring = { criteria: 샘플.criteria, passScore: 샘플.passScore, excludeExtremes: 샘플.excludeExtremes };
    expect(scoringSchema.safeParse(scoring).success).toBe(true);
    expect(scoringSchema.safeParse({ ...scoring, passScore: 101 }).success).toBe(false);
  });
});

describe("화면 입력칸 읽기", () => {
  it("항목 이름·배점 목록, 기준 점수, 제외 옵션을 읽는다 (빈칸은 숫자가 아닌 값)", () => {
    const form = new FormData();
    form.set("name", "위원회");
    form.append("criteriaName", "적정성");
    form.append("criteriaMax", "30");
    form.append("criteriaName", "효과성");
    form.append("criteriaMax", "");
    form.set("passScore", "70");
    form.set("excludeExtremes", "on");
    const raw = readScoringForm(form);
    expect(raw.criteria[0]).toEqual({ name: "적정성", maxScore: 30 });
    expect(Number.isNaN(raw.criteria[1].maxScore)).toBe(true);
    expect(raw.passScore).toBe(70);
    expect(raw.excludeExtremes).toBe(true);
  });

  it("제외 옵션 칸이 없으면 꺼짐", () => {
    expect(readScoringForm(new FormData()).excludeExtremes).toBe(false);
  });

  it("배점 합계", () => {
    expect(totalMaxScore(샘플.criteria)).toBe(100);
  });
});
