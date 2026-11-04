// Design Ref: §3.2 ③ 위원회 상세 (/admin/committees/{id}) — 탭 3개: 평가 방식 · 위원 명단 · 회의
// 평가 방식 탭(작업 7), 위원 명단 탭(작업 8). 회의 탭은 작업 9에서 채운다.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageContainer } from "@/components/PageContainer";
import { ScoringForm } from "@/components/ScoringForm";
import { requireStaff } from "@/lib/auth/session";
import { getCommittee, type CommitteeDetail } from "@/lib/db/committees";
import { formatKoreanDateTime } from "@/lib/format";
import { totalMaxScore } from "@/lib/rules/committee";
import { isUuid } from "@/lib/rules/ids";

import { updateScoringAction } from "../actions";

import { MembersTab } from "./MembersTab";

export const metadata: Metadata = { title: "위원회 상세" };

const 탭_목록 = [
  { key: "scoring", label: "평가 방식" },
  { key: "members", label: "위원 명단" },
  { key: "meetings", label: "회의" },
] as const;
type TabKey = (typeof 탭_목록)[number]["key"];

export default function CommitteePage(props: PageProps<"/admin/committees/[id]">) {
  return (
    <PageContainer>
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
        <Committee {...props} />
      </Suspense>
    </PageContainer>
  );
}

async function Committee({ params, searchParams }: PageProps<"/admin/committees/[id]">) {
  const staff = await requireStaff();
  const { id } = await params;
  const { tab } = await searchParams;
  const current: TabKey = 탭_목록.some((t) => t.key === tab) ? (tab as TabKey) : "scoring";

  // 주소에 이상한 값이 들어와도 데이터베이스 오류 대신 "찾을 수 없음"으로 보여 준다
  if (!isUuid(id)) notFound();
  const committee = await getCommittee(id);
  if (!committee) notFound();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin" className="text-primary hover:underline">
          ← 위원회 목록
        </Link>
      </p>
      <h1 className="text-2xl font-bold">{committee.name}</h1>

      <nav className="mt-4 mb-6 flex gap-1 border-b border-border" aria-label="위원회 상세 탭">
        {탭_목록.map((t) => (
          <Link
            key={t.key}
            href={`/admin/committees/${committee.id}?tab=${t.key}`}
            aria-current={current === t.key ? "page" : undefined}
            className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-4 font-semibold ${
              current === t.key ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {current === "scoring" ? <ScoringTab committee={committee} canEdit={staff.role === "staff"} /> : null}
      {current === "members" ? <MembersTab committeeId={committee.id} canEdit={staff.role === "staff"} /> : null}
      {current === "meetings" ? (
        <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-muted">
          회의 목록은 다음 작업(PLAN 작업 9)에서 연결됩니다.
        </p>
      ) : null}
    </>
  );
}

function ScoringTab({ committee, canEdit }: { committee: CommitteeDetail; canEdit: boolean }) {
  // 잠겼거나 팀장이면 읽기 전용 표로 보여 준다
  if (committee.lockedAt || !canEdit) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5">
        {committee.lockedAt ? (
          <p className="mb-4 rounded-md bg-background px-3 py-2 text-sm">
            <strong>잠김</strong> · {formatKoreanDateTime(committee.lockedAt)}에 첫 평가가 제출되어 평가 방식을 바꿀 수 없습니다.
          </p>
        ) : (
          <p className="mb-4 text-sm text-muted">팀장 계정은 열람만 할 수 있습니다.</p>
        )}
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border text-sm text-muted">
              <th className="py-2">평가 항목</th>
              <th className="py-2 text-right">배점</th>
            </tr>
          </thead>
          <tbody>
            {committee.criteria.map((c, i) => (
              <tr key={i} className="border-b border-border">
                <td className="py-2">{c.name}</td>
                <td className="py-2 text-right">{c.maxScore}점</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="py-2 font-semibold">배점 합계</td>
              <td className="py-2 text-right font-semibold">{totalMaxScore(committee.criteria)}점</td>
            </tr>
          </tfoot>
        </table>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted">가결 기준 점수</dt>
          <dd>{committee.passScore}점 이상</dd>
          <dt className="text-muted">최고점·최저점 제외</dt>
          <dd>{committee.excludeExtremes ? "켜짐 (평가 5명 이상일 때)" : "꺼짐"}</dd>
        </dl>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <p className="mb-4 text-sm text-muted">이 평가 방식은 위원회의 모든 회의에 똑같이 적용되며, 첫 평가가 제출되면 바꿀 수 없습니다.</p>
      <ScoringForm
        mode="edit"
        action={updateScoringAction.bind(null, committee.id)}
        initial={{ criteria: committee.criteria, passScore: committee.passScore, excludeExtremes: committee.excludeExtremes }}
      />
    </section>
  );
}
