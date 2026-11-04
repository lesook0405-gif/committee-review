"use server";
// Plan 작업 6 — 로그인·로그아웃 서버 처리
// PRD 7번: 담당 팀원과 팀장은 미리 등록해 둔 계정으로만 로그인한다. (가입 화면 없음)
import { redirect } from "next/navigation";
import { z } from "zod";

import { endSession, startSession } from "@/lib/auth/session";
import { createAdminClient, createAnonClient } from "@/lib/db/supabase";

export type LoginState = { error: string | null; email: string };

const 로그인_입력 = z.object({
  email: z.email({ error: "이메일 형식이 올바르지 않습니다." }),
  password: z.string().min(1, { error: "비밀번호를 입력해 주세요." }),
});

// 계정이 없는지 비밀번호가 틀렸는지 알려 주지 않는다 (계정 존재 여부를 짐작하지 못하게)
const 로그인_실패 = "이메일 또는 비밀번호가 올바르지 않습니다.";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = 로그인_입력.safeParse({ email, password: formData.get("password") ?? "" });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 로그인_실패, email };
  }

  // 1) Supabase 로그인 서비스로 이메일·비밀번호 확인
  const { data, error } = await createAnonClient().auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { error: 로그인_실패, email };
  }

  // 2) 담당 팀원·팀장으로 등록된 계정인지 확인 (Supabase 계정만 있고 staff 표에 없으면 거부)
  const { data: staff } = await createAdminClient()
    .from("staff")
    .select("id, role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!staff || (staff.role !== "staff" && staff.role !== "lead")) {
    return { error: 로그인_실패, email };
  }

  // 3) 서명된 로그인 쿠키 저장 후 관리자 첫 화면으로
  await startSession(staff.id, staff.role);
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}
