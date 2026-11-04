// Design Ref: §5.2 안건 업로드 — "PDF만, 30MB 이하. 서버가 업로드 주소 발급 → 브라우저가 보관함에 직접 업로드 → 서버가 다시 확인"
// PRD 5번 규칙: 안건 파일은 PDF만, 30MB 이하. 이 숫자는 보관함 설정(20261104000100 마이그레이션)과 똑같이 맞춘다.
import { z } from "zod";

/** 안건 PDF 최대 크기: 30MB = 30 × 1024 × 1024 바이트 */
export const AGENDA_MAX_BYTES = 30 * 1024 * 1024;

/** 화면에 보여 줄 파일 크기 ("1.2MB", "350KB") */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(Math.round((bytes / (1024 * 1024)) * 10) / 10).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/** 파일 앞부분이 "%PDF-"로 시작하는지 (PDF 파일은 모두 이 다섯 글자로 시작한다) */
export function hasPdfHeader(head: Uint8Array): boolean {
  const 표시 = [0x25, 0x50, 0x44, 0x46, 0x2d]; // % P D F -
  return head.length >= 표시.length && 표시.every((b, i) => head[i] === b);
}

/** 보관함 안의 저장 위치: meetings/{회의 ID}/{임의 ID}.pdf — 파일 이름은 서버가 정하고, 위원이 올린 이름은 쓰지 않는다 */
export function agendaPathFor(meetingId: string, fileId: string): string {
  return `meetings/${meetingId}/${fileId}.pdf`;
}

const 경로_모양 = /^meetings\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.pdf$/;

/** 브라우저가 돌려준 저장 위치가 정말 이 회의용으로 발급한 모양인지 (다른 회의 폴더나 엉뚱한 위치 거부) */
export function isAgendaPathOf(meetingId: string, path: string): boolean {
  const match = 경로_모양.exec(path);
  return !!match && match[1] === meetingId.toLowerCase();
}

/** 업로드 주소를 받기 전 검사: 안건 제목, 파일 이름(.pdf), 크기(1바이트 ~ 30MB) */
export const agendaUploadSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { error: "안건 제목을 입력해 주세요." })
    .max(200, { error: "안건 제목은 200자 이하로 입력해 주세요." }),
  fileName: z
    .string()
    .refine((name) => name.toLowerCase().endsWith(".pdf"), { error: "PDF 파일만 올릴 수 있습니다." }),
  size: z
    .number({ error: "파일을 선택해 주세요." })
    .int()
    .min(1, { error: "빈 파일은 올릴 수 없습니다." })
    .max(AGENDA_MAX_BYTES, { error: "30MB 이하의 PDF만 올릴 수 있습니다." }),
});

export type AgendaUploadInput = z.infer<typeof agendaUploadSchema>;
