// 위원 입력 검사와 휴대폰 번호 가리기 (PRD 7번: 화면에는 가운데를 가린다)
import { describe, expect, it } from "vitest";

import { issueMessages } from "./committee";
import { maskPhone, memberSchema, normalizePhone, readMemberForm } from "./member";

function 메시지(input: unknown) {
  const result = memberSchema.safeParse(input);
  return result.success ? [] : issueMessages(result.error);
}

describe("휴대폰 번호", () => {
  it("하이픈·공백이 있든 없든 010-1234-5678 모양으로 맞춘다", () => {
    expect(normalizePhone("01012345678")).toBe("010-1234-5678");
    expect(normalizePhone("010-1234-5678")).toBe("010-1234-5678");
    expect(normalizePhone(" 010 1234 5678 ")).toBe("010-1234-5678");
    expect(normalizePhone("011-123-4567")).toBe("011-123-4567");
  });

  it("휴대폰 번호가 아니면 null", () => {
    expect(normalizePhone("02-123-4567")).toBeNull();
    expect(normalizePhone("010-12-34")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });

  it("가운데를 가린다: 010-1234-5678 → 010-****-5678, 011-123-4567 → 011-***-4567", () => {
    expect(maskPhone("010-1234-5678")).toBe("010-****-5678");
    expect(maskPhone("01012345678")).toBe("010-****-5678");
    expect(maskPhone("011-123-4567")).toBe("011-***-4567");
  });

  it("형식을 알 수 없는 값은 전부 가린다 (원래 값이 새어 나가지 않게)", () => {
    expect(maskPhone("02-123-4567")).toBe("***");
  });
});

describe("위원 입력 검사", () => {
  const 정상 = { name: "홍길동", email: "hong@example.com", phone: "01012345678" };

  it("올바른 값은 통과하고, 번호는 010-1234-5678 모양으로 저장된다", () => {
    const result = memberSchema.safeParse({ ...정상, name: " 홍길동 ", email: " hong@example.com " });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "홍길동", email: "hong@example.com", phone: "010-1234-5678" });
  });

  it("이름 빈칸, 메일 형식 오류, 번호 형식 오류는 각각 한국어로 안내", () => {
    expect(메시지({ ...정상, name: "  " })).toContain("위원 이름을 입력해 주세요.");
    expect(메시지({ ...정상, email: "hong@" })).toContain("메일 주소 형식이 올바르지 않습니다.");
    expect(메시지({ ...정상, phone: "02-123-4567" })).toContain("휴대폰 번호 형식이 올바르지 않습니다. (예: 010-1234-5678)");
  });

  it("화면 입력칸 읽기", () => {
    const form = new FormData();
    form.set("name", "홍길동");
    form.set("email", "hong@example.com");
    form.set("phone", "010-1234-5678");
    expect(readMemberForm(form)).toEqual({ name: "홍길동", email: "hong@example.com", phone: "010-1234-5678" });
  });
});
