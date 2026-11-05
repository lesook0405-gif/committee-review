// 안건 PDF를 브라우저에서 보관함으로 직접 올릴 때 함께 쓰는 조각 (새 안건 올리기·안건 교체)
// Design Ref: §5.1 — 서버가 준 업로드 주소로 파일을 바로 보낸다. 서버는 앞뒤로 다시 확인한다.
import { AGENDA_MAX_BYTES } from "@/lib/rules/agenda";

/** 화면에서 먼저 알려 주는 파일 검사 (서버도 똑같이 다시 검사한다) */
export function pdfFileProblems(file: File | null): string[] {
  if (!file) return ["PDF 파일을 선택해 주세요."];
  if (!file.name.toLowerCase().endsWith(".pdf")) return ["PDF 파일만 올릴 수 있습니다."];
  if (file.size > AGENDA_MAX_BYTES) return ["30MB 이하의 PDF만 올릴 수 있습니다. 선택한 파일이 30MB를 넘습니다."];
  if (file.size === 0) return ["빈 파일은 올릴 수 없습니다."];
  return [];
}

/** 업로드 주소로 파일을 보낸다. 실패하면 한국어 안내, 성공하면 null */
export async function putPdf(uploadUrl: string, file: File): Promise<string | null> {
  const 응답 = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "content-type": "application/pdf", "x-upsert": "false" },
  });
  // 보관함도 PDF·30MB 제한을 따로 걸어 두었으므로, 여기서 거부되면 대부분 형식·크기 문제다
  return 응답.ok ? null : "파일을 올리지 못했습니다. PDF 파일이고 30MB 이하인지 확인한 뒤 다시 시도해 주세요.";
}
