// Plan 작업 21 — 마감 후에만 열리는 집계 결과 화면 점검 (개발 서버가 켜져 있어야 한다)
// 실행: npm run check:results   (기본 주소 http://localhost:3001, 다른 주소면 APP_URL=... 로 지정)
// DESIGN의 손 계산 예시를 화면까지 그대로 돌려 보고(77.3 가결, 73.3 가결), 마감 전에는 점수가 새어 나오지 않는지 확인한다.
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
const 가져오기 = async (경로: string, 쿠키값 = "") => {
  const 응답 = await fetch(`${APP_URL}${경로}`, { headers: { cookie: 쿠키값 }, redirect: "manual" });
  return { 상태: 응답.status, 위치: 응답.headers.get("location"), 글자: (await 응답.text()).replace(/<!-- -->/g, "") };
};
/** 태그를 지우고 공백을 하나로 모은 글 (표의 칸들이 "점검위원 가 25 35 20 80"처럼 이어서 읽힌다) */
const 글만 = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const 구역 = (html: string, 번호: number) => {
  const 시작 = html.indexOf(`aria-label="안건 ${번호} 결과"`);
  if (시작 < 0) return "";
  const 끝 = html.indexOf("</section>", 시작);
  return 글만(html.slice(시작, 끝 < 0 ? undefined : 끝));
};

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

// ── 준비: 위원회(30·40·30, 기준 70점, 최고·최저 제외 켜짐), 위원 7명, 이미 시작한 회의, 안건 4건
const 항목 = [{ name: "적정성", maxScore: 30 }, { name: "효과성", maxScore: 40 }, { name: "시급성", maxScore: 30 }];
const { data: 위원회 } = await db.from("committees").insert({ name: `${점검용} 결과 위원회`, criteria: 항목, pass_score: 70, exclude_extremes: true }).select("id").single();
const 이름들 = ["가", "나", "다", "라", "마", "바", "사"];
const { data: 위원들 } = await db
  .from("members")
  .insert(이름들.map((n, i) => ({ committee_id: 위원회!.id, name: `점검위원 ${n}`, email: `result-${i}@example.com`, phone: `010-0000-05${i}0` })))
  .select("id, name")
  .then((r) => ({ data: r.data?.sort((a, b) => a.name.localeCompare(b.name)) }));
const [가, 나, 다, 라, 마, 바, 사] = 위원들!;
const { data: 회의 } = await db.from("meetings").insert({ committee_id: 위원회!.id, title: `${점검용} 결과 회의`, starts_at: new Date(Date.now() - 3_600_000).toISOString() }).select("id").single();
await db.from("meeting_members").insert(위원들!.map((m) => ({ meeting_id: 회의!.id, member_id: m.id, removed_at: m.id === 사.id ? new Date().toISOString() : null })));
const 안건 = [] as string[];
for (let i = 1; i <= 4; i++) {
  안건.push((await db.from("agendas").insert({ meeting_id: 회의!.id, position: i, title: `점검 안건 ${i}`, pdf_path: `check/rs-${회의!.id}-${i}.pdf`, pdf_size_bytes: 100 }).select("id").single()).data!.id);
}
const 평가 = (agendaIdx: number, m: { id: string }, scores: number[], is_proxy = false) =>
  ({ agenda_id: 안건[agendaIdx], member_id: m.id, scores, total: scores.reduce((a, b) => a + b, 0), is_proxy });
await db.from("recusals").insert([
  { agenda_id: 안건[0], member_id: 바.id }, // 안건 1: 바 제척(기록 없음)
  { agenda_id: 안건[1], member_id: 마.id }, // 안건 2: 마 제척(기록 없음)
  { agenda_id: 안건[1], member_id: 바.id }, // 안건 2: 바 제척(이미 낸 평가 있음 → 집계에서 빠져야 함)
  ...위원들!.map((m) => ({ agenda_id: 안건[2], member_id: m.id })), // 안건 3: 전원 제척
  { agenda_id: 안건[3], member_id: 바.id },
]);
await db.from("evaluations").insert([
  // 안건 1 — DESIGN 손 계산 예시: 합계 98·80·70·45·82, 제외 켜짐, 기준 70 → 98과 45 제외, S=232 n=3 → 가결 77.3
  평가(0, 가, [30, 40, 28]), 평가(0, 나, [25, 35, 20]), 평가(0, 다, [20, 30, 20]), 평가(0, 라, [10, 20, 15]), 평가(0, 마, [28, 30, 24]),
  // 안건 2 — 가 80, 나 98, 다 45, 라 70(대리 입력), 제척된 바의 100점은 빠져야 함 → 293÷4=73.25 → 73.3 가결, 5명 미만이라 제외 안 함
  평가(1, 가, [25, 35, 20]), 평가(1, 나, [30, 40, 28]), 평가(1, 다, [10, 20, 15]), 평가(1, 라, [22, 30, 18], true), 평가(1, 바, [30, 40, 30]),
  // 안건 4 — 60·50·40·30·20, 기준 70 → 60과 20 제외, 평균 40.0 부결. 회의에서 제외된 사의 평가는 빠져야 함
  평가(3, 가, [20, 20, 20]), 평가(3, 나, [20, 20, 10]), 평가(3, 다, [10, 20, 10]), 평가(3, 라, [10, 10, 10]), 평가(3, 마, [5, 10, 5]), 평가(3, 사, [30, 40, 30]),
]);

