// Plan 작업 7 — 위원회 목록·등록·평가 방식 수정 점검 (개발 서버가 켜져 있어야 한다)
// 실행: npm run check:committees   (기본 주소 http://localhost:3001, 다른 주소면 APP_URL=... 로 지정)
// 실제 화면의 등록 양식을 그대로 제출해 서버 처리까지 확인하고, 점검용으로 만든 위원회는 마지막에 지운다.
// 로그인 쿠키 값은 .env.local의 SESSION_SECRET으로 만들어 쓰기만 하고 화면에 출력하지 않는다.
import { createHmac } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3001";
const 점검용_이름 = "[점검용] 자동 삭제 위원회";
let 실패 = false;

function 결과(통과: boolean, 설명: string) {
  console.log(`${통과 ? "✅" : "❌"} ${설명}`);
  if (!통과) 실패 = true;
}

const db = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function 쿠키(sub: string, role: "staff" | "lead"): string {
  const body = Buffer.from(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
  const sig = createHmac("sha256", process.env.SESSION_SECRET as string).update(body).digest("base64url");
  return `committee_session=${body}.${sig}`;
}

async function 열기(경로: string, 쿠키값: string) {
  const 응답 = await fetch(`${APP_URL}${경로}`, { headers: { cookie: 쿠키값 }, redirect: "manual" });
  // 화면 글자 사이에 끼는 보이지 않는 표시(<!-- -->)를 지워, 보이는 그대로 비교한다
  return { 상태: 응답.status, 글자: (await 응답.text()).replace(/<!-- -->/g, "") };
}

const 풀기 = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// 화면의 평가 방식 양식을 찾아, 숨은 칸(서버 처리 연결 정보)과 함께 제출한다 — 브라우저에서 스크립트가 꺼진 상태와 같은 방식
async function 양식_제출(경로: string, 쿠키값: string, 칸들: [string, string][]) {
  const { 글자 } = await 열기(경로, 쿠키값);
  const 양식 = [...글자.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes('name="criteriaName"'));
  if (!양식) return { 상태: 0, 위치: null as string | null, 글자: "(양식 없음)" };
  const 데이터 = new FormData();
  for (const m of 양식.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)) {
    데이터.append(풀기(m[1]), 풀기(m[2] ?? ""));
  }
  for (const [이름, 값] of 칸들) 데이터.append(이름, 값);
  return 보내기(경로, 쿠키값, 데이터);
}

// 양식의 숨은 칸만 미리 받아 둔다 (화면에서 양식이 사라진 뒤에도 서버 처리에 직접 보내 보기 위해)
async function 숨은_칸(경로: string, 쿠키값: string): Promise<[string, string][]> {
  const { 글자 } = await 열기(경로, 쿠키값);
  const 양식 = [...글자.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes('name="criteriaName"')) ?? "";
  return [...양식.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)].map((m) => [풀기(m[1]), 풀기(m[2] ?? "")]);
}

async function 보내기(경로: string, 쿠키값: string, 데이터: FormData) {
  const 응답 = await fetch(`${APP_URL}${경로}`, {
    method: "POST",
    body: 데이터,
    headers: { cookie: 쿠키값, origin: APP_URL },
    redirect: "manual",
  });
  return { 상태: 응답.status, 위치: 응답.headers.get("location"), 글자: await 응답.text() };
}

const 평가_방식 = (기준: string, 제외 = true): [string, string][] => [
  ["criteriaName", "적정성"], ["criteriaMax", "30"],
  ["criteriaName", "효과성"], ["criteriaMax", "40"],
  ["criteriaName", "시급성"], ["criteriaMax", "30"],
  ["passScore", 기준],
  ...(제외 ? ([["excludeExtremes", "on"]] as [string, string][]) : []),
];

// 샘플 계정 ID (npm run seed 로 만든 계정)
const { data: 계정들 } = await db.from("staff").select("id, role");
const 담당 = 계정들?.find((s) => s.role === "staff")?.id;
const 팀장 = 계정들?.find((s) => s.role === "lead")?.id;
if (!담당 || !팀장) {
  console.log("❌ 샘플 계정이 없습니다. 먼저 npm run seed 를 실행하세요.");
  process.exit(1);
}
const 담당_쿠키 = 쿠키(담당, "staff");
const 팀장_쿠키 = 쿠키(팀장, "lead");
await db.from("committees").delete().eq("name", 점검용_이름); // 지난 점검 찌꺼기 정리

