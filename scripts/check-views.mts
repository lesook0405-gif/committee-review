// Plan 작업 13 — 첫 열람 기록과 "열람 N / M"·"회의 전 열람 N / M" 점검 (개발 서버가 켜져 있어야 한다)
// 실행: npm run check:views   (기본 주소 http://localhost:3001, 다른 주소면 APP_URL=... 로 지정)
// 위원 브라우저가 열람 화면을 연 뒤 보내는 "열람 기록" 요청을 그대로 보내 보고, 회의 상세의 숫자가 규칙대로인지 확인한다.
// 링크값은 출력하지 않고, 점검용 회의와 파일은 마지막에 지운다.
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3001";
const 점검용 = "[점검용]";
const 보관함 = "agendas";
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
const 지문 = (token: string) =>
  createHmac("sha256", createHash("sha256").update(`fingerprint:${process.env.MEMBER_LINK_SECRET}`).digest()).update(token).digest("hex");
const 열기 = async (경로: string, 쿠키값 = "") =>
  (await (await fetch(`${APP_URL}${경로}`, { headers: { cookie: 쿠키값 }, redirect: "manual" })).text()).replace(/<!-- -->/g, "");

// 준비
const { data: 계정들 } = await db.from("staff").select("id, role");
const 담당 = 계정들?.find((s) => s.role === "staff")?.id;
const 팀장 = 계정들?.find((s) => s.role === "lead")?.id;
const { data: 위원회 } = await db.from("committees").select("id").like("name", "[샘플]%").maybeSingle();
if (!담당 || !팀장 || !위원회 || !process.env.MEMBER_LINK_SECRET) {
  console.log("❌ 샘플 데이터나 MEMBER_LINK_SECRET이 없습니다. npm run seed 와 .env.local을 확인하세요.");
  process.exit(1);
}
async function 정리() {
  const { data: ms } = await db.from("meetings").select("id").like("title", `${점검용}%`);
  for (const m of ms ?? []) {
    const { data: f } = await db.storage.from(보관함).list(`meetings/${m.id}`);
    if (f?.length) await db.storage.from(보관함).remove(f.map((x) => `meetings/${m.id}/${x.name}`));
  }
  await db.from("meetings").delete().like("title", `${점검용}%`);
}
await 정리();
const { data: 위원들 } = await db.from("members").select("id, name").eq("committee_id", 위원회.id).order("name");
const [가, 나, 다, 라] = 위원들!;

async function 회의_만들기(제목: string, 안건수: number) {
  const { data: m } = await db.from("meetings").insert({ committee_id: 위원회!.id, title: 제목, starts_at: "2099-01-02T01:00:00Z" }).select("id").single();
  const ids: string[] = [];
  for (let i = 1; i <= 안건수; i++) {
    const path = `meetings/${m!.id}/check-${i}.pdf`;
    await db.storage.from(보관함).copy("sample/agenda-1.pdf", path);
    const { data: a } = await db.from("agendas").insert({ meeting_id: m!.id, position: i, title: `점검 안건 ${i}`, pdf_path: path, pdf_size_bytes: 721 }).select("id").single();
    ids.push(a!.id);
  }
  return { id: m!.id, agendaIds: ids };
}
async function 링크_주기(meetingId: string, memberId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.from("meeting_members").upsert(
    { meeting_id: meetingId, member_id: memberId, link_ciphertext: "check-only", link_fingerprint: 지문(token), link_issued_at: new Date().toISOString(), blocked_at: null, removed_at: null },
    { onConflict: "meeting_id,member_id" },
  );
  return token;
}
const 회의 = await 회의_만들기(`${점검용} 열람 회의`, 2);
const 다른회의 = await 회의_만들기(`${점검용} 다른 회의`, 1);
const [안건1, 안건2] = 회의.agendaIds;
const 링크 = { 가: await 링크_주기(회의.id, 가.id), 나: await 링크_주기(회의.id, 나.id), 다: await 링크_주기(회의.id, 다.id), 라: await 링크_주기(회의.id, 라.id) };
const 상세 = `/admin/meetings/${회의.id}`;

