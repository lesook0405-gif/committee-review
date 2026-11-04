// Plan 작업 8 — 위원 명단 점검 (개발 서버가 켜져 있어야 한다)
// 실행: npm run check:members   (기본 주소 http://localhost:3001, 다른 주소면 APP_URL=... 로 지정)
// PRD 7번: 휴대폰 번호는 화면에서 가운데를 가린다 → 전체 번호가 브라우저로 가는 곳은 담당 팀원의 수정 화면뿐인지 확인한다.
// 점검용으로 만든 위원은 마지막에 지운다. 로그인 쿠키 값은 화면에 출력하지 않는다.
import { createHmac } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3001";
const 점검용 = "[점검용]";
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
const 풀기 = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

async function 열기(경로: string, 쿠키값: string) {
  const 응답 = await fetch(`${APP_URL}${경로}`, { headers: { cookie: 쿠키값 }, redirect: "manual" });
  return { 상태: 응답.status, 글자: (await 응답.text()).replace(/<!-- -->/g, "") };
}

// 화면의 위원 양식(이름·메일·휴대폰 칸이 있는 양식)의 숨은 칸을 받아 둔다
async function 숨은_칸(경로: string, 쿠키값: string): Promise<[string, string][]> {
  const { 글자 } = await 열기(경로, 쿠키값);
  const 양식 = [...글자.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes('name="phone"')) ?? "";
  return [...양식.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)].map((m) => [풀기(m[1]), 풀기(m[2] ?? "")]);
}

async function 보내기(경로: string, 쿠키값: string, 칸들: [string, string][]) {
  const 데이터 = new FormData();
  for (const [이름, 값] of 칸들) 데이터.append(이름, 값);
  const 응답 = await fetch(`${APP_URL}${경로}`, { method: "POST", body: 데이터, headers: { cookie: 쿠키값, origin: APP_URL }, redirect: "manual" });
  return { 상태: 응답.status, 위치: 응답.headers.get("location") };
}

// 준비: 샘플 계정, 샘플 위원회
const { data: 계정들 } = await db.from("staff").select("id, role");
const 담당 = 계정들?.find((s) => s.role === "staff")?.id;
const 팀장 = 계정들?.find((s) => s.role === "lead")?.id;
const { data: 위원회 } = await db.from("committees").select("id").like("name", "[샘플]%").maybeSingle();
if (!담당 || !팀장 || !위원회) {
  console.log("❌ 샘플 데이터가 없습니다. 먼저 npm run seed 를 실행하세요.");
  process.exit(1);
}
const 담당_쿠키 = 쿠키(담당, "staff");
const 팀장_쿠키 = 쿠키(팀장, "lead");
const 명단 = `/admin/committees/${위원회.id}?tab=members`;
await db.from("members").delete().like("name", `${점검용}%`); // 지난 점검 찌꺼기 정리

// 1) 명단 표 — 가린 번호만 보이고, 전체 번호는 화면 어디에도 없다
const { data: 위원들 } = await db.from("members").select("id, phone").eq("committee_id", 위원회.id);
const 전체번호들 = (위원들 ?? []).map((m) => m.phone);
for (const [누구, 쿠키값] of [["담당 팀원", 담당_쿠키], ["팀장", 팀장_쿠키]] as const) {
  const 화면 = await 열기(명단, 쿠키값);
  결과(화면.글자.includes("010-****-0001"), `${누구}: 명단에 가린 번호(010-****-0001) 표시`);
  결과(전체번호들.every((p) => !화면.글자.includes(p)), `${누구}: 명단 화면에 전체 번호가 하나도 없음 (위원 ${전체번호들.length}명)`);
}
const 팀장_명단 = await 열기(명단, 팀장_쿠키);
결과(!팀장_명단.글자.includes('name="phone"') && !팀장_명단.글자.includes("/members/"), "팀장: 추가 양식·수정 링크 없음");

