// Plan 작업 19 — 담당 팀원의 평가 대리 입력·수정 점검 (개발 서버가 켜져 있어야 한다)
// 실행: npm run check:proxy   (기본 주소 http://localhost:3001, 다른 주소면 APP_URL=... 로 지정)
// 화면의 [대리 입력 저장]이 보내는 요청(서버가 만든 숨은 칸 + 점수 칸)을 그대로 보내고, 팀장·상태가 바뀐 뒤의 요청, 동시 요청도 확인한다.
// "[점검용]" 위원회를 따로 만들어 쓰고 마지막에 지운다.
import { createHash, createHmac, randomBytes } from "node:crypto";

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
const 지문 = (token: string) =>
  createHmac("sha256", createHash("sha256").update(`fingerprint:${process.env.MEMBER_LINK_SECRET}`).digest()).update(token).digest("hex");
const 풀기 = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const 잠깐 = (ms: number) => new Promise((r) => setTimeout(r, ms));

const 열기 = async (경로: string, 쿠키값 = "") =>
  (await (await fetch(`${APP_URL}${경로}`, { headers: { cookie: 쿠키값 }, redirect: "manual" })).text()).replace(/<!-- -->/g, "");
async function 숨은_칸(경로: string, 쿠키값: string): Promise<[string, string][]> {
  const 글자 = await 열기(경로, 쿠키값);
  const 양식 = [...글자.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes('name="score-0"')) ?? "";
  return [...양식.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)].map((m) => [풀기(m[1]), 풀기(m[2] ?? "")]);
}
async function 보내기(경로: string, 쿠키값: string, 숨은: [string, string][], 점수: string[]) {
  const 데이터 = new FormData();
  for (const [이름, 값] of 숨은) 데이터.append(이름, 값);
  점수.forEach((v, i) => 데이터.append(`score-${i}`, v));
  const 응답 = await fetch(`${APP_URL}${경로}`, { method: "POST", body: 데이터, headers: { cookie: 쿠키값, origin: APP_URL }, redirect: "manual" });
  return (await 응답.text()).replace(/<!-- -->/g, "");
}

const { data: 계정들 } = await db.from("staff").select("id, role");
const 담당 = 계정들?.find((s) => s.role === "staff")?.id;
const 팀장 = 계정들?.find((s) => s.role === "lead")?.id;
if (!담당 || !팀장 || !process.env.MEMBER_LINK_SECRET) {
  console.log("❌ 담당 팀원·팀장 계정 또는 MEMBER_LINK_SECRET이 없습니다. npm run seed 와 .env.local을 확인하세요.");
  process.exit(1);
}
const 담당_쿠키 = 쿠키(담당, "staff");
const 팀장_쿠키 = 쿠키(팀장, "lead");
async function 정리() {
  await db.from("committees").delete().like("name", `${점검용}%`);
}
await 정리();

// ── 준비: 위원회(30·70점), 위원 5명(가·나·다·라·마), 이미 시작한 회의(참석 가·나·다·마), 안건 2건
const 항목 = [{ name: "적정성", maxScore: 30 }, { name: "효과성", maxScore: 70 }];
const { data: 위원회 } = await db.from("committees").insert({ name: `${점검용} 대리 위원회`, criteria: 항목, pass_score: 70 }).select("id").single();
const { data: 위원들 } = await db
  .from("members")
  .insert(["가", "나", "다", "라", "마"].map((n, i) => ({ committee_id: 위원회!.id, name: `점검위원 ${n}`, email: `proxy-${i}@example.com`, phone: `010-0000-03${i}0` })))
  .select("id, name")
  .then((r) => ({ data: r.data?.sort((a, b) => a.name.localeCompare(b.name)) }));
const [가, 나, 다, 라, 마] = 위원들!;
const { data: 회의 } = await db.from("meetings").insert({ committee_id: 위원회!.id, title: `${점검용} 대리 회의`, starts_at: new Date(Date.now() - 60_000).toISOString() }).select("id").single();
await db.from("meeting_members").insert([가, 나, 다, 마].map((m) => ({ meeting_id: 회의!.id, member_id: m.id })));
const 안건_만들기 = async (position: number) =>
  (await db.from("agendas").insert({ meeting_id: 회의!.id, position, title: `점검 안건 ${position}`, pdf_path: `check/px-${회의!.id}-${position}.pdf`, pdf_size_bytes: 100 }).select("id").single()).data!.id;
