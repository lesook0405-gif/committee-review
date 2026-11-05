// Plan 작업 23 — 샘플 위원회로 처음부터 끝까지 (성공 기준 S1~S7) 종단 점검 (개발 서버가 켜져 있어야 한다)
// 실행: npm run check:e2e
// 화면이 보내는 요청과 똑같이 순서대로 진행한다:
//   위원회 등록 → 위원 5명 입력 → 회의 등록 → 안건 PDF 2건 올리기 → 위원 링크 복사 → 위원 열람 → 평가 제출·제척·대리 입력 → 마감 → 결과 확인
// 손 계산 값(DESIGN §5.3)과 화면의 집계 값을 비교하고, 걸린 시간을 잰다. "[점검용]" 데이터만 쓰고 마지막에 지운다.
// 한계: 이 스크립트는 사람이 화면을 누르는 시간이 아니라 요청이 오가는 시간만 잰다(S5·S7의 "사람 시간"은 별도로 직접 재야 한다).
import {
  db, 결과, 끝내기, 계정, 가져오기, 글만, 숨은_칸, 양식_보내기, 서버처리_준비, 서버처리_부르기, 잠깐, 점검용, 점검용_정리, 로그인으로_보냄,
} from "./lib/check-kit.mts";

const { 담당_쿠키, 팀장_쿠키 } = await 계정();
await 점검용_정리();