const 결과_주소 = `/admin/meetings/${회의!.id}/results`;
const 상세 = `/admin/meetings/${회의!.id}`;

// 1) 마감 전 — 담당 팀원도 팀장도 안내만 보이고, 점수·이름·결과가 전혀 나오지 않음
const 마감전_담당 = await 가져오기(결과_주소, 담당_쿠키);
const 마감전_팀장 = await 가져오기(결과_주소, 팀장_쿠키);
for (const [누구, 화면] of [["담당 팀원", 마감전_담당], ["팀장", 마감전_팀장]] as const) {
  const 글 = 글만(화면.글자);
  결과(글.includes("평가 마감 후에 볼 수 있습니다") && !/점검위원|가결|부결|평균|77\.3|73\.3/.test(글), `마감 전 ${누구}: '평가 마감 후에 볼 수 있습니다'만 보이고 위원·점수·결과는 나오지 않음`);
}
결과(!(await 가져오기(상세, 담당_쿠키)).글자.includes("집계 결과 보기"), "마감 전 회의 상세에는 [집계 결과 보기]가 없음");
const 비로그인 = await 가져오기(결과_주소);
결과(비로그인.상태 >= 300 && 비로그인.상태 < 400 && !!비로그인.위치?.includes("/login"), "로그인하지 않으면 결과 주소가 로그인 화면으로 보내짐");

// 위원 링크를 가진 사람도 결과 주소로는 들어올 수 없음 (위원은 로그인 쿠키가 없다)
const 링크 = randomBytes(32).toString("base64url");
await db.from("meeting_members").update({ link_ciphertext: "check-only", link_fingerprint: 지문(링크), link_issued_at: new Date().toISOString() }).eq("meeting_id", 회의!.id).eq("member_id", 가.id);
const 위원접근 = await 가져오기(`${결과_주소}?token=${링크}`);
결과(위원접근.상태 >= 300 && 위원접근.상태 < 400 && !위원접근.글자.includes("점검위원"), "위원 링크 값을 붙여도 결과 주소는 로그인 없이 열리지 않음");

// 2) 마감 — 마감 후에만 열림
await db.from("meetings").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", 회의!.id);
const 담당_결과 = await 가져오기(결과_주소, 담당_쿠키);
const 팀장화면 = await 가져오기(결과_주소, 팀장_쿠키);
결과(담당_결과.상태 === 200 && 글만(담당_결과.글자).includes("집계 결과") && !글만(담당_결과.글자).includes("평가 마감 후에 볼 수 있습니다"), "마감 후 담당 팀원: 결과 화면이 열림");
결과(글만(팀장화면.글자) === 글만(담당_결과.글자) || (팀장화면.글자.includes("점검 안건 1") && 팀장화면.글자.includes("77.3")), "마감 후 팀장: 같은 결과를 볼 수 있음");
결과((await 가져오기(상세, 담당_쿠키)).글자.includes("집계 결과 보기") && (await 가져오기(상세, 팀장_쿠키)).글자.includes("집계 결과 보기"), "마감 후 회의 상세에 [집계 결과 보기] (담당 팀원·팀장 모두)");

