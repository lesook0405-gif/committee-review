// Plan 작업 6 — 로그인과 역할 구분 점검 (개발 서버가 켜져 있어야 한다)
// 실행: npm run check:login   (기본 주소 http://localhost:3001, 다른 주소면 APP_URL=... 로 지정)
// 샘플 계정 비밀번호와 로그인 쿠키 값은 .env.local에서 읽어 쓰기만 하고 화면에 출력하지 않는다.
import { createHmac } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3001";
const 쿠키_이름 = "committee_session";
let 실패 = false;

function 결과(통과: boolean, 설명: string) {
  console.log(`${통과 ? "✅" : "❌"} ${설명}`);
  if (!통과) 실패 = true;
}

// lib/auth/session-token.ts 와 같은 방식으로 서명한 로그인 쿠키 (점검용)
function 로그인_쿠키(sub: string, role: "staff" | "lead"): string {
  const body = Buffer.from(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
  const sig = createHmac("sha256", process.env.SESSION_SECRET as string).update(body).digest("base64url");
  return `${쿠키_이름}=${body}.${sig}`;
}

async function 화면_글자(경로: string, 쿠키?: string): Promise<{ 상태: number; 위치: string | null; 글자: string }> {
  const 응답 = await fetch(`${APP_URL}${경로}`, { headers: 쿠키 ? { cookie: 쿠키 } : {}, redirect: "manual" });
  return { 상태: 응답.status, 위치: 응답.headers.get("location"), 글자: await 응답.text() };
}

const 공개 = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_ANON_KEY as string, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const 관리자 = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 1) 샘플 계정으로 실제 로그인이 되는지, staff 표에 맞는 역할로 등록돼 있는지
const 계정들 = [
  { 이름: "담당 팀원", 메일: process.env.SEED_STAFF_EMAIL, 비번: process.env.SEED_STAFF_PASSWORD, 역할: "staff" as const },
  { 이름: "팀장", 메일: process.env.SEED_LEAD_EMAIL, 비번: process.env.SEED_LEAD_PASSWORD, 역할: "lead" as const },
];
const 계정_ID: Record<string, string> = {};
for (const 계정 of 계정들) {
  const { data, error } = await 공개.auth.signInWithPassword({ email: 계정.메일 ?? "", password: 계정.비번 ?? "" });
  결과(!error && !!data.user, `${계정.이름} 샘플 계정 로그인 (비밀번호 확인)`);
  if (!data.user) continue;
  const { data: staff } = await 관리자.from("staff").select("role").eq("id", data.user.id).maybeSingle();
  결과(staff?.role === 계정.역할, `${계정.이름} 역할 등록 (${계정.역할})`);
  계정_ID[계정.역할] = data.user.id;
}

// 2) 로그인하지 않으면 관리자 화면이 막히는지
const 비로그인 = await 화면_글자("/admin");
결과(비로그인.상태 >= 300 && 비로그인.상태 < 400 && (비로그인.위치 ?? "").endsWith("/login"), "로그인 없이 /admin → 로그인 화면으로 이동");

// 3) 위조한 쿠키는 막히는지
const 위조 = await 화면_글자("/admin", `${쿠키_이름}=forged.value`);
결과(위조.상태 >= 300 && 위조.상태 < 400, "위조한 로그인 쿠키 → 막힘");

// 4) 담당 팀원·팀장으로 로그인하면 이름·역할이 맞게 보이는지
if (계정_ID.staff) {
  const 화면 = await 화면_글자("/admin", 로그인_쿠키(계정_ID.staff, "staff"));
  결과(화면.상태 === 200 && 화면.글자.includes("담당 팀원 계정입니다"), "담당 팀원 로그인 → 관리자 화면, 담당 팀원 안내");
  const 로그인화면 = await 화면_글자("/login", 로그인_쿠키(계정_ID.staff, "staff"));
  결과((로그인화면.위치 ?? "").endsWith("/admin"), "로그인한 상태로 /login → 관리자 화면으로 이동");
}
if (계정_ID.lead) {
  const 화면 = await 화면_글자("/admin", 로그인_쿠키(계정_ID.lead, "lead"));
  결과(화면.상태 === 200 && 화면.글자.includes("팀장 계정은 열람만"), "팀장 로그인 → 관리자 화면, 열람만 안내");
  // 쿠키에 담당 팀원이라고 적어도, 화면은 데이터베이스의 실제 역할(팀장)을 따른다
  const 바꿔치기 = await 화면_글자("/admin", 로그인_쿠키(계정_ID.lead, "staff"));
  결과(바꿔치기.글자.includes("팀장 계정은 열람만"), "쿠키 역할을 바꿔도 데이터베이스의 실제 역할(팀장)을 따름");
}

// 5) staff 표에 없는 사람의 쿠키는 막히는지 (계정이 삭제된 경우)
const 없는_사람 = await 화면_글자("/admin", 로그인_쿠키("00000000-0000-0000-0000-000000000000", "staff"));
결과(!없는_사람.글자.includes("담당 팀원 계정입니다"), "등록되지 않은 계정의 쿠키 → 관리자 화면 내용이 보이지 않음");

console.log(실패 ? "\n로그인 점검 실패 — 위 ❌ 항목을 확인하세요." : "\n로그인 점검 통과");
process.exit(실패 ? 1 : 0);
