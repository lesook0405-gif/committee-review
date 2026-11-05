// Design Ref: §3.2 ⑤ 집계 결과 (/admin/meetings/{id}/results) — 마감 후에만 열린다.
// 담당 팀원과 팀장이 볼 수 있고(위원 링크로는 이 주소에 들어올 수 없다), 마감 전에 주소로 직접 들어오면 안내만 보여 준다.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageContainer } from "@/components/PageContainer";
import { requireStaff } from "@/lib/auth/session";
import { getMeetingResults, type AgendaResultView } from "@/lib/db/results";
import { formatKoreanDateTime } from "@/lib/format";
import { EXCLUDE_EXTREMES_MIN_COUNT } from "@/lib/rules/aggregate";
import { isUuid } from "@/lib/rules/ids";
import type { ResultRow } from "@/lib/rules/results";

export const metadata: Metadata = { title: "집계 결과" };

export default function ResultsPage(props: PageProps<"/admin/meetings/[id]/results">) {
  return (
    <PageContainer>
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
        <Results {...props} />
      </Suspense>
    </PageContainer>
  );
}

async function Results({ params }: PageProps<"/admin/meetings/[id]/results">) {
  await requireStaff(); // 담당 팀원·팀장만 (로그인하지 않았으면 로그인 화면으로)
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const data = await getMeetingResults(id);
  if (data.kind === "not-found") notFound();

  const back = (
    <p className="mb-2 text-sm">
      <Link href={`/admin/meetings/${id}`} className="text-primary hover:underline">
        ← 회의 상세
      </Link>
    </p>
  );
  if (data.kind === "not-closed") {
    return (
      <>
        {back}
        <h1 className="text-2xl font-bold">집계 결과</h1>
        <p role="status" className="mt-4 rounded-lg border border-border bg-surface p-5">
          평가 마감 후에 볼 수 있습니다.
        </p>
      </>
    );
  }

  return (
    <>
      {back}
      <h1 className="text-2xl font-bold">집계 결과</h1>
      <p className="mt-1 text-muted">
        {data.meeting.committeeName} · {data.meeting.title} · 회의 {formatKoreanDateTime(data.meeting.startsAt)}
        {data.meeting.closedAt ? ` · 마감 ${formatKoreanDateTime(data.meeting.closedAt)}` : ""}
      </p>
      <p className="mt-2 rounded-md bg-background px-4 py-3 text-sm">
        가결 기준 {data.passScore}점 이상 · 최고·최저점 제외 {data.excludeExtremes ? `켜짐(제출 ${EXCLUDE_EXTREMES_MIN_COUNT}명 이상일 때만 적용)` : "꺼짐"}. 가결 여부는 반올림하기 전 평균으로
        판단하고, 화면에는 소수점 둘째 자리에서 반올림한 점수를 보여 줍니다.
      </p>
      {data.agendas.length === 0 ? (
        <p className="mt-6 text-muted">안건이 없습니다.</p>
      ) : (
        <div className="mt-6 space-y-8">
          {data.agendas.map((a) => (
            <AgendaResultTable key={a.agendaId} agenda={a} criteria={data.criteria} />
          ))}
        </div>
      )}
    </>
  );
}

function verdict(a: AgendaResultView["result"]) {
  if (a.aggregate.kind === "no-evaluations") return { text: "평가 없음", className: "bg-background text-muted" };
  return a.aggregate.passed ? { text: "가결", className: "bg-green-50 text-success" } : { text: "부결", className: "bg-red-50 text-danger" };
}

function 비고(r: ResultRow): string {
  const 말: string[] = [];
  if (r.kind === "recused") 말.push("제척");
  if (r.kind === "removed") 말.push("회의에서 제외");
  if (r.kind === "missing") 말.push("미제출");
  if (r.isProxy) 말.push("대리 입력");
  if (r.excluded === "high") 말.push("최고점 제외");
  if (r.excluded === "low") 말.push("최저점 제외");
  return 말.join(" · ");
}

function AgendaResultTable({ agenda, criteria }: { agenda: AgendaResultView; criteria: { name: string; maxScore: number }[] }) {
  const { result } = agenda;
  const v = verdict(result);
  return (
    <section className="rounded-lg border border-border bg-surface p-5" aria-label={`안건 ${agenda.position} 결과`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          안건 {agenda.position}. {agenda.title}
        </h2>
        <span className="text-base">
          결과: <strong className={`rounded px-2 py-0.5 ${v.className}`}>{v.text}</strong>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left">
          <thead>
            <tr className="border-b border-border text-sm text-muted">
              <th className="py-2 pr-3">위원</th>
              {criteria.map((c, i) => (
                <th key={i} className="py-2 pr-3 text-right">
                  {c.name}
                  <span className="block text-xs font-normal">({c.maxScore})</span>
                </th>
              ))}
              <th className="py-2 pr-3 text-right">합계</th>
              <th className="py-2">비고</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.memberId} className={`border-b border-border ${r.excluded ? "text-muted" : ""}`}>
                <td className="py-2 pr-3 font-semibold">{r.name}</td>
                {criteria.map((_, i) => (
                  <td key={i} className="py-2 pr-3 text-right">
                    {r.scores ? (r.scores[i] ?? "—") : "—"}
                  </td>
                ))}
                <td className="py-2 pr-3 text-right font-semibold">{r.total ?? "—"}</td>
                <td className="py-2 text-sm">{비고(r)}</td>
              </tr>
            ))}
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={criteria.length + 3} className="py-3 text-muted">
                  평가 기록이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="mt-3">
        {result.aggregate.kind === "no-evaluations" ? (
          <span>평가 대상이 없어(모두 제외·제척) 평가 없음으로 표시합니다. 가결·부결을 내지 않습니다.</span>
        ) : (
          <>
            평균 <strong className="text-lg">{result.aggregate.averageText}점</strong> (가결 기준 {result.passScore}점) · 제출 {result.aggregate.submittedCount}명
            {result.aggregate.usedCount !== result.aggregate.submittedCount ? ` · 평균에 사용 ${result.aggregate.usedCount}명(최고·최저점 1개씩 제외)` : ""}
            {result.excludeSkippedBecauseFew ? ` (${EXCLUDE_EXTREMES_MIN_COUNT}명 미만이라 최고·최저점 제외 안 함)` : ""}
          </>
        )}
      </p>
    </section>
  );
}
