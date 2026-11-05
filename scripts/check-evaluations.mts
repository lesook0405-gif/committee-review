// Plan 작업 15 — 위원 평가 입력·제출·수정 점검 (개발 서버가 켜져 있어야 한다)
// 실행: npm run check:evaluations   (기본 주소 http://localhost:3001, 다른 주소면 APP_URL=... 로 지정)
// 평가를 제출하면 위원회의 평가 방식이 잠기므로, 샘플 위원회 대신 "[점검용]" 위원회를 따로 만들어 쓰고 마지막에 지운다.
// 위원 화면의 [제출]이 보내는 요청(서버가 만든 숨은 칸 + 점수 칸)을 그대로 보내고, 데이터베이스 함수는 직접 불러 경계 시각을 확인한다.
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
const 지문 = (token: string) =>
  createHmac("sha256", createHash("sha256").update(`fingerprint:${process.env.MEMBER_LINK_SECRET}`).digest()).update(token).digest("hex");
const 풀기 = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const 잠깐 = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function 열기(경로: string) {
  return (await (await fetch(`${APP_URL}${경로}`, { redirect: "manual" })).text()).replace(/<!-- -->/g, "");
}
// 평가 화면의 양식에서 서버가 만든 숨은 칸을 받아 둔다 (제출할 때 이 칸이 위원 본인과 안건을 알려 준다)
async function 숨은_칸(경로: string): Promise<[string, string][]> {
  const 글자 = await 열기(경로);
  const 양식 = [...글자.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes('name="score-0"')) ?? "";
  return [...양식.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)].map((m) => [풀기(m[1]), 풀기(m[2] ?? "")]);
}
async function 제출(경로: string, 숨은: [string, string][], 점수: string[]) {
  const 데이터 = new FormData();
  for (const [이름, 값] of 숨은) 데이터.append(이름, 값);
  점수.forEach((v, i) => 데이터.append(`score-${i}`, v));
  const 응답 = await fetch(`${APP_URL}${경로}`, { method: "POST", body: 데이터, headers: { origin: APP_URL }, redirect: "manual" });
  return (await 응답.text()).replace(/<!-- -->/g, "");
}

// ── 준비: 점검용 위원회(항목 3개: 30·40·30, 기준 70), 위원 3명, 회의(이미 시작), 안건 2건
async function 정리() {
  await db.from("committees").delete().like("name", `${점검용}%`); // 위원·회의·안건·평가가 함께 지워짐
}
await 정리();
const 항목 = [
  { name: "적정성", maxScore: 30 },
  { name: "효과성", maxScore: 40 },
  { name: "시급성", maxScore: 30 },
];
const { data: 위원회 } = await db.from("committees").insert({ name: `${점검용} 평가 위원회`, criteria: 항목, pass_score: 70 }).select("id, locked_at").single();
const { data: 위원들 } = await db
  .from("members")
  .insert(["가", "나", "다"].map((n, i) => ({ committee_id: 위원회!.id, name: `점검위원 ${n}`, email: `check-eval-${i}@example.com`, phone: `010-0000-01${i}0` })))
  .select("id, name")
  .then((r) => ({ data: r.data?.sort((a, b) => a.name.localeCompare(b.name)) }));
const [가, 나, 다] = 위원들!;
const { data: 회의 } = await db
  .from("meetings")
  .insert({ committee_id: 위원회!.id, title: `${점검용} 평가 회의`, starts_at: new Date(Date.now() - 60_000).toISOString() })
  .select("id")
  .single();
const 안건_만들기 = async (position: number) =>
  (await db.from("agendas").insert({ meeting_id: 회의!.id, position, title: `점검 안건 ${position}`, pdf_path: `check/${회의!.id}-${position}.pdf`, pdf_size_bytes: 100 }).select("id").single()).data!.id;
