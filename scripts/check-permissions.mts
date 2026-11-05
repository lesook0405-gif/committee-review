// Plan 작업 22 — 권한 점검: 위원·팀장·로그인하지 않은 사람에게 막혀야 하는 기능을 모두 시도해 본다 (개발 서버가 켜져 있어야 한다)
// 실행: npm run check:permissions
//
// 1부  담당 팀원 전용 서버 처리 19가지를 "팀장 / 팀장 계정에 담당 팀원 권한을 위조한 쿠키 / 로그인 안 함 / 서명이 깨진 쿠키"로 시도한다.
//      같은 요청을 담당 팀원이 보내면 실제로 바뀌는지(대조군)도 확인해서, "막혀서 안 바뀐 것"과 "요청이 잘못돼서 안 바뀐 것"을 구분한다.
// 2부  DESIGN 9.2 "서버 처리 시험" 20개 항목을 번호대로 실행한다.
// "[점검용]" 데이터만 만들고 마지막에 지운다. 링크값·비밀 값은 출력하지 않는다.
import {
  db, APP_URL, 결과, 끝내기, 쿠키, 망가진_쿠키, 가져오기, 글만, 로그인으로_보냄, 숨은_칸, 양식_보내기, 서버처리_준비, 서버처리_부르기,
  새_링크, 지문, 잠깐, 점검용, 점검용_정리, 계정, 회의_한_벌, 평가_넣기, 항목,
} from "./lib/check-kit.mts";

const { 담당, 팀장, 담당_쿠키, 팀장_쿠키 } = await 계정();
await 점검용_정리();

