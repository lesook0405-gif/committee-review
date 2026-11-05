// Plan 작업 14 — 안건 PDF 교체(첫 평가 전만, 열람 기록 초기화, 옛 파일 삭제) 점검 (개발 서버가 켜져 있어야 한다)
// 실행: npm run check:replace   (기본 주소 http://localhost:3001, 다른 주소면 APP_URL=... 로 지정)
// 화면의 [교체]가 하는 3단계(주소 발급 → 보관함에 직접 업로드 → 서버 확인·교체)를 그대로 따라 하고,
// 평가 기록이 있는 안건·마감된 회의·팀장·다른 회의 안건 등 막혀야 하는 경우를 직접 불러 확인한다.
// 점검용 회의와 파일은 마지막에 지운다.
import { createHmac } from "node:crypto";
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
const 열기 = async (경로: string, 쿠키값: string) =>
  (await (await fetch(`${APP_URL}${경로}`, { headers: { cookie: 쿠키값 }, redirect: "manual" })).text()).replace(/<!-- -->/g, "");

// 준비
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
async function 정리() {
  const { data: ms } = await db.from("meetings").select("id").like("title", `${점검용}%`);
  for (const m of ms ?? []) {
    const { data: f } = await db.storage.from(보관함).list(`meetings/${m.id}`);
    if (f?.length) await db.storage.from(보관함).remove(f.map((x) => `meetings/${m.id}/${x.name}`));
  }
  await db.from("meetings").delete().like("title", `${점검용}%`);
}
await 정리();
const { data: 위원들 } = await db.from("members").select("id").eq("committee_id", 위원회.id).order("name");
const [가, 나] = 위원들!;