const [안건1, 안건2] = [await 안건_만들기(1), await 안건_만들기(2)];
const 링크 = randomBytes(32).toString("base64url");
await db.from("meeting_members").update({ link_ciphertext: "check-only", link_fingerprint: 지문(링크), link_issued_at: new Date().toISOString() }).eq("meeting_id", 회의!.id).eq("member_id", 가.id);

const 목록 = `/admin/meetings/${회의!.id}/proxy`;
const 입력경로 = (agendaId: string, memberId: string) => `${목록}/${agendaId}/${memberId}`;
const 기록 = async (agendaId: string, memberId: string) =>
  (await db.from("evaluations").select("scores, total, is_proxy").eq("agenda_id", agendaId).eq("member_id", memberId).maybeSingle()).data;
const 평가수 = async () => (await db.from("evaluations").select("*", { count: "exact", head: true }).in("agenda_id", [안건1, 안건2])).count ?? 0;
const 잠김 = async () => !!(await db.from("committees").select("locked_at").eq("id", 위원회!.id).single()).data!.locked_at;
const proxyRpc = async (agendaId: string, memberId: string, scores: unknown) =>
  ((await db.rpc("save_proxy_evaluation", { p_meeting_id: 회의!.id, p_agenda_id: agendaId, p_member_id: memberId, p_scores: scores as never })).data as { result: string }).result;
const submitRpc = async (agendaId: string, memberId: string, scores: unknown) =>
  ((await db.rpc("submit_evaluation", { p_meeting_id: 회의!.id, p_agenda_id: agendaId, p_member_id: memberId, p_scores: scores as never })).data as { result: string }).result;

// 대리 입력 목록에서 안건 하나의 구역(<section>)만 잘라 낸다 (다른 안건의 같은 위원 이름과 섞이지 않게)
const 구역 = (html: string, 번호: number) => {
  const 시작 = html.indexOf(`${번호}. 점검 안건 ${번호}`);
  if (시작 < 0) return "";
  const 끝 = html.indexOf("</section>", 시작);
  return html.slice(시작, 끝 < 0 ? undefined : 끝);
};