const [안건1, 안건2] = [await 안건_만들기(1), await 안건_만들기(2)];
async function 링크_주기(memberId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.from("meeting_members").upsert(
    { meeting_id: 회의!.id, member_id: memberId, link_ciphertext: "check-only", link_fingerprint: 지문(token), link_issued_at: new Date().toISOString(), blocked_at: null, removed_at: null },
    { onConflict: "meeting_id,member_id" },
  );
  return token;
}
const 링크 = { 가: await 링크_주기(가.id), 나: await 링크_주기(나.id), 다: await 링크_주기(다.id) };
const 평가경로 = (token: string, agendaId: string) => `/m/${token}/a/${agendaId}/evaluate`;
const 내평가 = async (agendaId: string, memberId: string) =>
  (await db.from("evaluations").select("scores, total, is_proxy").eq("agenda_id", agendaId).eq("member_id", memberId).maybeSingle()).data;
const 잠금 = async () => (await db.from("committees").select("locked_at").eq("id", 위원회!.id).single()).data!.locked_at;
const 평가수 = async () => (await db.from("evaluations").select("*", { count: "exact", head: true }).in("agenda_id", [안건1, 안건2])).count ?? 0;
const rpc = async (agendaId: string, memberId: string, scores: unknown) =>
  ((await db.rpc("submit_evaluation", { p_meeting_id: 회의!.id, p_agenda_id: agendaId, p_member_id: memberId, p_scores: scores as never })).data as { result: string }).result;

// 1) 위원 화면 — 안건 목록 버튼, 평가 화면 모양
const 목록 = await 열기(`/m/${링크.가}`);
결과(목록.includes("평가하기") && 목록.includes("점검 안건 1"), "회의 시작 후: 안건 목록에 [평가하기] 버튼");
const 화면 = await 열기(평가경로(링크.가, 안건1));
결과(화면.includes("적정성") && 화면.includes("0 ~ 30점") && 화면.includes("효과성") && 화면.includes("0 ~ 40점") && 화면.includes("시급성"), "평가 화면: 항목 이름과 배점으로 입력칸이 자동 생성됨");
결과((화면.match(/name="score-\d"/g) ?? []).length === 3 && 화면.includes("합계"), "평가 화면: 입력칸 3개와 합계 표시");
결과(!/다른 위원|점검위원 나|점검위원 다|평균|가결/.test(화면), "평가 화면: 다른 위원 이름·평균·가결 여부 없음");
const 숨은_가 = await 숨은_칸(평가경로(링크.가, 안건1));
결과(숨은_가.length > 0, "서버가 만든 숨은 칸(위원 본인·안건 확인용)이 양식에 들어 있음");

// 2) 틀린 입력은 거부 — 저장된 것이 없어야 함
for (const [설명, 점수] of [
  ["빈칸이 있으면", ["25", "", "20"]],
  ["배점을 넘으면(31 > 30)", ["31", "35", "20"]],
  ["소수점이 있으면", ["25.5", "35", "20"]],
  ["음수이면", ["-1", "35", "20"]],
  ["숫자가 아니면", ["abc", "35", "20"]],
  ["지수 표기(1e1)이면", ["1e1", "35", "20"]],
] as const) {
  await 제출(평가경로(링크.가, 안건1), 숨은_가, [...점수]);
  결과((await 평가수()) === 0, `${설명} 거부, 저장되지 않음`);
}
결과((await 제출(평가경로(링크.가, 안건1), 숨은_가, ["25", "", "20"])).includes("점수를 입력해 주세요"), "빈칸 → '점수를 입력해 주세요.' 안내");
결과(!(await 잠금()), "저장된 평가가 없으면 평가 방식은 잠기지 않음");

// 3) 정상 제출 → 한 기록, 합계, 평가 방식 잠금
await 제출(평가경로(링크.가, 안건1), 숨은_가, ["25", "35", "20"]);
const 첫 = await 내평가(안건1, 가.id);
결과(!!첫 && JSON.stringify(첫.scores) === "[25,35,20]" && 첫.total === 80 && 첫.is_proxy === false, "정상 제출 → 점수 [25,35,20], 합계 80, 대리 입력 아님");
결과(!!(await 잠금()), "첫 평가가 저장되면 위원회의 평가 방식이 잠김");
await 제출(평가경로(링크.가, 안건1), 숨은_가, ["0", "40", "30"]);
const 수정 = await 내평가(안건1, 가.id);
결과(JSON.stringify(수정?.scores) === "[0,40,30]" && 수정?.total === 70 && (await 평가수()) === 1, "마감 전 다시 제출 → 같은 기록을 덮어씀 (위원 1명·안건 1건에 기록 1개), 경계값 0과 배점 그대로 허용");
결과((await 열기(평가경로(링크.가, 안건1))).includes('value="40"'), "다시 열면 내가 낸 점수가 채워져 있음");
결과((await 열기(`/m/${링크.가}`)).includes("제출 완료"), "안건 목록에 '제출 완료'와 [수정]");