const 샘플_PDF = (글: string) =>
  new TextEncoder().encode(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n% ${글}\ntrailer<</Root 1 0 R>>\n%%EOF\n`);

// 점검용 회의 1개, 안건 3건 (A: 평가 없음, B: 평가 있음(제외된 위원 기록), C: 대리 입력 기록)
const { data: 회의 } = await db.from("meetings").insert({ committee_id: 위원회.id, title: `${점검용} 교체 회의`, starts_at: "2099-01-02T01:00:00Z" }).select("id").single();
const { data: 다른 } = await db.from("meetings").insert({ committee_id: 위원회.id, title: `${점검용} 다른 회의`, starts_at: "2099-01-02T01:00:00Z" }).select("id").single();
async function 안건_만들기(meetingId: string, position: number, 이름: string) {
  const path = `meetings/${meetingId}/old-${position}.pdf`;
  await db.storage.from(보관함).upload(path, 샘플_PDF(`old ${이름}`), { contentType: "application/pdf" });
  const { data } = await db.from("agendas").insert({ meeting_id: meetingId, position, title: 이름, pdf_path: path, pdf_size_bytes: 100 }).select("id").single();
  return { id: data!.id, path };
}
const A = await 안건_만들기(회의!.id, 1, "안건 A");
const B = await 안건_만들기(회의!.id, 2, "안건 B");
const C = await 안건_만들기(회의!.id, 3, "안건 C");
const 남의 = await 안건_만들기(다른!.id, 1, "다른 회의 안건");
// 평가 기록: B는 회의에서 제외된 위원의 기록, C는 대리 입력 — 둘 다 "첫 평가"로 본다
await db.from("meeting_members").insert([{ meeting_id: 회의!.id, member_id: 가.id, removed_at: new Date().toISOString() }, { meeting_id: 회의!.id, member_id: 나.id }]);
await db.from("evaluations").insert([
  { agenda_id: B.id, member_id: 가.id, scores: [10], total: 10, is_proxy: false },
  { agenda_id: C.id, member_id: 나.id, scores: [10], total: 10, is_proxy: true },
]);
// A에는 열람 기록 2건
await db.from("agenda_views").insert([{ agenda_id: A.id, member_id: 가.id }, { agenda_id: A.id, member_id: 나.id }]);

const 상세 = `/admin/meetings/${회의!.id}`;
// 서버 처리 ID — 회의 상세를 한 번 열어 개발 서버가 목록을 만들게 한 뒤 찾는다
await 열기(상세, 담당_쿠키);
const 목록 = JSON.parse(readFileSync(".next/dev/server/server-reference-manifest.json", "utf8")) as {
  node: Record<string, { exportedName: string; filename: string }>;
};
const 처리_ID = (이름: string) => Object.entries(목록.node).find(([, v]) => v.exportedName === 이름 && v.filename.endsWith("agenda-actions.ts"))?.[0] ?? "";
const 발급_ID = 처리_ID("prepareAgendaReplaceAction");
const 교체_ID = 처리_ID("confirmAgendaReplaceAction");
if (!발급_ID || !교체_ID) {
  console.log("❌ 교체 서버 처리 ID를 찾지 못했습니다.");
  process.exit(1);
}
async function 부르기(id: string, 쿠키값: string, args: unknown[]): Promise<string> {
  const 응답 = await fetch(`${APP_URL}${상세}`, {
    method: "POST",
    headers: { cookie: 쿠키값, origin: APP_URL, "next-action": id, accept: "text/x-component", "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  return 응답.text();
}
const 꺼내기 = (응답: string) => ({ path: /"path":"(meetings\/[^"]+)"/.exec(응답)?.[1], uploadUrl: /"uploadUrl":"([^"]+)"/.exec(응답)?.[1] });
const 올리기 = (주소: string, 내용: Uint8Array<ArrayBuffer>, 형식 = "application/pdf") =>
  fetch(주소, { method: "PUT", body: new Blob([내용], { type: 형식 }), headers: { "content-type": 형식, "x-upsert": "false" } });
const 안건 = async (id: string) => (await db.from("agendas").select("pdf_path, pdf_size_bytes, title, position").eq("id", id).single()).data!;
const 파일있음 = async (path: string) => (await db.storage.from(보관함).exists(path)).data === true;
const 보관함_파일 = async () => (await db.storage.from(보관함).list(`meetings/${회의!.id}`)).data?.map((f) => f.name) ?? [];

// 1) 화면 — 평가 기록이 없는 안건만 [교체], 있는 안건은 안내, 팀장은 버튼 없음
const 담당_화면 = await 열기(상세, 담당_쿠키);
결과(담당_화면.includes("1번 안건 PDF 교체"), "평가 기록이 없는 안건 A: [교체] 버튼이 보임");
결과(!담당_화면.includes("2번 안건 PDF 교체") && !담당_화면.includes("3번 안건 PDF 교체"), "평가 기록이 있는 안건 B(제외된 위원 기록)·C(대리 입력): [교체] 버튼 없음");
결과(담당_화면.includes("평가 기록이 있어 PDF를 교체할 수 없습니다"), "평가 기록이 있는 안건에는 이유 안내");
결과(!/PDF 교체/.test(await 열기(상세, 팀장_쿠키)), "팀장 화면: [교체] 버튼이 보이지 않음");

// 2) 팀장이 직접 불러도 거부
const 팀장_발급 = await 부르기(발급_ID, 팀장_쿠키, [회의!.id, A.id, { fileName: "new.pdf", size: 100 }]);
결과(!꺼내기(팀장_발급).uploadUrl, "팀장이 교체 주소 발급을 직접 불러도 거부");

// 3) 평가 기록이 있는 안건은 주소 발급부터 거부 (제외된 위원 기록, 대리 입력 모두)
for (const [이름, 대상] of [["제외된 위원의 평가 기록", B], ["대리 입력 기록", C]] as const) {
  const 응답 = await 부르기(발급_ID, 담당_쿠키, [회의!.id, 대상.id, { fileName: "new.pdf", size: 100 }]);
  결과(!꺼내기(응답).uploadUrl && 응답.includes("평가 기록이 있는 안건"), `${이름}만 있는 안건 → 교체 주소를 주지 않음`);
}

// 4) 발급 전 검사 — PDF 아닌 이름, 30MB 초과, 다른 회의 안건
결과(!꺼내기(await 부르기(발급_ID, 담당_쿠키, [회의!.id, A.id, { fileName: "new.docx", size: 100 }])).uploadUrl, "PDF가 아닌 파일 이름 → 교체 주소를 주지 않음");
결과(!꺼내기(await 부르기(발급_ID, 담당_쿠키, [회의!.id, A.id, { fileName: "new.pdf", size: 30 * 1024 * 1024 + 1 }])).uploadUrl, "30MB 초과 → 교체 주소를 주지 않음");
결과(!꺼내기(await 부르기(발급_ID, 담당_쿠키, [회의!.id, 남의.id, { fileName: "new.pdf", size: 100 }])).uploadUrl, "다른 회의 안건 ID로 교체 요청 → 거부");

// 5) 가짜 PDF → 서버가 거부하고 새 파일을 지우며, 원래 안건은 그대로
const 가짜 = 꺼내기(await 부르기(발급_ID, 담당_쿠키, [회의!.id, A.id, { fileName: "fake.pdf", size: 20 }]));
await 올리기(가짜.uploadUrl!, new TextEncoder().encode("this is not a pdf..."));
const 가짜_응답 = await 부르기(교체_ID, 담당_쿠키, [회의!.id, A.id, { path: 가짜.path }]);
결과(가짜_응답.includes("PDF 파일이 아닙니다") && (await 안건(A.id)).pdf_path === A.path, "내용이 PDF가 아닌 파일 → 교체 거부, 안건은 그대로");
결과(!(await 파일있음(가짜.path!)) && (await 파일있음(A.path)), "거부한 새 파일은 지워지고 옛 파일은 그대로");
const { count: 열람_그대로 } = await db.from("agenda_views").select("*", { count: "exact", head: true }).eq("agenda_id", A.id);
결과(열람_그대로 === 2, "교체가 거부되면 열람 기록도 그대로");

// 6) 정상 교체 — 팀장 거부 / 담당 팀원은 새 파일로 바뀌고 열람 기록 초기화, 옛 파일 삭제
const 새pdf = 샘플_PDF("new agenda A, longer content to change the size");
const 정상 = 꺼내기(await 부르기(발급_ID, 담당_쿠키, [회의!.id, A.id, { fileName: "new.pdf", size: 새pdf.byteLength }]));
결과(!!정상.uploadUrl && (await 올리기(정상.uploadUrl, 새pdf)).ok, "평가 기록이 없는 안건: 교체 주소를 받아 새 파일을 직접 올림");
await 부르기(교체_ID, 팀장_쿠키, [회의!.id, A.id, { path: 정상.path }]);
결과((await 안건(A.id)).pdf_path === A.path, "팀장이 교체 확인을 직접 불러도 안건이 바뀌지 않음");
await 부르기(교체_ID, 담당_쿠키, [회의!.id, A.id, { path: 정상.path }]);
const 교체후 = await 안건(A.id);
결과(교체후.pdf_path === 정상.path && 교체후.pdf_size_bytes === 새pdf.byteLength, "담당 팀원 교체 → 새 파일 위치·실제 크기로 바뀜");
결과(교체후.title === "안건 A" && 교체후.position === 1, "안건 제목과 순서는 그대로");
결과(!(await 파일있음(A.path)) && (await 파일있음(정상.path!)), "옛 파일은 보관함에서 삭제, 새 파일만 남음");
const { count: 열람_초기화 } = await db.from("agenda_views").select("*", { count: "exact", head: true }).eq("agenda_id", A.id);
결과(열람_초기화 === 0, "교체하면 그 안건의 열람 기록이 초기화됨");
const { count: 다른안건_열람 } = await db.from("agenda_views").select("*", { count: "exact", head: true }).in("agenda_id", [B.id, C.id]);
결과(다른안건_열람 === 0 && (await 안건(B.id)).pdf_path === B.path, "다른 안건의 파일은 건드리지 않음");

// 7) 같은 요청을 한 번 더 보내도 문제 없음 (새 파일이 지워지지 않음)
await 부르기(교체_ID, 담당_쿠키, [회의!.id, A.id, { path: 정상.path }]);
결과((await 안건(A.id)).pdf_path === 정상.path && (await 파일있음(정상.path!)), "같은 교체 요청을 두 번 보내도 새 파일이 그대로");

// 8) 올린 직후 누군가 평가를 낸 경우 — 교체 확인 단계에서 다시 막고 새 파일을 지움
const 경합 = 꺼내기(await 부르기(발급_ID, 담당_쿠키, [회의!.id, A.id, { fileName: "race.pdf", size: 새pdf.byteLength }]));
await 올리기(경합.uploadUrl!, 샘플_PDF("race"));
await db.from("evaluations").insert({ agenda_id: A.id, member_id: 나.id, scores: [5], total: 5, is_proxy: false }); // 업로드와 확인 사이에 평가가 들어옴
await db.from("agenda_views").insert({ agenda_id: A.id, member_id: 나.id });
const 경합_응답 = await 부르기(교체_ID, 담당_쿠키, [회의!.id, A.id, { path: 경합.path }]);
결과(경합_응답.includes("평가 기록이 있는 안건") && (await 안건(A.id)).pdf_path === 정상.path, "업로드 뒤 평가가 들어왔으면 확인 단계에서 교체 거부");
결과(!(await 파일있음(경합.path!)) && (await 파일있음(정상.path!)), "거부된 새 파일은 지워지고 기존 파일은 그대로");
const { count: 경합_열람 } = await db.from("agenda_views").select("*", { count: "exact", head: true }).eq("agenda_id", A.id);
결과(경합_열람 === 1, "거부되면 열람 기록은 지워지지 않음");

// 9) 엉뚱한 위치 / 마감된 회의
const 엉뚱 = await 부르기(교체_ID, 담당_쿠키, [회의!.id, 남의.id === A.id ? B.id : A.id, { path: "sample/agenda-2.pdf" }]);
결과(엉뚱.includes("업로드 정보가 올바르지 않습니다") && (await db.storage.from(보관함).exists("sample/agenda-2.pdf")).data === true, "샘플 파일 위치로 교체 시도 → 거부, 원래 파일은 그대로");

await db.from("evaluations").delete().eq("agenda_id", A.id); // 다시 평가 없는 안건으로
const 마감전 = 꺼내기(await 부르기(발급_ID, 담당_쿠키, [회의!.id, A.id, { fileName: "late.pdf", size: 새pdf.byteLength }]));
await 올리기(마감전.uploadUrl!, 샘플_PDF("late"));
await db.from("meetings").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", 회의!.id);
결과(!/1번 안건 PDF 교체/.test(await 열기(상세, 담당_쿠키)), "마감된 회의: [교체] 버튼이 보이지 않음");
const 마감_응답 = await 부르기(교체_ID, 담당_쿠키, [회의!.id, A.id, { path: 마감전.path }]);
결과(마감_응답.includes("마감된 회의") && (await 안건(A.id)).pdf_path === 정상.path, "마감 전에 올려 둔 새 파일도 마감 후에는 교체 거부");
결과(!(await 파일있음(마감전.path!)), "마감으로 거부된 새 파일은 지워짐");
const 마감_발급 = await 부르기(발급_ID, 담당_쿠키, [회의!.id, A.id, { fileName: "x.pdf", size: 100 }]);
결과(!꺼내기(마감_발급).uploadUrl && 마감_발급.includes("마감된 회의"), "마감된 회의: 교체 주소 발급 거부");

// 정리
await 정리();
const { count } = await db.from("meetings").select("*", { count: "exact", head: true }).like("title", `${점검용}%`);
결과(count === 0 && (await 보관함_파일()).length === 0, "점검용 회의·안건·파일 정리 완료");

console.log(실패 ? "\n안건 교체 점검 실패 — 위 ❌ 항목을 확인하세요." : "\n안건 교체 점검 통과");
process.exit(실패 ? 1 : 0);