const 샘플_PDF = (글: string) =>
  new TextEncoder().encode(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n% ${글}\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
const 꺼내기 = (글자: string) => ({ path: /"path":"(meetings\/[^"]+)"/.exec(글자)?.[1], uploadUrl: /"uploadUrl":"([^"]+)"/.exec(글자)?.[1] });
const 초 = (ms: number) => (ms / 1000).toFixed(1);

// 서버 처리 ID를 얻으려면 관련 화면이 한 번씩 열려 있어야 한다 — 임시 회의로 한 번 열어 둔다
const 임시 = await db.from("meetings").select("id").limit(1).maybeSingle();
const 준비경로 = `/admin/meetings/${임시.data?.id ?? "00000000-0000-0000-0000-000000000000"}`;
const 처리 = await 서버처리_준비(담당_쿠키, 준비경로);

// ═════════════════ S1 — 등록부터 링크 준비까지 (S5 시간 측정 시작) ═════════════════
console.log("── S1·S5: 위원회 등록 → 위원 입력 → 회의 등록 → 안건 올리기 → 링크 복사 ──");
const T0 = Date.now();

// ① 위원회 등록 (항목 3개 30·40·30, 가결 기준 70점, 최고·최저점 제외 켜짐)
const 새칸 = await 숨은_칸("/admin/committees/new", 담당_쿠키, 'name="criteriaName"');
await 양식_보내기("/admin/committees/new", 담당_쿠키, [
  ...새칸, ["name", `${점검용} 종단 위원회`],
  ["criteriaName", "적정성"], ["criteriaMax", "30"], ["criteriaName", "효과성"], ["criteriaMax", "40"], ["criteriaName", "시급성"], ["criteriaMax", "30"],
  ["passScore", "70"], ["excludeExtremes", "on"],
]);
const 위원회 = (await db.from("committees").select("id, criteria, pass_score, exclude_extremes").eq("name", `${점검용} 종단 위원회`).maybeSingle()).data;
결과(!!위원회 && 위원회.pass_score === 70 && 위원회.exclude_extremes === true && (위원회.criteria as unknown[]).length === 3, "① 위원회 등록: 항목 3개(30·40·30), 가결 기준 70점, 최고·최저점 제외 켜짐");
if (!위원회) 끝내기("종단");

// ② 위원 5명 입력 (가상 위원)
const 이름들 = ["가", "나", "다", "라", "마"];
const 위원탭 = `/admin/committees/${위원회.id}?tab=members`;
const 위원칸 = await 숨은_칸(위원탭, 담당_쿠키, 'name="email"');
for (const [i, n] of 이름들.entries()) {
  await 양식_보내기(위원탭, 담당_쿠키, [...위원칸, ["name", `점검위원 ${n}`], ["email", `e2e-${i}@example.com`], ["phone", `010-1234-500${i}`]]);
}
const 위원들 = ((await db.from("members").select("id, name, phone").eq("committee_id", 위원회.id)).data ?? []).sort((a, b) => a.name.localeCompare(b.name, "ko"));
결과(위원들.length === 5, "② 위원 5명 입력");
const 위원탭_화면 = await 가져오기(위원탭, 담당_쿠키);
결과(위원탭_화면.글자.includes("010-****-5000") && !위원탭_화면.글자.includes("010-1234-5000"), "   휴대폰 번호는 화면에서 가운데가 가려짐 (010-****-5000)");
const [가, 나, 다, 라, 마] = 위원들;

// ③ 회의 등록 (위원 5명 모두 참석, 일시는 한국 시간 — 처음엔 미래)
const 회의탭 = `/admin/committees/${위원회.id}?tab=meetings`;
const 회의칸 = await 숨은_칸(회의탭, 담당_쿠키, 'name="startsAt"');
await 양식_보내기(회의탭, 담당_쿠키, [...회의칸, ["title", `${점검용} 제1차 종단 회의`], ["startsAt", "2099-01-02T14:00"], ...위원들.map((m): [string, string] => ["memberIds", m.id])]);
const 회의 = (await db.from("meetings").select("id, starts_at, status").eq("title", `${점검용} 제1차 종단 회의`).maybeSingle()).data;
결과(!!회의 && new Date(회의.starts_at).toISOString() === "2099-01-02T05:00:00.000Z", "③ 회의 등록: 한국 시간 14:00이 UTC 05:00으로 저장");
if (!회의) 끝내기("종단");
const 상세 = `/admin/meetings/${회의.id}`;
await 가져오기(상세, 담당_쿠키); // 회의 상세 화면의 서버 처리(링크 복사·제척·마감 등)가 목록에 올라오게 한다
const { data: 참석들 } = await db.from("meeting_members").select("member_id, link_fingerprint").eq("meeting_id", 회의.id);
결과((참석들 ?? []).length === 5 && new Set((참석들 ?? []).map((p) => p.link_fingerprint)).size === 5, "   참석 위원 5명에게 서로 다른 링크가 바로 발급됨");

// ④ 안건 PDF 2건 올리기 (서버가 주소 발급 → 브라우저가 직접 업로드 → 서버가 확인·등록)
for (const [i, 제목] of ["가상기업 A 투자 심사", "가상기업 B 투자 심사"].entries()) {
  const 발급 = 꺼내기((await 서버처리_부르기(처리("prepareAgendaUploadAction", "agenda-actions.ts"), 담당_쿠키, 상세, [회의.id, { title: 제목, fileName: `a${i}.pdf`, size: 200 }])).글자);
  const 올림 = await fetch(발급.uploadUrl ?? "", { method: "PUT", body: new Blob([샘플_PDF(`e2e ${i}`)], { type: "application/pdf" }), headers: { "content-type": "application/pdf", "x-upsert": "false" } });
  await 서버처리_부르기(처리("confirmAgendaUploadAction", "agenda-actions.ts"), 담당_쿠키, 상세, [회의.id, { path: 발급.path, title: 제목 }]);
  void 올림;
}
const 안건들 = ((await db.from("agendas").select("id, position, pdf_path").eq("meeting_id", 회의.id).order("position")).data ?? []);
결과(안건들.length === 2, "④ 안건 PDF 2건 업로드·등록 (비공개 보관함)");
const [안건1, 안건2] = 안건들;

// ⑤ 위원별 링크 복사 (담당 팀원 화면의 [링크 복사])
const 링크: Record<string, string> = {};
for (const m of 위원들) {
  const 응답 = await 서버처리_부르기(처리("revealLinkAction", "link-actions.ts"), 담당_쿠키, 상세, [회의.id, m.id]);
  const t = /"path":"\/m\/([A-Za-z0-9_-]{43})"/.exec(응답.글자)?.[1];
  if (t) 링크[m.id] = t;
}
const T1 = Date.now();
결과(Object.keys(링크).length === 5, "⑤ 위원 5명의 링크를 모두 복사할 수 있음");
결과(T1 - T0 < 30 * 60 * 1000, `S5 등록부터 링크 준비까지 요청 시간 ${초(T1 - T0)}초 (기준 30분 — 사람이 직접 입력하는 시간은 별도로 재야 함)`);

// ═════════════════ S3 — 열람 현황 (회의 전 3명, 회의 후 1명, 안 연 1명) ═════════════════
console.log("\n── S3: 열람 현황 ──");
const 열람_기록 = async (m: { id: string }, agendaId: string) => {
  await 가져오기(`/m/${링크[m.id]}/a/${agendaId}`); // 화면을 연다(PDF 임시 주소 발급)
  await 서버처리_부르기(처리("recordViewAction", "m/[token]/actions.ts"), "", `/m/${링크[m.id]}/a/${agendaId}`, [링크[m.id], agendaId]); // 브라우저가 화면을 그린 뒤 보내는 기록
};
await 가져오기(`/m/${링크[가.id]}/a/${안건1.id}`); // 위원 안건 화면을 열어, 서버 처리 목록에 위원 쪽 처리가 올라오게 한다
// (회의 시작 전) 가·나·다가 안건 1을, 가가 안건 2를 연다
for (const m of [가, 나, 다]) await 열람_기록(m, 안건1.id);
await 열람_기록(가, 안건2.id);
// 회의 시작 — 시간이 흘러 회의 일시가 지나는 것을 흉내 낸다: 시작 시각을 "방금 한 열람 바로 뒤"로 잡고 그 시각이 지날 때까지 기다린다
// (시작 시각을 과거로 당기면 이미 한 열람까지 "회의 시작 후"가 되어 버려 실제와 달라진다)
const 시작시각 = new Date(Date.now() + 1500);
await db.from("meetings").update({ starts_at: 시작시각.toISOString() }).eq("id", 회의.id);
await 잠깐(Math.max(0, 시작시각.getTime() - Date.now()) + 500);
await 열람_기록(라, 안건1.id); // 회의 시작 후에 연 위원
const 현황 = await 가져오기(상세, 담당_쿠키);
결과(현황.글자.includes('aria-label="열람 5명 중 4명"') && 현황.글자.includes('aria-label="회의 전 열람 5명 중 3명"'), "S3 안건 1: 열람 4 / 5, 회의 전 열람 3 / 5 (마가 안 열었고, 라는 회의 시작 후에 열었으므로)");
결과(현황.글자.includes('aria-label="열람 5명 중 1명"') && 현황.글자.includes('aria-label="회의 전 열람 5명 중 1명"'), "S3 안건 2: 열람 1 / 5, 회의 전 열람 1 / 5");
결과((await 가져오기(상세, 팀장_쿠키)).글자.includes('aria-label="열람 5명 중 4명"'), "S3 팀장 화면에도 같은 열람 현황이 보임");

// ═════════════════ S1·S2 — 평가 제출, 제척, 대리 입력 ═════════════════
console.log("\n── S1·S2: 평가 제출·제척·대리 입력 ──");
// 안건 2에서 마를 제척하고(마는 안건 2를 평가하지 않음), 라의 안건 2는 담당 팀원이 대리 입력한다
await 서버처리_부르기(처리("setRecusalAction", "recusal-actions.ts"), 담당_쿠키, 상세, [회의.id, 안건2.id, 마.id, true]);

const 평가경로 = (m: { id: string }, a: { id: string }) => `/m/${링크[m.id]}/a/${a.id}/evaluate`;
const 위원_제출 = async (m: { id: string }, a: { id: string }, 점수: [number, number, number]) => {
  const 칸 = await 숨은_칸(평가경로(m, a), "", 'name="score-0"');
  await 양식_보내기(평가경로(m, a), "", [...칸, ...점수.map((v, i): [string, string] => [`score-${i}`, String(v)])]);
};
const 마감_시도 = async () => 글만((await 서버처리_부르기(처리("closeMeetingAction", "close-actions.ts"), 담당_쿠키, 상세, [회의.id, { errors: [] }])).글자);

// 안건 1 — DESIGN 손 계산 예시: 합계 98·80·70·45·82 (가·나·다·라·마)
const 안건1_점수: [typeof 가, [number, number, number]][] = [[가, [30, 40, 28]], [나, [25, 35, 20]], [다, [20, 30, 20]], [라, [10, 20, 15]], [마, [28, 30, 24]]];
// 안건 2 — 가 80, 나 98, 다 45, (라 70은 대리 입력), 마는 제척
const 안건2_점수: [typeof 가, [number, number, number]][] = [[가, [25, 35, 20]], [나, [30, 40, 28]], [다, [10, 20, 15]]];

결과((await 마감_시도()).includes("마감할 수 없습니다") && (await db.from("meetings").select("status").eq("id", 회의.id).single()).data!.status === "open", "S1 아무도 제출하지 않았을 때는 마감할 수 없음");
for (const [m, s] of 안건1_점수) await 위원_제출(m, 안건1, s);
for (const [m, s] of 안건2_점수) await 위원_제출(m, 안건2, s);
const 제출된 = (await db.from("evaluations").select("*", { count: "exact", head: true }).in("agenda_id", [안건1.id, 안건2.id])).count;
결과(제출된 === 8, "S1 위원 5명(안건 1)과 3명(안건 2)이 자기 링크로 점수 제출 (8건 저장)");
const 중간 = await 가져오기(상세, 담당_쿠키);
결과(중간.글자.includes("미제출 1명") && 중간.글자.includes("점검위원 라") && 중간.글자.includes('aria-label="제출 4명 중 3명"'), "S1 라의 안건 2만 남아 '미제출 1명(라)', 안건 2는 '제출 3 / 4'(제척된 마는 분모에서 빠짐)");
결과((await 마감_시도()).includes("제출하지 않은 평가 대상 위원이 1명"), "S1 미제출 1명이면 마감 거부");

// 대리 입력 (라의 안건 2, 합계 70)
const 대리경로 = `${상세}/proxy/${안건2.id}/${라.id}`;
const 대리칸 = await 숨은_칸(대리경로, 담당_쿠키, 'name="score-0"');
await 양식_보내기(대리경로, 담당_쿠키, [...대리칸, ["score-0", "22"], ["score-1", "30"], ["score-2", "18"]]);
const 라2 = (await db.from("evaluations").select("total, is_proxy").eq("agenda_id", 안건2.id).eq("member_id", 라.id).maybeSingle()).data;
결과(라2?.total === 70 && 라2.is_proxy === true, "S1 담당 팀원 대리 입력: 라의 안건 2 점수 합계 70, '대리 입력' 표시");
결과(!!(await db.from("committees").select("locked_at").eq("id", 위원회.id).single()).data!.locked_at, "S1 첫 평가가 들어오자 위원회의 평가 방식이 잠김");

// ═════════════════ S7 — 마감 직후 결과 (시간 측정) ═════════════════
console.log("\n── S1·S2·S7: 마감 → 결과 ──");
결과((await 가져오기(`${상세}/results`, 담당_쿠키)).글자.includes("평가 마감 후에 볼 수 있습니다"), "S1 마감 전에는 결과 화면이 안내만 보임");
const T2 = Date.now();
const 마감응답 = await 마감_시도();
const 결과화면 = await 가져오기(`${상세}/results`, 담당_쿠키);
const T3 = Date.now();
const 닫힘 = (await db.from("meetings").select("status, closed_at").eq("id", 회의.id).single()).data!;
결과(닫힘.status === "closed" && !!닫힘.closed_at && !마감응답.includes("마감할 수 없습니다"), "S1 전원 제출 후 담당 팀원이 마감함 (마감 시각 기록)");
const 구역 = (n: number) => {
  const 시작 = 결과화면.글자.indexOf(`aria-label="안건 ${n} 결과"`);
  const 끝 = 결과화면.글자.indexOf("</section>", 시작);
  return 시작 < 0 ? "" : 글만(결과화면.글자.slice(시작, 끝));
};
결과(/결과: 가결/.test(구역(1)) && 구역(1).includes("77.3점") && 구역(1).includes("최고점 제외") && 구역(1).includes("최저점 제외"), "S2 안건 1: 98·80·70·45·82 → 최고·최저 제외, 평균 77.3점, 가결 (손 계산과 같음)");
결과(/결과: 가결/.test(구역(2)) && 구역(2).includes("73.3점") && 구역(2).includes("대리 입력") && 구역(2).includes("점검위원 마 — — — — 제척"), "S2 안건 2: 80·98·45·70(대리 입력)·마 제척 → 293÷4=73.25를 올려 73.3점, 가결");
결과(구역(2).includes("5명 미만이라 최고·최저점 제외 안 함"), "S2 안건 2: 제출 4명이라 제외 옵션이 켜져 있어도 제외하지 않고 이유를 안내");
결과(T3 - T2 < 60_000, `S7 마감 직후 결과 화면에 집계와 가결 여부가 나옴 (마감 → 결과 확인 ${초(T3 - T2)}초, 기준 1분)`);

// ═════════════════ S4 — 접근 제한 ═════════════════
console.log("\n── S4: 접근 제한 ──");
const 위원_결과 = await 가져오기(`${상세}/results`);
결과(로그인으로_보냄(위원_결과), "S4 위원(로그인 없음)은 결과 주소를 열 수 없음");
const 위원_내점수 = 글만((await 가져오기(`/m/${링크[가.id]}/my`)).글자);
결과(위원_내점수.includes("합계 98점") && !위원_내점수.includes("점검위원 나") && !위원_내점수.includes("77.3") && !위원_내점수.includes("73.3"), "S4 위원은 자기 점수(98점)만 보고, 다른 위원·평균·가결 여부는 볼 수 없음");
const 팀장_결과 = await 가져오기(`${상세}/results`, 팀장_쿠키);
결과(팀장_결과.글자.includes("77.3점"), "S4 팀장은 결과를 볼 수 있음");
const 팀장_링크 = await 서버처리_부르기(처리("revealLinkAction", "link-actions.ts"), 팀장_쿠키, 상세, [회의.id, 가.id]);
결과(!/"path":"\/m\//.test(팀장_링크.글자), "S4 팀장은 위원 링크를 조회할 수 없음 (서버가 거부)");
const 팀장_상세 = await 가져오기(상세, 팀장_쿠키);
결과(!팀장_상세.글자.includes("링크 복사") && !/\/m\/[A-Za-z0-9_-]{43}/.test(팀장_상세.글자), "S4 팀장 화면에는 링크 버튼도 링크값도 없음");
const 마감후_제출 = await 서버처리_부르기(처리("closeMeetingAction", "close-actions.ts"), 담당_쿠키, 상세, [회의.id, { errors: [] }]);
결과(마감후_제출.글자.includes("이미 마감된 회의"), "마감 후 다시 마감하려 해도 거부");

await 점검용_정리();
const { count } = await db.from("committees").select("*", { count: "exact", head: true }).like("name", `${점검용}%`);
결과(count === 0, "점검용 위원회·회의·안건·평가·보관함 파일 정리 완료");
끝내기("종단(S1~S5·S7)");
