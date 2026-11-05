// 입력 중 점수 임시 저장 규칙 테스트
import { describe, expect, it } from "vitest";

import { criteriaSignature, DRAFT_MAX_AGE_MS, draftStorageKey, isWorthSaving, parseDraft, serializeDraft } from "./evaluation-draft";

const 항목 = [
  { name: "적정성", maxScore: 30 },
  { name: "효과성", maxScore: 40 },
];
const 지금 = new Date("2026-11-20T06:00:00.000Z");

describe("보관 이름", () => {
  it("위원 참석 기록 ID와 안건 ID로 만들고 링크값은 들어가지 않는다", () => {
    expect(draftStorageKey("mm-1", "ag-1")).toBe("eval-draft:mm-1:ag-1");
  });
  it("위원·안건이 다르면 이름이 다르다", () => {
    expect(draftStorageKey("mm-1", "ag-1")).not.toBe(draftStorageKey("mm-2", "ag-1"));
    expect(draftStorageKey("mm-1", "ag-1")).not.toBe(draftStorageKey("mm-1", "ag-2"));
  });
});

describe("저장했다가 다시 읽기", () => {
  it("저장한 글자를 그대로 돌려준다 (잘못 입력한 글자도 지우지 않는다)", () => {
    const 글 = serializeDraft(항목, ["25", "abc"], 지금);
    expect(parseDraft(글, 항목, new Date(지금.getTime() + 60_000))).toEqual(["25", "abc"]);
  });
  it("빈칸도 그대로", () => {
    expect(parseDraft(serializeDraft(항목, ["", "7"], 지금), 항목, 지금)).toEqual(["", "7"]);
  });
});

describe("쓰지 않는 임시 저장", () => {
  it("없거나 망가진 글", () => {
    expect(parseDraft(null, 항목, 지금)).toBeNull();
    expect(parseDraft("", 항목, 지금)).toBeNull();
    expect(parseDraft("{not json", 항목, 지금)).toBeNull();
    expect(parseDraft("123", 항목, 지금)).toBeNull();
    expect(parseDraft("null", 항목, 지금)).toBeNull();
  });
  it("평가 방식이 바뀐 뒤(항목 이름·배점·개수)", () => {
    const 글 = serializeDraft(항목, ["1", "2"], 지금);
    expect(parseDraft(글, [{ name: "적정성", maxScore: 31 }, 항목[1]], 지금)).toBeNull();
    expect(parseDraft(글, [{ name: "다른 이름", maxScore: 30 }, 항목[1]], 지금)).toBeNull();
    expect(parseDraft(글, [...항목, { name: "추가", maxScore: 10 }], 지금)).toBeNull();
  });
  it("보관 기간(7일) 경계: 정확히 7일까지 사용, 1밀리초 넘으면 버림", () => {
    const 글 = serializeDraft(항목, ["1", "2"], 지금);
    expect(parseDraft(글, 항목, new Date(지금.getTime() + DRAFT_MAX_AGE_MS))).toEqual(["1", "2"]);
    expect(parseDraft(글, 항목, new Date(지금.getTime() + DRAFT_MAX_AGE_MS + 1))).toBeNull();
  });
  it("미래 시각(기기 시계 오류·조작)은 버림", () => {
    const 글 = serializeDraft(항목, ["1", "2"], new Date(지금.getTime() + 1000));
    expect(parseDraft(글, 항목, 지금)).toBeNull();
  });
  it("모양이 틀린 값(글자가 아닌 칸, 칸 수 불일치, 너무 긴 글)은 버림", () => {
    const 서명 = criteriaSignature(항목);
    const 만들기 = (texts: unknown) => JSON.stringify({ v: 1, sig: 서명, texts, savedAt: 지금.getTime() });
    expect(parseDraft(만들기([1, 2]), 항목, 지금)).toBeNull();
    expect(parseDraft(만들기(["1"]), 항목, 지금)).toBeNull();
    expect(parseDraft(만들기("12"), 항목, 지금)).toBeNull();
    expect(parseDraft(만들기(["1", "9".repeat(13)]), 항목, 지금)).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 2, sig: 서명, texts: ["1", "2"], savedAt: 지금.getTime() }), 항목, 지금)).toBeNull();
  });
});

describe("남길 가치", () => {
  it("서버에 낸 점수(또는 빈칸)와 같으면 남기지 않는다", () => {
    expect(isWorthSaving(["", ""], ["", ""])).toBe(false);
    expect(isWorthSaving(["25", "35"], ["25", "35"])).toBe(false);
  });
  it("하나라도 다르면 남긴다", () => {
    expect(isWorthSaving(["25", "36"], ["25", "35"])).toBe(true);
    expect(isWorthSaving(["1", ""], ["", ""])).toBe(true);
  });
});