// 서버 처리 ID — 위원 열람 화면을 한 번 열어 개발 서버가 목록을 만들게 한 뒤 찾는다
await 열기(`/m/${링크.라}/a/${안건1}`);
const 목록 = JSON.parse(readFileSync(".next/dev/server/server-reference-manifest.json", "utf8")) as {
  node: Record<string, { exportedName: string; filename: string }>;
};
const 기록_ID = Object.entries(목록.node).find(([, v]) => v.exportedName === "recordViewAction" && v.filename.endsWith("m/[token]/actions.ts"))?.[0];
if (!기록_ID) {
  console.log("❌ 열람 기록 서버 처리 ID를 찾지 못했습니다.");
  process.exit(1);
}
// 위원 브라우저가 열람 화면을 연 뒤 보내는 요청과 같다
const 열람_기록 = (token: string, agendaId: string) =>
  fetch(`${APP_URL}/m/${token}/a/${agendaId}`, {
    method: "POST",
    headers: { origin: APP_URL, "next-action": 기록_ID, accept: "text/x-component", "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify([token, agendaId]),
  }).then((r) => r.text());
const 기록 = async (agendaId: string, memberId: string) =>
  (await db.from("agenda_views").select("first_viewed_at").eq("agenda_id", agendaId).eq("member_id", memberId).maybeSingle()).data;

// 1) 화면을 서버에서 받아 가기만 하면(미리 불러오기 등) 기록하지 않음
await db.from("agenda_views").delete().eq("agenda_id", 안건1); // 위의 ID 찾기용 열기에서 남은 것이 있으면 지움
await 열기(`/m/${링크.가}/a/${안건1}`);
결과(!(await 기록(안건1, 가.id)), "열람 화면을 서버에서 받아 가기만 하면 기록되지 않음 (미리 불러오기로 잘못 세지 않음)");

// 2) 브라우저가 연 뒤 기록 → 처음 시각 하나만, 다시 열어도 그대로
await 열람_기록(링크.가, 안건1);
const 처음 = await 기록(안건1, 가.id);
결과(!!처음, "열람 화면이 열린 뒤 첫 열람 시각 기록");
await new Promise((r) => setTimeout(r, 1100));
await 열람_기록(링크.가, 안건1);
결과((await 기록(안건1, 가.id))?.first_viewed_at === 처음?.first_viewed_at, "다시 열어도 처음 연 시각은 바뀌지 않음");

// 3) 막혀야 하는 기록
await 열람_기록(링크.가, 다른회의.agendaIds[0]);
결과(!(await 기록(다른회의.agendaIds[0], 가.id)), "다른 회의 안건 ID로 기록 요청 → 기록 안 됨");
await db.from("meeting_members").update({ blocked_at: new Date().toISOString() }).eq("meeting_id", 회의.id).eq("member_id", 나.id);
await 열람_기록(링크.나, 안건1);
결과(!(await 기록(안건1, 나.id)), "차단된 링크로 기록 요청 → 기록 안 됨");
await 열람_기록(randomBytes(32).toString("base64url"), 안건1);
const { count: 엉뚱 } = await db.from("agenda_views").select("*", { count: "exact", head: true }).eq("agenda_id", 안건1);
결과(엉뚱 === 1, "발급한 적 없는 링크로 기록 요청 → 기록 안 됨");
await db.from("meeting_members").update({ blocked_at: null }).eq("meeting_id", 회의.id).eq("member_id", 나.id);

// 4) 숫자 만들기
//    안건 1: 가·나는 회의 전에, 다는 회의 시작 후에 열람. 라는 회의 전에 열었다가 회의에서 제외됨
//    안건 2: 다만 열람했는데 다는 안건 2에 제척됨
await 열람_기록(링크.나, 안건1);
await 열람_기록(링크.라, 안건1);
await db.from("agenda_views").update({ first_viewed_at: "2026-01-01T00:00:00Z" }).eq("agenda_id", 안건1).in("member_id", [가.id, 나.id, 라.id]);
await db.from("meeting_members").update({ removed_at: new Date().toISOString() }).eq("meeting_id", 회의.id).eq("member_id", 라.id);
await db.from("meetings").update({ starts_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", 회의.id);
await 열람_기록(링크.다, 안건1);
await 열람_기록(링크.다, 안건2);
await db.from("recusals").insert({ agenda_id: 안건2, member_id: 다.id });
결과(!!(await 기록(안건1, 라.id)) && !!(await 기록(안건2, 다.id)), "제외·제척된 위원의 열람 기록도 지우지 않고 남아 있음");

const 담당_화면 = await 열기(상세, 쿠키(담당, "staff"));
결과(담당_화면.includes('aria-label="열람 3명 중 3명"'), "안건 1: 열람 3 / 3 (제외된 위원은 분자·분모에서 뺌)");
결과(담당_화면.includes('aria-label="회의 전 열람 3명 중 2명"'), "안건 1: 회의 전 열람 2 / 3 (회의 시작 후에 연 위원은 뺌)");
결과(담당_화면.includes('aria-label="열람 2명 중 0명"') && 담당_화면.includes('aria-label="회의 전 열람 2명 중 0명"'), "안건 2: 열람 0 / 2 (제척된 위원은 분자·분모에서 뺌)");
const 팀장_화면 = await 열기(상세, 쿠키(팀장, "lead"));
결과(팀장_화면.includes('aria-label="열람 3명 중 3명"'), "팀장 화면에도 열람 현황이 보임");

await 정리();
const { count } = await db.from("meetings").select("*", { count: "exact", head: true }).like("title", `${점검용}%`);
결과(count === 0, "점검용 회의·안건·열람 기록·파일 정리 완료");

console.log(실패 ? "\n열람 기록 점검 실패 — 위 ❌ 항목을 확인하세요." : "\n열람 기록 점검 통과");
process.exit(실패 ? 1 : 0);
