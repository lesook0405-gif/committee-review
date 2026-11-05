"use server";
// Design Ref: §7 서버 처리 — "평가 마감 | 담당 팀원 | 평가 대상 전원 제출"
// 화면에서 버튼을 막는 것과 별도로, 서버에서 담당 팀원인지 다시 확인하고, 전원 제출 여부는 데이터베이스 함수가 잠근 채 다시 확인한다.
import { refresh } from "next/cache";

import { editorDenial } from "@/lib/auth/session";
import { closeMeeting } from "@/lib/db/meetings";
import { isUuid } from "@/lib/rules/ids";

export type CloseState = { errors: string[]; closed?: boolean };

/** 평가 마감 — 평가 대상 전원이 모든 안건에 제출했을 때만. 마감하면 되돌릴 수 없고 평가를 고칠 수 없다 */
export async function closeMeetingAction(meetingId: string): Promise<CloseState> {
  const 거부 = await editorDenial();
  if (거부) return { errors: [거부] };
  if (!isUuid(meetingId)) return { errors: ["회의를 찾을 수 없습니다."] };

  const result = await closeMeeting(meetingId);
  switch (result.kind) {
    case "ok":
      refresh();
      return { errors: [], closed: true };
    case "missing":
      return { errors: [`아직 제출하지 않은 평가 대상 위원이 ${result.count}명 있어 마감할 수 없습니다.`] };
    case "no-agendas":
      return { errors: ["안건이 하나도 없는 회의는 마감할 수 없습니다. 안건 PDF를 먼저 올려 주세요."] };
    case "not-started":
      return { errors: ["회의가 시작되기 전에는 마감할 수 없습니다."] };
    case "closed":
      return { errors: ["이미 마감된 회의입니다."] };
    default:
      return { errors: ["회의를 찾을 수 없습니다."] };
  }
}
