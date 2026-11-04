// Plan 작업 9 — 회의 등록·일시 수정·참석 위원 추가/제외/다시 추가 점검 (개발 서버가 켜져 있어야 한다)
// 실행: npm run check:meetings   (기본 주소 http://localhost:3001, 다른 주소면 APP_URL=... 로 지정)
// 화면의 양식·버튼이 보내는 것과 똑같이 서버 처리에 보내 확인하고, 점검용으로 만든 회의·위원회는 마지막에 지운다.
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
  return (await 응답.text()).replace(/<!-- -->/g, "");
}

// 화면에서 표시(글자)로 양식을 찾아 숨은 칸(서버 처리 연결 정보)을 받아 둔다
async function 숨은_칸(경로: string, 쿠키값: string, 표시: string): Promise<[string, string][]> {
  const 글자 = await 열기(경로, 쿠키값);
  const 양식 = [...글자.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes(표시)) ?? "";
  return [...양식.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)].map((m) => [풀기(m[1]), 풀기(m[2] ?? "")]);
}

async function 보내기(경로: string, 쿠키값: string, 칸들: [string, string][]) {
  const 데이터 = new FormData();
  for (const [이름, 값] of 칸들) 데이터.append(이름, 값);
  const 응답 = await fetch(`${APP_URL}${경로}`, { method: "POST", body: 데이터, headers: { cookie: 쿠키값, origin: APP_URL }, redirect: "manual" });
  return { 상태: 응답.status, 위치: 응답.headers.get("location") };
}

const 참석_상태 = async (meetingId: string) => {
  const { data } = await db.from("meeting_members").select("id, member_id, removed_at").eq("meeting_id", meetingId);
  return data ?? [];
};

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
await db.from("meetings").delete().like("title", `${점검용}%`);
await db.from("committees").delete().like("name", `${점검용}%`);

const { data: 위원들 } = await db.from("members").select("id, name").eq("committee_id", 위원회.id).order("name");
const 회의_탭 = `/admin/committees/${위원회.id}?tab=meetings`;

// 다른 위원회 위원 (회의 등록 때 섞어 보내 본다)
const { data: 다른위원회 } = await db.from("committees").insert({ name: `${점검용} 다른 위원회`, criteria: [{ name: "a", maxScore: 10 }], pass_score: 5 }).select("id").single();
const { data: 외부위원 } = await db.from("members").insert({ committee_id: 다른위원회!.id, name: "외부 위원", email: "outside@example.com", phone: "010-0000-0090" }).select("id").single();

// 1) 회의 탭 — 팀장은 등록 양식 없음
const 탭_팀장 = await 열기(회의_탭, 팀장_쿠키);
결과(탭_팀장.includes("제1차 샘플 회의") && !탭_팀장.includes('name="startsAt"'), "팀장: 회의 목록만 보이고 등록 양식 없음");

// 2) 회의 등록 — 팀장이 보내면 거부 / 담당 팀원은 등록, 참석 위원은 이 위원회 소속만
const 등록_칸 = await 숨은_칸(회의_탭, 담당_쿠키, 'name="startsAt"');
const 등록_값: [string, string][] = [
  ["title", `${점검용} 회의`],
  ["startsAt", "2099-01-02T10:00"],
  ["memberIds", 위원들![0].id],
  ["memberIds", 위원들![1].id],
  ["memberIds", 외부위원!.id],
];
await 보내기(회의_탭, 팀장_쿠키, [...등록_칸, ...등록_값]);
const { data: 팀장_등록 } = await db.from("meetings").select("id").like("title", `${점검용}%`);
결과(등록_칸.length > 0 && (팀장_등록 ?? []).length === 0, "팀장이 회의 등록을 직접 보내도 저장 안 됨");

const 등록 = await 보내기(회의_탭, 담당_쿠키, [...등록_칸, ...등록_값]);
const { data: 회의 } = await db.from("meetings").select("id, starts_at").like("title", `${점검용}%`).maybeSingle();
결과(!!회의 && new Date(회의.starts_at).toISOString() === "2099-01-02T01:00:00.000Z", "담당 팀원 회의 등록 → 10:00(한국 시간)이 UTC 01:00으로 저장");
결과(!!회의 && !!등록.위치 && 등록.위치.includes(`/admin/meetings/${회의.id}`), "등록 후 회의 상세 화면으로 이동");
if (!회의) process.exit(1);
const 처음_참석 = await 참석_상태(회의.id);
결과(처음_참석.length === 2 && !처음_참석.some((p) => p.member_id === 외부위원!.id), "참석 위원은 고른 2명만, 다른 위원회 위원은 빠짐");

const 상세 = `/admin/meetings/${회의.id}`;
const 가 = 위원들![0];
const 다 = 위원들![2];

