// Plan 작업 12 — 위원 링크 접속 → 안건 목록 → 안건 열람 점검 (개발 서버가 켜져 있어야 한다)
// 실행: npm run check:member-view   (기본 주소 http://localhost:3001, 다른 주소면 APP_URL=... 로 지정)
// 점검용 회의 2개(이 회의 / 다른 회의)와 링크를 만들어, 쓸 수 있는 링크와 막혀야 하는 링크를 모두 확인한다.
// 링크값은 출력하지 않고, 점검용 회의와 파일은 마지막에 지운다.
import { createHash, createHmac, randomBytes } from "node:crypto";

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
// 앱과 같은 방식의 지문 (앱의 계산을 쓰지 않고 따로 계산해 맞는지 확인)
const 지문 = (token: string) =>
  createHmac("sha256", createHash("sha256").update(`fingerprint:${process.env.MEMBER_LINK_SECRET}`).digest()).update(token).digest("hex");
const 새_링크 = () => randomBytes(32).toString("base64url");

async function 열기(경로: string) {
  const 응답 = await fetch(`${APP_URL}${경로}`, { redirect: "manual" });
  return { 상태: 응답.status, 위치: 응답.headers.get("location"), 머리글: 응답.headers, 글자: (await 응답.text()).replace(/<!-- -->/g, "") };
}
const 풀기 = (s: string) => s.replace(/&amp;/g, "&");

