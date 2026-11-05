// Plan 작업 23 — Part 5(Vercel 배포) 전에 하는 배포 준비 점검
// 실행: npm run check:deploy   (먼저 npm run build 로 운영용 빌드가 만들어져 있어야 한다)
// 비밀 값은 어디에도 출력하지 않는다. "있음/없음", "찾지 못함" 같은 결과와 이름만 말한다.
//   A. 환경 변수: 코드가 읽는 이름이 모두 준비돼 있고, 브라우저로 나가는 이름(NEXT_PUBLIC_)이 없는지
//   B. 비밀 값이 Git(현재 파일·과거 기록)과 빌드 결과물에 들어 있지 않은지
//   C. 데이터베이스·보관함이 공개 키로는 열리지 않는지 (읽기·쓰기·서버 함수 호출)
//   D. 운영 모드(next start)로 띄워 보안 설정이 적용되는지
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { db, 결과, 끝내기, 점검용_정리, 평가_넣기, 회의_한_벌 } from "./lib/check-kit.mts";

// ── 파일 읽기 도구 ──
function envParse(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const 줄 of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(줄);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
function 파일들(dir: string, 건너뜀: string[] = []): string[] {
  const 결과들: string[] = [];
  for (const 이름 of readdirSync(dir)) {
    const 경로 = join(dir, 이름);
    if (건너뜀.some((s) => 경로.replaceAll("\\", "/").includes(s))) continue;
    const st = statSync(경로);
    if (st.isDirectory()) 결과들.push(...파일들(경로, 건너뜀));
    else if (st.size < 8 * 1024 * 1024) 결과들.push(경로);
  }
  return 결과들;
}

const 지역 = envParse(".env.local");
const 공용 = envParse(".env");
const 모든값 = { ...공용, ...지역 };

// ═════ A. 환경 변수 ═════
console.log("── A. 환경 변수 ──");
const 필요한_이름 = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "MEMBER_LINK_SECRET", "SESSION_SECRET"];
// 코드가 실제로 읽는 이름을 소스에서 모은다 (process.env.이름, readEnv("이름"), 배열·문자열로 적은 이름)
const 소스들 = ["app", "lib", "components"].flatMap((d) => 파일들(d)).concat(["proxy.ts"]).filter((f) => /\.(ts|tsx)$/.test(f));
const 코드가_읽는_이름 = new Set<string>();
for (const f of 소스들) {
  const 글 = readFileSync(f, "utf8");
  for (const m of 글.matchAll(/process\.env\.([A-Z0-9_]+)/g)) 코드가_읽는_이름.add(m[1]);
  for (const m of 글.matchAll(/readEnv\("([A-Z0-9_]+)"/g)) 코드가_읽는_이름.add(m[1]);
}
코드가_읽는_이름.delete("NODE_ENV");
for (const 이름 of 필요한_이름) {
  결과(!!지역[이름] || !!공용[이름], `${이름}: 값 ${지역[이름] || 공용[이름] ? "있음" : "없음"}`);
}
결과(
  [...코드가_읽는_이름].every((n) => 필요한_이름.includes(n)),
  `코드가 읽는 환경 변수는 위 ${필요한_이름.length}개뿐임 (이 목록에 없는 새 이름이 코드에 생기면 여기서 걸림: ${[...코드가_읽는_이름].filter((n) => !필요한_이름.includes(n)).join(", ") || "없음"})`,
);
결과((지역.MEMBER_LINK_SECRET ?? "").length >= 32 && (지역.SESSION_SECRET ?? "").length >= 32, "MEMBER_LINK_SECRET·SESSION_SECRET은 32자 이상의 충분히 긴 값");
결과(
  Object.keys(모든값).every((n) => !n.startsWith("NEXT_PUBLIC_")) && ![...코드가_읽는_이름].some((n) => n.startsWith("NEXT_PUBLIC_")),
  "브라우저로 나가는 NEXT_PUBLIC_ 이름이 환경 파일에도 코드에도 없음",
);
const 클라이언트_파일 = 소스들.filter((f) => /^\s*["']use client["']/m.test(readFileSync(f, "utf8").slice(0, 200)));
결과(
  클라이언트_파일.every((f) => !/process\.env/.test(readFileSync(f, "utf8")) && !/from "@\/lib\/(db|auth)\//.test(readFileSync(f, "utf8"))),
  `브라우저 쪽 코드 ${클라이언트_파일.length}개 파일은 환경 변수와 서버 전용 코드(lib/db·lib/auth)를 쓰지 않음`,
);
const 배포_안_쓰는 = Object.keys(모든값).filter((n) => !필요한_이름.includes(n));
console.log(`   ℹ️  Vercel에 등록할 환경 변수(이름만): ${필요한_이름.join(", ")}`);
console.log(`   ℹ️  배포에는 필요 없고 내 컴퓨터에서만 쓰는 이름: ${배포_안_쓰는.join(", ") || "없음"}`);

// ═════ B. 비밀 값이 새 나가지 않았는지 ═════
console.log("\n── B. 비밀 값이 Git·빌드 결과물에 들어 있지 않은지 ──");
const 비밀_이름 = Object.keys(모든값).filter((n) => /KEY|SECRET|TOKEN|PASSWORD/.test(n) && (모든값[n] ?? "").length >= 8);
const git = (args: string[]) => spawnSync("git", args, { encoding: "utf8" });
const 추적된_환경파일 = git(["ls-files"]).stdout.split("\n").filter((f) => /(^|\/)\.env/.test(f));
결과(추적된_환경파일.length === 0, "Git이 추적하는 파일 중 .env 계열이 없음");
const 무시 = readFileSync(".gitignore", "utf8");
결과(/^\.env\*/m.test(무시) && /^\/node_modules/m.test(무시) && /^\/trash-can\//m.test(무시), ".gitignore에 .env*, node_modules, trash-can이 등록돼 있음");
let 현재파일_유출 = 0;
let 기록_유출 = 0;
for (const 이름 of 비밀_이름) {
  if (git(["grep", "-F", "-l", "-e", 모든값[이름]]).status === 0) 현재파일_유출++;
  if (git(["log", "--all", "--oneline", `-S${모든값[이름]}`]).stdout.trim() !== "") 기록_유출++;
}
결과(현재파일_유출 === 0, `비밀 값 ${비밀_이름.length}개(${비밀_이름.join(", ")})가 Git이 추적하는 어떤 파일에도 없음`);
결과(기록_유출 === 0, "비밀 값이 과거 커밋 기록 어디에도 없음");
const 빌드_있음 = existsSync(".next/BUILD_ID");
결과(빌드_있음, "운영용 빌드(.next)가 있음 — 없으면 먼저 npm run build");
if (빌드_있음) {
  let 유출_파일 = 0;
  for (const f of 파일들(".next", [".next/cache", ".next/dev", ".next/diagnostics"])) {
    const 내용 = readFileSync(f);
    if (비밀_이름.some((n) => 내용.includes(모든값[n]))) 유출_파일++;
  }
  결과(유출_파일 === 0, "운영용 빌드 결과물(브라우저로 내려가는 파일 포함) 어디에도 비밀 값이 들어 있지 않음");
}

// ═════ C. 데이터베이스·보관함 보안 ═════
console.log("\n── C. 공개 키로는 데이터베이스·보관함이 열리지 않는지 ──");
await 점검용_정리();
const 익명 = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_ANON_KEY as string, { auth: { persistSession: false, autoRefreshToken: false } });
const R = await 회의_한_벌({ 이름: "배포", 위원수: 2, 안건수: 1 });
await 평가_넣기(R.안건들[0], R.위원들[0].id, 50);
await db.from("recusals").insert({ agenda_id: R.안건들[0], member_id: R.위원들[1].id });
await db.from("agenda_views").insert({ agenda_id: R.안건들[0], member_id: R.위원들[0].id });
const 표들 = ["staff", "committees", "members", "meetings", "meeting_members", "agendas", "agenda_views", "recusals", "evaluations"] as const;
const 읽힌 = [] as string[];
for (const 표 of 표들) {
  const 실제 = (await db.from(표).select("*", { count: "exact", head: true })).count ?? 0;
  const { data } = await 익명.from(표).select("*").limit(5);
  if ((data ?? []).length > 0) 읽힌.push(표);
  if (실제 === 0 && 표 !== "staff") 읽힌.push(`${표}(점검용 기록이 없어 확인 불가)`);
}
결과(읽힌.length === 0, `공개 키로 표 ${표들.length}개 모두 한 줄도 읽을 수 없음 (행 단위 보안) ${읽힌.length ? `— 문제: ${읽힌.join(", ")}` : ""}`);
const 쓰기 = await 익명.from("committees").insert({ name: `${"[점검용]"} 익명 쓰기`, criteria: [{ name: "a", maxScore: 10 }], pass_score: 5 });
결과(!!쓰기.error && (await db.from("committees").select("*", { count: "exact", head: true }).eq("name", "[점검용] 익명 쓰기")).count === 0, "공개 키로는 표에 기록을 쓸 수 없음");
const 수정 = await 익명.from("evaluations").update({ total: 99 }).eq("agenda_id", R.안건들[0]);
const 평가_그대로 = (await db.from("evaluations").select("total").eq("agenda_id", R.안건들[0]).single()).data?.total === 50;
결과(평가_그대로 && ((수정.data ?? null) === null || !수정.error), "공개 키로는 평가 점수를 고칠 수 없음 (점수 그대로)");
const 함수들 = [
  ["submit_evaluation", { p_meeting_id: R.회의, p_agenda_id: R.안건들[0], p_member_id: R.위원들[1].id, p_scores: [1, 1] }],
  ["save_proxy_evaluation", { p_meeting_id: R.회의, p_agenda_id: R.안건들[0], p_member_id: R.위원들[1].id, p_scores: [1, 1] }],
  ["set_recusal", { p_meeting_id: R.회의, p_agenda_id: R.안건들[0], p_member_id: R.위원들[0].id, p_recused: true }],
  ["close_meeting", { p_meeting_id: R.회의 }],
  ["replace_agenda_pdf", { p_meeting_id: R.회의, p_agenda_id: R.안건들[0], p_new_path: "x", p_new_size: 1 }],
  ["evaluation_total", { p_criteria: [], p_scores: [] }],
] as const;
let 열린_함수 = 0;
for (const [이름, 인자] of 함수들) {
  const r = await (익명.rpc as unknown as (n: string, a: unknown) => Promise<{ error: unknown }>)(이름, 인자);
  if (!r.error) 열린_함수++;
}
const 회의_상태 = (await db.from("meetings").select("status").eq("id", R.회의).single()).data?.status;
결과(열린_함수 === 0 && 회의_상태 === "open", `공개 키로는 서버 전용 데이터베이스 함수 ${함수들.length}개를 하나도 부를 수 없음 (회의 상태도 그대로)`);
const 보관함 = (await db.storage.getBucket("agendas")).data;
결과(보관함?.public === false && Number(보관함.file_size_limit) === 30 * 1024 * 1024 && (보관함.allowed_mime_types ?? []).join() === "application/pdf", "안건 PDF 보관함: 비공개, 30MB 제한, PDF만 허용");
const 공개주소 = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/public/agendas/sample/agenda-1.pdf`);
const 익명목록 = await 익명.storage.from("agendas").list("sample");
결과(!공개주소.ok && (익명목록.data ?? []).length === 0, "공개 주소와 공개 키로는 보관함의 PDF를 열거나 목록을 볼 수 없음");
const 설정 = await (await fetch(`${process.env.SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: process.env.SUPABASE_ANON_KEY as string } })).json().catch(() => ({})) as { disable_signup?: boolean };
if (설정.disable_signup === true) 결과(true, "Supabase 로그인 서비스의 외부 가입이 꺼져 있음");
else console.log("   ⚠️  Supabase 로그인 서비스의 외부 가입(signup)이 켜져 있습니다. 앱에는 가입 화면이 없고 담당 팀원 명단(staff 표)에 있는 계정만 로그인되지만, 배포 전에 Supabase 대시보드 Authentication 설정에서 끄는 것을 권장합니다.");
await 점검용_정리();

// ═════ D. 운영 모드로 띄워 보기 ═════
console.log("\n── D. 운영 모드(next start)로 실행 ──");
if (!빌드_있음) {
  결과(false, "운영용 빌드가 없어 운영 모드 점검을 건너뜀");
} else {
  const 포트 = 3055;
  const 서버 = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(포트)], { stdio: "ignore" });
  const 주소 = `http://localhost:${포트}`;
  let 떴음 = false;
  for (let i = 0; i < 60 && !떴음; i++) {
    await new Promise((r) => setTimeout(r, 500));
    떴음 = await fetch(`${주소}/login`).then((r) => r.ok).catch(() => false);
  }
  try {
    결과(떴음, "운영 모드로 서버가 뜸");
    if (떴음) {
      const 로그인 = await fetch(`${주소}/login`);
      const 로그인_글 = await 로그인.text();
      결과(/noindex/.test(로그인_글), "검색 엔진에 노출하지 않음 (noindex)");
      결과(!로그인.headers.has("x-powered-by"), "응답에 서버 종류를 알리는 X-Powered-By 머리글이 없음");
      const 위원 = await fetch(`${주소}/m/${"A".repeat(43)}`);
      결과(위원.headers.get("referrer-policy") === "no-referrer", "위원 화면 응답에 Referrer-Policy: no-referrer (링크 주소가 다른 사이트로 새지 않음)");
      const 관리 = await fetch(`${주소}/admin`, { redirect: "manual" });
      결과(관리.status >= 300 && 관리.status < 400 && (관리.headers.get("location") ?? "").includes("/login"), "운영 모드에서도 로그인하지 않고 /admin을 열면 로그인 화면으로 보내짐");
      const 결과주소 = await fetch(`${주소}/admin/meetings/00000000-0000-0000-0000-000000000000/results`, { redirect: "manual" });
      결과(결과주소.status >= 300 && 결과주소.status < 400, "운영 모드에서도 로그인하지 않으면 결과 주소가 열리지 않음");
      const 가짜링크 = await (await fetch(`${주소}/m/${"A".repeat(43)}`)).text();
      결과(글만_포함(가짜링크, "사용할 수 없는 링크") && !가짜링크.includes("점검 안건"), "엉뚱한 위원 링크는 운영 모드에서도 안내만 보임");
    }
  } finally {
    서버.kill();
  }
}
function 글만_포함(html: string, 말: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").includes(말);
}

const { count } = await db.from("committees").select("*", { count: "exact", head: true }).like("name", "[점검용]%");
결과(count === 0, "점검용 데이터 정리 완료");
끝내기("배포 준비");