// 2) 수정 화면 — 담당 팀원은 전체 번호, 팀장은 열람 안내만 (전체 번호 없음)
const 첫위원 = 위원들![0];
const 수정_경로 = `/admin/committees/${위원회.id}/members/${첫위원.id}`;
const 수정_담당 = await 열기(수정_경로, 담당_쿠키);
결과(수정_담당.글자.includes(`value="${첫위원.phone}"`), "담당 팀원: 수정 화면에만 전체 번호 표시");
const 수정_팀장 = await 열기(수정_경로, 팀장_쿠키);
결과(!수정_팀장.글자.includes(첫위원.phone) && 수정_팀장.글자.includes("팀장 계정은 열람만"), "팀장: 수정 화면에 전체 번호 없이 열람 안내");

// 3) 추가 — 팀장이 직접 보내면 거부, 담당 팀원은 저장 (번호는 010-0000-0099 모양으로 맞춰 저장)
const 추가_칸 = await 숨은_칸(명단, 담당_쿠키);
const 새_위원: [string, string][] = [["name", `${점검용} 가상위원`], ["email", "check-member@example.com"], ["phone", "01000000099"]];
await 보내기(명단, 팀장_쿠키, [...추가_칸, ...새_위원]);
const { data: 팀장_추가 } = await db.from("members").select("id").like("name", `${점검용}%`);
결과(추가_칸.length > 0 && (팀장_추가 ?? []).length === 0, "팀장이 위원 추가를 직접 보내도 저장 안 됨");
await 보내기(명단, 담당_쿠키, [...추가_칸, ...새_위원]);
const { data: 추가됨 } = await db.from("members").select("id, phone").like("name", `${점검용}%`).maybeSingle();
결과(추가됨?.phone === "010-0000-0099", "담당 팀원 위원 추가 → 번호를 010-0000-0099 모양으로 저장");
await 보내기(명단, 담당_쿠키, [...추가_칸, ["name", `${점검용} 잘못`], ["email", "bad@"], ["phone", "01000000098"]]);
const { data: 잘못 } = await db.from("members").select("id").eq("name", `${점검용} 잘못`);
결과((잘못 ?? []).length === 0, "메일 형식이 틀리면 저장 안 됨");

// 4) 수정 — (다른 위원회 위원을 고치지 못하게 하는 보호는 lib/db/members.ts의 "그 위원회 소속만 수정" 조건이 맡는다.
//    서버 처리에 묶인 위원회 ID는 Next.js가 암호화해 화면에 넣기 때문에, 이 스크립트로는 바꿔치기를 시험할 수 없다.)
if (추가됨) {
  const 수정_칸 = await 숨은_칸(`/admin/committees/${위원회.id}/members/${추가됨.id}`, 담당_쿠키);
  const 저장 = await 보내기(`/admin/committees/${위원회.id}/members/${추가됨.id}`, 담당_쿠키, [...수정_칸, ["name", `${점검용} 수정됨`], ["email", "check-member@example.com"], ["phone", "010 0000 0088"]]);
  const { data: 수정됨 } = await db.from("members").select("name, phone").eq("id", 추가됨.id).single();
  결과(수정됨?.name === `${점검용} 수정됨` && 수정됨.phone === "010-0000-0088", "담당 팀원 위원 정보 수정 저장 (번호 모양 맞춤)");
  결과(!!저장.위치 && 저장.위치.includes("tab=members"), "수정 후 위원 명단 탭으로 이동");
}

// 5) 없는 위원·형식이 틀린 주소
const 없음 = await 열기(`/admin/committees/${위원회.id}/members/00000000-0000-0000-0000-000000000000`, 담당_쿠키);
결과(없음.글자.includes("페이지를 찾을 수 없습니다"), "없는 위원 주소 → 찾을 수 없음 안내");

await db.from("members").delete().like("name", `${점검용}%`);
await db.from("committees").delete().like("name", `${점검용}%`);
const { count } = await db.from("members").select("*", { count: "exact", head: true }).like("name", `${점검용}%`);
결과(count === 0, "점검용 위원 정리 완료");

console.log(실패 ? "\n위원 명단 점검 실패 — 위 ❌ 항목을 확인하세요." : "\n위원 명단 점검 통과");
process.exit(실패 ? 1 : 0);
