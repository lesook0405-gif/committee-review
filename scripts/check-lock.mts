// Plan 작업 16 — 첫 평가(대리 입력 포함) 후 평가 방식 잠금 점검
// 실행: npm run check:lock   (개발 서버는 화면 표시 확인에만 쓴다. 기본 주소 http://localhost:3001)
// 평가가 어떤 길로 들어와도(위원 제출, 대리 입력처럼 기록을 직접 넣는 경우) 위원회가 잠기고,
// 잠긴 위원회는 앱 코드를 거치지 않고 데이터베이스에 직접 고치려 해도 평가 방식이 바뀌지 않는지 확인한다.
// "[점검용]" 위원회를 따로 만들어 쓰고 마지막에 지운다.
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
const 열기 = async (경로: string, 쿠키값: string) =>
  (await (await fetch(`${APP_URL}${경로}`, { headers: { cookie: 쿠키값 }, redirect: "manual" })).text()).replace(/<!-- -->/g, "");

const 항목 = [
  { name: "적정성", maxScore: 30 },
  { name: "효과성", maxScore: 40 },
  { name: "시급성", maxScore: 30 },
];

async function 정리() {
  await db.from("committees").delete().like("name", `${점검용}%`);
}
await 정리();

/** 위원회 + 위원 + 이미 시작한 회의 + 안건 1건 */
async function 준비(이름: string) {
  const { data: 위원회 } = await db.from("committees").insert({ name: `${점검용} ${이름}`, criteria: 항목, pass_score: 70, exclude_extremes: false }).select("id").single();
  const { data: 위원 } = await db.from("members").insert({ committee_id: 위원회!.id, name: "점검위원", email: `lock-${이름}@example.com`, phone: "010-0000-0199" }).select("id").single();
  const { data: 회의 } = await db.from("meetings").insert({ committee_id: 위원회!.id, title: `${점검용} ${이름} 회의`, starts_at: new Date(Date.now() - 60_000).toISOString() }).select("id").single();
  await db.from("meeting_members").insert({ meeting_id: 회의!.id, member_id: 위원!.id });
  const { data: 안건 } = await db.from("agendas").insert({ meeting_id: 회의!.id, position: 1, title: "점검 안건", pdf_path: `check/lock-${회의!.id}.pdf`, pdf_size_bytes: 100 }).select("id").single();
  return { 위원회: 위원회!.id, 위원: 위원!.id, 회의: 회의!.id, 안건: 안건!.id };
}
const 상태 = async (id: string) =>
  (await db.from("committees").select("name, criteria, pass_score, exclude_extremes, locked_at").eq("id", id).single()).data!;

// 1) 평가가 없으면 평가 방식을 자유롭게 고칠 수 있고 잠기지 않음
const A = await 준비("직접 입력");
const 고침 = await db.from("committees").update({ pass_score: 60, exclude_extremes: true }).eq("id", A.위원회);
결과(!고침.error && (await 상태(A.위원회)).pass_score === 60 && !(await 상태(A.위원회)).locked_at, "평가가 없는 위원회: 평가 방식을 고칠 수 있고 잠기지 않음");

// 2) 평가 기록이 어떤 길로든 처음 들어오면 즉시 잠김 — 대리 입력 기록(is_proxy)을 앱 함수를 거치지 않고 직접 넣어 본다
const 넣기 = await db.from("evaluations").insert({ agenda_id: A.안건, member_id: A.위원, scores: [10, 10, 10], total: 30, is_proxy: true });
결과(!넣기.error && !!(await 상태(A.위원회)).locked_at, "대리 입력 기록이 직접 들어와도(앱 함수를 거치지 않아도) 위원회가 잠김");

// 3) 잠긴 위원회 — 앱 코드를 거치지 않고 데이터베이스에 직접 고치려 해도 거부
const 잠금시각 = (await 상태(A.위원회)).locked_at;
const 시도 = async (설명: string, 변경: Record<string, unknown>) => {
  const 응답 = await db.from("committees").update(변경).eq("id", A.위원회);
  const 현재 = await 상태(A.위원회);
  결과(!!응답.error && JSON.stringify(현재.criteria) === JSON.stringify(항목) && 현재.pass_score === 60 && 현재.exclude_extremes === true, `잠긴 위원회: ${설명} → 거부, 값 그대로`);
};
await 시도("배점 항목 바꾸기", { criteria: [{ name: "적정성", maxScore: 99 }] });
await 시도("가결 기준 점수 바꾸기", { pass_score: 1 });
await 시도("최고·최저점 제외 옵션 바꾸기", { exclude_extremes: false });
const 풀기 = await db.from("committees").update({ locked_at: null }).eq("id", A.위원회);
결과(!!풀기.error && (await 상태(A.위원회)).locked_at === 잠금시각, "잠긴 위원회: 잠금 풀기 → 거부, 잠금 시각 그대로");
const 이름만 = await db.from("committees").update({ name: `${점검용} 이름 바꿈` }).eq("id", A.위원회);
결과(!이름만.error && (await 상태(A.위원회)).name === `${점검용} 이름 바꿈`, "잠긴 위원회도 이름은 바꿀 수 있음 (평가 방식이 아니므로)");

// 4) 앱이 쓰는 방식 그대로: "잠기지 않았을 때만" 조건을 붙인 수정은 바뀐 행이 0건
const 앱방식 = await db.from("committees").update({ pass_score: 5 }).eq("id", A.위원회).is("locked_at", null).select("id");
결과(!앱방식.error && (앱방식.data ?? []).length === 0 && (await 상태(A.위원회)).pass_score === 60, "앱의 수정 방식(잠기지 않았을 때만)도 바뀐 행 0건");

