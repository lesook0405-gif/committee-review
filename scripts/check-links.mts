// Plan 작업 11 — 위원 링크 발급·재발급·차단·만료 점검 (개발 서버가 켜져 있어야 한다)
// 실행: npm run check:links   (기본 주소 http://localhost:3001, 다른 주소면 APP_URL=... 로 지정)
// 화면의 버튼이 보내는 요청과, 화면을 거치지 않고 서버 처리를 직접 부르는 요청을 모두 확인한다.
// 링크값은 화면·로그에 출력하지 않는다. 점검용 회의는 마지막에 지운다.
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

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

// 앱과 따로 계산한 지문 (앱의 계산이 맞는지 독립적으로 확인)
const 지문 = (token: string) =>
  createHmac("sha256", createHash("sha256").update(`fingerprint:${process.env.MEMBER_LINK_SECRET}`).digest()).update(token).digest("hex");

async function 열기(경로: string, 쿠키값: string) {
  const 응답 = await fetch(`${APP_URL}${경로}`, { headers: { cookie: 쿠키값 }, redirect: "manual" });
  return (await 응답.text()).replace(/<!-- -->/g, "");
}
async function 숨은_칸(경로: string, 쿠키값: string, 표시: string): Promise<[string, string][]> {
  const 글자 = await 열기(경로, 쿠키값);
  const 양식 = [...글자.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes(표시)) ?? "";
  return [...양식.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)].map((m) => [풀기(m[1]), 풀기(m[2] ?? "")]);
}
async function 보내기(경로: string, 쿠키값: string, 칸들: [string, string][]) {
  const 데이터 = new FormData();
  for (const [이름, 값] of 칸들) 데이터.append(이름, 값);
  const 응답 = await fetch(`${APP_URL}${경로}`, { method: "POST", body: 데이터, headers: { cookie: 쿠키값, origin: APP_URL }, redirect: "manual" });
  return { 위치: 응답.headers.get("location") };
}

// 서버 처리 ID (개발 서버가 만든 목록에서 이름으로 찾음)
// 개발 서버가 다시 켜진 직후에는 서버 처리 목록이 비어 있으므로, 회의 상세 화면을 한 번 열어 목록을 채운다
{
  const { data: 담당자 } = await db.from("staff").select("id").eq("role", "staff").limit(1).maybeSingle();
  const { data: 아무회의 } = await db.from("meetings").select("id").limit(1).maybeSingle();
  if (담당자 && 아무회의) await fetch(`${APP_URL}/admin/meetings/${아무회의.id}`, { headers: { cookie: 쿠키(담당자.id, "staff") } });
}
const 목록 = JSON.parse(readFileSync(".next/dev/server/server-reference-manifest.json", "utf8")) as {
  node: Record<string, { exportedName: string; filename: string }>;
};
const 처리_ID = (파일: string, 이름: string) =>
  Object.entries(목록.node).find(([, v]) => v.exportedName === 이름 && v.filename.endsWith(파일))?.[0] ?? "";
