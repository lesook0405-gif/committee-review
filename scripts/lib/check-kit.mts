// 점검 스크립트(scripts/check-*.mts)가 함께 쓰는 도구 모음 (작업 22부터 새 점검 스크립트에서 사용)
// - 개발 서버(APP_URL)에 로그인 쿠키를 만들어 요청하고, 화면이 보내는 서버 처리 요청을 그대로 흉내 낸다.
// - 링크값·비밀 값은 출력하지 않는다. 점검용 데이터는 이름이 "[점검용]"으로 시작하게 만들고 끝에 지운다.
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { encryptLinkToken } from "../../lib/rules/member-link.ts";

export const APP_URL = process.env.APP_URL ?? "http://localhost:3001";
export const 점검용 = "[점검용]";

let 실패 = false;
export function 결과(통과: boolean, 설명: string) {
  console.log(`${통과 ? "✅" : "❌"} ${설명}`);
  if (!통과) 실패 = true;
}
export function 끝내기(제목: string): never {
  console.log(실패 ? `\n${제목} 점검 실패 — 위 ❌ 항목을 확인하세요.` : `\n${제목} 점검 통과`);
  process.exit(실패 ? 1 : 0);
}

export const db = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type 역할 = "staff" | "lead";
/** 로그인 쿠키를 직접 만든다 (비밀 값은 .env.local에서만 읽는다). role을 계정의 실제 역할과 다르게 적어 "위조 쿠키"도 만들 수 있다 */
export function 쿠키(sub: string, role: 역할): string {
  const body = Buffer.from(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
  const sig = createHmac("sha256", process.env.SESSION_SECRET as string).update(body).digest("base64url");
  return `committee_session=${body}.${sig}`;
}
/** 서명이 틀린 쿠키 (누군가 값을 고쳐 쓴 경우) */
export function 망가진_쿠키(sub: string): string {
  const 정상 = 쿠키(sub, "staff");
  return 정상.slice(0, -4) + "AAAA";
}

export const 지문 = (token: string) =>
  createHmac("sha256", createHash("sha256").update(`fingerprint:${process.env.MEMBER_LINK_SECRET}`).digest()).update(token).digest("hex");
export const 새_링크 = () => randomBytes(32).toString("base64url");

export const 풀기 = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/** 태그를 지우고 공백을 하나로 모은 글 */
export const 글만 = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
export const 잠깐 = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function 가져오기(경로: string, 쿠키값 = "") {
  const 응답 = await fetch(`${APP_URL}${경로}`, { headers: { cookie: 쿠키값 }, redirect: "manual" });
  return { 상태: 응답.status, 위치: 응답.headers.get("location"), 글자: (await 응답.text()).replace(/<!-- -->/g, "") };
}
export const 로그인으로_보냄 = (r: { 상태: number; 위치: string | null }) => r.상태 >= 300 && r.상태 < 400 && !!r.위치?.includes("/login");

/** 화면의 양식에서 서버가 만든 숨은 칸(서버 처리 연결 정보)을 받아 둔다. 양식은 표시(글자)로 찾는다 */
export async function 숨은_칸(경로: string, 쿠키값: string, 표시: string): Promise<[string, string][]> {
  const { 글자 } = await 가져오기(경로, 쿠키값);
  const 양식 = [...글자.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes(표시)) ?? "";
  return [...양식.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)].map((m) => [풀기(m[1]), 풀기(m[2] ?? "")]);
}
/** 양식 보내기 (JavaScript 없이 브라우저가 보내는 방식과 같다) */
export async function 양식_보내기(경로: string, 쿠키값: string, 칸들: [string, string][]) {
  const 데이터 = new FormData();
  for (const [이름, 값] of 칸들) 데이터.append(이름, 값);
  const 응답 = await fetch(`${APP_URL}${경로}`, { method: "POST", body: 데이터, headers: { cookie: 쿠키값, origin: APP_URL }, redirect: "manual" });
  return { 상태: 응답.status, 위치: 응답.headers.get("location"), 글자: (await 응답.text()).replace(/<!-- -->/g, "") };
}

