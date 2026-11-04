// Plan 작업 1 — 앱이 Supabase에 제대로 연결되는지 확인하는 점검 스크립트
// 실행: npm run check:supabase   (.env.local의 값을 읽어서 쓴다. 키 값은 화면에 출력하지 않는다)
import { createClient } from "@supabase/supabase-js";

const 필요한_값 = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "MEMBER_LINK_SECRET"] as const;

let 실패 = false;

// 1) 필요한 환경 변수가 모두 있는지 (있음 / 없음만 표시)
for (const 이름 of 필요한_값) {
  const 있음 = Boolean(process.env[이름]);
  console.log(`${있음 ? "✅" : "❌"} ${이름}: ${있음 ? "값 있음" : "값 없음"}`);
  if (!있음) 실패 = true;
}

if (!실패) {
  const url = process.env.SUPABASE_URL as string;

  // 2) 공개 키로 로그인 서비스에 접속되는지
  try {
    const 응답 = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY as string },
    });
    console.log(`${응답.ok ? "✅" : "❌"} 로그인 서비스 접속 (공개 키): ${응답.ok ? "성공" : `실패 (응답 코드 ${응답.status})`}`);
    if (!응답.ok) 실패 = true;
  } catch {
    console.log("❌ 로그인 서비스 접속 (공개 키): 네트워크 오류");
    실패 = true;
  }

  // 3) 비밀 키로 파일 보관함 목록을 읽을 수 있는지 (관리자 권한 확인)
  const 관리자 = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await 관리자.storage.listBuckets();
  if (error) {
    console.log(`❌ 파일 보관함 접속 (비밀 키): 실패 — ${error.message}`);
    실패 = true;
  } else {
    console.log(`✅ 파일 보관함 접속 (비밀 키): 성공 (보관함 ${data.length}개)`);
  }
}

console.log(실패 ? "\n연결 점검 실패 — 위 ❌ 항목을 확인하세요." : "\n연결 점검 통과 — 앱이 Supabase에 연결됩니다.");
process.exit(실패 ? 1 : 0);
