// 평가 입력 규칙 테스트 — PRD "각 항목 0~배점 정수, 빈칸 불가", "회의 시작 시각부터 마감 전까지"
import { describe, expect, it } from "vitest";

import { checkScores, checkScoreText, evaluationWindow, runningTotal, scoreFieldName } from "./evaluation";

const 항목 = [
  { name: "적정성", maxScore: 30 },
  { name: "효과성", maxScore: 40 },
  { name: "시급성", maxScore: 30 },
];

describe("점수 한 칸", () => {
  it("0과 배점 그대로는 통과 (경계)", () => {
    expect(checkScoreText("0", 30)).toEqual({ ok: true, value: 0 });
    expect(checkScoreText("30", 30)).toEqual({ ok: true, value: 30 });
  });
  it("배점을 1점이라도 넘으면 거부", () => {
    expect(checkScoreText("31", 30)).toEqual({ ok: false, message: "배점(30점)을 넘을 수 없습니다." });
  });
  it("빈칸·공백만 있으면 거부", () => {
    expect(checkScoreText("", 30).ok).toBe(false);
    expect(checkScoreText("   ", 30).ok).toBe(false);
  });
  it("소수·음수·지수·글자·부호는 거부", () => {
    for (const 값 of ["1.5", "-1", "+1", "1e2", "0x10", "abc", "１２", "1,0", "٣"]) {
      expect(checkScoreText(값, 100).ok, 값).toBe(false);
    }
  });
  it("앞뒤 공백은 허용, 앞의 0은 같은 값으로 본다", () => {
    expect(checkScoreText(" 25 ", 30)).toEqual({ ok: true, value: 25 });
    expect(checkScoreText("007", 30)).toEqual({ ok: true, value: 7 });
  });
  it("아주 긴 숫자는 거부", () => {
    expect(checkScoreText("1".repeat(50), 1000).ok).toBe(false);
  });
});

describe("항목 전체", () => {
  it("모두 맞으면 점수 배열과 합계", () => {
    expect(checkScores(항목, ["25", "35", "20"])).toEqual({ ok: true, scores: [25, 35, 20], total: 80 });
  });
  it("틀린 칸마다 안내, 맞는 칸은 null", () => {
    const r = checkScores(항목, ["25", "", "31"]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors).toEqual([null, "점수를 입력해 주세요.", "배점(30점)을 넘을 수 없습니다."]);
      expect(r.messages).toEqual(["효과성: 점수를 입력해 주세요.", "시급성: 배점(30점)을 넘을 수 없습니다."]);
    }
  });
  it("칸 수가 모자라면 빈칸으로 본다", () => {
    expect(checkScores(항목, ["25"]).ok).toBe(false);
  });
  it("합계는 항목 수와 상관없이 정수로 더한다 (10개 항목)", () => {
    const 열개 = Array.from({ length: 10 }, (_, i) => ({ name: `항목${i}`, maxScore: 10 }));
    const r = checkScores(열개, Array(10).fill("10"));
    expect(r).toEqual({ ok: true, scores: Array(10).fill(10), total: 100 });
  });
});

describe("입력 중 합계", () => {
  it("틀린 칸은 0으로 보고 더한다", () => {
    expect(runningTotal(항목, ["25", "abc", "20"])).toBe(45);
    expect(runningTotal(항목, ["", "", ""])).toBe(0);
  });
});

describe("칸 이름", () => {
  it("score-번호", () => {
    expect(scoreFieldName(2)).toBe("score-2");
  });
});

describe("평가할 수 있는 때 (한국 시간 14:00 = 05:00 UTC)", () => {
  const 시작 = "2026-11-20T05:00:00.000Z";
  const 회의 = { status: "open" as const, startsAt: 시작 };
  it("13:59는 아직, 14:00부터 가능 (경계)", () => {
    expect(evaluationWindow(회의, new Date("2026-11-20T04:59:59.999Z"))).toBe("not-started");
    expect(evaluationWindow(회의, new Date("2026-11-20T05:00:00.000Z"))).toBe("open");
  });
  it("마감되면 시작 시각이 지나도 닫힘", () => {
    expect(evaluationWindow({ status: "closed", startsAt: 시작 }, new Date("2026-11-21T00:00:00Z"))).toBe("closed");
  });
});