// 서버 처리(서버 액션) ID — 개발 서버가 만든 목록에서 이름으로 찾는다. 목록이 비어 있지 않도록 관리자 화면을 한 번 열어 둔다.
type 목록 = { node: Record<string, { exportedName: string; filename: string }> };
export async function 서버처리_준비(담당_쿠키: string, 아무_회의_경로: string) {
  await 가져오기(아무_회의_경로, 담당_쿠키);
  const m = JSON.parse(readFileSync(".next/dev/server/server-reference-manifest.json", "utf8")) as 목록;
  return (이름: string, 파일: string) => {
    const id = Object.entries(m.node).find(([, v]) => v.exportedName === 이름 && v.filename.endsWith(파일))?.[0];
    if (!id) throw new Error(`서버 처리 ${이름}의 ID를 찾지 못했습니다. 개발 서버에서 관련 화면을 한 번 연 뒤 다시 실행하세요.`);
    return id;
  };
}
/** 서버 처리를 화면을 거치지 않고 직접 부른다 (화면의 버튼이 보내는 요청과 같은 모양) */
export async function 서버처리_부르기(id: string, 쿠키값: string, 경로: string, args: unknown[]) {
  const 응답 = await fetch(`${APP_URL}${경로}`, {
    method: "POST",
    headers: { cookie: 쿠키값, origin: APP_URL, "next-action": id, accept: "text/x-component", "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  return { 상태: 응답.status, 글자: await 응답.text() };
}

export async function 점검용_정리() {
  const { data: ms } = await db.from("meetings").select("id").like("title", `${점검용}%`);
  for (const m of ms ?? []) {
    const { data: f } = await db.storage.from("agendas").list(`meetings/${m.id}`);
    if (f?.length) await db.storage.from("agendas").remove(f.map((x) => `meetings/${m.id}/${x.name}`));
  }
  await db.from("committees").delete().like("name", `${점검용}%`);
}

export async function 계정() {
  const { data } = await db.from("staff").select("id, role");
  const 담당 = data?.find((s) => s.role === "staff")?.id;
  const 팀장 = data?.find((s) => s.role === "lead")?.id;
  if (!담당 || !팀장 || !process.env.MEMBER_LINK_SECRET) {
    console.log("❌ 담당 팀원·팀장 계정 또는 MEMBER_LINK_SECRET이 없습니다. npm run seed 와 .env.local을 확인하세요.");
    process.exit(1);
  }
  return { 담당, 팀장, 담당_쿠키: 쿠키(담당, "staff"), 팀장_쿠키: 쿠키(팀장, "lead") };
}

export const 항목 = [
  { name: "적정성", maxScore: 30 },
  { name: "효과성", maxScore: 70 },
];

/** 점검용 위원회·위원·회의·안건 한 벌 */
export async function 회의_한_벌(opts: {
  이름: string;
  위원수?: number;
  참석?: number; // 앞에서부터 몇 명을 참석시킬지 (기본 전원)
  안건수?: number;
  시작?: Date;
  링크?: boolean; // 참석 위원 전원에게 링크 발급 (기본 true)
  위원회_이름?: string;
}) {
  const 위원수 = opts.위원수 ?? 4;
  const { data: 위원회 } = await db
    .from("committees")
    .insert({ name: `${점검용} ${opts.위원회_이름 ?? opts.이름} 위원회`, criteria: 항목, pass_score: 70, exclude_extremes: true })
    .select("id")
    .single();
  const { data: 위원들 } = await db
    .from("members")
    .insert(Array.from({ length: 위원수 }, (_, i) => ({ committee_id: 위원회!.id, name: `점검위원 ${String.fromCharCode(0xac00 + i * 3)}`, email: `kit-${randomBytes(4).toString("hex")}@example.com`, phone: `010-0000-07${i}0` })))
    .select("id, name")
    .then((r) => ({ data: r.data?.sort((a, b) => a.name.localeCompare(b.name, "ko")) }));
  const { data: 회의 } = await db
    .from("meetings")
    .insert({ committee_id: 위원회!.id, title: `${점검용} ${opts.이름}`, starts_at: (opts.시작 ?? new Date(Date.now() - 60_000)).toISOString() })
    .select("id")
    .single();
  const 참석 = 위원들!.slice(0, opts.참석 ?? 위원수);
  const 링크: Record<string, string> = {};
  const 행 = 참석.map((m) => {
    const token = 새_링크();
    링크[m.id] = token;
    return {
      meeting_id: 회의!.id,
      member_id: m.id,
      // 암호문은 진짜로 만든다 (담당 팀원의 [링크 복사]가 해독할 수 있어야 하므로). 접속 확인용 지문은 앱 코드와 따로 계산한다.
      ...(opts.링크 === false ? {} : { link_ciphertext: encryptLinkToken(token, process.env.MEMBER_LINK_SECRET as string), link_fingerprint: 지문(token), link_issued_at: new Date().toISOString() }),
    };
  });
  if (행.length) await db.from("meeting_members").insert(행);
  const 안건들: string[] = [];
  for (let i = 1; i <= (opts.안건수 ?? 2); i++) {
    const { data: a } = await db
      .from("agendas")
      .insert({ meeting_id: 회의!.id, position: i, title: `점검 안건 ${i}`, pdf_path: `check/kit-${회의!.id}-${i}.pdf`, pdf_size_bytes: 100 })
      .select("id")
      .single();
    안건들.push(a!.id);
  }
  return { 위원회: 위원회!.id, 위원들: 위원들!, 회의: 회의!.id, 안건들, 링크, 상세: `/admin/meetings/${회의!.id}` };
}
export const 평가_넣기 = (agendaId: string, memberId: string, total = 50, is_proxy = false) =>
  db.from("evaluations").insert({ agenda_id: agendaId, member_id: memberId, scores: [Math.min(total, 30), Math.max(total - 30, 0)], total, is_proxy });
