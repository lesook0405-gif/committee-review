"use server";
// Design Ref: §7 서버 처리 — "안건 열람 기록 | 위원(링크) | 링크 유효, 이 회의의 안건"
// 위원은 로그인하지 않으므로, 매번 링크값으로 다시 확인한다. (차단·제외·만료·재발급 전 링크는 기록하지 않음)
import { resolveMemberLink } from "@/lib/auth/member-link";
import { recordFirstView } from "@/lib/db/agenda-views";
import { getMeetingAgenda } from "@/lib/db/agendas";
import { isUuid } from "@/lib/rules/ids";

/** 안건 열람 화면이 실제로 열렸을 때 첫 열람 시각을 남긴다 */
export async function recordViewAction(token: string, agendaId: string): Promise<{ ok: boolean }> {
  if (typeof token !== "string" || typeof agendaId !== "string" || !isUuid(agendaId)) return { ok: false };
  const check = await resolveMemberLink(token);
  if (!check.ok) return { ok: false };
  const agenda = await getMeetingAgenda(check.access.meeting.id, agendaId);
  if (!agenda) return { ok: false };
  await recordFirstView(agenda.id, check.access.memberId);
  return { ok: true };
}
