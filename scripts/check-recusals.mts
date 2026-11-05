// Plan 작업 18 — 안건별 제척 표시·해제 점검 (개발 서버가 켜져 있어야 한다)
// 실행: npm run check:recusals   (기본 주소 http://localhost:3001, 다른 주소면 APP_URL=... 로 지정)
// 화면의 [제척]/[제척 해제] 버튼이 보내는 요청과, 화면을 거치지 않고 서버 처리를 직접 부르는 요청을 모두 확인한다.
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

// 준비: 위원회(위원 4명: 가·나·다·라), 회의(이미 시작, 참석은 가·나·다), 안건 2건, 다른 위원회의 위원·회의·안건 1건
const 항목 = [{ name: "적정성", maxScore: 30 }, { name: "효과성", maxScore: 70 }];
const { data: 위원회 } = await db.from("committees").insert({ name: `${점검용} 제척 위원회`, criteria: 항목, pass_score: 70 }).select("id").single();
const { data: 위원들 } = await db
  .from("members")
  .insert(["가", "나", "다", "라"].map((n, i) => ({ committee_id: 위원회!.id, name: `점검위원 ${n}`, email: `recusal-${i}@example.com`, phone: `010-0000-02${i}0` })))
  .select("id, name")
  .then((r) => ({ data: r.data?.sort((a, b) => a.name.localeCompare(b.name)) }));
const [가, 나, 다, 라] = 위원들!;
const { data: 회의 } = await db.from("meetings").insert({ committee_id: 위원회!.id, title: `${점검용} 제척 회의`, starts_at: new Date(Date.now() - 60_000).toISOString() }).select("id").single();
await db.from("meeting_members").insert([가, 나, 다].map((m) => ({ meeting_id: 회의!.id, member_id: m.id })));
const 안건_만들기 = async (meetingId: string, position: number) =>
  (await db.from("agendas").insert({ meeting_id: meetingId, position, title: `점검 안건 ${position}`, pdf_path: `check/rc-${meetingId}-${position}.pdf`, pdf_size_bytes: 100 }).select("id").single()).data!.id;
const [안건1, 안건2] = [await 안건_만들기(회의!.id, 1), await 안건_만들기(회의!.id, 2)];
const { data: 다른위원회 } = await db.from("committees").insert({ name: `${점검용} 다른 위원회`, criteria: 항목, pass_score: 70 }).select("id").single();
const { data: 남 } = await db.from("members").insert({ committee_id: 다른위원회!.id, name: "다른 위원회 위원", email: "recusal-other@example.com", phone: "010-0000-0299" }).select("id").single();
const { data: 다른회의 } = await db.from("meetings").insert({ committee_id: 다른위원회!.id, title: `${점검용} 다른 회의`, starts_at: new Date(Date.now() - 60_000).toISOString() }).select("id").single();
const 남의안건 = await 안건_만들기(다른회의!.id, 1);

