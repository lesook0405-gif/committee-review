// Plan 작업 10 — 안건 PDF 업로드 점검 (개발 서버가 켜져 있어야 한다)
// 실행: npm run check:agendas   (기본 주소 http://localhost:3001, 다른 주소면 APP_URL=... 로 지정)
// 화면의 [안건 올리기]가 하는 3단계(주소 발급 → 보관함에 직접 업로드 → 확인·등록)를 그대로 따라 하고,
// 화면을 거치지 않고 서버 처리를 직접 불러도 막히는지 확인한다. 점검용 회의와 파일은 마지막에 지운다.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3001";
const 점검용 = "[점검용]";
const 보관함 = "agendas";
const 최대 = 30 * 1024 * 1024;
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
  return (await 응답.text()).replace(/<!-- -->/g, "");
}

// 개발 서버가 만든 서버 처리 목록에서 이름으로 ID를 찾는다 (화면의 버튼이 내부적으로 쓰는 값)
// 개발 서버가 다시 켜진 직후에는 서버 처리 목록이 비어 있으므로, 회의 상세 화면을 한 번 열어 목록을 채운다
{
  const { data: 담당자 } = await db.from("staff").select("id").eq("role", "staff").limit(1).maybeSingle();
  const { data: 아무회의 } = await db.from("meetings").select("id").limit(1).maybeSingle();
  if (담당자 && 아무회의) await fetch(`${APP_URL}/admin/meetings/${아무회의.id}`, { headers: { cookie: 쿠키(담당자.id, "staff") } });
}
const 목록 = JSON.parse(readFileSync(".next/dev/server/server-reference-manifest.json", "utf8")) as {
  node: Record<string, { exportedName: string; filename: string }>;
};
const 처리_ID = (이름: string) =>
  Object.entries(목록.node).find(([, v]) => v.exportedName === 이름 && v.filename.endsWith("agenda-actions.ts"))?.[0];
const 발급_ID = 처리_ID("prepareAgendaUploadAction");
const 등록_ID = 처리_ID("confirmAgendaUploadAction");
if (!발급_ID || !등록_ID) {
  console.log("❌ 서버 처리 ID를 찾지 못했습니다. 개발 서버에서 회의 상세 화면을 한 번 연 뒤 다시 실행하세요.");
  process.exit(1);
}

