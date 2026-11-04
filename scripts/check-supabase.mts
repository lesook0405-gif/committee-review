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

  // 4) Plan 작업 2 — 데이터 구조(표 9개)가 만들어졌는지
  const 표_목록 = [
    "staff", "committees", "members", "meetings", "meeting_members",
    "agendas", "agenda_views", "recusals", "evaluations",
  ] as const;
  for (const 표 of 표_목록) {
    const { error: 표_오류 } = await 관리자.from(표).select("*", { count: "exact", head: true });
    console.log(`${표_오류 ? "❌" : "✅"} 표 ${표}: ${표_오류 ? `없음 — ${표_오류.message}` : "있음"}`);
    if (표_오류) 실패 = true;
  }

  // 5) 평가 방식 규칙(항목 1~10개, 배점 양의 정수, 기준 점수 0~합계)을 데이터베이스가 지키는지
  //    잘못된 값은 거부되어야 하고, 올바른 값은 저장된 뒤 곧바로 지운다.
  const 잘못된_예 = [
    { 설명: "항목 0개", criteria: [], pass_score: 0 },
    { 설명: "항목 11개", criteria: Array.from({ length: 11 }, (_, i) => ({ name: `항목${i + 1}`, maxScore: 10 })), pass_score: 50 },
    { 설명: "배점 소수", criteria: [{ name: "적정성", maxScore: 30.5 }], pass_score: 10 },
    { 설명: "기준 점수가 합계 초과", criteria: [{ name: "적정성", maxScore: 30 }], pass_score: 31 },
  ];
  for (const 예 of 잘못된_예) {
    const { error: 거부 } = await 관리자.from("committees").insert({ name: "점검용", criteria: 예.criteria, pass_score: 예.pass_score });
    console.log(`${거부 ? "✅" : "❌"} 잘못된 평가 방식 거부 (${예.설명}): ${거부 ? "거부됨" : "저장됨 (규칙 확인 필요)"}`);
    if (!거부) 실패 = true;
  }
  const { data: 저장됨, error: 저장_오류 } = await 관리자
    .from("committees")
    .insert({
      name: "점검용(자동 삭제)",
      criteria: [{ name: "적정성", maxScore: 30 }, { name: "효과성", maxScore: 40 }, { name: "시급성", maxScore: 30 }],
      pass_score: 70,
    })
    .select("id")
    .single();
  console.log(`${저장_오류 ? "❌" : "✅"} 올바른 평가 방식 저장: ${저장_오류 ? `실패 — ${저장_오류.message}` : "성공"}`);
  if (저장_오류) 실패 = true;

  // 6) 공개 키로는 표를 읽을 수 없는지 (행 단위 보안 확인) — 점검용 행이 실제로 있는 동안 확인
  if (저장됨) {
    const 공개 = createClient(url, process.env.SUPABASE_ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: 공개_결과 } = await 공개.from("committees").select("id").eq("id", 저장됨.id);
    const 막힘 = !공개_결과 || 공개_결과.length === 0;
    console.log(`${막힘 ? "✅" : "❌"} 공개 키로 표 읽기 차단: ${막힘 ? "차단됨" : "읽힘 (보안 설정 확인 필요)"}`);
    if (!막힘) 실패 = true;
    await 관리자.from("committees").delete().eq("id", 저장됨.id);
  }
  // 거부되지 않고 잘못 저장된 점검용 행이 있으면 함께 지운다
  await 관리자.from("committees").delete().eq("name", "점검용");
}

console.log(실패 ? "\n연결 점검 실패 — 위 ❌ 항목을 확인하세요." : "\n연결 점검 통과 — 앱이 Supabase에 연결됩니다.");
process.exit(실패 ? 1 : 0);