// 1) 화면 — 팀장은 막히고 담당 팀원만 보임
const 팀장_목록 = await 열기(목록, 팀장_쿠키);
결과(팀장_목록.includes("대리 입력은 담당 팀원만 할 수 있습니다") && !팀장_목록.includes("점검위원 가") && !/proxy\/[0-9a-f-]{36}\//.test(팀장_목록), "팀장: 대리 입력 목록이 막히고 위원 정보도 보이지 않음");
결과((await 열기(입력경로(안건1, 가.id), 팀장_쿠키)).includes("담당 팀원만") && !(await 열기(입력경로(안건1, 가.id), 팀장_쿠키)).includes('name="score-0"'), "팀장: 대리 입력 양식 화면도 막힘");
const 담당_목록 = await 열기(목록, 담당_쿠키);
결과(담당_목록.includes(`${가.name} 대리 입력`) && 담당_목록.includes("미제출"), "담당 팀원: 평가 대상 위원마다 [대리 입력] 버튼과 '미제출'");
결과(!담당_목록.includes(라.name), "회의에 참석하지 않는 위원은 목록에 없음");
결과((await 열기(`/admin/meetings/${회의!.id}`, 담당_쿠키)).includes("대리 입력·수정") && !(await 열기(`/admin/meetings/${회의!.id}`, 팀장_쿠키)).includes("대리 입력·수정"), "회의 상세: 담당 팀원에게만 [대리 입력·수정] 바로가기");
const 양식 = await 열기(입력경로(안건1, 가.id), 담당_쿠키);
결과(양식.includes('name="score-0"') && 양식.includes('name="score-1"') && 양식.includes("0 ~ 30점") && 양식.includes("대리 입력 저장"), "담당 팀원: 항목·배점으로 만든 입력칸과 [대리 입력 저장]");
결과(!(await 잠김()), "대리 입력 전에는 평가 방식이 잠기지 않음");

// 2) 팀장이 담당 팀원이 받은 양식 정보로 직접 보내도 거부
const 숨은_가 = await 숨은_칸(입력경로(안건1, 가.id), 담당_쿠키);
const 팀장_응답 = await 보내기(입력경로(안건1, 가.id), 팀장_쿠키, 숨은_가, ["20", "50"]);
결과((await 평가수()) === 0, "팀장이 대리 입력을 직접 보내도 저장되지 않음");
void 팀장_응답;

// 3) 틀린 점수는 거부
for (const [설명, 점수] of [["빈칸", ["20", ""]], ["배점 초과", ["31", "50"]], ["소수", ["20.5", "50"]], ["음수", ["-1", "50"]], ["글자", ["가", "50"]]] as const) {
  await 보내기(입력경로(안건1, 가.id), 담당_쿠키, 숨은_가, [...점수]);
  결과((await 평가수()) === 0, `대리 입력: ${설명} 거부, 저장되지 않음`);
}

// 4) 정상 대리 입력 → 대리 입력 표시, 첫 평가 → 잠김
const 저장응답 = await 보내기(입력경로(안건1, 가.id), 담당_쿠키, 숨은_가, ["20", "50"]);
const 첫 = await 기록(안건1, 가.id);
결과(!!첫 && JSON.stringify(첫.scores) === "[20,50]" && 첫.total === 70 && 첫.is_proxy === true, "담당 팀원 대리 입력 → 점수 [20,50], 합계 70, '대리 입력' 표시");
결과(저장응답.includes("대리 입력을 저장했습니다") || (await 평가수()) === 1, "저장 후 완료 안내");
결과(await 잠김(), "대리 입력도 첫 평가이므로 위원회의 평가 방식이 잠김");
결과((await 열기(`/admin/meetings/${회의!.id}`, 담당_쿠키)).includes("평가 기록이 있어 PDF를 교체할 수 없습니다"), "대리 입력도 평가 기록이므로 그 안건 PDF 교체 불가");

// 5) 대리 입력 수정 — 같은 기록을 고치고 '대리 입력' 표시 유지, 팀장은 수정 불가
await 보내기(입력경로(안건1, 가.id), 팀장_쿠키, 숨은_가, ["1", "1"]);
결과(JSON.stringify((await 기록(안건1, 가.id))?.scores) === "[20,50]", "팀장이 대리 입력 수정을 직접 보내도 바뀌지 않음");
const 수정양식 = await 열기(입력경로(안건1, 가.id), 담당_쿠키);
결과(수정양식.includes('value="20"') && 수정양식.includes('value="50"') && 수정양식.includes("대리 입력 수정") && 수정양식.includes("수정 저장"), "다시 열면 입력해 둔 점수가 채워지고 [수정 저장]");
await 보내기(입력경로(안건1, 가.id), 담당_쿠키, 숨은_가, ["0", "70"]);
const 고침 = await 기록(안건1, 가.id);
결과(JSON.stringify(고침?.scores) === "[0,70]" && 고침?.total === 70 && 고침?.is_proxy === true && (await 평가수()) === 1, "수정 → 같은 기록 갱신, 경계값 0과 배점 그대로 허용, 여전히 '대리 입력'(기록 1개)");
const 목록2 = await 열기(목록, 담당_쿠키);
결과(목록2.includes("대리 입력됨 · 합계 70점") && 목록2.includes(`${가.name} 대리 입력 수정`), "목록: '대리 입력됨 · 합계'와 [대리 입력 수정]");

// 6) 위원 화면 — 대리 입력 기록은 위원이 고칠 수 없다
const 위원_평가 = await 열기(`/m/${링크}/a/${안건1}/evaluate`);
결과(위원_평가.includes("대리 입력한 평가") && !위원_평가.includes('name="score-0"'), "위원 화면: 대리 입력된 안건은 입력 양식 대신 안내");
결과((await 열기(`/m/${링크}`)).includes("대리 입력됨"), "위원 안건 목록에 '대리 입력됨'");
결과((await submitRpc(안건1, 가.id, [30, 70])) === "proxy" && (await 기록(안건1, 가.id))?.total === 70, "위원이 제출·수정을 보내도 대리 입력 기록은 그대로 (거부)");

// 7) 위원이 이미 직접 제출한 경우 — 대리 입력 불가, 점수도 보이지 않음
const 숨은_나 = await 숨은_칸(입력경로(안건1, 나.id), 담당_쿠키); // 위원이 내기 전에 받아 둔 양식 정보
결과((await submitRpc(안건1, 나.id, [11, 22])) === "ok", "(준비) 위원 나가 앱에서 직접 제출");
await 보내기(입력경로(안건1, 나.id), 담당_쿠키, 숨은_나, ["30", "70"]);
const 나기록 = await 기록(안건1, 나.id);
결과(나기록?.is_proxy === false && 나기록?.total === 33, "위원이 직접 낸 기록은 대리 입력으로 덮어쓸 수 없음 (점수·표시 그대로)");
결과((await 열기(입력경로(안건1, 나.id), 담당_쿠키)).includes("직접 제출한 평가가 있어 대리 입력할 수 없습니다"), "양식 화면에도 안내");
const 목록3 = await 열기(목록, 담당_쿠키);
const 안건1_구역 = 구역(목록3, 1);
결과(
  안건1_구역.includes(`${나.name}`) && 안건1_구역.includes("위원이 앱에서 제출함") && !목록3.includes("합계 33점") && !안건1_구역.includes(`${나.name} 대리 입력`),
  "목록: 위원이 직접 제출한 안건에는 '위원이 앱에서 제출함'만 표시, 마감 전에는 낸 점수를 보여 주지 않고 [대리 입력] 버튼도 없음",
);
결과(구역(목록3, 2).includes(`${나.name} 대리 입력`), "같은 위원이 아직 제출하지 않은 다른 안건(안건 2)에는 [대리 입력] 버튼이 있음");
결과((await proxyRpc(안건1, 나.id, [1, 1])) === "submitted", "데이터베이스 함수도 위원이 낸 기록에는 거부");

// 8) 제척된 위원·회의에서 제외된 위원
const 숨은_다2 = await 숨은_칸(입력경로(안건2, 다.id), 담당_쿠키);
await db.from("recusals").insert({ agenda_id: 안건2, member_id: 다.id });
await 보내기(입력경로(안건2, 다.id), 담당_쿠키, 숨은_다2, ["10", "10"]);
결과((await 기록(안건2, 다.id)) === null, "제척된 위원에게는 대리 입력할 수 없음");
결과((await 열기(입력경로(안건2, 다.id), 담당_쿠키)).includes("평가 대상 위원이 아닙니다"), "제척된 위원의 입력 화면은 '평가 대상 위원이 아닙니다'");
const 제척_목록 = await 열기(목록, 담당_쿠키);
결과(구역(제척_목록, 2).length > 0 && !구역(제척_목록, 2).includes(다.name) && 구역(제척_목록, 1).includes(다.name), "목록: 제척된 안건(2)에는 그 위원이 나오지 않고 제척되지 않은 안건(1)에는 나옴");
const 숨은_마 = await 숨은_칸(입력경로(안건1, 마.id), 담당_쿠키);
await db.from("meeting_members").update({ removed_at: new Date().toISOString() }).eq("meeting_id", 회의!.id).eq("member_id", 마.id);
await 보내기(입력경로(안건1, 마.id), 담당_쿠키, 숨은_마, ["10", "10"]);
결과((await 기록(안건1, 마.id)) === null && (await proxyRpc(안건1, 마.id, [10, 10])) === "not-participant", "회의에서 제외된 위원에게는 대리 입력할 수 없음");
await db.from("meeting_members").update({ removed_at: null }).eq("meeting_id", 회의!.id).eq("member_id", 마.id);
await db.from("recusals").delete().eq("agenda_id", 안건2);

// 9) 데이터베이스 함수 직접 확인 — 점수 규칙은 위원 제출과 같음, 없는 안건
결과((await proxyRpc(안건2, 다.id, [31, 0])) === "invalid-scores", "데이터베이스: 배점 초과 거부");
결과((await proxyRpc(안건2, 다.id, [1])) === "invalid-scores", "데이터베이스: 항목 수가 다르면 거부");
결과((await proxyRpc(안건2, 다.id, [1.5, 2])) === "invalid-scores", "데이터베이스: 소수 거부");
결과((await proxyRpc("00000000-0000-0000-0000-000000000000", 다.id, [1, 1])) === "not-found", "데이터베이스: 없는 안건 거부");

// 10) 동시 요청 — 위원 제출과 대리 입력이 같은 순간에 와도 기록은 1개, 한쪽만 성공
let 어긋남 = 0;
let 위원이_먼저 = 0;
let 대리가_먼저 = 0;
for (let 회차 = 0; 회차 < 8; 회차++) {
  await db.from("evaluations").delete().eq("agenda_id", 안건2).eq("member_id", 다.id);
  const [제출, 대리] = await Promise.all([submitRpc(안건2, 다.id, [5, 5]), proxyRpc(안건2, 다.id, [6, 6])]);
  const 현재 = await 기록(안건2, 다.id);
  const { count } = await db.from("evaluations").select("*", { count: "exact", head: true }).eq("agenda_id", 안건2).eq("member_id", 다.id);
  const 하나만 = (제출 === "ok") !== (대리 === "ok");
  const 맞음 = count === 1 && 하나만 && (제출 === "ok" ? 현재?.is_proxy === false && 대리 === "submitted" : 현재?.is_proxy === true && 제출 === "proxy");
  if (제출 === "ok") 위원이_먼저++;
  else 대리가_먼저++;
  if (!맞음) 어긋남++;
}
결과(어긋남 === 0, `위원 제출과 대리 입력이 동시에 와도 기록은 1개, 한쪽만 성공 (8회: 위원이 먼저 ${위원이_먼저}회, 대리 입력이 먼저 ${대리가_먼저}회)`);
await db.from("evaluations").delete().eq("agenda_id", 안건2).eq("member_id", 다.id);

// 11) 회의 시작 시각 — 시작 전 거부, 시작 시각이 지나면 허용 (14:00 경계와 같은 규칙)
const 시작_예정 = new Date(Date.now() + 2500);
await db.from("meetings").update({ starts_at: 시작_예정.toISOString() }).eq("id", 회의!.id);
결과((await proxyRpc(안건2, 다.id, [1, 1])) === "not-started", "회의 시작 전에는 대리 입력 거부 (데이터베이스)");
결과((await 열기(입력경로(안건2, 다.id), 담당_쿠키)).includes("회의가 시작된 뒤에 입력할 수 있습니다") && !(await 열기(목록, 담당_쿠키)).includes(`${다.name} 대리 입력`), "시작 전: 양식 대신 안내, 목록의 버튼 없음");
await 잠깐(Math.max(0, 시작_예정.getTime() - Date.now()) + 300);
결과((await proxyRpc(안건2, 다.id, [1, 1])) === "ok", "시작 시각이 지나면 대리 입력 허용");
await db.from("evaluations").delete().eq("agenda_id", 안건2).eq("member_id", 다.id);

// 12) 마감 후 — 입력·수정 모두 거부, 화면에도 버튼 없음
await db.from("meetings").update({ status: "closed", closed_at: new Date().toISOString(), starts_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", 회의!.id);
const 마감전점수 = (await 기록(안건1, 가.id))?.total;
await 보내기(입력경로(안건1, 가.id), 담당_쿠키, 숨은_가, ["1", "1"]);
결과((await 기록(안건1, 가.id))?.total === 마감전점수 && (await proxyRpc(안건1, 가.id, [2, 2])) === "closed", "마감 후 대리 입력 수정 거부");
결과((await proxyRpc(안건2, 다.id, [2, 2])) === "closed" && (await 기록(안건2, 다.id)) === null, "마감 후 새 대리 입력 거부");
const 마감목록 = await 열기(목록, 담당_쿠키);
결과(마감목록.includes("마감된 회의라 대리 입력하거나 고칠 수 없습니다") && !마감목록.includes("대리 입력 수정"), "마감 후 목록: 안내만 있고 버튼 없음");

await 정리();
const { count } = await db.from("committees").select("*", { count: "exact", head: true }).like("name", `${점검용}%`);
결과(count === 0, "점검용 위원회·회의·안건·평가 정리 완료");

console.log(실패 ? "\n대리 입력 점검 실패 — 위 ❌ 항목을 확인하세요." : "\n대리 입력 점검 통과");
process.exit(실패 ? 1 : 0);