// 5) 평가 기록을 지워도 잠금은 풀리지 않음 (한 번 잠기면 계속 잠김)
await db.from("evaluations").delete().eq("agenda_id", A.안건);
결과((await 상태(A.위원회)).locked_at === 잠금시각, "평가 기록을 지워도 잠금은 그대로");

// 6) 위원 제출 함수(submit_evaluation)로도 잠기고, 같은 위원회의 다른 평가는 잠금 시각을 바꾸지 않음
const B = await 준비("위원 제출");
const 제출 = (await db.rpc("submit_evaluation", { p_meeting_id: B.회의, p_agenda_id: B.안건, p_member_id: B.위원, p_scores: [10, 20, 30] })).data as { result: string };
const 제출후 = await 상태(B.위원회);
결과(제출.result === "ok" && !!제출후.locked_at, "위원 제출(submit_evaluation)로도 위원회가 잠김");
await db.rpc("submit_evaluation", { p_meeting_id: B.회의, p_agenda_id: B.안건, p_member_id: B.위원, p_scores: [11, 21, 29] });
결과((await 상태(B.위원회)).locked_at === 제출후.locked_at, "수정해서 다시 제출해도 잠금 시각은 처음 그대로");

// 7) 다른 위원회는 영향 없음
const C = await 준비("다른 위원회");
결과(!(await 상태(C.위원회)).locked_at, "다른 위원회는 잠기지 않음");
const 다른수정 = await db.from("committees").update({ pass_score: 50 }).eq("id", C.위원회);
결과(!다른수정.error && (await 상태(C.위원회)).pass_score === 50, "다른 위원회의 평가 방식은 계속 고칠 수 있음");

// 8) 제출과 평가 방식 수정이 동시에 와도 어긋나지 않음 — 저장된 점수는 항상 "저장 당시 평가 방식"에 맞아야 한다
//    수정은 배점을 5로 줄이려 하고, 제출은 배점 30·40·30에 맞는 점수라 둘 중 하나만 성공해야 한다.
let 어긋남 = 0;
let 제출먼저 = 0;
let 수정먼저 = 0;
for (let 회차 = 0; 회차 < 8; 회차++) {
  const D = await 준비(`동시 ${회차}`);
  const 작게 = [{ name: "적정성", maxScore: 5 }, { name: "효과성", maxScore: 5 }, { name: "시급성", maxScore: 5 }];
  const [제출결과, 수정결과] = await Promise.all([
    db.rpc("submit_evaluation", { p_meeting_id: D.회의, p_agenda_id: D.안건, p_member_id: D.위원, p_scores: [30, 40, 30] }),
    db.from("committees").update({ criteria: 작게, pass_score: 15 }).eq("id", D.위원회).is("locked_at", null).select("id"),
  ]);
  const 제출성공 = (제출결과.data as { result: string }).result === "ok";
  const 수정성공 = (수정결과.data ?? []).length > 0;
  const 현재 = await 상태(D.위원회);
  const 평가 = (await db.from("evaluations").select("scores").eq("agenda_id", D.안건)).data ?? [];
  const 맞음 = 제출성공 ? JSON.stringify(현재.criteria) === JSON.stringify(항목) && 평가.length === 1 : 평가.length === 0;
  if (제출성공) 제출먼저++;
  else 수정먼저++;
  if (!맞음 || (제출성공 && 수정성공)) 어긋남++;
}
결과(어긋남 === 0, `제출과 평가 방식 수정이 동시에 와도 어긋나지 않음 (8회: 제출이 먼저 ${제출먼저}회, 수정이 먼저 ${수정먼저}회)`);

// 9) 화면 — 잠긴 위원회는 '잠김' 표시와 읽기 전용 표, 수정 양식 없음 (담당 팀원·팀장 모두)
const { data: 계정들 } = await db.from("staff").select("id, role");
const 담당 = 계정들?.find((s) => s.role === "staff")?.id;
const 팀장 = 계정들?.find((s) => s.role === "lead")?.id;
if (담당 && 팀장) {
  const 담당_화면 = await 열기(`/admin/committees/${B.위원회}?tab=scoring`, 쿠키(담당, "staff"));
  결과(담당_화면.includes("잠김") && 담당_화면.includes("첫 평가가 제출되어 평가 방식을 바꿀 수 없습니다") && !담당_화면.includes("평가 방식 저장"), "잠긴 위원회(담당 팀원): '잠김' 안내와 읽기 전용 표, 저장 버튼 없음");
  const 팀장_화면 = await 열기(`/admin/committees/${B.위원회}?tab=scoring`, 쿠키(팀장, "lead"));
  결과(팀장_화면.includes("잠김") && !팀장_화면.includes("평가 방식 저장"), "잠긴 위원회(팀장): '잠김' 표시, 저장 버튼 없음");
  const 안잠김 = await 열기(`/admin/committees/${C.위원회}?tab=scoring`, 쿠키(담당, "staff"));
  결과(!안잠김.includes("첫 평가가 제출되어") && 안잠김.includes("평가 방식 저장"), "잠기지 않은 위원회: 수정 양식이 보임");
} else {
  결과(false, "담당 팀원·팀장 계정이 없어 화면 확인을 건너뜀 (npm run seed 필요)");
}

await 정리();
const { count } = await db.from("committees").select("*", { count: "exact", head: true }).like("name", `${점검용}%`);
결과(count === 0, "점검용 위원회 정리 완료");

console.log(실패 ? "\n평가 방식 잠금 점검 실패 — 위 ❌ 항목을 확인하세요." : "\n평가 방식 잠금 점검 통과");
process.exit(실패 ? 1 : 0);