// 4) 위원 본인 확인 — 다른 안건·다른 위원 기록은 건드리지 않음
결과((await 내평가(안건2, 가.id)) === null && (await 내평가(안건1, 나.id)) === null, "다른 안건·다른 위원의 기록은 만들어지지 않음");
const 숨은_나 = await 숨은_칸(평가경로(링크.나, 안건1));
await 제출(평가경로(링크.나, 안건1), 숨은_나, ["10", "10", "10"]);
const 나기록 = await 내평가(안건1, 나.id);
결과(나기록?.total === 30 && (await 내평가(안건1, 가.id))?.total === 70, "위원 나의 제출은 나의 기록으로만 저장 (가의 점수는 그대로)");

// 5) 데이터베이스 함수 직접 호출 — 상태별 거부
결과((await rpc(안건1, 다.id, [1, 2]))  === "invalid-scores", "항목 수가 다른 점수 배열 → 거부");
결과((await rpc(안건1, 다.id, [1, 2, "3"])) === "invalid-scores", "숫자가 아닌 값 → 거부");
결과((await rpc(안건1, 다.id, [1, 2, 3.5])) === "invalid-scores", "소수 → 거부 (데이터베이스에서도 정수만)");
결과((await rpc(안건1, 다.id, [1, 41, 3])) === "invalid-scores", "배점 초과 → 거부 (데이터베이스에서도)");
결과((await 내평가(안건1, 다.id)) === null, "거부된 점수는 저장되지 않음");

// 6) 제척·대리 입력·회의에서 제외·차단된 링크
// 안건 2 양식은 제척하기 전에 받아 둔다 (제척된 뒤에는 입력 화면이 열리지 않으므로)
const 숨은_다2 = await 숨은_칸(평가경로(링크.다, 안건2));
await db.from("recusals").insert({ agenda_id: 안건2, member_id: 다.id });
await 제출(평가경로(링크.다, 안건2), 숨은_다2, ["10", "10", "10"]);
결과((await 내평가(안건2, 다.id)) === null && (await rpc(안건2, 다.id, [10, 10, 10])) === "recused", "제척된 안건에는 제출할 수 없음");
결과((await 열기(평가경로(링크.다, 안건2))).includes("제척되어 평가하지 않습니다") && !(await 열기(평가경로(링크.다, 안건2))).includes('name="score-0"'), "제척된 안건: 입력 화면 대신 안내");
결과((await 열기(`/m/${링크.다}`)).includes("제척"), "안건 목록에 '제척' 표시");
await db.from("recusals").delete().eq("agenda_id", 안건2); // 뒤의 시험을 위해 제척을 풀어 둔다

await db.from("evaluations").insert({ agenda_id: 안건1, member_id: 다.id, scores: [5, 5, 5], total: 15, is_proxy: true });
결과((await rpc(안건1, 다.id, [30, 40, 30])) === "proxy" && (await 내평가(안건1, 다.id))?.total === 15, "담당 팀원이 대리 입력한 기록은 위원이 고칠 수 없음");
const 대리화면 = await 열기(평가경로(링크.다, 안건1));
결과(대리화면.includes("대리 입력한 평가") && !대리화면.includes('name="score-0"'), "대리 입력된 안건: 입력 화면 대신 안내");
결과((await 열기(`/m/${링크.다}`)).includes("대리 입력됨"), "안건 목록에 '대리 입력됨' 표시");

