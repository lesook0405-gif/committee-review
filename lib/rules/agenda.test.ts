// 안건 업로드 규칙 테스트 — PRD "PDF만, 30MB 이하"를 경계값까지 확인한다
import { describe, expect, it } from "vitest";

import { AGENDA_MAX_BYTES, agendaPathFor, agendaUploadSchema, formatFileSize, hasPdfHeader, isAgendaPathOf } from "./agenda";

const 회의 = "e4af50f8-43e6-456c-aafa-45af088dbc0f";
const 다른회의 = "c380a8ff-c835-46eb-a50e-33ef7917445e";
const 파일 = "11111111-2222-4333-8444-555555555555";

describe("안건 파일 크기 제한", () => {
  const 검사 = (size: number) => agendaUploadSchema.safeParse({ title: "안건", fileName: "a.pdf", size }).success;

  it("30MB는 정확히 31,457,280바이트", () => {
    expect(AGENDA_MAX_BYTES).toBe(31457280);
  });
  it("30MB까지 통과, 1바이트라도 넘으면 거부", () => {
    expect(검사(AGENDA_MAX_BYTES)).toBe(true);
    expect(검사(AGENDA_MAX_BYTES + 1)).toBe(false);
  });
  it("빈 파일(0바이트) 거부", () => {
    expect(검사(0)).toBe(false);
  });
});

describe("안건 입력 검사", () => {
  it("PDF가 아닌 파일 이름 거부, 대문자 .PDF는 통과", () => {
    expect(agendaUploadSchema.safeParse({ title: "안건", fileName: "a.docx", size: 10 }).success).toBe(false);
    expect(agendaUploadSchema.safeParse({ title: "안건", fileName: "A.PDF", size: 10 }).success).toBe(true);
  });
  it("제목 빈칸 거부, 앞뒤 공백은 지움", () => {
    expect(agendaUploadSchema.safeParse({ title: "  ", fileName: "a.pdf", size: 10 }).success).toBe(false);
    expect(agendaUploadSchema.parse({ title: "  가상기업 A  ", fileName: "a.pdf", size: 10 }).title).toBe("가상기업 A");
  });
});

describe("PDF 앞부분 확인", () => {
  const 글자 = (s: string) => new TextEncoder().encode(s);
  it("%PDF- 로 시작하면 PDF", () => {
    expect(hasPdfHeader(글자("%PDF-1.4\n..."))).toBe(true);
  });
  it("이름만 .pdf인 다른 파일은 거부", () => {
    expect(hasPdfHeader(글자("PK\u0003\u0004"))).toBe(false); // 워드·엑셀 파일 앞부분
    expect(hasPdfHeader(글자("%PD"))).toBe(false); // 너무 짧음
  });
});

describe("보관함 저장 위치", () => {
  it("이 회의 폴더로 발급한 위치만 인정", () => {
    const 위치 = agendaPathFor(회의, 파일);
    expect(위치).toBe(`meetings/${회의}/${파일}.pdf`);
    expect(isAgendaPathOf(회의, 위치)).toBe(true);
  });
  it("다른 회의 폴더, 샘플 폴더, 상위 폴더 이동은 거부", () => {
    expect(isAgendaPathOf(다른회의, agendaPathFor(회의, 파일))).toBe(false);
    expect(isAgendaPathOf(회의, "sample/agenda-1.pdf")).toBe(false);
    expect(isAgendaPathOf(회의, `meetings/${회의}/../${파일}.pdf`)).toBe(false);
  });
});

describe("파일 크기 표시", () => {
  it("MB는 소수 첫째 자리, 작은 파일은 KB", () => {
    expect(formatFileSize(AGENDA_MAX_BYTES)).toBe("30.0MB");
    expect(formatFileSize(1572864)).toBe("1.5MB");
    expect(formatFileSize(2048)).toBe("2KB");
    expect(formatFileSize(10)).toBe("1KB");
  });
});
