// Design Ref: §5.2 평가 입력 "(입력 중) 기기에 임시 저장" / PRD must 2
//   "위원이 입력 중인 점수는 제출 전까지 그 기기에 자동으로 임시 저장해, 네트워크가 끊기거나 화면을 닫았다 다시 열어도 이어서 입력할 수 있게 한다."
// 임시 저장은 위원 기기의 브라우저(localStorage)에만 남고 서버로 보내지 않는다. 제출해야 담당자에게 전달된다.
// 저장·읽기 규칙을 화면과 분리해 여기에 둔다(테스트하기 쉽게). 실제 localStorage 접근은 components/EvaluationForm.tsx에서 한다.
import type { Criterion } from "./evaluation";

/** 임시 저장 보관 기간: 7일 (링크도 마감 7일 뒤 만료되므로, 그보다 오래 남겨 두지 않는다) */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const DRAFT_VERSION = 1;
const MAX_TEXT_LENGTH = 12; // 점수 칸에 의미 있는 글자 수 상한 (실제 규칙은 evaluation.ts의 검사)

/**
 * 보관 이름 — 링크값은 넣지 않는다(기기에 비밀 값을 남기지 않기 위해).
 * 회의 참석 기록 ID(위원 1명·회의 1건당 하나, 링크를 재발급해도 같음)와 안건 ID로 위원·안건별로 따로 저장한다.
 */
export function draftStorageKey(meetingMemberId: string, agendaId: string): string {
  return `eval-draft:${meetingMemberId}:${agendaId}`;
}

/** 평가 방식(항목 이름·배점)의 서명 — 저장 당시와 다르면 임시 저장은 쓰지 않는다 */
export function criteriaSignature(criteria: readonly Criterion[]): string {
  return criteria.map((c) => `${c.name}\u0001${c.maxScore}`).join("\u0002");
}

/** 임시 저장 글 만들기 */
export function serializeDraft(criteria: readonly Criterion[], texts: readonly string[], now: Date): string {
  return JSON.stringify({ v: DRAFT_VERSION, sig: criteriaSignature(criteria), texts, savedAt: now.getTime() });
}

/**
 * 저장된 글 → 입력칸 글자. 망가졌거나, 옛 평가 방식이거나, 7일이 지났거나, 미래 시각이면 null.
 * (브라우저 저장소는 누구나 고칠 수 있는 값이므로 모양을 모두 확인한다. 실제 점수 검사는 제출할 때 서버가 다시 한다)
 */
export function parseDraft(raw: string | null, criteria: readonly Criterion[], now: Date): string[] | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const d = value as Record<string, unknown>;
  if (d.v !== DRAFT_VERSION || d.sig !== criteriaSignature(criteria)) return null;
  if (typeof d.savedAt !== "number" || !Number.isFinite(d.savedAt)) return null;
  const age = now.getTime() - d.savedAt;
  if (age < 0 || age > DRAFT_MAX_AGE_MS) return null;
  if (!Array.isArray(d.texts) || d.texts.length !== criteria.length) return null;
  if (!d.texts.every((t) => typeof t === "string" && t.length <= MAX_TEXT_LENGTH)) return null;
  return d.texts as string[];
}

/** 임시 저장을 남길 가치가 있는지 — 서버에 낸 점수(또는 빈칸)와 똑같으면 남기지 않는다 */
export function isWorthSaving(texts: readonly string[], baseTexts: readonly string[]): boolean {
  return texts.some((t, i) => t !== (baseTexts[i] ?? ""));
}