const 일 = 24 * 60 * 60 * 1000;
const 샘플_PDF = (글: string) =>
  new TextEncoder().encode(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n% ${글}\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
const 올리기 = (주소: string, 내용: Uint8Array<ArrayBuffer>, 형식 = "application/pdf") =>
  fetch(주소, { method: "PUT", body: new Blob([내용], { type: 형식 }), headers: { "content-type": 형식, "x-upsert": "false" } });
const 꺼내기 = (글자: string) => ({ path: /"path":"(meetings\/[^"]+)"/.exec(글자)?.[1], uploadUrl: /"uploadUrl":"([^"]+)"/.exec(글자)?.[1] });

// ── 서버 처리 ID를 찾기 위해 필요한 화면들을 한 번씩 열어 둔다
const 시험용 = await 회의_한_벌({ 이름: "준비" });
for (const 경로 of [`${시험용.상세}/proxy`, `${시험용.상세}/proxy/${시험용.안건들[0]}/${시험용.위원들[0].id}`, `/m/${시험용.링크[시험용.위원들[0].id]}/a/${시험용.안건들[0]}/evaluate`]) await 가져오기(경로, 담당_쿠키);
const 처리 = await 서버처리_준비(담당_쿠키, 시험용.상세);
const ID = {
  일시: 처리("updateStartsAtAction", "meetings/actions.ts"),
  추가: 처리("addParticipantAction", "meetings/actions.ts"),
  제외: 처리("removeParticipantAction", "meetings/actions.ts"),
  복사: 처리("revealLinkAction", "link-actions.ts"),
  재발급: 처리("reissueLinkAction", "link-actions.ts"),
  차단: 처리("blockLinkAction", "link-actions.ts"),
  업로드주소: 처리("prepareAgendaUploadAction", "agenda-actions.ts"),
  업로드확인: 처리("confirmAgendaUploadAction", "agenda-actions.ts"),
  교체주소: 처리("prepareAgendaReplaceAction", "agenda-actions.ts"),
  교체확인: 처리("confirmAgendaReplaceAction", "agenda-actions.ts"),
  제척: 처리("setRecusalAction", "recusal-actions.ts"),
  마감: 처리("closeMeetingAction", "close-actions.ts"),
};
const 부르기 = (이름: keyof typeof ID, 쿠키값: string, 경로: string, args: unknown[]) => 서버처리_부르기(ID[이름], 쿠키값, 경로, args);

// ─────────────────────────────────────────────
// 점검용 데이터 전체의 상태를 글 하나로 만든다 (막힌 시도 뒤에 이 글이 그대로여야 한다)
// ─────────────────────────────────────────────
async function 스냅샷(): Promise<string> {
  const { data: 위원회들 } = await db.from("committees").select("*").like("name", `${점검용}%`).order("id");
  const 위원회_ids = (위원회들 ?? []).map((c) => c.id);
  if (위원회_ids.length === 0) return "[]";
  const { data: 위원들 } = await db.from("members").select("*").in("committee_id", 위원회_ids).order("id");
  const { data: 회의들 } = await db.from("meetings").select("*").in("committee_id", 위원회_ids).order("id");
  const 회의_ids = (회의들 ?? []).map((m) => m.id);
  const { data: 참석 } = await db.from("meeting_members").select("*").in("meeting_id", 회의_ids).order("id");
  const { data: 안건들 } = await db.from("agendas").select("*").in("meeting_id", 회의_ids).order("id");
  const 안건_ids = (안건들 ?? []).map((a) => a.id);
  const { data: 제척 } = await db.from("recusals").select("*").in("agenda_id", 안건_ids).order("agenda_id").order("member_id");
  const { data: 평가 } = await db.from("evaluations").select("*").in("agenda_id", 안건_ids).order("id");
  const { data: 열람 } = await db.from("agenda_views").select("*").in("agenda_id", 안건_ids).order("agenda_id").order("member_id");
  return JSON.stringify([위원회들, 위원들, 회의들, 참석, 안건들, 제척, 평가, 열람]);
}

// ═════════════════════════════════════════════
// 1부 — 담당 팀원 전용 서버 처리를 담당 팀원이 아닌 사람이 시도
// ═════════════════════════════════════════════
type 호출자 = { 이름: string; 쿠키: string };
const 호출자들: 호출자[] = [
  { 이름: "팀장", 쿠키: 팀장_쿠키 },
  { 이름: "팀장 계정에 담당 팀원 권한을 위조한 쿠키", 쿠키: 쿠키(팀장, "staff") },
  { 이름: "로그인하지 않은 사람", 쿠키: "" },
  { 이름: "서명이 깨진 쿠키", 쿠키: 망가진_쿠키(담당) },
];

type 시도 = {
  이름: string;
  준비: () => Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
  호출: (쿠키값: string, c: Record<string, any>) => Promise<{ 글자: string }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** 응답만으로 "성공했다"고 볼 수 있는 경우 (링크 복사·주소 발급처럼 데이터베이스가 바뀌지 않는 처리) */
  성공응답?: (글자: string) => boolean;
};

const 시도들: 시도[] = [];
const 등록 = (s: 시도) => 시도들.push(s);

// 회의 일시 수정 (양식)
등록({
  이름: "회의 일시 수정",
  준비: async () => {
    const R = await 회의_한_벌({ 이름: "일시", 시작: new Date(Date.now() + 1 * 일) });
    return { R, 칸: await 숨은_칸(R.상세, 담당_쿠키, "일시 저장") };
  },
  호출: (k, c) => 양식_보내기(c.R.상세, k, [...c.칸, ["startsAt", "2099-02-02T10:00"]]),
});
등록({
  이름: "회의 참석 위원 추가",
  준비: async () => ({ R: await 회의_한_벌({ 이름: "추가", 참석: 2 }) }),
  호출: (k, c) => 부르기("추가", k, c.R.상세, [c.R.회의, c.R.위원들[3].id, { errors: [] }]),
});
등록({
  이름: "회의 참석 위원 제외",
  준비: async () => ({ R: await 회의_한_벌({ 이름: "제외" }) }),
  호출: (k, c) => 부르기("제외", k, c.R.상세, [c.R.회의, c.R.위원들[0].id, { errors: [] }]),
});
등록({
  이름: "위원 링크 복사(링크값 조회)",
  준비: async () => ({ R: await 회의_한_벌({ 이름: "복사" }) }),
  호출: (k, c) => 부르기("복사", k, c.R.상세, [c.R.회의, c.R.위원들[0].id]),
  성공응답: (글자) => /"path":"\/m\/[A-Za-z0-9_-]{43}"/.test(글자),
});
등록({
  이름: "위원 링크 재발급",
  준비: async () => ({ R: await 회의_한_벌({ 이름: "재발급" }) }),
  호출: (k, c) => 부르기("재발급", k, c.R.상세, [c.R.회의, c.R.위원들[0].id, { errors: [] }]),
});
등록({
  이름: "위원 링크 차단",
  준비: async () => ({ R: await 회의_한_벌({ 이름: "차단" }) }),
  호출: (k, c) => 부르기("차단", k, c.R.상세, [c.R.회의, c.R.위원들[0].id, { errors: [] }]),
});
등록({
  이름: "안건 업로드 주소 발급",
  준비: async () => ({ R: await 회의_한_벌({ 이름: "업로드주소" }) }),
  호출: (k, c) => 부르기("업로드주소", k, c.R.상세, [c.R.회의, { title: "새 안건", fileName: "a.pdf", size: 100 }]),
  성공응답: (글자) => !!꺼내기(글자).uploadUrl,
});
등록({
  이름: "안건 업로드 확인·등록",
  준비: async () => {
    const R = await 회의_한_벌({ 이름: "업로드확인" });
    const 발급 = 꺼내기((await 부르기("업로드주소", 담당_쿠키, R.상세, [R.회의, { title: "새 안건", fileName: "a.pdf", size: 100 }])).글자);
    await 올리기(발급.uploadUrl!, 샘플_PDF("perm upload"));
    return { R, path: 발급.path };
  },
  호출: (k, c) => 부르기("업로드확인", k, c.R.상세, [c.R.회의, { path: c.path, title: "새 안건" }]),
});
등록({
  이름: "안건 PDF 교체 주소 발급",
  준비: async () => ({ R: await 회의_한_벌({ 이름: "교체주소" }) }),
  호출: (k, c) => 부르기("교체주소", k, c.R.상세, [c.R.회의, c.R.안건들[0], { fileName: "n.pdf", size: 100 }]),
  성공응답: (글자) => !!꺼내기(글자).uploadUrl,
});
등록({
  이름: "안건 PDF 교체 확인",
  준비: async () => {
    const R = await 회의_한_벌({ 이름: "교체확인" });
    const 발급 = 꺼내기((await 부르기("교체주소", 담당_쿠키, R.상세, [R.회의, R.안건들[0], { fileName: "n.pdf", size: 100 }])).글자);
    await 올리기(발급.uploadUrl!, 샘플_PDF("perm replace"));
    return { R, path: 발급.path };
  },
  호출: (k, c) => 부르기("교체확인", k, c.R.상세, [c.R.회의, c.R.안건들[0], { path: c.path }]),
});
등록({
  이름: "안건별 제척",
  준비: async () => ({ R: await 회의_한_벌({ 이름: "제척" }) }),
  호출: (k, c) => 부르기("제척", k, c.R.상세, [c.R.회의, c.R.안건들[0], c.R.위원들[0].id, true]),
});
등록({
  이름: "안건별 제척 해제",
  준비: async () => {
    const R = await 회의_한_벌({ 이름: "제척해제" });
    await db.from("recusals").insert({ agenda_id: R.안건들[0], member_id: R.위원들[0].id });
    return { R };
  },
  호출: (k, c) => 부르기("제척", k, c.R.상세, [c.R.회의, c.R.안건들[0], c.R.위원들[0].id, false]),
});
등록({
  이름: "평가 대리 입력(양식)",
  준비: async () => {
    const R = await 회의_한_벌({ 이름: "대리" });
    return { R, 칸: await 숨은_칸(`${R.상세}/proxy/${R.안건들[0]}/${R.위원들[0].id}`, 담당_쿠키, 'name="score-0"') };
  },
  호출: (k, c) => 양식_보내기(`${c.R.상세}/proxy/${c.R.안건들[0]}/${c.R.위원들[0].id}`, k, [...c.칸, ["score-0", "20"], ["score-1", "30"]]),
});
등록({
  이름: "평가 마감",
  준비: async () => {
    const R = await 회의_한_벌({ 이름: "마감", 위원수: 2, 안건수: 1 });
    for (const m of R.위원들) await 평가_넣기(R.안건들[0], m.id);
    return { R };
  },
  호출: (k, c) => 부르기("마감", k, c.R.상세, [c.R.회의, { errors: [] }]),
});
// 위원회·위원·회의 등록과 평가 방식 수정은 양식으로 보낸다
const 점수칸 = (이름: string, 기준: string): [string, string][] => [["name", 이름], ["criteriaName", "항목 하나"], ["criteriaMax", "100"], ["passScore", 기준]];
등록({
  이름: "위원회 등록",
  준비: async () => ({ 칸: await 숨은_칸("/admin/committees/new", 담당_쿠키, 'name="criteriaName"') }),
  호출: (k, c) => 양식_보내기("/admin/committees/new", k, [...c.칸, ...점수칸(`${점검용} 권한시험 새 위원회`, "60")]),
});
등록({
  이름: "평가 방식 수정",
  준비: async () => {
    const R = await 회의_한_벌({ 이름: "방식" });
    return { R, 칸: await 숨은_칸(`/admin/committees/${R.위원회}?tab=scoring`, 담당_쿠키, 'name="passScore"') };
  },
  호출: (k, c) => 양식_보내기(`/admin/committees/${c.R.위원회}?tab=scoring`, k, [...c.칸, ["criteriaName", "적정성"], ["criteriaMax", "30"], ["criteriaName", "효과성"], ["criteriaMax", "70"], ["passScore", "55"]]),
});
등록({
  이름: "위원 추가",
  준비: async () => {
    const R = await 회의_한_벌({ 이름: "위원추가" });
    return { R, 칸: await 숨은_칸(`/admin/committees/${R.위원회}?tab=members`, 담당_쿠키, 'name="email"') };
  },
  호출: (k, c) => 양식_보내기(`/admin/committees/${c.R.위원회}?tab=members`, k, [...c.칸, ["name", "권한시험 위원"], ["email", "perm-new@example.com"], ["phone", "010-0000-0999"]]),
});
등록({
  이름: "위원 정보 수정",
  준비: async () => {
    const R = await 회의_한_벌({ 이름: "위원수정" });
    const 경로 = `/admin/committees/${R.위원회}/members/${R.위원들[0].id}`;
    return { R, 경로, 칸: await 숨은_칸(경로, 담당_쿠키, 'name="email"') };
  },
  호출: (k, c) => 양식_보내기(c.경로, k, [...c.칸, ["name", "바뀐 이름"], ["email", "perm-edit@example.com"], ["phone", "010-0000-0888"]]),
});
등록({
  이름: "회의 등록",
  준비: async () => {
    const R = await 회의_한_벌({ 이름: "회의등록" });
    return { R, 칸: await 숨은_칸(`/admin/committees/${R.위원회}?tab=meetings`, 담당_쿠키, 'name="startsAt"') };
  },
  호출: (k, c) => 양식_보내기(`/admin/committees/${c.R.위원회}?tab=meetings`, k, [...c.칸, ["title", `${점검용} 새 회의`], ["startsAt", "2099-03-03T10:00"], ["memberIds", c.R.위원들[0].id]]),
});

console.log(`── 1부: 담당 팀원 전용 서버 처리 ${시도들.length}가지를 담당 팀원이 아닌 4가지 호출자로 시도 ──`);
let 일부_모두_막힘 = true;
for (const s of 시도들) {
  const c = await s.준비();
  const 기준 = await 스냅샷();
  let 막힘 = true;
  const 새어나감: string[] = [];
  for (const 호출자 of 호출자들) {
    const 응답 = await s.호출(호출자.쿠키, c).catch(() => ({ 글자: "" }));
    const 바뀜 = (await 스냅샷()) !== 기준;
    const 응답성공 = s.성공응답 ? s.성공응답(응답.글자) : false;
    if (바뀜 || 응답성공) {
      막힘 = false;
      새어나감.push(호출자.이름);
    }
  }
  // 대조군: 같은 요청을 담당 팀원이 보내면 실제로 효과가 있어야 한다 (그래야 위의 "막힘"이 의미가 있다)
  const 응답 = await s.호출(담당_쿠키, c);
  const 대조_바뀜 = (await 스냅샷()) !== 기준;
  const 대조_성공 = s.성공응답 ? s.성공응답(응답.글자) : 대조_바뀜;
  일부_모두_막힘 = 일부_모두_막힘 && 막힘 && 대조_성공;
  결과(막힘 && 대조_성공, `${s.이름}: ${막힘 ? "팀장·위조 쿠키·로그인 안 함·깨진 쿠키 모두 막힘" : `막히지 않음! (${새어나감.join(", ")})`}, 대조군(담당 팀원)은 ${대조_성공 ? "정상 처리됨" : "처리되지 않음 — 시도 자체가 잘못됨"}`);
}

// ═════════════════════════════════════════════
// 2부 — DESIGN 9.2 서버 처리 시험 20개
// ═════════════════════════════════════════════
console.log("\n── 2부: DESIGN 9.2 서버 처리 시험 20개 ──");
const 단계 = (번호: number, 설명: string, 통과: boolean) => 결과(통과, `9.2-${번호}. ${설명}`);
const 평가경로 = (token: string, agendaId: string) => `/m/${token}/a/${agendaId}/evaluate`;
const 내평가 = async (agendaId: string, memberId: string) =>
  (await db.from("evaluations").select("scores, total, is_proxy").eq("agenda_id", agendaId).eq("member_id", memberId).maybeSingle()).data;
const 상태 = async (meetingId: string) => (await db.from("meetings").select("status, closed_at, starts_at").eq("id", meetingId).single()).data!;
const 제출_보내기 = async (token: string, agendaId: string, 칸: [string, string][], 점수 = ["20", "30"]) =>
  양식_보내기(평가경로(token, agendaId), "", [...칸, ["score-0", 점수[0]], ["score-1", 점수[1]]]);

// 1. 위원 링크로 /admin 또는 결과 주소 열기
{
  const R = await 회의_한_벌({ 이름: "1" });
  const 링크 = R.링크[R.위원들[0].id];
  await db.from("meetings").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", R.회의);
  const 결과들 = await Promise.all([`/admin`, R.상세, `${R.상세}/results`, `${R.상세}/proxy`, `/admin?token=${링크}`, `${R.상세}/results?token=${링크}`].map((경로) => 가져오기(경로)));
  단계(1, "위원 링크(로그인 없음)로 /admin·회의 상세·결과 주소를 열면 모두 로그인 화면으로 보내짐", 결과들.every((r) => 로그인으로_보냄(r) && !r.글자.includes("점검위원")));
}
// 2. 팀장 계정으로 링크값 조회·재발급·등록·마감 — 1부에서 팀장·위조·비로그인 모두 막힘을 확인했다
단계(2, `팀장 계정으로 링크값 조회·재발급·위원회·회의 등록·마감 등 담당 팀원 전용 ${시도들.length}가지 시도 → 모두 막힘(1부 결과)`, 일부_모두_막힘 && 시도들.some((x) => x.이름.includes("링크 복사")) && 시도들.some((x) => x.이름.includes("평가 마감")) && 시도들.some((x) => x.이름.includes("회의 등록")));

// 3. 30MB 초과 파일, PDF가 아닌 파일
{
  const R = await 회의_한_벌({ 이름: "3" });
  const 큰 = await 부르기("업로드주소", 담당_쿠키, R.상세, [R.회의, { title: "큰 파일", fileName: "big.pdf", size: 30 * 1024 * 1024 + 1 }]);
  const 워드 = await 부르기("업로드주소", 담당_쿠키, R.상세, [R.회의, { title: "워드", fileName: "a.docx", size: 100 }]);
  const 정상 = 꺼내기((await 부르기("업로드주소", 담당_쿠키, R.상세, [R.회의, { title: "정상", fileName: "a.pdf", size: 100 }])).글자);
  const 글_형식 = 꺼내기((await 부르기("업로드주소", 담당_쿠키, R.상세, [R.회의, { title: "글", fileName: "a.pdf", size: 100 }])).글자);
  const 큰_파일 = 꺼내기((await 부르기("업로드주소", 담당_쿠키, R.상세, [R.회의, { title: "큰", fileName: "a.pdf", size: 100 }])).글자);
  const 큰_내용 = new Uint8Array(30 * 1024 * 1024 + 1);
  큰_내용.set(샘플_PDF("big"));
  const [PDF아님, 용량초과] = [await 올리기(글_형식.uploadUrl!, new TextEncoder().encode("plain text") as Uint8Array<ArrayBuffer>, "text/plain"), await 올리기(큰_파일.uploadUrl!, 큰_내용)];
  void 정상;
  단계(3, "30MB 초과·PDF 아닌 이름은 서버가 주소를 안 주고, 보관함도 PDF 아닌 형식과 30MB 초과 파일을 직접 거부", !꺼내기(큰.글자).uploadUrl && !꺼내기(워드.글자).uploadUrl && !PDF아님.ok && !용량초과.ok);
}
// 4. 평가가 1건 있는 안건 PDF 교체
{
  const R = await 회의_한_벌({ 이름: "4" });
  await 평가_넣기(R.안건들[0], R.위원들[0].id);
  const 응답 = await 부르기("교체주소", 담당_쿠키, R.상세, [R.회의, R.안건들[0], { fileName: "n.pdf", size: 100 }]);
  단계(4, "평가가 1건 있는 안건의 PDF 교체 주소를 담당 팀원에게도 주지 않음", !꺼내기(응답.글자).uploadUrl && 응답.글자.includes("평가 기록이 있는 안건"));
}
// 5. 잠긴 위원회의 평가 방식 수정
{
  const R = await 회의_한_벌({ 이름: "5" });
  const 칸 = await 숨은_칸(`/admin/committees/${R.위원회}?tab=scoring`, 담당_쿠키, 'name="passScore"'); // 잠기기 전에 받아 둔 양식 정보
  await 평가_넣기(R.안건들[0], R.위원들[0].id); // 첫 평가 → 잠김
  await 양식_보내기(`/admin/committees/${R.위원회}?tab=scoring`, 담당_쿠키, [...칸, ["criteriaName", "적정성"], ["criteriaMax", "30"], ["criteriaName", "효과성"], ["criteriaMax", "70"], ["passScore", "10"]]);
  const 위원회 = (await db.from("committees").select("pass_score, locked_at").eq("id", R.위원회).single()).data!;
  단계(5, "잠긴 위원회의 평가 방식 수정은 담당 팀원이 직접 보내도 거부", !!위원회.locked_at && 위원회.pass_score === 70);
}
// 6. 미제출 위원이 있을 때 마감
{
  const R = await 회의_한_벌({ 이름: "6", 위원수: 3, 안건수: 1 });
  await 평가_넣기(R.안건들[0], R.위원들[0].id);
  const 응답 = await 부르기("마감", 담당_쿠키, R.상세, [R.회의, { errors: [] }]);
  단계(6, "미제출 위원이 있으면 담당 팀원도 마감할 수 없고 몇 명인지 안내", 응답.글자.includes("제출하지 않은 평가 대상 위원이 2명") && (await 상태(R.회의)).status === "open");
}
// 7. 마감 후 평가 수정·대리 입력
{
  const R = await 회의_한_벌({ 이름: "7", 위원수: 2, 안건수: 1 });
  const 링크 = R.링크[R.위원들[0].id];
  const 위원칸 = await 숨은_칸(평가경로(링크, R.안건들[0]), "", 'name="score-0"');
  const 대리칸 = await 숨은_칸(`${R.상세}/proxy/${R.안건들[0]}/${R.위원들[1].id}`, 담당_쿠키, 'name="score-0"');
  await 제출_보내기(링크, R.안건들[0], 위원칸); // 마감 전 정상 제출
  await 양식_보내기(`${R.상세}/proxy/${R.안건들[0]}/${R.위원들[1].id}`, 담당_쿠키, [...대리칸, ["score-0", "10"], ["score-1", "10"]]); // 대리 입력 → 전원 제출
  const 결과마감 = await 부르기("마감", 담당_쿠키, R.상세, [R.회의, { errors: [] }]);
  const 제출점수 = (await 내평가(R.안건들[0], R.위원들[0].id))?.total;
  await 제출_보내기(링크, R.안건들[0], 위원칸, ["1", "1"]);
  await 양식_보내기(`${R.상세}/proxy/${R.안건들[0]}/${R.위원들[1].id}`, 담당_쿠키, [...대리칸, ["score-0", "1"], ["score-1", "1"]]);
  void 결과마감;
  단계(7, "마감 후에는 위원의 점수 수정도, 담당 팀원의 대리 입력 수정도 거부", (await 상태(R.회의)).status === "closed" && (await 내평가(R.안건들[0], R.위원들[0].id))?.total === 제출점수 && (await 내평가(R.안건들[0], R.위원들[1].id))?.total === 20);
}
// 8. 회의 시작 시각 전 평가 제출
{
  const R = await 회의_한_벌({ 이름: "8", 위원수: 1, 안건수: 1 });
  const 링크 = R.링크[R.위원들[0].id];
  const 칸 = await 숨은_칸(평가경로(링크, R.안건들[0]), "", 'name="score-0"'); // 시작한 상태에서 받아 둔 양식 정보
  await db.from("meetings").update({ starts_at: new Date(Date.now() + 3_600_000).toISOString() }).eq("id", R.회의);
  const 응답 = await 제출_보내기(링크, R.안건들[0], 칸);
  const 화면 = 글만((await 가져오기(평가경로(링크, R.안건들[0]))).글자);
  단계(8, "회의 시작 전에는 입력 화면이 안 열리고, 미리 받아 둔 양식으로 보내도 제출이 거부", (await 내평가(R.안건들[0], R.위원들[0].id)) === null && 화면.includes("회의가 시작된 뒤에 평가할 수 있습니다") && 응답.글자.length > 0);
}
// 9. 재발급 전 링크, 차단된 링크, 만료된 링크, 회의에서 제외된 위원 링크
{
  const R = await 회의_한_벌({ 이름: "9", 위원수: 4, 안건수: 1 });
  const [가, 나, 다, 라] = R.위원들;
  const 옛링크 = R.링크[가.id];
  const 옛칸 = await 숨은_칸(평가경로(옛링크, R.안건들[0]), "", 'name="score-0"');
  await 부르기("재발급", 담당_쿠키, R.상세, [R.회의, 가.id, { errors: [] }]); // 가: 재발급 → 옛 링크 무효
  await 부르기("차단", 담당_쿠키, R.상세, [R.회의, 나.id, { errors: [] }]); // 나: 차단
  await db.from("meeting_members").update({ removed_at: new Date().toISOString() }).eq("meeting_id", R.회의).eq("member_id", 다.id); // 다: 제외
  const 거부 = async (token: string, 안내: string) => {
    const 경로들 = [`/m/${token}`, 평가경로(token, R.안건들[0]), `/m/${token}/my`, `/m/${token}/a/${R.안건들[0]}`];
    const 화면들 = await Promise.all(경로들.map((p) => 가져오기(p)));
    return 화면들.every((r) => 글만(r.글자).includes(안내) && !r.글자.includes("점검 안건 1") && !r.글자.includes('name="score-0"') && !r.글자.includes("/object/sign/"));
  };
  const 옛링크_거부 = await 거부(옛링크, "사용할 수 없는 링크");
  await 제출_보내기(옛링크, R.안건들[0], 옛칸);
  const 차단_거부 = await 거부(R.링크[나.id], "사용이 중지된 링크");
  const 제외_거부 = await 거부(R.링크[다.id], "이 회의에 참석하지 않는");
  await db.from("meetings").update({ status: "closed", closed_at: new Date(Date.now() - 8 * 일).toISOString() }).eq("id", R.회의);
  const 만료_거부 = await 거부(R.링크[라.id], "링크가 만료되었습니다");
  단계(9, "재발급 전·차단·회의 제외·만료된 링크는 안건 목록·열람·평가·내 점수 화면 모두 안내만 보이고, 옛 링크의 양식 제출도 저장 안 됨", 옛링크_거부 && 차단_거부 && 제외_거부 && 만료_거부 && (await 내평가(R.안건들[0], 가.id)) === null);
}
// 10. 제척된 위원의 그 안건 평가 제출
{
  const R = await 회의_한_벌({ 이름: "10", 위원수: 1, 안건수: 1 });
  const 링크 = R.링크[R.위원들[0].id];
  const 칸 = await 숨은_칸(평가경로(링크, R.안건들[0]), "", 'name="score-0"');
  await 부르기("제척", 담당_쿠키, R.상세, [R.회의, R.안건들[0], R.위원들[0].id, true]);
  await 제출_보내기(링크, R.안건들[0], 칸);
  단계(10, "제척된 위원이 미리 받아 둔 양식으로 제출해도 거부", (await 내평가(R.안건들[0], R.위원들[0].id)) === null);
}
// 11. 이미 제출한 위원에게 대리 입력
{
  const R = await 회의_한_벌({ 이름: "11", 위원수: 1, 안건수: 1 });
  const 대리경로 = `${R.상세}/proxy/${R.안건들[0]}/${R.위원들[0].id}`;
  const 대리칸 = await 숨은_칸(대리경로, 담당_쿠키, 'name="score-0"');
  const 링크 = R.링크[R.위원들[0].id];
  await 제출_보내기(링크, R.안건들[0], await 숨은_칸(평가경로(링크, R.안건들[0]), "", 'name="score-0"'), ["11", "22"]);
  await 양식_보내기(대리경로, 담당_쿠키, [...대리칸, ["score-0", "30"], ["score-1", "70"]]);
  const e = await 내평가(R.안건들[0], R.위원들[0].id);
  단계(11, "이미 제출한 위원에게 대리 입력은 거부되고 위원의 점수·표시가 그대로", e?.total === 33 && e.is_proxy === false);
}
// 12. 마감 후 만료 전 링크 재발급·차단은 허용 (만료 뒤에는 거부)
{
  const R = await 회의_한_벌({ 이름: "12", 위원수: 2, 안건수: 1 });
  await db.from("meetings").update({ status: "closed", closed_at: new Date(Date.now() - 3 * 일).toISOString() }).eq("id", R.회의);
  const 전 = (await db.from("meeting_members").select("link_fingerprint").eq("meeting_id", R.회의).eq("member_id", R.위원들[0].id).single()).data!.link_fingerprint;
  await 부르기("재발급", 담당_쿠키, R.상세, [R.회의, R.위원들[0].id, { errors: [] }]);
  await 부르기("차단", 담당_쿠키, R.상세, [R.회의, R.위원들[1].id, { errors: [] }]);
  const 재발급됨 = (await db.from("meeting_members").select("link_fingerprint").eq("meeting_id", R.회의).eq("member_id", R.위원들[0].id).single()).data!.link_fingerprint !== 전;
  const 차단됨 = !!(await db.from("meeting_members").select("blocked_at").eq("meeting_id", R.회의).eq("member_id", R.위원들[1].id).single()).data!.blocked_at;
  await db.from("meetings").update({ closed_at: new Date(Date.now() - 8 * 일).toISOString() }).eq("id", R.회의);
  const 만료전 = (await db.from("meeting_members").select("link_fingerprint").eq("meeting_id", R.회의).eq("member_id", R.위원들[0].id).single()).data!.link_fingerprint;
  await 부르기("재발급", 담당_쿠키, R.상세, [R.회의, R.위원들[0].id, { errors: [] }]);
  const 만료후_그대로 = (await db.from("meeting_members").select("link_fingerprint").eq("meeting_id", R.회의).eq("member_id", R.위원들[0].id).single()).data!.link_fingerprint === 만료전;
  단계(12, "마감 3일 뒤(만료 전)에는 재발급·차단이 되고, 마감 8일 뒤(만료)에는 재발급이 거부", 재발급됨 && 차단됨 && 만료후_그대로);
}
// 13. 마감 전 결과 화면 (담당 팀원·팀장)
{
  const R = await 회의_한_벌({ 이름: "13", 위원수: 1, 안건수: 1 });
  await 평가_넣기(R.안건들[0], R.위원들[0].id, 77);
  const 화면들 = await Promise.all([담당_쿠키, 팀장_쿠키].map((k) => 가져오기(`${R.상세}/results`, k)));
  단계(13, "마감 전 결과 화면은 담당 팀원·팀장 모두 '평가 마감 후에 볼 수 있습니다'만 보이고 점수는 나오지 않음", 화면들.every((r) => 글만(r.글자).includes("평가 마감 후에 볼 수 있습니다") && !글만(r.글자).includes("77점") && !글만(r.글자).includes("점검위원")));
}
// 14. 위원 링크로 대리 입력 기록 수정
{
  const R = await 회의_한_벌({ 이름: "14", 위원수: 1, 안건수: 1 });
  const 링크 = R.링크[R.위원들[0].id];
  const 칸 = await 숨은_칸(평가경로(링크, R.안건들[0]), "", 'name="score-0"');
  await 평가_넣기(R.안건들[0], R.위원들[0].id, 40, true); // 담당 팀원이 대리 입력
  await 제출_보내기(링크, R.안건들[0], 칸, ["30", "70"]);
  const e = await 내평가(R.안건들[0], R.위원들[0].id);
  단계(14, "위원이 자기 링크로 대리 입력 기록을 고치려 해도 거부 (점수·대리 입력 표시 그대로)", e?.total === 40 && e.is_proxy === true);
}
// 15. 차단 후 재발급한 새 링크로 접속
{
  const R = await 회의_한_벌({ 이름: "15", 위원수: 1, 안건수: 1 });
  const 가 = R.위원들[0];
  const 옛 = R.링크[가.id];
  await 부르기("차단", 담당_쿠키, R.상세, [R.회의, 가.id, { errors: [] }]);
  const 차단중 = 글만((await 가져오기(`/m/${옛}`)).글자).includes("사용이 중지된 링크");
  await 부르기("재발급", 담당_쿠키, R.상세, [R.회의, 가.id, { errors: [] }]);
  const 새 = /"path":"\/m\/([A-Za-z0-9_-]{43})"/.exec((await 부르기("복사", 담당_쿠키, R.상세, [R.회의, 가.id])).글자)?.[1];
  const 새링크 = 새 ? 글만((await 가져오기(`/m/${새}`)).글자) : "";
  const 옛링크 = 글만((await 가져오기(`/m/${옛}`)).글자);
  단계(15, "차단 → 재발급하면 새 링크로는 접속되고 옛 링크는 계속 막힘", 차단중 && 새링크.includes("점검 안건 1") && 옛링크.includes("사용할 수 없는 링크"));
}
// 16. 회의에서 제외된 위원 링크 재발급
{
  const R = await 회의_한_벌({ 이름: "16", 위원수: 2, 안건수: 1 });
  await 부르기("제외", 담당_쿠키, R.상세, [R.회의, R.위원들[0].id, { errors: [] }]);
  const 전 = (await db.from("meeting_members").select("link_fingerprint").eq("meeting_id", R.회의).eq("member_id", R.위원들[0].id).single()).data!.link_fingerprint;
  const 응답 = await 부르기("재발급", 담당_쿠키, R.상세, [R.회의, R.위원들[0].id, { errors: [] }]);
  const 복사 = await 부르기("복사", 담당_쿠키, R.상세, [R.회의, R.위원들[0].id]);
  단계(16, "회의에서 제외된 위원의 링크는 재발급도 복사도 거부", 응답.글자.includes("제외된 위원") && !/"path":"\/m\//.test(복사.글자) && (await db.from("meeting_members").select("link_fingerprint").eq("meeting_id", R.회의).eq("member_id", R.위원들[0].id).single()).data!.link_fingerprint === 전);
}
// 17. 제외했던 위원 재추가 후 집계 — 기존 평가가 다시 반영됨
{
  const 만들기 = async (이름: string) => {
    const R = await 회의_한_벌({ 이름, 위원수: 3, 안건수: 1 });
    const 합 = [60, 70, 80];
    for (const [i, m] of R.위원들.entries()) await 평가_넣기(R.안건들[0], m.id, 합[i]);
    await 부르기("제외", 담당_쿠키, R.상세, [R.회의, R.위원들[2].id, { errors: [] }]); // 80점을 낸 위원 제외
    return R;
  };
  const 제외상태 = await 만들기("17a");
  await 부르기("마감", 담당_쿠키, 제외상태.상세, [제외상태.회의, { errors: [] }]);
  const 제외중 = 글만((await 가져오기(`${제외상태.상세}/results`, 담당_쿠키)).글자);
  const 재추가 = await 만들기("17b");
  await 부르기("추가", 담당_쿠키, 재추가.상세, [재추가.회의, 재추가.위원들[2].id, { errors: [] }]);
  await 부르기("마감", 담당_쿠키, 재추가.상세, [재추가.회의, { errors: [] }]);
  const 재추가후 = 글만((await 가져오기(`${재추가.상세}/results`, 담당_쿠키)).글자);
  단계(17, "제외된 동안은 평균 65.0점(60·70)에서 빠지고, 마감 전에 다시 추가하면 기존 80점이 다시 반영돼 평균 70.0점(60·70·80)", 제외중.includes("65.0점") && 재추가후.includes("70.0점"));
}
// 18. 회의 시작 후 회의 일시 수정
{
  const R = await 회의_한_벌({ 이름: "18", 시작: new Date(Date.now() + 1 * 일) });
  const 칸 = await 숨은_칸(R.상세, 담당_쿠키, "일시 저장");
  await db.from("meetings").update({ starts_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", R.회의);
  const 전 = (await 상태(R.회의)).starts_at;
  await 양식_보내기(R.상세, 담당_쿠키, [...칸, ["startsAt", "2099-05-05T10:00"]]);
  단계(18, "회의가 시작된 뒤에는 일시 수정을 담당 팀원이 직접 보내도 거부", (await 상태(R.회의)).starts_at === 전);
}
// 19. 제외·제척 위원의 기록만 있는 안건 PDF 교체
{
  const R = await 회의_한_벌({ 이름: "19", 위원수: 2, 안건수: 2 });
  await 평가_넣기(R.안건들[0], R.위원들[0].id);
  await db.from("meeting_members").update({ removed_at: new Date().toISOString() }).eq("meeting_id", R.회의).eq("member_id", R.위원들[0].id); // 안건 1: 제외된 위원의 기록뿐
  await 평가_넣기(R.안건들[1], R.위원들[1].id);
  await db.from("recusals").insert({ agenda_id: R.안건들[1], member_id: R.위원들[1].id }); // 안건 2: 제척된 위원의 기록뿐
  const 응답들 = await Promise.all(R.안건들.map((a) => 부르기("교체주소", 담당_쿠키, R.상세, [R.회의, a, { fileName: "n.pdf", size: 100 }])));
  단계(19, "제외된 위원·제척된 위원의 평가 기록만 있어도(평가 기록이 있으므로) 그 안건 PDF 교체는 거부", 응답들.every((r) => !꺼내기(r.글자).uploadUrl && r.글자.includes("평가 기록이 있는 안건")));
}
// 20. 회의 일시 14:00 기준 13:59와 14:00 — 데이터베이스는 "시작 시각 전이면 거부, 시작 시각부터 허용"
{
  const R = await 회의_한_벌({ 이름: "20", 위원수: 1, 안건수: 1 });
  const 시작 = new Date(Date.now() + 2500);
  await db.from("meetings").update({ starts_at: 시작.toISOString() }).eq("id", R.회의);
  const 전 = ((await db.rpc("submit_evaluation", { p_meeting_id: R.회의, p_agenda_id: R.안건들[0], p_member_id: R.위원들[0].id, p_scores: [1, 1] })).data as { result: string }).result;
  await 잠깐(Math.max(0, 시작.getTime() - Date.now()) + 300);
  const 후 = ((await db.rpc("submit_evaluation", { p_meeting_id: R.회의, p_agenda_id: R.안건들[0], p_member_id: R.위원들[0].id, p_scores: [1, 1] })).data as { result: string }).result;
  단계(20, "시작 시각 직전에는 거부, 시작 시각이 지나면 허용 (정확히 같은 시각의 경계는 규칙 테스트 evaluation.test.ts의 13:59/14:00으로 확인)", 전 === "not-started" && 후 === "ok");
}

void APP_URL; void 새_링크; void 지문; void 항목; void 샘플_PDF;
await 점검용_정리();
const { count } = await db.from("committees").select("*", { count: "exact", head: true }).like("name", `${점검용}%`);
결과(count === 0, "점검용 위원회·회의·안건·평가 정리 완료");
끝내기("권한");