// 1) 위원회 목록
const 목록_담당 = await 열기("/admin", 담당_쿠키);
결과(목록_담당.글자.includes("[샘플] 투자심사위원회") && 목록_담당.글자.includes("위원 5명"), "위원회 목록에 샘플 위원회(위원 5명) 표시");
결과(목록_담당.글자.includes("2026. 11. 20. 14:00"), "최근 회의 일시를 한국 시간으로 표시 (2026. 11. 20. 14:00)");
결과(목록_담당.글자.includes("+ 위원회 등록"), "담당 팀원에게 [+ 위원회 등록] 버튼 보임");
const 목록_팀장 = await 열기("/admin", 팀장_쿠키);
결과(목록_팀장.글자.includes("[샘플] 투자심사위원회") && !목록_팀장.글자.includes("+ 위원회 등록"), "팀장은 목록만 보이고 등록 버튼 없음");

// 2) 등록 화면
const 등록_팀장 = await 열기("/admin/committees/new", 팀장_쿠키);
결과(!등록_팀장.글자.includes('name="criteriaName"') && 등록_팀장.글자.includes("팀장 계정은 열람만"), "팀장은 등록 화면에 양식 대신 열람 안내");

// 3) 잘못된 값 제출 → 서버가 거부 (기준 점수가 합계 초과)
const 잘못 = await 양식_제출("/admin/committees/new", 담당_쿠키, [["name", 점검용_이름], ...평가_방식("101")]);
결과(잘못.글자.includes("가결 기준 점수는 배점 합계(100점) 이하여야 합니다.") && !잘못.위치, "기준 점수가 합계를 넘으면 서버에서 거부하고 한국어 안내");
const 이름없음 = await 양식_제출("/admin/committees/new", 담당_쿠키, [["name", "  "], ...평가_방식("70")]);
결과(이름없음.글자.includes("위원회 이름을 입력해 주세요."), "위원회 이름이 비어 있으면 거부");

// 4) 올바른 값 제출 → 등록 후 상세 화면으로 이동
const 등록 = await 양식_제출("/admin/committees/new", 담당_쿠키, [["name", 점검용_이름], ...평가_방식("70")]);
const { data: 생성됨 } = await db.from("committees").select("id, criteria, pass_score, exclude_extremes").eq("name", 점검용_이름).maybeSingle();
결과(!!생성됨 && 생성됨.pass_score === 70 && 생성됨.exclude_extremes === true && JSON.stringify(생성됨.criteria).includes("효과성"), "올바른 값으로 위원회 등록 → 데이터베이스에 저장");
결과(!!등록.위치 && !!생성됨 && 등록.위치.includes(`/admin/committees/${생성됨.id}`), "등록 후 그 위원회 상세 화면으로 이동");

// 5) 팀장이 등록 처리를 직접 시도 → 서버가 거부 (화면에 양식이 없어도, 담당 팀원 화면의 연결 정보로 직접 보내 본다)
const { 글자: 담당_화면 } = await 열기("/admin/committees/new", 담당_쿠키);
const 담당_양식 = [...담당_화면.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes('name="criteriaName"')) ?? "";
const 몰래 = new FormData();
for (const m of 담당_양식.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)) 몰래.append(풀기(m[1]), 풀기(m[2] ?? ""));
for (const [이름, 값] of [["name", `${점검용_이름} (팀장 시도)`], ...평가_방식("70")] as [string, string][]) 몰래.append(이름, 값);
await fetch(`${APP_URL}/admin/committees/new`, { method: "POST", body: 몰래, headers: { cookie: 팀장_쿠키, origin: APP_URL }, redirect: "manual" });
const { data: 팀장이_만든것 } = await db.from("committees").select("id").eq("name", `${점검용_이름} (팀장 시도)`);
결과((팀장이_만든것 ?? []).length === 0, "팀장이 등록 처리를 직접 보내도 서버에서 거부 (저장 안 됨)");
if ((팀장이_만든것 ?? []).length > 0) await db.from("committees").delete().eq("name", `${점검용_이름} (팀장 시도)`);

