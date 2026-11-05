// Design Ref: §5.1 — PDF는 서버를 거치지 않고 보관함으로 바로 올린다(서버 액션 1MB·Vercel 약 4.5MB 제한 때문).
//   서버는 "올려도 되는지 확인 → 업로드 주소 발급 → 올린 뒤 다시 확인"만 한다.
// Design Ref: §7 서버 처리 — 안건 업로드 확인·등록: 마감 전 재확인, 30MB 이하, 앞부분 %PDF, 실패 시 올린 파일 삭제
// 권한 확인은 이 함수를 부르는 서버 처리(app/admin/meetings/agenda-actions.ts)에서 먼저 한다.
// 작업 14: 안건 교체(첫 평가 전만, 열람 기록 초기화, 옛 파일 삭제)도 같은 3단계로 한다.
import "server-only";

import { randomUUID } from "node:crypto";

import { AGENDA_MAX_BYTES, agendaPathFor, hasPdfHeader, isAgendaPathOf } from "@/lib/rules/agenda";

import { getMeeting } from "./meetings";
import { createAdminClient } from "./supabase";

/** 비공개 보관함 이름 (마이그레이션 20261104000100) */
const BUCKET = "agendas";

export type AgendaRow = {
  id: string;
  position: number;
  title: string;
  sizeBytes: number;
  uploadedAt: string;
};

/** 회의의 안건 목록 (순서대로) */
export async function listAgendas(meetingId: string): Promise<AgendaRow[]> {
  const { data, error } = await createAdminClient()
    .from("agendas")
    .select("id, position, title, pdf_size_bytes, uploaded_at")
    .eq("meeting_id", meetingId)
    .order("position");
  if (error) throw new Error(`안건 목록을 불러오지 못했습니다. (${error.message})`);
  return data.map((a) => ({
    id: a.id,
    position: a.position,
    title: a.title,
    sizeBytes: a.pdf_size_bytes,
    uploadedAt: a.uploaded_at,
  }));
}

/** PDF 임시 열람 주소 유효 시간: 5분 (Design §7) */
export const AGENDA_VIEW_URL_SECONDS = 5 * 60;

/** 위원 열람용: 이 회의의 안건이면 안건 정보, 아니면 null (다른 회의 안건 ID를 넣어도 열리지 않게 회의로 함께 거른다) */
export async function getMeetingAgenda(meetingId: string, agendaId: string) {
  const { data, error } = await createAdminClient()
    .from("agendas")
    .select("id, position, title, pdf_path")
    .eq("id", agendaId)
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (error) throw new Error(`안건을 불러오지 못했습니다. (${error.message})`);
  return data;
}

/** 비공개 보관함의 PDF를 5분만 열 수 있는 임시 주소 */
export async function createAgendaViewUrl(pdfPath: string): Promise<string> {
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUrl(pdfPath, AGENDA_VIEW_URL_SECONDS);
  if (error || !data) throw new Error(`안건 PDF 주소를 만들지 못했습니다. (${error?.message ?? "알 수 없음"})`);
  return data.signedUrl;
}

export type PrepareResult =
  | { kind: "ok"; path: string; uploadUrl: string }
  | { kind: "not-found" | "closed" };

/** ① 업로드 주소 발급 — 진행 중인 회의만. 저장 위치는 서버가 정하고(meetings/{회의}/{임의 ID}.pdf), 주소는 그 위치 하나에만 쓸 수 있다 */
export async function prepareAgendaUpload(meetingId: string): Promise<PrepareResult> {
  const meeting = await getMeeting(meetingId);
  if (!meeting) return { kind: "not-found" };
  if (meeting.status === "closed") return { kind: "closed" };

  const path = agendaPathFor(meetingId, randomUUID());
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(`업로드 주소를 만들지 못했습니다. (${error.message})`);
  return { kind: "ok", path, uploadUrl: data.signedUrl };
}

/**
 * 올린 파일을 서버가 직접 확인한다: 보관함에 있는지, 크기 1바이트~30MB인지, 앞부분이 %PDF- 인지.
 * 통과하면 실제 크기를 돌려준다. (지우는 것은 부르는 쪽에서 결과에 따라 한다)
 */
async function 올린_파일_검사(path: string): Promise<{ size: number } | "missing" | "too-large" | "not-pdf"> {
  const storage = createAdminClient().storage.from(BUCKET);
  const { data: info, error: infoError } = await storage.info(path);
  if (infoError || !info) return "missing";
  const size = Number(info.size);
  if (!Number.isInteger(size) || size < 1 || size > AGENDA_MAX_BYTES) return "too-large";

  // 파일 전체를 받지 않고 앞 5바이트만 읽어 PDF인지 확인한다
  const { data: signed, error: signError } = await storage.createSignedUrl(path, 60);
  if (signError || !signed) return "missing";
  const head = await fetch(signed.signedUrl, { headers: { range: "bytes=0-4" } });
  if (!head.ok || !hasPdfHeader(new Uint8Array(await head.arrayBuffer()))) return "not-pdf";
  return { size };
}

export type ConfirmResult = "ok" | "not-found" | "closed" | "bad-path" | "missing" | "too-large" | "not-pdf";

/**
 * ③ 올린 뒤 다시 확인하고 안건으로 등록한다.
 * 마감 전인지, 크기 30MB 이하인지, 파일 앞부분이 %PDF- 인지 서버가 직접 확인하고, 통과하지 못하면 올린 파일을 지운다.
 */
