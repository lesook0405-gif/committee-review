"use server";
// Design Ref: §7 서버 처리 — "안건 업로드 주소 발급 | 담당 팀원 | 마감 전" / "안건 업로드 확인·등록 | 담당 팀원 | 마감 전 재확인, 30MB, %PDF"
// 두 처리 모두 화면에서 버튼을 숨기는 것과 별도로, 서버에서 담당 팀원인지 다시 확인한다(팀장·로그인 안 한 사람 거부).
import { refresh } from "next/cache";

import { editorDenial } from "@/lib/auth/session";
import {
  confirmAgendaReplace,
  confirmAgendaUpload,
  prepareAgendaReplace,
  prepareAgendaUpload,
  type ReplaceResult,
} from "@/lib/db/agendas";
import { issueMessages } from "@/lib/rules/committee";
import { agendaUploadSchema } from "@/lib/rules/agenda";
import { isUuid } from "@/lib/rules/ids";

export type PrepareState = { errors: string[]; path?: string; uploadUrl?: string };
export type ConfirmState = { errors: string[]; saved?: boolean };

const 안내: Record<Exclude<ReplaceResult, "ok">, string> = {
  evaluated: "이미 평가 기록이 있는 안건이라 PDF를 교체할 수 없습니다.",
  "not-found": "회의나 안건을 찾을 수 없습니다.",
  closed: "마감된 회의에는 안건을 올리거나 교체할 수 없습니다.",
  "bad-path": "업로드 정보가 올바르지 않습니다. 다시 올려 주세요.",
  missing: "올린 파일을 찾을 수 없습니다. 다시 올려 주세요.",
  "too-large": "30MB 이하의 PDF만 올릴 수 있습니다.",
  "not-pdf": "PDF 파일이 아닙니다. PDF 파일만 올릴 수 있습니다.",
};

/** ① 업로드 주소 발급 (파일 자체는 받지 않고 제목·이름·크기만 확인) */
export async function prepareAgendaUploadAction(
  meetingId: string,
  input: { title: string; fileName: string; size: number },
): Promise<PrepareState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };
  if (!isUuid(meetingId)) return { errors: [안내["not-found"]] };

  const parsed = agendaUploadSchema.safeParse(input);
  if (!parsed.success) return { errors: issueMessages(parsed.error) };

  const result = await prepareAgendaUpload(meetingId);
  if (result.kind !== "ok") return { errors: [안내[result.kind]] };
  return { errors: [], path: result.path, uploadUrl: result.uploadUrl };
}

/** ③ 올린 뒤 확인·등록 */
export async function confirmAgendaUploadAction(meetingId: string, input: { path: string; title: string }): Promise<ConfirmState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };
  if (!isUuid(meetingId)) return { errors: [안내["not-found"]] };

  const title = agendaUploadSchema.shape.title.safeParse(input.title);
  if (!title.success) return { errors: issueMessages(title.error) };

  const result = await confirmAgendaUpload(meetingId, String(input.path ?? ""), title.data);
  if (result !== "ok") return { errors: [안내[result]] };
  refresh();
  return { errors: [], saved: true };
}

// ─────────────────────────────────────────────
// 안건 PDF 교체 (PLAN 작업 14) — 첫 평가 전까지만, 교체하면 열람 기록 초기화
// ─────────────────────────────────────────────

/** 교체 ① 업로드 주소 발급 (평가 기록 0건인지 먼저 확인) */
export async function prepareAgendaReplaceAction(
  meetingId: string,
  agendaId: string,
  input: { fileName: string; size: number },
): Promise<PrepareState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };
  if (!isUuid(meetingId) || !isUuid(agendaId)) return { errors: [안내["not-found"]] };

  // 제목은 바꾸지 않으므로 검사용 자리 값을 넣고, 파일 이름·크기만 확인한다
  const parsed = agendaUploadSchema.safeParse({ title: "교체", fileName: input?.fileName, size: input?.size });
  if (!parsed.success) return { errors: issueMessages(parsed.error) };

  const result = await prepareAgendaReplace(meetingId, agendaId);
  if (result.kind !== "ok") return { errors: [안내[result.kind]] };
  return { errors: [], path: result.path, uploadUrl: result.uploadUrl };
}

/** 교체 ③ 올린 뒤 확인·교체 (마감 전·평가 0건을 다시 확인, 옛 파일 삭제, 열람 기록 초기화) */
export async function confirmAgendaReplaceAction(meetingId: string, agendaId: string, input: { path: string }): Promise<ConfirmState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };
  if (!isUuid(meetingId) || !isUuid(agendaId)) return { errors: [안내["not-found"]] };

  const result = await confirmAgendaReplace(meetingId, agendaId, String(input?.path ?? ""));
  if (result !== "ok") return { errors: [안내[result]] };
  refresh();
  return { errors: [], saved: true };
}
