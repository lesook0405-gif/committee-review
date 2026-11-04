// Design Ref: §7 서버 처리 목록 — "모든 처리는 첫 줄에서 누구인지, 권한이 있는지를 확인한다"
// 담당 팀원·팀장의 로그인 상태를 읽고·쓰는 서버 전용 도구 (데이터 접근 계층)
import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { createAdminClient } from "@/lib/db/supabase";

import { createSessionToken, SESSION_MAX_AGE_SECONDS, verifySessionToken, type StaffRole } from "./session-token";

export const SESSION_COOKIE = "committee_session";

export type CurrentStaff = {
  id: string;
  name: string;
  role: StaffRole;
};

/** 화면에 보여 줄 역할 이름 */
export const ROLE_LABEL: Record<StaffRole, string> = {
  staff: "담당 팀원",
  lead: "팀장",
};

/** 로그인 성공 시 쿠키 저장 (서버 처리 안에서만 호출) */
export async function startSession(staffId: string, role: StaffRole): Promise<void> {
  const token = createSessionToken(staffId, role, process.env.SESSION_SECRET ?? "");
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // 브라우저 스크립트가 읽을 수 없게
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // 배포 환경에서는 https로만
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** 로그아웃 — 쿠키 삭제 */
export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * 지금 로그인한 담당 팀원·팀장 (없으면 null)
 * 쿠키의 서명·만료를 확인한 뒤, 데이터베이스에서 계정이 아직 등록돼 있는지와 최신 역할을 다시 읽는다.
 * (쿠키에 적힌 역할을 그대로 믿지 않는다 — 역할이 바뀌거나 계정이 지워지면 즉시 반영)
 */
export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  // 만료 확인에 "지금 시각"을 쓰므로, 화면을 미리 만들어 두지 말고 요청이 올 때 계산하라고 알린다 (cacheComponents 규칙)
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token, process.env.SESSION_SECRET);
  if (!session) return null;

  const { data, error } = await createAdminClient()
    .from("staff")
    .select("id, name, role")
    .eq("id", session.sub)
    .maybeSingle();
  if (error || !data) return null;
  if (data.role !== "staff" && data.role !== "lead") return null;
  return { id: data.id, name: data.name, role: data.role };
}

/** 관리자 화면·서버 처리용: 로그인하지 않았으면 로그인 화면으로 보낸다 */
export async function requireStaff(): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  return staff;
}

/** 팀장이 등록·수정·마감을 시도했을 때의 오류 */
export class NotEditorError extends Error {
  constructor() {
    super("팀장 계정은 열람만 할 수 있습니다. 등록·수정·마감은 담당 팀원 계정으로 해 주세요.");
    this.name = "NotEditorError";
  }
}

/** 등록·수정·마감 같은 처리용: 담당 팀원만 통과 (팀장은 열람만 — PRD 4번) */
export async function requireEditor(): Promise<CurrentStaff> {
  const staff = await requireStaff();
  if (staff.role !== "staff") throw new NotEditorError();
  return staff;
}