export async function confirmAgendaUpload(meetingId: string, path: string, title: string): Promise<ConfirmResult> {
  // 이 회의용으로 발급한 모양의 위치가 아니면 손대지 않고 거부 (남의 파일을 지우거나 등록하지 않게)
  if (!isAgendaPathOf(meetingId, path)) return "bad-path";

  const db = createAdminClient();
  const storage = db.storage.from(BUCKET);
  const 지우고 = async (result: ConfirmResult): Promise<ConfirmResult> => {
    await storage.remove([path]);
    return result;
  };

  const meeting = await getMeeting(meetingId);
  if (!meeting) return 지우고("not-found");
  if (meeting.status === "closed") return 지우고("closed");

  // 이미 등록된 위치면 다시 등록하지 않는다 (같은 요청이 두 번 와도 안건이 두 개 생기지 않게)
  const { data: 이미 } = await db.from("agendas").select("id").eq("pdf_path", path).maybeSingle();
  if (이미) return "ok";

  const 파일 = await 올린_파일_검사(path);
  if (파일 === "missing") return "missing";
  if (typeof 파일 === "string") return 지우고(파일);
  const size = 파일.size;

  // 순서 = 지금까지 안건 중 가장 큰 번호 + 1. 동시에 두 건이 들어와 번호가 겹치면 다시 시도한다
  for (let 시도 = 0; 시도 < 3; 시도++) {
    const { data: last } = await db
      .from("agendas")
      .select("position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await db.from("agendas").insert({
      meeting_id: meetingId,
      position: (last?.position ?? 0) + 1,
      title,
      pdf_path: path,
      pdf_size_bytes: size,
    });
    if (!error) return "ok";
    if (error.code !== "23505") {
      await storage.remove([path]);
      throw new Error(`안건을 저장하지 못했습니다. (${error.message})`);
    }
  }
  await storage.remove([path]);
  throw new Error("안건 순서가 겹쳐 저장하지 못했습니다. 다시 시도해 주세요.");
}

// ─────────────────────────────────────────────
// 안건 PDF 교체 (PLAN 작업 14)
// PRD 5번: 그 안건에 첫 평가(제외·제척 위원 기록, 대리 입력 포함)가 제출되기 전까지만 교체. 교체하면 열람 기록 초기화.
// ─────────────────────────────────────────────

/** 안건별 평가 기록 수 (교체 버튼을 보여 줄지 정할 때 쓴다 — 제외·제척 위원 기록과 대리 입력도 모두 센다) */
export async function listAgendaEvaluationCounts(agendaIds: readonly string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>(agendaIds.map((id) => [id, 0]));
  if (agendaIds.length === 0) return counts;
  const { data, error } = await createAdminClient().from("evaluations").select("agenda_id").in("agenda_id", agendaIds);
  if (error) throw new Error(`평가 기록을 불러오지 못했습니다. (${error.message})`);
  for (const e of data ?? []) counts.set(e.agenda_id, (counts.get(e.agenda_id) ?? 0) + 1);
  return counts;
}

export type ReplacePrepareResult = PrepareResult | { kind: "evaluated" };

/** ① 교체용 업로드 주소 발급 — 진행 중인 회의의 그 회의 안건이고, 평가 기록이 0건일 때만 */
export async function prepareAgendaReplace(meetingId: string, agendaId: string): Promise<ReplacePrepareResult> {
  const agenda = await getMeetingAgenda(meetingId, agendaId);
  if (!agenda) return { kind: "not-found" };
  if ((await listAgendaEvaluationCounts([agendaId])).get(agendaId)) return { kind: "evaluated" };
  return prepareAgendaUpload(meetingId); // 회의 확인·새 저장 위치·주소 발급은 새로 올릴 때와 같다
}

export type ReplaceResult = ConfirmResult | "evaluated";

/**
 * ③ 올린 새 파일을 확인한 뒤 교체한다.
 * 파일 확인(크기·%PDF) → 데이터베이스 함수 replace_agenda_pdf가 "마감 전·평가 0건"을 안건을 잠근 채 다시 확인하고
 * 파일 위치를 바꾸며 그 안건의 열람 기록을 지운다 → 성공하면 옛 파일을 지운다. 실패하면 새로 올린 파일을 지운다.
 */
export async function confirmAgendaReplace(meetingId: string, agendaId: string, path: string): Promise<ReplaceResult> {
  if (!isAgendaPathOf(meetingId, path)) return "bad-path";
  const storage = createAdminClient().storage.from(BUCKET);
  const 지우고 = async (result: ReplaceResult): Promise<ReplaceResult> => {
    await storage.remove([path]);
    return result;
  };

  const agenda = await getMeetingAgenda(meetingId, agendaId);
  if (!agenda) return 지우고("not-found");
  if (agenda.pdf_path === path) return "ok"; // 같은 요청이 두 번 왔으면 이미 교체된 상태

  const 파일 = await 올린_파일_검사(path);
  if (파일 === "missing") return "missing";
  if (typeof 파일 === "string") return 지우고(파일);

  const { data, error } = await createAdminClient().rpc("replace_agenda_pdf", {
    p_meeting_id: meetingId,
    p_agenda_id: agendaId,
    p_new_path: path,
    p_new_size: 파일.size,
  });
  if (error) {
    await storage.remove([path]);
    throw new Error(`안건을 교체하지 못했습니다. (${error.message})`);
  }
  const 결과 = data as { result: "ok" | "not-found" | "closed" | "evaluated"; old_path?: string };
  if (결과.result !== "ok") return 지우고(결과.result);

  // 교체가 끝난 뒤 옛 파일 삭제 (실패해도 위원은 옛 파일 주소를 받을 방법이 없으므로 교체 자체는 그대로 둔다)
  if (결과.old_path && 결과.old_path !== path) await storage.remove([결과.old_path]);
  return "ok";
}
