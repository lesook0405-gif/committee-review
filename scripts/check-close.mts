// Plan 작업 20 — 제출 현황("제출 N/M"·"미제출 N명")과 전원 제출 시에만 가능한 평가 마감 점검 (개발 서버가 켜져 있어야 한다)
// 실행: npm run check:close   (기본 주소 http://localhost:3001, 다른 주소면 APP_URL=... 로 지정)
// 화면의 [마감 확정]이 보내는 요청과, 팀장·미제출 상태·시작 전·안건 없음·동시 요청을 모두 확인한다.
// "[점검용]" 위원회를 따로 만들어 쓰고 마지막에 지운다.
import { createHmac } from "node:crypto";
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
const 열기 = async (경로: string, 쿠키값: string) =>
  (await (await fetch(`${APP_URL}${경로}`, { headers: { cookie: 쿠키값 }, redirect: "manual" })).text()).replace(/<!-- -->/g, "");

const { data: 계정들 } = await db.from("staff").select("id, role");
const 담당 = 계정들?.find((s) => s.role === "staff")?.id;
const 팀장 = 계정들?.find((s) => s.role === "lead")?.id;
if (!담당 || !팀장) {
  console.log("❌ 담당 팀원·팀장 계정이 없습니다. 먼저 npm run seed 를 실행하세요.");
  process.exit(1);
}
const 담당_쿠키 = 쿠키(담당, "staff");
const 팀장_쿠키 = 쿠키(팀장, "lead");
async function 정리() {
  await db.from("committees").delete().like("name", `${점검용}%`);
}
await 정리();

// ── 준비: 위원회(배점 30·70), 위원 4명(가·나·다·라), 이미 시작한 회의(참석 가·나·다), 안건 2건
const 항목 = [{ name: "적정성", maxScore: 30 }, { name: "효과성", maxScore: 70 }];
const { data: 위원회 } = await db.from("committees").insert({ name: `${점검용} 마감 위원회`, criteria: 항목, pass_score: 70 }).select("id").single();
const { data: 위원들 } = await db
  .from("members")
  .insert(["가", "나", "다", "라"].map((n, i) => ({ committee_id: 위원회!.id, name: `점검위원 ${n}`, email: `close-${i}@example.com`, phone: `010-0000-04${i}0` })))
  .select("id, name")
  .then((r) => ({ data: r.data?.sort((a, b) => a.name.localeCompare(b.name)) }));
const [가, 나, 다, 라] = 위원들!;

async function 회의_만들기(제목: string, 시작: Date, 참석: { id: string }[], 안건수: number) {
  const { data: m } = await db.from("meetings").insert({ committee_id: 위원회!.id, title: `${점검용} ${제목}`, starts_at: 시작.toISOString() }).select("id").single();
  if (참석.length) await db.from("meeting_members").insert(참석.map((x) => ({ meeting_id: m!.id, member_id: x.id })));
  const 안건들: string[] = [];
  for (let i = 1; i <= 안건수; i++) {
    const { data: a } = await db.from("agendas").insert({ meeting_id: m!.id, position: i, title: `점검 안건 ${i}`, pdf_path: `check/close-${m!.id}-${i}.pdf`, pdf_size_bytes: 100 }).select("id").single();
    안건들.push(a!.id);
  }
  return { id: m!.id, 안건들 };
}
const 과거 = new Date(Date.now() - 60_000);
const 회의 = await 회의_만들기("마감 회의", 과거, [가, 나, 다], 2);
const [안건1, 안건2] = 회의.안건들;
const 상세 = `/admin/meetings/${회의.id}`;

