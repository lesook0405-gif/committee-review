// Plan 작업 3 — 샘플 데이터 넣기
// Design Ref: §9.3 샘플 데이터 — 위원회 1개(적정성 30·효과성 40·시급성 30, 기준 70점, 제외 켜짐),
//   위원 5명, 회의 1건, 안건 PDF 2건, 담당 팀원·팀장 계정 각 1개
// PRD 7번: 실제 안건·실제 위원 정보는 쓰지 않는다. 여기 있는 이름·연락처·PDF 내용은 모두 지어낸 것이다.
//
// 실행: npm run seed
//   여러 번 실행해도 된다. 이전 샘플(이름이 "[샘플]"로 시작하는 위원회)을 지우고 새로 넣는다.
//   샘플이 아닌 데이터는 건드리지 않는다. 계정 비밀번호는 .env.local에서 읽고 화면에 출력하지 않는다.
import { createClient } from "@supabase/supabase-js";

const 샘플_표시 = "[샘플]";
const 보관함 = "agendas";

function 환경값(이름: string): string {
  const 값 = process.env[이름];
  if (!값) {
    console.error(`❌ 환경 변수 ${이름}이(가) 없습니다. .env.local 파일을 확인하세요.`);
    process.exit(1);
  }
  return 값;
}

const db = createClient(환경값("SUPABASE_URL"), 환경값("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 작업 중 오류가 나면 무엇이 실패했는지 한국어로 알리고 멈춘다
function 확인<T>(단계: string, 결과: { data: T; error: { message: string } | null }): T {
  if (결과.error) {
    console.error(`❌ ${단계} 실패 — ${결과.error.message}`);
    process.exit(1);
  }
  return 결과.data;
}

// ─────────────────────────────────────────────
// 샘플 PDF 만들기 (외부 파일 없이 글자 몇 줄짜리 PDF를 직접 만든다)
// PDF 기본 글꼴은 한글을 지원하지 않아 영어로 적는다.
// ─────────────────────────────────────────────
function 샘플_PDF(줄들: string[]): Buffer {
  const 이스케이프 = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const 본문 = ["BT", "/F1 16 Tf", "72 770 Td", "22 TL",
    ...줄들.map((줄) => `(${이스케이프(줄)}) Tj T*`), "ET"].join("\n");
  const 객체들 = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(본문)} >>\nstream\n${본문}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const 위치들: number[] = [];
  객체들.forEach((객체, i) => {
    위치들.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${객체}\nendobj\n`;
  });
  const 목차_위치 = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${객체들.length + 1}\n0000000000 65535 f \n`;
  pdf += 위치들.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${객체들.length + 1} /Root 1 0 R >>\nstartxref\n${목차_위치}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

// ─────────────────────────────────────────────
// 1. 담당 팀원·팀장 계정 (미리 등록 — 가입 화면 없음)
// ─────────────────────────────────────────────
async function 계정_준비(이메일: string, 비밀번호: string, 이름: string, 역할: "staff" | "lead") {
  const 목록 = 확인("계정 목록 조회", await db.auth.admin.listUsers({ perPage: 1000 }));
  const 기존 = 목록.users.find((u) => u.email === 이메일);
  let id: string;
  if (기존) {
    확인("계정 비밀번호 갱신", await db.auth.admin.updateUserById(기존.id, { password: 비밀번호 }));
    id = 기존.id;
  } else {
    const 새_계정 = 확인("계정 만들기", await db.auth.admin.createUser({ email: 이메일, password: 비밀번호, email_confirm: true }));
    id = 새_계정.user!.id;
  }
  확인("역할 저장", await db.from("staff").upsert({ id, name: 이름, role: 역할 }));
  console.log(`✅ ${역할 === "staff" ? "담당 팀원" : "팀장"} 계정: ${이메일} (비밀번호는 .env.local)`);
}

await 계정_준비(환경값("SEED_STAFF_EMAIL"), 환경값("SEED_STAFF_PASSWORD"), `${샘플_표시} 담당 팀원`, "staff");
await 계정_준비(환경값("SEED_LEAD_EMAIL"), 환경값("SEED_LEAD_PASSWORD"), `${샘플_표시} 팀장`, "lead");

// ─────────────────────────────────────────────
// 2. 이전 샘플 지우기 (위원회를 지우면 위원·회의·안건·평가가 함께 지워진다)
// ─────────────────────────────────────────────
확인("이전 샘플 위원회 삭제", await db.from("committees").delete().like("name", `${샘플_표시}%`));
const 이전_파일 = 확인("이전 샘플 PDF 조회", await db.storage.from(보관함).list("sample"));
if (이전_파일.length > 0) {
  확인("이전 샘플 PDF 삭제", await db.storage.from(보관함).remove(이전_파일.map((f) => `sample/${f.name}`)));
}

// ─────────────────────────────────────────────
// 3. 위원회 (평가 방식 포함)
// ─────────────────────────────────────────────
const 위원회 = 확인("위원회 만들기", await db.from("committees").insert({
  name: `${샘플_표시} 투자심사위원회`,
  criteria: [
    { name: "적정성", maxScore: 30 },
    { name: "효과성", maxScore: 40 },
    { name: "시급성", maxScore: 30 },
  ],
  pass_score: 70,
  exclude_extremes: true,
}).select("id").single());
console.log("✅ 위원회 1개: [샘플] 투자심사위원회 (적정성 30·효과성 40·시급성 30, 기준 70점, 최고·최저 제외 켜짐)");

// ─────────────────────────────────────────────
// 4. 위원 5명 (가상 인물 — 메일은 예시용 도메인, 번호는 실제로 쓰지 않는 0000 번호)
// ─────────────────────────────────────────────
const 위원_목록 = ["가상위원 가", "가상위원 나", "가상위원 다", "가상위원 라", "가상위원 마"].map((이름, i) => ({
  committee_id: 위원회.id,
  name: 이름,
  email: `sample-member${i + 1}@example.com`,
  phone: `010-0000-000${i + 1}`,
}));
const 위원들 = 확인("위원 만들기", await db.from("members").insert(위원_목록).select("id, name"));
console.log(`✅ 위원 ${위원들.length}명: ${위원들.map((m) => m.name).join(", ")}`);

// ─────────────────────────────────────────────
// 5. 회의 1건 (한국 시간 2026-11-20 14:00 — 시간대를 붙여 저장)
// ─────────────────────────────────────────────
const 회의 = 확인("회의 만들기", await db.from("meetings").insert({
  committee_id: 위원회.id,
  title: "제1차 샘플 회의",
  starts_at: "2026-11-20T14:00:00+09:00",
}).select("id").single());
확인("참석 위원 등록", await db.from("meeting_members").insert(
  위원들.map((m) => ({ meeting_id: 회의.id, member_id: m.id })),
));
console.log("✅ 회의 1건: 제1차 샘플 회의 (2026-11-20 14:00 한국 시간, 참석 위원 5명 — 링크는 작업 11에서 발급)");

// ─────────────────────────────────────────────
// 6. 안건 PDF 2건 (비공개 보관함에 올리고 안건으로 등록)
// ─────────────────────────────────────────────
const 안건_목록 = [
  { 제목: "가상기업 A 투자 심사", 파일: "sample/agenda-1.pdf", 줄들: ["SAMPLE AGENDA 1 (fictional data)", "Investment review: Fictional Company A", "This document is sample data for testing only."] },
  { 제목: "가상기업 B 투자 심사", 파일: "sample/agenda-2.pdf", 줄들: ["SAMPLE AGENDA 2 (fictional data)", "Investment review: Fictional Company B", "This document is sample data for testing only."] },
];
for (const [i, 안건] of 안건_목록.entries()) {
  const pdf = 샘플_PDF(안건.줄들);
  확인(`안건 PDF 올리기 (${안건.제목})`, await db.storage.from(보관함).upload(안건.파일, pdf, {
    contentType: "application/pdf",
    upsert: true,
  }));
  확인(`안건 등록 (${안건.제목})`, await db.from("agendas").insert({
    meeting_id: 회의.id,
    position: i + 1,
    title: 안건.제목,
    pdf_path: 안건.파일,
    pdf_size_bytes: pdf.byteLength,
  }));
}
console.log(`✅ 안건 ${안건_목록.length}건: ${안건_목록.map((a) => a.제목).join(", ")} (비공개 보관함에 PDF 저장)`);

console.log("\n샘플 데이터 준비 완료");