// 서버 처리를 직접 부른다 (화면을 거치지 않은 요청 = 공격자가 보낼 수 있는 요청)
async function 부르기(id: string, 쿠키값: string, 경로: string, args: unknown[]): Promise<string> {
  const 응답 = await fetch(`${APP_URL}${경로}`, {
    method: "POST",
    headers: { cookie: 쿠키값, origin: APP_URL, "next-action": id, accept: "text/x-component", "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  return 응답.text();
}

const 샘플_PDF = (글: string) =>
  new TextEncoder().encode(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n% ${글}\ntrailer<</Root 1 0 R>>\n%%EOF\n`);

async function 올리기(주소: string, 내용: Uint8Array<ArrayBuffer>, 형식 = "application/pdf") {
  return fetch(주소, { method: "PUT", body: new Blob([내용], { type: 형식 }), headers: { "content-type": 형식, "x-upsert": "false" } });
}

const 꺼내기 = (응답: string) => ({
  path: /"path":"(meetings\/[^"]+)"/.exec(응답)?.[1],
  uploadUrl: /"uploadUrl":"([^"]+)"/.exec(응답)?.[1],
});

// 준비
const { data: 계정들 } = await db.from("staff").select("id, role");
const 담당 = 계정들?.find((s) => s.role === "staff")?.id;
const 팀장 = 계정들?.find((s) => s.role === "lead")?.id;
const { data: 위원회 } = await db.from("committees").select("id").like("name", "[샘플]%").maybeSingle();
const { data: 샘플회의 } = await db.from("meetings").select("id").eq("committee_id", 위원회?.id ?? "").like("title", "제1차%").maybeSingle();
if (!담당 || !팀장 || !위원회 || !샘플회의) {
  console.log("❌ 샘플 데이터가 없습니다. 먼저 npm run seed 를 실행하세요.");
  process.exit(1);
}
const 담당_쿠키 = 쿠키(담당, "staff");
const 팀장_쿠키 = 쿠키(팀장, "lead");
await db.from("meetings").delete().like("title", `${점검용}%`);

const { data: 회의 } = await db
  .from("meetings")
  .insert({ committee_id: 위원회.id, title: `${점검용} 안건 회의`, starts_at: "2099-01-02T01:00:00Z" })
  .select("id")
  .single();
if (!회의) process.exit(1);
const 상세 = `/admin/meetings/${회의.id}`;
const 안건_수 = async () => (await db.from("agendas").select("id").eq("meeting_id", 회의.id)).data?.length ?? -1;
const 보관함_파일 = async () => (await db.storage.from(보관함).list(`meetings/${회의.id}`)).data?.map((f) => f.name) ?? [];
const 입력 = (size: number, fileName = "agenda.pdf") => ({ title: "가상기업 C 투자 심사", fileName, size });

// 1) 화면 — 팀장은 올리기 양식 없음, 담당 팀원은 있음
결과(!(await 열기(상세, 팀장_쿠키)).includes('name="file"'), "팀장: 안건 올리기 양식이 보이지 않음");
결과((await 열기(상세, 담당_쿠키)).includes('name="file"'), "담당 팀원: 안건 올리기 양식이 보임");

// 2) 팀장이 직접 불러도 업로드 주소가 나오지 않고, 등록도 안 됨
const 팀장_발급 = await 부르기(발급_ID, 팀장_쿠키, 상세, [회의.id, 입력(1000)]);
결과(!꺼내기(팀장_발급).uploadUrl && 팀장_발급.includes("팀장 계정은"), "팀장이 업로드 주소 발급을 직접 불러도 거부");

// 3) 주소 발급 전 검사 — 30MB 초과·PDF 아닌 이름은 주소를 주지 않음
const 큰_발급 = await 부르기(발급_ID, 담당_쿠키, 상세, [회의.id, 입력(최대 + 1)]);
결과(!꺼내기(큰_발급).uploadUrl && 큰_발급.includes("30MB 이하"), "30MB를 1바이트라도 넘으면 업로드 주소를 주지 않음");
const 워드_발급 = await 부르기(발급_ID, 담당_쿠키, 상세, [회의.id, 입력(1000, "agenda.docx")]);
결과(!꺼내기(워드_발급).uploadUrl && 워드_발급.includes("PDF 파일만"), "PDF가 아닌 파일 이름은 업로드 주소를 주지 않음");

// 4) 정상 3단계 — 주소 발급 → 직접 업로드 → 확인·등록
const pdf = 샘플_PDF("check agenda 1");
const 첫 = 꺼내기(await 부르기(발급_ID, 담당_쿠키, 상세, [회의.id, 입력(pdf.byteLength)]));
결과(!!첫.uploadUrl && !!첫.path?.startsWith(`meetings/${회의.id}/`), "담당 팀원: 이 회의 폴더용 업로드 주소를 받음");
결과((await 올리기(첫.uploadUrl!, pdf)).ok, "업로드 주소로 보관함에 직접 올라감 (서버를 거치지 않음)");

await 부르기(등록_ID, 팀장_쿠키, 상세, [회의.id, { path: 첫.path, title: "팀장 등록" }]);
결과((await 안건_수()) === 0, "팀장이 확인·등록을 직접 불러도 안건이 생기지 않음");

await 부르기(등록_ID, 담당_쿠키, 상세, [회의.id, { path: 첫.path, title: "  가상기업 C 투자 심사  " }]);
const { data: 등록됨 } = await db.from("agendas").select("position, title, pdf_size_bytes").eq("meeting_id", 회의.id);
결과(
  등록됨?.length === 1 && 등록됨[0].position === 1 && 등록됨[0].title === "가상기업 C 투자 심사" && 등록됨[0].pdf_size_bytes === pdf.byteLength,
  "확인·등록 → 1번 안건으로 저장 (제목 앞뒤 공백 제거, 실제 파일 크기 기록)",
);
await 부르기(등록_ID, 담당_쿠키, 상세, [회의.id, { path: 첫.path, title: "두 번째 요청" }]);
결과((await 안건_수()) === 1, "같은 파일로 등록을 두 번 보내도 안건은 1건");
결과((await 열기(상세, 담당_쿠키)).includes("1. 가상기업 C 투자 심사"), "회의 상세 화면 안건 목록에 보임");

// 5) 이름만 .pdf인 가짜 파일 → 서버가 앞부분을 읽어 거부하고 올린 파일을 지움
const 가짜 = 꺼내기(await 부르기(발급_ID, 담당_쿠키, 상세, [회의.id, 입력(20)]));
await 올리기(가짜.uploadUrl!, new TextEncoder().encode("this is not a pdf..."));
const 가짜_등록 = await 부르기(등록_ID, 담당_쿠키, 상세, [회의.id, { path: 가짜.path, title: "가짜" }]);
결과(가짜_등록.includes("PDF 파일이 아닙니다") && (await 안건_수()) === 1, "내용이 PDF가 아닌 파일 → 등록 거부");
결과(!(await 보관함_파일()).some((n) => 가짜.path!.endsWith(n)), "거부한 가짜 파일은 보관함에서 지워짐");

// 6) 보관함 자체 제한 — PDF 형식이 아니거나 30MB를 넘으면 보관함이 받지 않음
const 글 = 꺼내기(await 부르기(발급_ID, 담당_쿠키, 상세, [회의.id, 입력(20)]));
결과(!(await 올리기(글.uploadUrl!, new TextEncoder().encode("plain text"), "text/plain")).ok, "보관함: PDF 형식이 아닌 파일은 받지 않음");
const 큰 = 꺼내기(await 부르기(발급_ID, 담당_쿠키, 상세, [회의.id, 입력(최대)]));
const 큰_내용 = new Uint8Array(최대 + 1);
큰_내용.set(샘플_PDF("big"));
결과(!(await 올리기(큰.uploadUrl!, 큰_내용)).ok, "보관함: 30MB를 1바이트 넘는 파일은 받지 않음");

// 7) 엉뚱한 위치 등록 시도 — 다른 회의 폴더·샘플 파일·없는 파일
const 다른_회의_경로 = `meetings/${샘플회의.id}/11111111-2222-4333-8444-555555555555.pdf`;
const 다른 = await 부르기(등록_ID, 담당_쿠키, 상세, [회의.id, { path: 다른_회의_경로, title: "x" }]);
결과(다른.includes("업로드 정보가 올바르지 않습니다") && (await 안건_수()) === 1, "다른 회의 폴더 위치로 등록 → 거부");
await 부르기(등록_ID, 담당_쿠키, 상세, [회의.id, { path: "sample/agenda-1.pdf", title: "x" }]);
결과((await db.storage.from(보관함).exists("sample/agenda-1.pdf")).data === true && (await 안건_수()) === 1, "샘플 안건 파일 위치로 등록 → 거부, 원래 파일은 그대로");
const 없음 = await 부르기(등록_ID, 담당_쿠키, 상세, [회의.id, { path: `meetings/${회의.id}/22222222-2222-4333-8444-555555555555.pdf`, title: "x" }]);
결과(없음.includes("올린 파일을 찾을 수 없습니다"), "올리지 않은 위치로 등록 → 파일 없음 안내");

// 8) 마감된 회의 — 양식 없음, 주소 발급 거부, 마감 전에 올려 둔 파일도 등록 거부 후 삭제
const 마감전 = 꺼내기(await 부르기(발급_ID, 담당_쿠키, 상세, [회의.id, 입력(pdf.byteLength)]));
await 올리기(마감전.uploadUrl!, pdf);
await db.from("meetings").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", 회의.id);
const 마감_화면 = await 열기(상세, 담당_쿠키);
결과(!마감_화면.includes('name="file"') && 마감_화면.includes("마감된 회의라 안건을 올릴 수 없습니다"), "마감된 회의: 올리기 양식 없이 안내");
const 마감_발급 = await 부르기(발급_ID, 담당_쿠키, 상세, [회의.id, 입력(pdf.byteLength)]);
결과(!꺼내기(마감_발급).uploadUrl && 마감_발급.includes("마감된 회의"), "마감된 회의: 업로드 주소 발급 거부");
const 마감_등록 = await 부르기(등록_ID, 담당_쿠키, 상세, [회의.id, { path: 마감전.path, title: "늦은 안건" }]);
결과(마감_등록.includes("마감된 회의") && (await 안건_수()) === 1, "마감 전에 올려 둔 파일도 마감 후에는 등록 거부");
결과(!(await 보관함_파일()).some((n) => 마감전.path!.endsWith(n)), "등록 거부된 파일은 보관함에서 지워짐");

// 정리 — 점검용 회의 폴더의 파일과 회의(안건은 회의와 함께 지워짐)
const 남은_파일 = await 보관함_파일();
if (남은_파일.length > 0) await db.storage.from(보관함).remove(남은_파일.map((n) => `meetings/${회의.id}/${n}`));
await db.from("meetings").delete().like("title", `${점검용}%`);
결과((await 보관함_파일()).length === 0 && (await 안건_수()) === 0, "점검용 회의·안건·파일 정리 완료");

console.log(실패 ? "\n안건 업로드 점검 실패 — 위 ❌ 항목을 확인하세요." : "\n안건 업로드 점검 통과");
process.exit(실패 ? 1 : 0);
