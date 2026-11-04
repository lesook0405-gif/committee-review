// Design Ref: §4.2·§4.3 — 앱과 Supabase(데이터베이스·PDF 보관함·로그인)를 잇는 서버 전용 연결
// 이 파일은 서버에서만 실행된다. 브라우저용 화면 코드에서 불러오면 빌드가 멈춘다.
import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 환경 변수를 읽고, 비어 있으면 무엇이 빠졌는지 한국어로 알려 준다. (값 자체는 절대 출력하지 않는다)
function readEnv(name: "SUPABASE_URL" | "SUPABASE_ANON_KEY" | "SUPABASE_SERVICE_ROLE_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경 변수 ${name}이(가) 없습니다. .env.local 파일을 확인하세요.`);
  }
  return value;
}

// 서버가 데이터와 파일을 다룰 때 쓰는 관리자용 연결 (비밀 키 사용 — 서버 안에서만)
export function createAdminClient(): SupabaseClient {
  return createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// 담당 팀원·팀장 로그인 처리에 쓰는 일반 연결 (공개 키 사용 — 그래도 브라우저로 보내지 않는다)
export function createAnonClient(): SupabaseClient {
  return createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
