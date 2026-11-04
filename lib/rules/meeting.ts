// Design Ref: §6.2 meetings — "일시는 한국 시간(Asia/Seoul)으로 입력받아 시간대 포함 형식으로 저장하고,
//   비교는 서버 현재 시각으로 한다. 일시는 회의 시작 전까지만 수정."
// 한국은 서머타임이 없어 항상 UTC+9다.
import { z } from "zod";

const KST_OFFSET = "+09:00";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 화면의 날짜·시간 칸 값("2026-11-20T14:00")을 한국 시간으로 읽어 시간대 포함 형식으로 바꾼다.
 * 형식이 틀리거나 없는 날짜(2월 30일 등)면 null
 */
export function kstInputToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00${KST_OFFSET}`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // 2월 30일처럼 달력에 없는 날은 자동으로 다음 달로 넘어가므로, 다시 한국 시간으로 바꿔 같은지 확인한다
  if (isoToKstInput(date.toISOString()) !== `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`) return null;
  return iso;
}

/** 저장된 시각을 화면의 날짜·시간 칸 값("2026-11-20T14:00", 한국 시간)으로 바꾼다 */
export function isoToKstInput(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 16);
}

/** 회의 시작 전인지 (일시 수정·평가 시작 판단에 쓴다) */
export function isBeforeStart(startsAtIso: string, now: Date): boolean {
  return now.getTime() < new Date(startsAtIso).getTime();
}

export const meetingSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { error: "회차 이름을 입력해 주세요." })
    .max(100, { error: "회차 이름은 100자 이하로 입력해 주세요." }),
  startsAt: z.string().transform((value, ctx) => {
    const iso = kstInputToIso(value);
    if (!iso) {
      ctx.addIssue({ code: "custom", message: "회의 일시를 올바르게 입력해 주세요. (한국 시간)" });
      return z.NEVER;
    }
    return iso;
  }),
});

export const startsAtSchema = meetingSchema.pick({ startsAt: true });

export type MeetingInput = z.infer<typeof meetingSchema>;
