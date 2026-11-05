// Design Ref: §3.2 ⑨ 위원: 내 점수 (/m/{링크값}/my)
// 안건별로 "내가 낸 점수"만 보인다. 평균, 다른 위원의 점수, 가결 여부는 어디에도 나오지 않는다.
// 링크가 만료되기 전까지(마감 후 7일) 볼 수 있다. 위원 ID는 링크 확인으로 얻으므로 다른 위원의 점수는 읽을 방법이 없다.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LinkDenied, MemberShell } from "@/components/MemberShell";
import { PageContainer } from "@/components/PageContainer";
import { resolveMemberLink } from "@/lib/auth/member-link";
import { listAgendas } from "@/lib/db/agendas";
import { getCommittee } from "@/lib/db/committees";
import { listMyAgendaStates, listMyEvaluations } from "@/lib/db/evaluations";
import { formatKoreanDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "내 점수" };

export default function MyScoresPage(props: PageProps<"/m/[token]/my">) {
  return (
    <Suspense fallback={<PageContainer><p className="text-muted">불러오는 중…</p></PageContainer>}>
      <MyScores {...props} />
    </Suspense>
  );
}

async function MyScores({ params }: PageProps<"/m/[token]/my">) {
  const { token } = await params;
  const check = await resolveMemberLink(token);
  if (!check.ok) return <LinkDenied reason={check.reason} />;
  const { meeting, memberId, memberName } = check.access;

  const [agendas, committee] = await Promise.all([listAgendas(meeting.id), getCommittee(meeting.committeeId)]);
  const ids = agendas.map((a) => a.id);
  const [mine, states] = await Promise.all([listMyEvaluations(memberId, ids), listMyAgendaStates(memberId, ids)]);
  const criteria = committee?.criteria ?? [];

  return (
    <MemberShell token={token} meetingTitle={meeting.title} memberName={memberName}>
      <p className="text-sm">
        <Link href={`/m/${token}`} className="text-primary hover:underline">
          ← 안건 목록
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold">내 점수</h1>
      <p className="mt-1 text-sm text-muted">내가 낸 점수만 보입니다. 평균과 가결 여부는 담당자가 확인합니다.</p>

      {agendas.length === 0 ? (
        <p className="mt-4 rounded-lg border border-border bg-surface p-5 text-muted">아직 올라온 안건이 없습니다.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {agendas.map((a) => {
            const e = mine.get(a.id);
            const 제척 = states.get(a.id)?.recused === true;
            return (
              <section key={a.id} className="rounded-lg border border-border bg-surface p-5" aria-label={`안건 ${a.position} 내 점수`}>
                <h2 className="text-lg font-semibold">
                  {a.position}. {a.title}
                </h2>
                {제척 ? (
                  <p className="mt-2 text-muted">이 안건은 제척되어 평가하지 않습니다.</p>
                ) : !e ? (
                  <p className="mt-2 text-muted">아직 제출하지 않았습니다.</p>
                ) : (
                  <>
                    <table className="mt-2 w-full max-w-md text-left">
                      <tbody>
                        {criteria.map((c, i) => (
                          <tr key={i} className="border-b border-border">
                            <td className="py-2">{c.name}</td>
                            <td className="py-2 text-right">{e.scores[i] ?? "-"}점</td>
                          </tr>
                        ))}
                        <tr>
                          <td className="py-2 font-semibold">합계</td>
                          <td className="py-2 text-right font-semibold">{e.total}점</td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="mt-2 text-sm text-muted">
                      {e.isProxy ? "담당자가 대리 입력한 점수입니다. " : ""}
                      {formatKoreanDateTime(e.updatedAt)} 저장
                    </p>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </MemberShell>
  );
}