// 3) 참석 위원 제외 → 기록은 남고 제외 시각만 / 팀장은 제외 불가
const 제외_칸 = await 숨은_칸(상세, 담당_쿠키, `aria-label="${가.name} 이 회의에서 제외"`);
await 보내기(상세, 팀장_쿠키, 제외_칸);
결과((await 참석_상태(회의.id)).find((p) => p.member_id === 가.id)?.removed_at === null, "팀장이 제외를 직접 보내도 바뀌지 않음");
const 원래_기록 = (await 참석_상태(회의.id)).find((p) => p.member_id === 가.id)!.id;
await 보내기(상세, 담당_쿠키, 제외_칸);
const 제외후 = (await 참석_상태(회의.id)).find((p) => p.member_id === 가.id);
결과(!!제외후?.removed_at && 제외후.id === 원래_기록, "담당 팀원 제외 → 기록은 그대로, 제외 시각만 기록");

// 4) 다시 추가 → 같은 기록을 되살림 / 처음 추가 → 새 기록
const 다시_칸 = await 숨은_칸(상세, 담당_쿠키, `aria-label="${가.name} 다시 추가"`);
await 보내기(상세, 담당_쿠키, 다시_칸);
const 다시후 = (await 참석_상태(회의.id)).find((p) => p.member_id === 가.id);
결과(다시후?.removed_at === null && 다시후.id === 원래_기록, "다시 추가 → 같은 기록을 되살림 (제외 시각 지움)");
const 추가_칸 = await 숨은_칸(상세, 담당_쿠키, `aria-label="${다.name} 이 회의에 추가"`);
await 보내기(상세, 담당_쿠키, 추가_칸);
결과((await 참석_상태(회의.id)).some((p) => p.member_id === 다.id && p.removed_at === null), "처음 추가 → 참석 위원으로 들어감");

// 5) 일시 수정 — 시작 전이면 저장, 시작 후면 거부
const 일시_칸 = await 숨은_칸(상세, 담당_쿠키, "일시 저장");
await 보내기(상세, 담당_쿠키, [...일시_칸, ["startsAt", "2099-01-03T15:30"]]);
const { data: 바뀐 } = await db.from("meetings").select("starts_at").eq("id", 회의.id).single();
결과(new Date(바뀐!.starts_at).toISOString() === "2099-01-03T06:30:00.000Z", "시작 전 일시 수정 → 저장 (15:30 한국 시간)");
await 보내기(상세, 팀장_쿠키, [...일시_칸, ["startsAt", "2099-01-04T15:30"]]);
const { data: 팀장_수정 } = await db.from("meetings").select("starts_at").eq("id", 회의.id).single();
결과(팀장_수정!.starts_at === 바뀐!.starts_at, "팀장이 일시 수정을 직접 보내도 바뀌지 않음");

await db.from("meetings").update({ starts_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", 회의.id); // 1분 전에 시작한 회의로
const 시작후_화면 = await 열기(상세, 담당_쿠키);
결과(!시작후_화면.includes("일시 저장"), "시작한 회의: 일시 수정 칸이 보이지 않음");
const { data: 시작후_전 } = await db.from("meetings").select("starts_at").eq("id", 회의.id).single();
await 보내기(상세, 담당_쿠키, [...일시_칸, ["startsAt", "2099-01-05T10:00"]]);
const { data: 시작후 } = await db.from("meetings").select("starts_at").eq("id", 회의.id).single();
결과(시작후!.starts_at === 시작후_전!.starts_at, "시작한 회의에 일시 수정을 직접 보내도 저장 안 됨");

// 6) 마감된 회의 — 참석 위원을 바꿀 수 없음
await db.from("meetings").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", 회의.id);
const 마감_화면 = await 열기(상세, 담당_쿠키);
결과(마감_화면.includes("마감된 회의라 참석 위원을 바꿀 수 없습니다") && !마감_화면.includes("이 회의에서 제외</button>"), "마감된 회의: 제외·추가 버튼 없이 안내");
await 보내기(상세, 담당_쿠키, 제외_칸);
결과((await 참석_상태(회의.id)).find((p) => p.member_id === 가.id)?.removed_at === null, "마감된 회의에 제외를 직접 보내도 바뀌지 않음");

// 7) 없는 회의 주소
const 없음 = await 열기("/admin/meetings/00000000-0000-0000-0000-000000000000", 담당_쿠키);
결과(없음.includes("페이지를 찾을 수 없습니다"), "없는 회의 주소 → 찾을 수 없음 안내");

// 정리
await db.from("meetings").delete().like("title", `${점검용}%`);
await db.from("committees").delete().like("name", `${점검용}%`);
const { count } = await db.from("meetings").select("*", { count: "exact", head: true }).like("title", `${점검용}%`);
결과(count === 0, "점검용 회의·위원회 정리 완료");

console.log(실패 ? "\n회의 점검 실패 — 위 ❌ 항목을 확인하세요." : "\n회의 점검 통과");
process.exit(실패 ? 1 : 0);