// 3) 안건 1 — DESIGN 손 계산 예시
const 안건1 = 구역(담당_결과.글자, 1);
결과(/결과: 가결/.test(안건1) && 안건1.includes("77.3점") && 안건1.includes("제출 5명") && 안건1.includes("평균에 사용 3명"), "안건 1: 98·80·70·45·82, 제외 켜짐 → 최고·최저 제외 후 평균 77.3점, 가결");
결과(안건1.includes("점검위원 가 30 40 28 98 최고점 제외") && 안건1.includes("점검위원 라 10 20 15 45 최저점 제외"), "안건 1: 위원별 항목 점수와 합계, 비고에 '최고점 제외'·'최저점 제외'");
결과(안건1.includes("점검위원 나 25 35 20 80") && !안건1.includes("점검위원 나 25 35 20 80 최"), "안건 1: 제외되지 않은 위원 줄에는 제외 표시가 없음");
결과(안건1.includes("점검위원 바 — — — — 제척"), "안건 1: 제척된 위원은 '—'와 '제척'으로 표시");
결과(안건1.includes("가결 기준 70점") , "안건 1: 가결 기준 점수 표시");

// 4) 안건 2 — 73.25 → 73.3, 대리 입력 표시, 제척된 위원의 점수는 평균에 안 들어감, 5명 미만이라 제외 안 함
const 안건2 = 구역(담당_결과.글자, 2);
결과(/결과: 가결/.test(안건2) && 안건2.includes("73.3점") && 안건2.includes("제출 4명"), "안건 2: 293÷4=73.25를 올려 73.3점, 가결 (제척된 위원의 100점은 평균에 들어가지 않음)");
결과(안건2.includes("점검위원 라 22 30 18 70 대리 입력"), "안건 2: 대리 입력 기록에 '대리 입력' 표시");
결과(안건2.includes("5명 미만이라 최고·최저점 제외 안 함") && !/d 최고점 제외/.test(안건2) && !/d 최저점 제외/.test(안건2), "안건 2: 5명 미만이라 제외 옵션이 켜져 있어도 제외하지 않고 그 이유를 안내");
결과(안건2.includes("점검위원 바 — — — — 제척") && !안건2.includes("30 40 30 100"), "안건 2: 이미 평가를 낸 위원도 제척되면 점수 대신 '제척'만 보임");

// 5) 안건 3 — 전원 제척 → 평가 없음, 가결·부결 없음
const 안건3 = 구역(담당_결과.글자, 3);
결과(/결과: 평가 없음/.test(안건3) && !/결과: (가결|부결)/.test(안건3) && !안건3.includes("평균"), "안건 3: 평가 대상이 없으면 '평가 없음'만 표시 (가결·부결·평균 없음)");

// 6) 안건 4 — 부결, 회의에서 제외된 위원의 평가는 빠짐
const 안건4 = 구역(담당_결과.글자, 4);
결과(/결과: 부결/.test(안건4) && !/결과: 가결/.test(안건4) && 안건4.includes("40.0점") && 안건4.includes("평균에 사용 3명"), "안건 4: 60·50·40·30·20 → 최고·최저 제외 후 평균 40.0점, 부결");
결과(안건4.includes("점검위원 사 — — — — 회의에서 제외"), "안건 4: 회의에서 제외된 위원(평가 기록 있음)은 '회의에서 제외'로 표시되고 평균에서 빠짐");
결과(안건4.includes("제출 5명"), "안건 4: 제출 5명(제외된 위원의 평가는 세지 않음)");

// 7) 없는 회의·잘못된 주소
결과((await 가져오기("/admin/meetings/00000000-0000-0000-0000-000000000000/results", 담당_쿠키)).글자.includes("페이지를 찾을 수 없습니다"), "없는 회의의 결과 주소 → 찾을 수 없음");
결과((await 가져오기("/admin/meetings/not-a-uuid/results", 담당_쿠키)).글자.includes("페이지를 찾을 수 없습니다"), "모양이 틀린 주소 → 찾을 수 없음");

// 8) 마감 후 위원 화면에서는 집계·다른 위원 점수가 보이지 않음 (위원은 자기 점수만)
const 위원화면 = await 가져오기(`/m/${링크}`);
결과(!/77\.3|73\.3|가결|부결|평균/.test(글만(위원화면.글자)) && !위원화면.글자.includes("점검위원 나"), "마감 후에도 위원 화면에는 평균·가결 여부·다른 위원 점수가 나오지 않음");

await 정리();
const { count } = await db.from("committees").select("*", { count: "exact", head: true }).like("name", `${점검용}%`);
결과(count === 0, "점검용 위원회·회의·안건·평가 정리 완료");

console.log(실패 ? "\n집계 결과 점검 실패 — 위 ❌ 항목을 확인하세요." : "\n집계 결과 점검 통과");
process.exit(실패 ? 1 : 0);