const 상세 = `/admin/meetings/${회의!.id}`;
await 열기(상세, 담당_쿠키); // 개발 서버가 서버 처리 목록을 만들게 한다
const 목록 = JSON.parse(readFileSync(".next/dev/server/server-reference-manifest.json", "utf8")) as {
  node: Record<string, { exportedName: string; filename: string }>;
};
const 처리_ID = Object.entries(목록.node).find(([, v]) => v.exportedName === "setRecusalAction" && v.filename.endsWith("recusal-actions.ts"))?.[0];
if (!처리_ID) {
  console.log("❌ 제척 서버 처리 ID를 찾지 못했습니다.");
  process.exit(1);
}
async function 부르기(쿠키값: string, args: unknown[]): Promise<string> {
  const 응답 = await fetch(`${APP_URL}${상세}`, {
    method: "POST",
    headers: { cookie: 쿠키값, origin: APP_URL, "next-action": 처리_ID as string, accept: "text/x-component", "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  return 응답.text();
}
const 제척수 = async (agendaId: string, memberId?: string) => {
  let q = db.from("recusals").select("*", { count: "exact", head: true }).eq("agenda_id", agendaId);
  if (memberId) q = q.eq("member_id", memberId);
  return (await q).count ?? 0;
};
const 제척하기 = (쿠키값: string, agendaId: string, memberId: string, recused: boolean, meetingId = 회의!.id) => 부르기(쿠키값, [meetingId, agendaId, memberId, recused]);

// 1) 화면 — 담당 팀원에게는 [제척] 버튼, 팀장에게는 버튼 없음
const 담당_화면 = await 열기(상세, 담당_쿠키);
결과(담당_화면.includes(`1번 안건 ${가.name} 제척`) && 담당_화면.includes("제척 관리"), "담당 팀원 화면: 안건별 위원 [제척] 버튼과 '제척 관리'");
결과(!담당_화면.includes(`1번 안건 ${라.name} 제척`), "회의에 참석하지 않는 위원은 제척 대상 목록에 없음");
결과(!/ 제척"/.test(await 열기(상세, 팀장_쿠키)) && !(await 열기(상세, 팀장_쿠키)).includes("제척 관리"), "팀장 화면: 제척 버튼이 보이지 않음 (제척된 위원이 없을 때)");

// 2) 팀장이 직접 불러도 거부
await 제척하기(팀장_쿠키, 안건1, 가.id, true);
결과((await 제척수(안건1)) === 0, "팀장이 제척을 직접 불러도 저장되지 않음");

// 3) 담당 팀원 제척 → 기록 생김, 같은 요청을 또 보내도 1건
await 제척하기(담당_쿠키, 안건1, 가.id, true);
결과((await 제척수(안건1, 가.id)) === 1, "담당 팀원 제척 → 그 안건에 제척 기록 1건");
await 제척하기(담당_쿠키, 안건1, 가.id, true);
결과((await 제척수(안건1, 가.id)) === 1, "같은 제척을 두 번 보내도 기록은 1건");
결과((await 제척수(안건2, 가.id)) === 0, "다른 안건에는 영향 없음 (안건별 제척)");

// 4) 화면 반영 — 담당 팀원은 [제척 해제], 팀장은 제척된 위원 이름만, 열람 분모 감소
const 제척후_담당 = await 열기(상세, 담당_쿠키);
결과(제척후_담당.includes(`1번 안건 ${가.name} 제척 해제`) && 제척후_담당.includes(`제척 1명: ${가.name}`), "제척 뒤 담당 팀원 화면: [제척 해제]와 제척된 위원 이름");
const 제척후_팀장 = await 열기(상세, 팀장_쿠키);
결과(제척후_팀장.includes(`제척 1명: ${가.name}`) && !제척후_팀장.includes("제척 해제"), "제척 뒤 팀장 화면: 제척된 위원 이름만 보이고 버튼은 없음");
결과(제척후_담당.includes('aria-label="열람 2명 중 0명"') && 제척후_담당.includes('aria-label="열람 3명 중 0명"'), "열람 분모: 제척한 안건 1은 2명, 제척 없는 안건 2는 3명");

// 5) 참석하지 않는 위원·다른 회의 안건·엉뚱한 값은 거부
await 제척하기(담당_쿠키, 안건1, 라.id, true);
결과((await 제척수(안건1, 라.id)) === 0, "회의에 참석하지 않는 위원은 제척할 수 없음");
await 제척하기(담당_쿠키, 남의안건, 나.id, true);
결과((await 제척수(남의안건)) === 0, "다른 회의의 안건 ID로 제척 요청 → 거부");
await 제척하기(담당_쿠키, 안건1, 남!.id, true);
결과((await 제척수(안건1, 남!.id)) === 0, "다른 위원회 위원 ID로 제척 요청 → 거부");
await 부르기(담당_쿠키, [회의!.id, 안건1, 나.id, "true"]);
await 부르기(담당_쿠키, ["not-uuid", 안건1, 나.id, true]);
결과((await 제척수(안건1, 나.id)) === 0, "모양이 틀린 값(글자 'true', 잘못된 ID)은 거부");

// 6) 이미 낸 평가 — 제척해도 지워지지 않고, 제척된 동안은 새로 낼 수 없고, 해제하면 그대로 살아 있음
await db.from("evaluations").insert({ agenda_id: 안건1, member_id: 나.id, scores: [20, 50], total: 70, is_proxy: false });
await 제척하기(담당_쿠키, 안건1, 나.id, true);
const 평가_남음 = (await db.from("evaluations").select("total").eq("agenda_id", 안건1).eq("member_id", 나.id).maybeSingle()).data;
결과(평가_남음?.total === 70, "이미 평가를 낸 위원을 제척해도 평가 기록은 지워지지 않음");
const 제척_제출 = ((await db.rpc("submit_evaluation", { p_meeting_id: 회의!.id, p_agenda_id: 안건1, p_member_id: 나.id, p_scores: [1, 1] })).data as { result: string }).result;
결과(제척_제출 === "recused" && (await db.from("evaluations").select("total").eq("agenda_id", 안건1).eq("member_id", 나.id).single()).data?.total === 70, "제척된 위원은 평가를 새로 내거나 고칠 수 없음");
await 제척하기(담당_쿠키, 안건1, 나.id, false);
const 해제후 = (await db.from("evaluations").select("total").eq("agenda_id", 안건1).eq("member_id", 나.id).maybeSingle()).data;
결과((await 제척수(안건1, 나.id)) === 0 && 해제후?.total === 70, "제척 해제 → 제척 기록이 사라지고 이전 평가가 그대로 살아 있음 (다시 반영 대상)");
const 해제_제출 = ((await db.rpc("submit_evaluation", { p_meeting_id: 회의!.id, p_agenda_id: 안건1, p_member_id: 나.id, p_scores: [25, 60] })).data as { result: string }).result;
결과(해제_제출 === "ok", "제척을 해제하면 다시 평가를 낼 수 있음");

// 7) 제척만으로는 PDF 교체가 막히지 않음 (평가 기록이 있어야 막힘)
const 교체화면 = await 열기(상세, 담당_쿠키);
결과(교체화면.includes("2번 안건 PDF 교체") && !교체화면.includes("1번 안건 PDF 교체"), "제척만 있는 안건은 [교체] 가능, 평가 기록이 있는 안건은 불가");
await 제척하기(담당_쿠키, 안건2, 다.id, true);
결과((await 열기(상세, 담당_쿠키)).includes("2번 안건 PDF 교체"), "제척 기록이 생겨도 평가 기록이 없으면 [교체] 가능");

// 8) 제척 해제 — 팀장 거부 / 담당 팀원 해제 / 없는 제척 해제는 조용히 성공
await 제척하기(팀장_쿠키, 안건2, 다.id, false);
결과((await 제척수(안건2, 다.id)) === 1, "팀장이 제척 해제를 직접 불러도 바뀌지 않음");
await 제척하기(담당_쿠키, 안건2, 다.id, false);
결과((await 제척수(안건2, 다.id)) === 0, "담당 팀원 제척 해제 → 기록 삭제");
const 없는해제 = await 제척하기(담당_쿠키, 안건2, 다.id, false);
결과(!없는해제.includes("바꿀 수 없습니다") && (await 제척수(안건2)) === 0, "제척이 없는 위원을 해제해도 오류 없이 그대로");

// 9) 회의에서 제외된 위원 — 이미 있던 제척은 해제할 수 있고, 새 제척은 거부
await 제척하기(담당_쿠키, 안건2, 가.id, true);
await db.from("meeting_members").update({ removed_at: new Date().toISOString() }).eq("meeting_id", 회의!.id).eq("member_id", 가.id);
await 제척하기(담당_쿠키, 안건2, 가.id, false);
결과((await 제척수(안건2, 가.id)) === 0, "회의에서 제외된 위원의 제척도 해제할 수 있음");
await 제척하기(담당_쿠키, 안건2, 가.id, true);
결과((await 제척수(안건2, 가.id)) === 0, "회의에서 제외된 위원은 새로 제척할 수 없음");
await db.from("meeting_members").update({ removed_at: null }).eq("meeting_id", 회의!.id).eq("member_id", 가.id);

// 10) 마감 후 — 제척·해제 모두 거부, 화면에는 버튼 없음
await 제척하기(담당_쿠키, 안건2, 나.id, true); // 마감 전에 하나 만들어 둔다
await db.from("meetings").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", 회의!.id);
const 마감_응답 = await 제척하기(담당_쿠키, 안건2, 다.id, true);
결과(마감_응답.includes("마감된 회의") && (await 제척수(안건2, 다.id)) === 0, "마감된 회의: 제척 거부");
await 제척하기(담당_쿠키, 안건2, 나.id, false);
결과((await 제척수(안건2, 나.id)) === 1, "마감된 회의: 제척 해제도 거부 (기록 그대로)");
const 마감_화면 = await 열기(상세, 담당_쿠키);
결과(!/ 제척"/.test(마감_화면) && !마감_화면.includes("제척 해제"), "마감된 회의 화면: [제척]·[제척 해제] 버튼 없음");

await 정리();
const { count } = await db.from("committees").select("*", { count: "exact", head: true }).like("name", `${점검용}%`);
결과(count === 0, "점검용 위원회·회의·안건·제척 정리 완료");

console.log(실패 ? "\n제척 점검 실패 — 위 ❌ 항목을 확인하세요." : "\n제척 점검 통과");
process.exit(실패 ? 1 : 0);