// 준비: 샘플 위원회에 점검용 회의 2개, 각각 안건 1건(샘플 PDF 복사)
const { data: 위원회 } = await db.from("committees").select("id").like("name", "[샘플]%").maybeSingle();
if (!위원회 || !process.env.MEMBER_LINK_SECRET) {
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
const { data: 위원들 } = await db.from("members").select("id, name, email").eq("committee_id", 위원회.id).order("name");
const [가, 나] = 위원들!;

async function 회의_만들기(제목: string, 안건: string) {
  const { data: m } = await db.from("meetings").insert({ committee_id: 위원회!.id, title: 제목, starts_at: "2099-01-02T01:00:00Z" }).select("id").single();
  const path = `meetings/${m!.id}/check.pdf`;
  await db.storage.from(보관함).copy("sample/agenda-1.pdf", path);
  const { data: a } = await db.from("agendas").insert({ meeting_id: m!.id, position: 1, title: 안건, pdf_path: path, pdf_size_bytes: 721 }).select("id").single();
  return { id: m!.id, agendaId: a!.id };
}
async function 링크_주기(meetingId: string, memberId: string) {
  const token = 새_링크();
  await db.from("meeting_members").upsert(
    { meeting_id: meetingId, member_id: memberId, link_ciphertext: "check-only", link_fingerprint: 지문(token), link_issued_at: new Date().toISOString(), blocked_at: null, removed_at: null },
    { onConflict: "meeting_id,member_id" },
  );
  return token;
}
const 이회의 = await 회의_만들기(`${점검용} 이 회의`, "점검용 안건 가");
const 다른회의 = await 회의_만들기(`${점검용} 다른 회의`, "다른 회의 안건 나");
const 가_링크 = await 링크_주기(이회의.id, 가.id);
await 링크_주기(이회의.id, 나.id);

// 1) 쓸 수 있는 링크 → 이 회의 안건 목록만, 관리 버튼 없음, 다른 위원 정보 없음
const 목록 = await 열기(`/m/${가_링크}`);
결과(목록.상태 === 200 && 목록.글자.includes(`${점검용} 이 회의`) && 목록.글자.includes("점검용 안건 가"), "링크 접속 → 그 회의 이름과 안건 목록");
결과(!목록.글자.includes("다른 회의 안건 나"), "다른 회의 안건은 목록에 없음");
결과(!/올리기|업로드|삭제|이 회의에서 제외|재발급|로그아웃/.test(목록.글자), "위원 화면에 관리 버튼(올리기·삭제·제외·재발급·로그아웃) 없음");
결과(목록.글자.includes(`${가.name} 위원님`) && !목록.글자.includes(나.name) && !목록.글자.includes(가.email), "자기 이름만 보이고 다른 위원 이름·메일은 없음");
결과(목록.글자.includes("회의 시작 후 평가할 수 있습니다"), "회의 시작 전: '회의 시작 후 평가할 수 있습니다' 안내");
결과(목록.머리글.get("referrer-policy") === "no-referrer", "링크 주소가 다른 사이트로 새지 않게 Referrer-Policy: no-referrer");

// 2) 안건 열람 → 5분짜리 임시 주소로 PDF가 열림
const 열람 = await 열기(`/m/${가_링크}/a/${이회의.agendaId}`);
const 임시주소 = /src="(https:\/\/[^"]+\/object\/sign\/agendas\/[^"]+)"/.exec(열람.글자)?.[1];
결과(열람.상태 === 200 && !!임시주소, "안건 열람 화면에 PDF 임시 주소가 들어 있음");
if (임시주소) {
  const pdf = await fetch(풀기(임시주소));
  const 앞부분 = new TextDecoder().decode(new Uint8Array(await pdf.arrayBuffer()).slice(0, 5));
  결과(pdf.ok && 앞부분 === "%PDF-", "임시 주소로 PDF 내용을 받음");
  const 토큰 = new URL(풀기(임시주소)).searchParams.get("token") ?? "";
  const 내용 = JSON.parse(Buffer.from(토큰.split(".")[1] ?? "", "base64url").toString() || "{}") as { exp?: number; iat?: number };
  결과(내용.exp !== undefined && 내용.iat !== undefined && 내용.exp - 내용.iat === 300, "임시 주소 유효 시간은 5분(300초)");
}
const 공개주소 = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/public/${보관함}/meetings/${이회의.id}/check.pdf`);
결과(!공개주소.ok, "임시 주소 없이 공개 주소로는 PDF가 열리지 않음 (비공개 보관함)");

// 3) 다른 회의 안건 ID를 주소에 넣어도 열리지 않음
const 남의안건 = await 열기(`/m/${가_링크}/a/${다른회의.agendaId}`);
결과(남의안건.글자.includes("이 회의의 안건이 아니거나") && !남의안건.글자.includes("/object/sign/"), "다른 회의 안건 ID로 열람 → 거부, PDF 주소 없음");
const 이상한ID = await 열기(`/m/${가_링크}/a/not-a-uuid`);
결과(이상한ID.글자.includes("이 회의의 안건이 아니거나"), "모양이 틀린 안건 ID → 찾을 수 없음 안내");

// 4) 막혀야 하는 링크들
const 막힘 = async (token: string, 안내: string, 설명: string) => {
  const 화면 = await 열기(`/m/${token}`);
  const 열람화면 = await 열기(`/m/${token}/a/${이회의.agendaId}`);
  결과(
    화면.글자.includes(안내) && !화면.글자.includes("점검용 안건 가") && !열람화면.글자.includes("/object/sign/"),
    `${설명} → 안내만 보이고 안건·PDF 없음`,
  );
};
await 막힘(새_링크(), "사용할 수 없는 링크", "발급한 적 없는 링크");
await 막힘("short-value", "사용할 수 없는 링크", "모양이 틀린 링크");

const 재발급_전 = 가_링크;
const 재발급_후 = await 링크_주기(이회의.id, 가.id);
await 막힘(재발급_전, "사용할 수 없는 링크", "재발급 전 링크");
결과((await 열기(`/m/${재발급_후}`)).글자.includes("점검용 안건 가"), "재발급한 새 링크로는 접속됨");

await db.from("meeting_members").update({ blocked_at: new Date().toISOString() }).eq("meeting_id", 이회의.id).eq("member_id", 가.id);
await 막힘(재발급_후, "사용이 중지된 링크", "차단된 링크");

const 나_링크 = await 링크_주기(이회의.id, 나.id);
await db.from("meeting_members").update({ removed_at: new Date().toISOString() }).eq("meeting_id", 이회의.id).eq("member_id", 나.id);
await 막힘(나_링크, "이 회의에 참석하지 않는", "회의에서 제외된 위원 링크");

// 5) 마감 뒤 — 7일 안은 열람 가능, 7일 지나면 만료
const 마감_링크 = await 링크_주기(이회의.id, 가.id);
const 일 = 24 * 60 * 60 * 1000;
await db.from("meetings").update({ status: "closed", closed_at: new Date(Date.now() - 6 * 일).toISOString() }).eq("id", 이회의.id);
const 마감6일 = await 열기(`/m/${마감_링크}`);
결과(마감6일.글자.includes("점검용 안건 가") && 마감6일.글자.includes("평가가 마감된 회의"), "마감 6일 뒤: 안건은 볼 수 있고 마감 안내");
await db.from("meetings").update({ closed_at: new Date(Date.now() - 8 * 일).toISOString() }).eq("id", 이회의.id);
await 막힘(마감_링크, "링크가 만료되었습니다", "마감 8일 뒤 링크");

// 6) 위원 링크만으로는 관리자 화면에 들어갈 수 없음
const 관리자 = await 열기("/admin");
결과(관리자.상태 >= 300 && 관리자.상태 < 400 && !!관리자.위치?.includes("/login"), "로그인 없이 /admin → 로그인 화면으로");

await 정리();
const { count } = await db.from("meetings").select("*", { count: "exact", head: true }).like("title", `${점검용}%`);
결과(count === 0, "점검용 회의·안건·파일 정리 완료");

console.log(실패 ? "\n위원 화면 점검 실패 — 위 ❌ 항목을 확인하세요." : "\n위원 화면 점검 통과");
process.exit(실패 ? 1 : 0);