await 열기(상세, 담당_쿠키); // 개발 서버가 서버 처리 목록을 만들게 한다
const 목록 = JSON.parse(readFileSync(".next/dev/server/server-reference-manifest.json", "utf8")) as {
  node: Record<string, { exportedName: string; filename: string }>;
};
const 마감_ID = Object.entries(목록.node).find(([, v]) => v.exportedName === "closeMeetingAction" && v.filename.endsWith("close-actions.ts"))?.[0];
if (!마감_ID) {
  console.log("❌ 마감 서버 처리 ID를 찾지 못했습니다.");
  process.exit(1);
}
// [마감 확정]이 보내는 요청 — 첫 인자는 회의 ID, 두 번째는 이전 상태
async function 마감하기(쿠키값: string, meetingId: string): Promise<string> {
  const 응답 = await fetch(`${APP_URL}${상세}`, {
    method: "POST",
    headers: { cookie: 쿠키값, origin: APP_URL, "next-action": 마감_ID as string, accept: "text/x-component", "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify([meetingId, { errors: [] }]),
    redirect: "manual",
  });
  return 응답.text();
}
const 상태 = async (meetingId = 회의.id) => (await db.from("meetings").select("status, closed_at").eq("id", meetingId).single()).data!;
const 평가_넣기 = (agendaId: string, memberId: string, is_proxy = false) =>
  db.from("evaluations").insert({ agenda_id: agendaId, member_id: memberId, scores: [10, 10], total: 20, is_proxy });
const closeRpc = async (meetingId: string) => (await db.rpc("close_meeting", { p_meeting_id: meetingId })).data as { result: string; count?: number };

// 1) 처음: 아무도 제출하지 않음 — 제출 0/3, 미제출 3명, 마감 버튼 비활성
const 담당1 = await 열기(상세, 담당_쿠키);
결과(담당1.includes('aria-label="제출 3명 중 0명"') && 담당1.includes("미제출 3명"), "처음: 안건마다 '제출 0 / 3', '미제출 3명'");
결과(담당1.includes("미제출 3명") && [가, 나, 다].every((m) => 담당1.includes(m.name)), "미제출 위원 이름이 함께 표시됨");
결과(담당1.includes("평가 대상 위원 전원이 제출해야 마감할 수 있습니다") && !담당1.includes("마감 확정"), "마감 버튼이 비활성이고 이유 안내가 보임");
const 팀장1 = await 열기(상세, 팀장_쿠키);
결과(
  팀장1.includes('aria-label="제출 3명 중 0명"') && 팀장1.includes("미제출 3명") && !팀장1.includes("평가 마감") && !팀장1.includes("마감 확정") && !팀장1.includes("대리 입력·수정") && !팀장1.includes("/proxy"),
  "팀장 화면: 제출 현황 숫자는 보이고 [평가 마감]·[대리 입력·수정] 버튼과 대리 입력 주소는 없음",
);

// 2) 미제출이 있으면 마감 거부 (서버 처리·데이터베이스 모두), 팀장도 거부
const 거부응답 = await 마감하기(담당_쿠키, 회의.id);
결과(거부응답.includes("제출하지 않은 평가 대상 위원이 3명") && (await 상태()).status === "open", "미제출이 있으면 마감 거부, 몇 명인지 안내 (서버 처리)");
결과((await closeRpc(회의.id)).result === "missing" && (await closeRpc(회의.id)).count === 3 && (await 상태()).status === "open", "데이터베이스 함수도 미제출 3명으로 거부");
await 마감하기(팀장_쿠키, 회의.id);
결과((await 상태()).status === "open", "팀장이 마감을 직접 보내도 마감되지 않음");

// 3) 일부 제출 — 가: 안건1 직접 제출 + 안건2 대리 입력, 나: 안건1만, 다: 없음
await 평가_넣기(안건1, 가.id);
await 평가_넣기(안건2, 가.id, true);
await 평가_넣기(안건1, 나.id);
const 담당2 = await 열기(상세, 담당_쿠키);
결과(담당2.includes('aria-label="제출 3명 중 2명"') && 담당2.includes('aria-label="제출 3명 중 1명"'), "안건 1은 '제출 2 / 3', 안건 2는 '제출 1 / 3' (대리 입력도 제출로 셈)");
결과(담당2.includes("미제출 2명") && !담당2.includes("미제출 3명"), "미제출 2명 (나는 안건 2를, 다는 모두 안 냄 — 안건이 둘이어도 사람 수로 셈)");
결과((await 마감하기(담당_쿠키, 회의.id)).includes("2명") && (await 상태()).status === "open", "미제출 2명이면 마감 거부");

// 4) 제척 — 다를 두 안건 모두 제척하면 평가 대상에서 빠져 미제출이 1명(나)으로 줄고, 다가 낸 평가는 숫자에서 빠짐
await 평가_넣기(안건1, 다.id); // 다가 제척 전에 안건 1에 평가를 냈다고 하자
await db.from("recusals").insert([{ agenda_id: 안건1, member_id: 다.id }, { agenda_id: 안건2, member_id: 다.id }]);
const 담당3 = await 열기(상세, 담당_쿠키);
결과(담당3.includes('aria-label="제출 2명 중 2명"') && 담당3.includes('aria-label="제출 2명 중 1명"'), "제척된 위원은 분모와 분자에서 모두 빠짐 (제척 전에 낸 평가도 숫자에서 뺌)");
결과(담당3.includes("미제출 1명") && 담당3.includes("점검위원 나"), "모든 안건에서 제척된 위원은 미제출에 세지 않음 → 미제출 1명(나)");

// 5) 회의에서 제외된 위원 — 이미 낸 평가는 남지만 숫자에서 빠짐
await db.from("meeting_members").insert({ meeting_id: 회의.id, member_id: 라.id });
await 평가_넣기(안건1, 라.id);
await db.from("meeting_members").update({ removed_at: new Date().toISOString() }).eq("meeting_id", 회의.id).eq("member_id", 라.id);
const 담당4 = await 열기(상세, 담당_쿠키);
결과(담당4.includes('aria-label="제출 2명 중 2명"') && !담당4.includes("미제출 2명"), "회의에서 제외된 위원이 낸 평가는 지워지지 않지만 숫자(분자·분모·미제출)에서는 빠짐");
결과((await db.from("evaluations").select("*", { count: "exact", head: true }).eq("agenda_id", 안건1).eq("member_id", 라.id)).count === 1, "(확인) 제외된 위원의 평가 기록은 그대로 남아 있음");

// 6) 마지막 한 명이 낸 순간 — 전원 제출 안내, 마감 버튼 활성
await 평가_넣기(안건2, 나.id);
const 담당5 = await 열기(상세, 담당_쿠키);
결과(담당5.includes("평가 대상 위원이 모든 안건을 제출했습니다") && !담당5.includes("미제출 1명"), "전원 제출: '모든 안건을 제출했습니다' 표시");
결과(!담당5.includes("전원이 제출해야 마감할 수 있습니다") && 담당5.includes("평가 마감"), "전원 제출: 마감 버튼 활성(비활성 안내 없음)");
const 팀장_거부 = await 마감하기(팀장_쿠키, 회의.id);
결과((await 상태()).status === "open", "전원 제출이어도 팀장은 마감할 수 없음");
void 팀장_거부;

// 7) 담당 팀원 마감 → 마감 시각 기록, 이후 모든 변경 거부
const 마감응답 = await 마감하기(담당_쿠키, 회의.id);
const 마감됨 = await 상태();
결과(마감됨.status === "closed" && !!마감됨.closed_at && !마감응답.includes("마감할 수 없습니다"), "담당 팀원 마감 → 마감 상태와 마감 시각 기록, 오류 안내 없음");
const 마감화면 = await 열기(상세, 담당_쿠키);
결과(마감화면.includes("평가가 마감되었습니다") && !마감화면.includes("마감 확정") && !마감화면.includes("대리 입력·수정") && !마감화면.includes("/proxy"), "마감 후 화면: 마감 안내만 있고 마감·대리 입력 버튼 없음");
결과((await 마감하기(담당_쿠키, 회의.id)).includes("이미 마감된 회의") && (await 상태()).closed_at === 마감됨.closed_at, "이미 마감된 회의를 다시 마감 → 거부, 마감 시각 그대로");
const 제출시도 = (await db.rpc("submit_evaluation", { p_meeting_id: 회의.id, p_agenda_id: 안건1, p_member_id: 가.id, p_scores: [1, 1] })).data as { result: string };
const 대리시도 = (await db.rpc("save_proxy_evaluation", { p_meeting_id: 회의.id, p_agenda_id: 안건2, p_member_id: 가.id, p_scores: [1, 1] })).data as { result: string };
const 제척시도 = (await db.rpc("set_recusal", { p_meeting_id: 회의.id, p_agenda_id: 안건1, p_member_id: 가.id, p_recused: true })).data as { result: string };
결과(제출시도.result === "closed" && 대리시도.result === "closed" && 제척시도.result === "closed", "마감 후: 위원 제출·대리 입력·제척 모두 거부");

// 8) 마감할 수 없는 다른 경우 — 회의 시작 전, 안건 없음
const 시작전 = await 회의_만들기("시작 전 회의", new Date(Date.now() + 3_600_000), [], 1); // 참석 위원이 없어 미제출은 0명
결과((await closeRpc(시작전.id)).result === "not-started" && (await 상태(시작전.id)).status === "open", "회의 시작 전에는 (미제출이 0명이어도) 마감 거부");
const 안건없음 = await 회의_만들기("안건 없는 회의", 과거, [가], 0);
결과((await closeRpc(안건없음.id)).result === "no-agendas" && (await 상태(안건없음.id)).status === "open", "안건이 하나도 없는 회의는 마감 거부");
const 없는회의 = await closeRpc("00000000-0000-0000-0000-000000000000");
결과(없는회의.result === "not-found", "없는 회의 → 찾을 수 없음");
const 모두제외 = await 회의_만들기("모두 제외 회의", 과거, [가], 1);
await db.from("meeting_members").update({ removed_at: new Date().toISOString() }).eq("meeting_id", 모두제외.id);
결과((await closeRpc(모두제외.id)).result === "ok", "평가 대상이 아무도 없으면(모두 제외) 미제출 0명이라 마감 가능");

// 9) 동시 요청 — 마감과 제출/제척이 같은 순간에 와도 마감 뒤에 끼어들지 않는다
let 어긋남 = 0;
let 마감먼저 = 0;
let 제출먼저 = 0;
for (let 회차 = 0; 회차 < 8; 회차++) {
  const R = await 회의_만들기(`동시 제출 ${회차}`, 과거, [가, 나], 1);
  await 평가_넣기(R.안건들[0], 가.id); // 가는 이미 냄, 나가 마지막
  const [마감결과, 제출결과] = await Promise.all([
    closeRpc(R.id),
    db.rpc("submit_evaluation", { p_meeting_id: R.id, p_agenda_id: R.안건들[0], p_member_id: 나.id, p_scores: [10, 10] }).then((r) => r.data as { result: string }),
  ]);
  const 회의상태 = await 상태(R.id);
  const 나평가 = (await db.from("evaluations").select("submitted_at").eq("agenda_id", R.안건들[0]).eq("member_id", 나.id).maybeSingle()).data;
  let 맞음: boolean;
  if (마감결과.result === "ok") {
    // 마감됐다면 나의 평가가 먼저 들어가 있어야 하고(마감 시각보다 이전), 제출은 성공이어야 한다
    맞음 = 제출결과.result === "ok" && !!나평가 && new Date(나평가.submitted_at) <= new Date(회의상태.closed_at!);
    제출먼저++;
  } else {
    // 마감 안 됐다면 제출이 마감보다 늦었다는 뜻: 마감은 '미제출'로 거부, 제출은 성공
    맞음 = 마감결과.result === "missing" && 제출결과.result === "ok" && 회의상태.status === "open";
    마감먼저++;
  }
  if (!맞음) 어긋남++;
}
결과(어긋남 === 0, `마감과 마지막 제출이 동시에 와도 어긋나지 않음 (8회: 제출이 먼저 ${제출먼저}회, 마감이 먼저 ${마감먼저}회)`);

let 어긋남2 = 0;
for (let 회차 = 0; 회차 < 8; 회차++) {
  const R = await 회의_만들기(`동시 제척 ${회차}`, 과거, [가, 나], 1);
  await 평가_넣기(R.안건들[0], 가.id); // 나만 미제출
  const [마감결과, 제척결과] = await Promise.all([
    closeRpc(R.id),
    db.rpc("set_recusal", { p_meeting_id: R.id, p_agenda_id: R.안건들[0], p_member_id: 나.id, p_recused: true }).then((r) => r.data as { result: string }),
  ]);
  const 회의상태 = await 상태(R.id);
  const 제척기록 = (await db.from("recusals").select("created_at").eq("agenda_id", R.안건들[0]).eq("member_id", 나.id).maybeSingle()).data;
  // 마감이 성공하려면 나가 평가 대상에서 빠져 있어야 한다 → 제척이 마감보다 먼저여야 함. 마감이 먼저였다면 마감은 '미제출'로 거부됐어야 한다.
  const 맞음 =
    마감결과.result === "ok"
      ? 제척결과.result === "ok" && !!제척기록 && new Date(제척기록.created_at) <= new Date(회의상태.closed_at!)
      : 마감결과.result === "missing" && 회의상태.status === "open" && (제척결과.result === "ok");
  if (!맞음) 어긋남2++;
}
결과(어긋남2 === 0, "마감과 제척이 동시에 와도 마감 뒤에 제척이 끼어들지 않음 (8회)");

await 정리();
const { count } = await db.from("committees").select("*", { count: "exact", head: true }).like("name", `${점검용}%`);
결과(count === 0, "점검용 위원회·회의·안건·평가 정리 완료");

console.log(실패 ? "\n마감 점검 실패 — 위 ❌ 항목을 확인하세요." : "\n마감 점검 통과");
process.exit(실패 ? 1 : 0);