if (생성됨) {
  const 상세 = `/admin/committees/${생성됨.id}`;

  // 6) 상세 화면 — 담당 팀원은 수정 양식, 팀장은 읽기 전용 표
  const 상세_담당 = await 열기(상세, 담당_쿠키);
  결과(상세_담당.글자.includes("평가 방식 저장") && 상세_담당.글자.includes('value="효과성"'), "담당 팀원: 상세 화면에 기존 값이 채워진 수정 양식");
  const 상세_팀장 = await 열기(상세, 팀장_쿠키);
  결과(!상세_팀장.글자.includes("평가 방식 저장") && 상세_팀장.글자.includes("배점 합계"), "팀장: 수정 양식 없이 읽기 전용 표");

  // 7) 수정 — 기준 점수 70 → 80, 제외 끄기
  // (저장 완료 문구는 브라우저 스크립트가 켜진 실제 화면에서 보인다 — 여기서는 저장 결과를 데이터베이스와 다시 연 화면으로 확인)
  await 양식_제출(상세, 담당_쿠키, 평가_방식("80", false));
  const { data: 수정됨 } = await db.from("committees").select("pass_score, exclude_extremes").eq("id", 생성됨.id).single();
  결과(수정됨?.pass_score === 80 && 수정됨?.exclude_extremes === false, "평가 방식 수정 저장 (기준 80점, 제외 꺼짐)");
  const 다시_연_화면 = await 열기(상세, 담당_쿠키);
  결과(다시_연_화면.글자.includes('value="80"'), "다시 연 수정 화면에 바뀐 값(80점) 표시");

  // 수정할 때도 잘못된 값은 거부 (항목 이름 빈칸)
  const 잘못된_수정 = await 양식_제출(상세, 담당_쿠키, [["criteriaName", " "], ["criteriaMax", "100"], ["passScore", "50"]]);
  const { data: 그대로 } = await db.from("committees").select("pass_score").eq("id", 생성됨.id).single();
  결과(그대로?.pass_score === 80 && 잘못된_수정.상태 === 200, "수정 때 항목 이름이 비면 거부 (저장 안 됨)");

  // 8) 잠긴 위원회는 수정 거부 — 잠그기 전에 양식 연결 정보를 받아 두었다가, 잠근 뒤 직접 보낸다
  const 잠그기_전_칸 = await 숨은_칸(상세, 담당_쿠키);
  await db.from("committees").update({ locked_at: new Date().toISOString() }).eq("id", 생성됨.id);
  const 잠긴_화면 = await 열기(상세, 담당_쿠키);
  결과(잠긴_화면.글자.includes("잠김") && !잠긴_화면.글자.includes("평가 방식 저장"), "잠긴 위원회: 수정 양식 대신 '잠김' 표시");
  const 잠긴_뒤_데이터 = new FormData();
  for (const [이름, 값] of [...잠그기_전_칸, ...평가_방식("60")]) 잠긴_뒤_데이터.append(이름, 값);
  const 잠긴_뒤_응답 = await 보내기(상세, 담당_쿠키, 잠긴_뒤_데이터);
  const { data: 잠금후 } = await db.from("committees").select("pass_score").eq("id", 생성됨.id).single();
  결과(잠그기_전_칸.length > 0 && 잠긴_뒤_응답.상태 === 200 && 잠금후?.pass_score === 80, "잠긴 위원회에 수정을 직접 보내도 저장 안 됨 (기준 80점 그대로)");

  // 9) 없는 위원회 주소
  const 없음 = await 열기("/admin/committees/00000000-0000-0000-0000-000000000000", 담당_쿠키);
  결과(없음.글자.includes("페이지를 찾을 수 없습니다"), "없는 위원회 주소 → 찾을 수 없음 안내");
  const 이상한주소 = await 열기("/admin/committees/not-a-real-id", 담당_쿠키);
  결과(이상한주소.글자.includes("페이지를 찾을 수 없습니다"), "형식이 틀린 주소 → 찾을 수 없음 안내");
}

// 점검용 위원회 지우기
await db.from("committees").delete().like("name", `${점검용_이름}%`);
const { count } = await db.from("committees").select("*", { count: "exact", head: true }).like("name", "[점검용]%");
결과(count === 0, "점검용 위원회 정리 완료");

console.log(실패 ? "\n위원회 점검 실패 — 위 ❌ 항목을 확인하세요." : "\n위원회 점검 통과");
process.exit(실패 ? 1 : 0);