await db.from("meeting_members").update({ removed_at: new Date().toISOString() }).eq("meeting_id", 회의!.id).eq("member_id", 나.id);
결과((await rpc(안건1, 나.id, [1, 1, 1])) === "not-participant", "회의에서 제외된 위원 → 거부");
await db.from("meeting_members").update({ removed_at: null, blocked_at: new Date().toISOString() }).eq("meeting_id", 회의!.id).eq("member_id", 나.id);
const 차단전_점수 = (await 내평가(안건1, 나.id))?.total;
const 차단응답 = await 제출(평가경로(링크.나, 안건1), 숨은_나, ["30", "40", "30"]);
결과((await 내평가(안건1, 나.id))?.total === 차단전_점수 && 차단응답.includes("사용이 중지된 링크"), "차단된 링크로 제출 → 거부, 점수 그대로");
await db.from("meeting_members").update({ blocked_at: null }).eq("meeting_id", 회의!.id).eq("member_id", 나.id);

// 7) 회의 시작 시각 경계 — 시작 시각 "전"은 거부, 시작 시각 "부터" 허용
await db.from("evaluations").delete().eq("agenda_id", 안건2);
const 시작_예정 = new Date(Date.now() + 2500);
await db.from("meetings").update({ starts_at: 시작_예정.toISOString() }).eq("id", 회의!.id);
결과((await rpc(안건2, 가.id, [1, 1, 1])) === "not-started", "시작 시각 전에는 제출 거부 (데이터베이스)");
const 시작전_화면 = await 열기(평가경로(링크.가, 안건2));
결과(시작전_화면.includes("회의가 시작된 뒤에 평가할 수 있습니다") && !시작전_화면.includes('name="score-0"'), "시작 전: 입력 화면 대신 안내");
결과((await 열기(`/m/${링크.가}`)).includes("회의 시작 후 평가"), "시작 전: 안건 목록에는 [평가하기] 대신 안내");
await 잠깐(Math.max(0, 시작_예정.getTime() - Date.now()) + 300);
결과((await rpc(안건2, 가.id, [1, 1, 1])) === "ok", "시작 시각이 지나면 제출 허용");

// 8) 마감 후 — 수정 불가, 내 점수는 읽기 전용
await db.from("meetings").update({ status: "closed", closed_at: new Date().toISOString(), starts_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", 회의!.id);
const 마감전점수 = (await 내평가(안건1, 가.id))?.total;
결과((await rpc(안건1, 가.id, [30, 40, 30])) === "closed" && (await 내평가(안건1, 가.id))?.total === 마감전점수, "마감 후 제출·수정 거부 (데이터베이스)");
const 마감화면 = await 열기(평가경로(링크.가, 안건1));
결과(마감화면.includes("마감된 회의라 점수를 바꿀 수 없습니다") && !마감화면.includes('name="score-0"'), "마감 후: 입력 화면 대신 안내");
const 마감목록 = await 열기(`/m/${링크.가}`);
결과(마감목록.includes("제출 완료") && !마감목록.includes(">수정<"), "마감 후 안건 목록: '제출 완료'만, [수정] 없음");
await db.from("meetings").update({ status: "open", closed_at: null }).eq("id", 회의!.id);

// 9) 같은 위원이 거의 동시에 두 번 제출해도 기록은 1개
await db.from("evaluations").delete().eq("agenda_id", 안건2).eq("member_id", 가.id);
await Promise.all([rpc(안건2, 가.id, [1, 1, 1]), rpc(안건2, 가.id, [2, 2, 2]), rpc(안건2, 가.id, [3, 3, 3])]);
const { count: 동시 } = await db.from("evaluations").select("*", { count: "exact", head: true }).eq("agenda_id", 안건2).eq("member_id", 가.id);
결과(동시 === 1, "동시에 여러 번 제출해도 위원 1명·안건 1건에 기록 1개");

// 10) 평가 방식이 잠긴 위원회 — 점수 검사는 저장 당시 평가 방식으로 (잠금 확인)
결과(!!(await 잠금()), "평가 기록이 있는 위원회는 계속 잠겨 있음");

await 정리();
const { count } = await db.from("committees").select("*", { count: "exact", head: true }).like("name", `${점검용}%`);
결과(count === 0, "점검용 위원회·회의·안건·평가 정리 완료");

console.log(실패 ? "\n평가 점검 실패 — 위 ❌ 항목을 확인하세요." : "\n평가 점검 통과");
process.exit(실패 ? 1 : 0);
