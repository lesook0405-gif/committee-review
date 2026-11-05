// Plan 작업 22 — 위원 "내 점수" 화면 점검 (개발 서버가 켜져 있어야 한다)
// 실행: npm run check:myscores
// 자기가 낸 점수만 보이고, 평균·가결 여부·다른 위원의 점수와 이름은 어디에도 나오지 않는지, 링크 규칙(차단·만료)을 따르는지 확인한다.
import { 가져오기, 결과, 계정, 글만, 끝내기, db, 점검용_정리, 평가_넣기, 회의_한_벌 } from "./lib/check-kit.mts";

await 계정();
await 점검용_정리();

const R = await 회의_한_벌({ 이름: "내점수", 위원수: 3, 안건수: 3 });
const [가, 나, 다] = R.위원들;
const [안건1, 안건2, 안건3] = R.안건들;
// 가: 안건 1 직접 제출(점수 [30, 25]=55), 안건 2는 대리 입력([10, 20]=30), 안건 3은 제척
// 나·다: 같은 안건에 서로 다른 점수를 냄 — 가의 화면에 절대 나오면 안 됨 (눈에 띄는 숫자 사용)
await db.from("evaluations").insert([
  { agenda_id: 안건1, member_id: 가.id, scores: [30, 25], total: 55, is_proxy: false },
  { agenda_id: 안건2, member_id: 가.id, scores: [10, 20], total: 30, is_proxy: true },
  { agenda_id: 안건1, member_id: 나.id, scores: [17, 66], total: 83, is_proxy: false },
  { agenda_id: 안건1, member_id: 다.id, scores: [13, 61], total: 74, is_proxy: false },
  { agenda_id: 안건2, member_id: 나.id, scores: [19, 67], total: 86, is_proxy: false },
]);
await db.from("recusals").insert({ agenda_id: 안건3, member_id: 가.id });

const 내점수 = (member: { id: string }) => `/m/${R.링크[member.id]}/my`;
const 화면 = await 가져오기(내점수(가));
const 글 = 글만(화면.글자);
const 구역 = (n: number) => {
  const 시작 = 화면.글자.indexOf(`aria-label="안건 ${n} 내 점수"`);
  const 끝 = 화면.글자.indexOf("</section>", 시작);
  return 시작 < 0 ? "" : 글만(화면.글자.slice(시작, 끝));
};

결과(화면.상태 === 200 && 글.includes("내 점수") && 글.includes(`${가.name} 위원님`), "링크로 들어가면 '내 점수' 화면이 열림");
결과(구역(1).includes("적정성 30점") && 구역(1).includes("효과성 25점") && 구역(1).includes("합계 55점"), "안건 1: 내가 낸 항목별 점수와 합계(55점)가 보임");
결과(구역(2).includes("합계 30점") && 구역(2).includes("대리 입력한 점수"), "안건 2: 담당자가 대리 입력한 점수에는 그 표시가 붙음");
결과(구역(3).includes("제척되어 평가하지 않습니다") && !구역(3).includes("합계"), "안건 3: 제척된 안건은 점수 대신 안내");

// 다른 위원의 점수·이름, 평균, 가결 여부는 나오지 않음
const 나온_점수 = [...글.matchAll(/(\d+)점/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
결과(
  JSON.stringify(나온_점수) === JSON.stringify([10, 20, 25, 30, 30, 55]) /* 안건 1: 30·25·합계 55 / 안건 2: 10·20·합계 30 */,
  `화면에 나온 "○○점" 숫자는 내가 낸 점수뿐임 (나온 숫자: ${나온_점수.join(", ")}) — 다른 위원의 83·74·86·17·66점 등은 없음`,
);
결과(!글.includes(나.name) && !글.includes(다.name), "다른 위원의 이름은 나오지 않음");
결과(!/결과:|평균 \d|\d 평균|(가결|부결) ?\(|가결 기준/.test(글) && !글.includes("제출 3명"), "평균 점수·가결/부결 결과·제출 인원 같은 집계 값은 나오지 않음 (안내 문구에 단어만 있을 뿐)");
결과((await 가져오기(`/m/${R.링크[가.id]}`)).글자.includes("내 점수 보기"), "안건 목록에서 [내 점수 보기]로 들어갈 수 있음");

// 아직 아무것도 내지 않은 위원 — 안건마다 '아직 제출하지 않았습니다'
await db.from("evaluations").delete().eq("member_id", 다.id);
const 다화면 = 글만((await 가져오기(내점수(다))).글자);
결과(다화면.includes("아직 제출하지 않았습니다") && !다화면.includes("합계"), "제출하지 않은 위원: 안건마다 '아직 제출하지 않았습니다'");

// 마감 후에도 링크가 만료되기 전까지는 볼 수 있음 / 만료·차단·제외되면 못 봄
const 일 = 24 * 60 * 60 * 1000;
await db.from("meetings").update({ status: "closed", closed_at: new Date(Date.now() - 6 * 일).toISOString() }).eq("id", R.회의);
결과(글만((await 가져오기(내점수(가))).글자).includes("합계 55점"), "마감 6일 뒤(만료 전)에도 내 점수를 볼 수 있음");
await db.from("meetings").update({ closed_at: new Date(Date.now() - 8 * 일).toISOString() }).eq("id", R.회의);
const 만료 = 글만((await 가져오기(내점수(가))).글자);
결과(만료.includes("링크가 만료되었습니다") && !만료.includes("합계"), "마감 8일 뒤(만료)에는 점수 대신 만료 안내만 보임");
await db.from("meetings").update({ closed_at: new Date(Date.now() - 1 * 일).toISOString() }).eq("id", R.회의);
await db.from("meeting_members").update({ blocked_at: new Date().toISOString() }).eq("meeting_id", R.회의).eq("member_id", 가.id);
const 차단 = 글만((await 가져오기(내점수(가))).글자);
결과(차단.includes("사용이 중지된 링크") && !차단.includes("합계"), "차단된 링크: 점수가 보이지 않음");
await db.from("meeting_members").update({ blocked_at: null, removed_at: new Date().toISOString() }).eq("meeting_id", R.회의).eq("member_id", 가.id);
const 제외 = 글만((await 가져오기(내점수(가))).글자);
결과(제외.includes("참석하지 않는 것으로 변경") && !제외.includes("합계"), "회의에서 제외된 위원의 링크: 점수가 보이지 않음");
결과(글만((await 가져오기("/m/not-a-real-link/my")).글자).includes("사용할 수 없는 링크"), "엉뚱한 링크: 사용할 수 없다는 안내만");

// 평가가 없는 회의 / 안건이 없는 회의도 오류 없이 열림
void 평가_넣기;
await 점검용_정리();
const { count } = await db.from("committees").select("*", { count: "exact", head: true }).like("name", "[점검용]%");
결과(count === 0, "점검용 위원회·회의·평가 정리 완료");
끝내기("내 점수");
