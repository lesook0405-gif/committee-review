// 실제로 쓸 담당 팀원·팀장 로그인 계정 만들기 (가입 화면이 없으므로 미리 등록한다)
// 실행: npm run create-accounts
//   .env.local의 STAFF_*, LEAD_* 칸을 먼저 채운다. 여러 번 실행해도 된다(이미 있으면 이름·비밀번호만 갱신).
//   팀장 칸을 모두 비워 두면 담당 팀원 계정만 만든다. 비밀번호는 화면에 출력하지 않는다. 샘플 데이터는 만들지 않는다.
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../types/database.ts";

function 필수(이름: string): string {
  const 값 = process.env[이름]?.trim();
  if (!값) {
    console.error(`❌ .env.local의 ${이름} 칸이 비어 있습니다. 채운 뒤 다시 실행하세요.`);
    process.exit(1);
  }
  return 값;
}

const db = createClient<Database>(필수("SUPABASE_URL"), 필수("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function 계정_준비(접두: "STAFF" | "LEAD", 역할: "staff" | "lead", 역할_이름: string) {
  const 이름 = 필수(`${접두}_NAME`);
  const 이메일 = 필수(`${접두}_EMAIL`);
  const 비밀번호 = 필수(`${접두}_PASSWORD`);
  if (비밀번호.length < 8) {
    console.error(`❌ ${접두}_PASSWORD는 8자 이상이어야 합니다.`);
    process.exit(1);
  }

  const 목록 = await db.auth.admin.listUsers({ perPage: 1000 });
  if (목록.error) {
    console.error(`❌ 계정 목록 조회 실패 — ${목록.error.message}`);
    process.exit(1);
  }
  const 기존 = 목록.data.users.find((u) => u.email?.toLowerCase() === 이메일.toLowerCase());
  let id: string;
  if (기존) {
    const { error } = await db.auth.admin.updateUserById(기존.id, { password: 비밀번호 });
    if (error) {
      console.error(`❌ ${역할_이름} 비밀번호 갱신 실패 — ${error.message}`);
      process.exit(1);
    }
    id = 기존.id;
  } else {
    const { data, error } = await db.auth.admin.createUser({ email: 이메일, password: 비밀번호, email_confirm: true });
    if (error || !data.user) {
      console.error(`❌ ${역할_이름} 계정 만들기 실패 — ${error?.message}`);
      process.exit(1);
    }
    id = data.user.id;
  }
  const { error } = await db.from("staff").upsert({ id, name: 이름, role: 역할 });
  if (error) {
    console.error(`❌ ${역할_이름} 역할 저장 실패 — ${error.message}`);
    process.exit(1);
  }
  console.log(`✅ ${역할_이름} 계정 준비 완료: ${이름} (${이메일})`);
}

await 계정_준비("STAFF", "staff", "담당 팀원");
if (process.env.LEAD_EMAIL?.trim() || process.env.LEAD_PASSWORD?.trim() || process.env.LEAD_NAME?.trim()) {
  await 계정_준비("LEAD", "lead", "팀장");
} else {
  console.log("ℹ️ 팀장 칸이 비어 있어 팀장 계정은 만들지 않았습니다.");
}