const ID = {
  복사: 처리_ID("link-actions.ts", "revealLinkAction"),
  재발급: 처리_ID("link-actions.ts", "reissueLinkAction"),
  차단: 처리_ID("link-actions.ts", "blockLinkAction"),
  제외: 처리_ID("meetings/actions.ts", "removeParticipantAction"),
  추가: 처리_ID("meetings/actions.ts", "addParticipantAction"),
};
if (Object.values(ID).some((v) => !v)) {
  console.log("❌ 서버 처리 ID를 찾지 못했습니다. 개발 서버에서 회의 상세 화면을 한 번 연 뒤 다시 실행하세요.");
  process.exit(1);
}
async function 부르기(id: string, 쿠키값: string, 경로: string, args: unknown[]): Promise<string> {
  const 응답 = await fetch(`${APP_URL}${경로}`, {
    method: "POST",
    headers: { cookie: 쿠키값, origin: APP_URL, "next-action": id, accept: "text/x-component", "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  return 응답.text();
}
const 링크값 = (응답: string) => /"path":"\/m\/([A-Za-z0-9_-]{43})"/.exec(응답)?.[1];

// 준비
const { data: 계정들 } = await db.from("staff").select("id, role");
const 담당 = 계정들?.find((s) => s.role === "staff")?.id;
const 팀장 = 계정들?.find((s) => s.role === "lead")?.id;
const { data: 위원회 } = await db.from("committees").select("id").like("name", "[샘플]%").maybeSingle();
if (!담당 || !팀장 || !위원회 || !process.env.MEMBER_LINK_SECRET) {
  console.log("❌ 샘플 데이터나 MEMBER_LINK_SECRET이 없습니다. npm run seed 와 .env.local을 확인하세요.");
  process.exit(1);
}
const 담당_쿠키 = 쿠키(담당, "staff");
const 팀장_쿠키 = 쿠키(팀장, "lead");
await db.from("meetings").delete().like("title", `${점검용}%`);
const { data: 위원들 } = await db.from("members").select("id, name").eq("committee_id", 위원회.id).order("name");
const [가, 나, 다] = 위원들!;

// 1) 회의 등록 → 고른 위원마다 서로 다른 링크가 바로 발급됨
const 회의_탭 = `/admin/committees/${위원회.id}?tab=meetings`;
const 등록_칸 = await 숨은_칸(회의_탭, 담당_쿠키, 'name="startsAt"');
await 보내기(회의_탭, 담당_쿠키, [
  ...등록_칸,
  ["title", `${점검용} 링크 회의`],
  ["startsAt", "2099-01-02T10:00"],
  ["memberIds", 가.id],
  ["memberIds", 나.id],
]);
const { data: 회의 } = await db.from("meetings").select("id").like("title", `${점검용}%`).single();
const 상세 = `/admin/meetings/${회의!.id}`;
const 기록 = async (memberId: string) =>
  (await db.from("meeting_members").select("link_ciphertext, link_fingerprint, blocked_at, removed_at").eq("meeting_id", 회의!.id).eq("member_id", memberId).maybeSingle()).data;
const 처음_가 = await 기록(가.id);
const 처음_나 = await 기록(나.id);
결과(!!처음_가?.link_fingerprint && !!처음_나?.link_fingerprint && 처음_가.link_fingerprint !== 처음_나.link_fingerprint, "회의 등록 → 참석 위원마다 서로 다른 링크 발급");

// 2) 화면 — 팀장에게는 링크 영역이 없음
const 팀장_화면 = await 열기(상세, 팀장_쿠키);
const 담당_화면 = await 열기(상세, 담당_쿠키);
결과(!/링크 복사|재발급|링크 사용 가능|\/m\//.test(팀장_화면), "팀장 화면: 링크 상태·복사·재발급·차단이 보이지 않음");
결과(담당_화면.includes(`${가.name} 링크 복사`) && 담당_화면.includes(`${가.name} 링크 차단`), "담당 팀원 화면: [링크 복사][재발급][차단]이 보임");
결과(!/\/m\/[A-Za-z0-9_-]{43}/.test(담당_화면), "링크값은 화면에 미리 넣어 두지 않음 (누를 때만 받음)");

// 3) 링크 복사 — 팀장 거부, 담당 팀원은 원래 값을 되찾음, 저장된 것은 암호문
결과(!링크값(await 부르기(ID.복사, 팀장_쿠키, 상세, [회의!.id, 가.id])), "팀장이 링크 복사를 직접 불러도 링크값을 받지 못함");
const 첫_링크 = 링크값(await 부르기(ID.복사, 담당_쿠키, 상세, [회의!.id, 가.id]));
결과(!!첫_링크 && 지문(첫_링크) === 처음_가!.link_fingerprint, "담당 팀원 링크 복사 → 저장된 지문과 맞는 원래 링크값");
결과(!!첫_링크 && !처음_가!.link_ciphertext!.includes(첫_링크), "데이터베이스에는 링크값이 아닌 암호문만 저장");

// 4) 재발급 — 팀장 거부 / 담당 팀원은 새 값, 예전 값은 더 이상 맞지 않음
await 부르기(ID.재발급, 팀장_쿠키, 상세, [회의!.id, 가.id]);
결과((await 기록(가.id))!.link_fingerprint === 처음_가!.link_fingerprint, "팀장이 재발급을 직접 불러도 바뀌지 않음");
await 부르기(ID.재발급, 담당_쿠키, 상세, [회의!.id, 가.id]);
const 재발급후 = await 기록(가.id);
const 새_링크 = 링크값(await 부르기(ID.복사, 담당_쿠키, 상세, [회의!.id, 가.id]));
결과(재발급후!.link_fingerprint !== 처음_가!.link_fingerprint && !!새_링크 && 새_링크 !== 첫_링크, "재발급 → 새 링크값");
const { count: 옛_지문 } = await db.from("meeting_members").select("*", { count: "exact", head: true }).eq("link_fingerprint", 지문(첫_링크!));
결과(옛_지문 === 0, "재발급 전 링크값은 어느 기록과도 맞지 않음 (즉시 못 씀)");

// 5) 차단 — 팀장 거부 / 차단 후 복사 불가 / 차단 후 재발급하면 차단 풀림
await 부르기(ID.차단, 팀장_쿠키, 상세, [회의!.id, 가.id]);
결과((await 기록(가.id))!.blocked_at === null, "팀장이 차단을 직접 불러도 바뀌지 않음");
await 부르기(ID.차단, 담당_쿠키, 상세, [회의!.id, 가.id]);
결과(!!(await 기록(가.id))!.blocked_at, "담당 팀원 차단 → 차단 시각 기록");
결과(!링크값(await 부르기(ID.복사, 담당_쿠키, 상세, [회의!.id, 가.id])), "차단된 링크는 복사해 주지 않음");
결과((await 열기(상세, 담당_쿠키)).includes("링크 차단됨"), "화면에 '링크 차단됨' 표시");
await 부르기(ID.재발급, 담당_쿠키, 상세, [회의!.id, 가.id]);
const 차단후_재발급 = await 기록(가.id);
결과(차단후_재발급!.blocked_at === null && 차단후_재발급!.link_fingerprint !== 재발급후!.link_fingerprint, "차단 후 재발급 → 차단 풀리고 새 링크");

// 6) 회의에서 제외 → 재발급·복사 거부 / 다시 추가 → 새 링크
await 부르기(ID.제외, 담당_쿠키, 상세, [회의!.id, 나.id]);
const 제외_재발급 = await 부르기(ID.재발급, 담당_쿠키, 상세, [회의!.id, 나.id]);
결과(제외_재발급.includes("회의에서 제외된 위원") && (await 기록(나.id))!.link_fingerprint === 처음_나!.link_fingerprint, "회의에서 제외된 위원 재발급 → 거부");
결과(!링크값(await 부르기(ID.복사, 담당_쿠키, 상세, [회의!.id, 나.id])), "회의에서 제외된 위원 링크는 복사해 주지 않음");
await 부르기(ID.추가, 담당_쿠키, 상세, [회의!.id, 나.id]);
const 다시추가 = await 기록(나.id);
결과(다시추가!.removed_at === null && 다시추가!.link_fingerprint !== 처음_나!.link_fingerprint, "다시 추가 → 링크 새로 발급 (예전 링크 못 씀)");
await 부르기(ID.추가, 담당_쿠키, 상세, [회의!.id, 다.id]);
결과(!!(await 기록(다.id))?.link_fingerprint, "처음 추가한 위원도 링크 발급");

// 7) 마감 후 7일 안 → 재발급·차단 가능 / 7일 지남 → 만료, 버튼 없음·거부
const 일 = 24 * 60 * 60 * 1000;
await db.from("meetings").update({ status: "closed", closed_at: new Date(Date.now() - 6 * 일).toISOString() }).eq("id", 회의!.id);
const 마감_전 = await 기록(가.id);
await 부르기(ID.재발급, 담당_쿠키, 상세, [회의!.id, 가.id]);
결과((await 기록(가.id))!.link_fingerprint !== 마감_전!.link_fingerprint, "마감 6일 뒤(만료 전) 재발급 허용");
await 부르기(ID.차단, 담당_쿠키, 상세, [회의!.id, 가.id]);
결과(!!(await 기록(가.id))!.blocked_at, "마감 6일 뒤(만료 전) 차단 허용");

await db.from("meetings").update({ closed_at: new Date(Date.now() - 8 * 일).toISOString() }).eq("id", 회의!.id);
const 만료_전 = await 기록(가.id);
const 만료_재발급 = await 부르기(ID.재발급, 담당_쿠키, 상세, [회의!.id, 가.id]);
결과(만료_재발급.includes("만료") && (await 기록(가.id))!.link_fingerprint === 만료_전!.link_fingerprint, "마감 8일 뒤(만료) 재발급 거부");
const 만료_화면 = await 열기(상세, 담당_쿠키);
결과(만료_화면.includes("링크가 모두 만료되었습니다") && !만료_화면.includes(`${가.name} 링크 재발급`), "만료된 회의 화면: 안내만 있고 재발급 버튼 없음");

// 정리
await db.from("meetings").delete().like("title", `${점검용}%`);
const { count } = await db.from("meetings").select("*", { count: "exact", head: true }).like("title", `${점검용}%`);
결과(count === 0, "점검용 회의 정리 완료");

console.log(실패 ? "\n링크 점검 실패 — 위 ❌ 항목을 확인하세요." : "\n링크 점검 통과");
process.exit(실패 ? 1 : 0);
