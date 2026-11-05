// Design Ref: §3.2 ⑧ 위원: 평가 입력·수정 (/m/{링크값}/a/{안건}/evaluate)
// 회의 시작 전이나 마감 후에는 입력 화면 대신 안내 문구를 보여 준다. 제척된 안건과 대리 입력된 안건도 입력 화면을 열지 않는다.
// 서버 쪽 확인은 제출할 때 한 번 더 한다(submitEvaluationAction + 데이터베이스 함수).
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EvaluationForm } from "@/components/EvaluationForm";
import { LinkDenied, MemberShell } from "@/components/MemberShell";
import { PageContainer } from "@/components/PageContainer";
import { resolveMemberLink } from "@/lib/auth/member-link";
import { getMeetingAgenda } from "@/lib/db/agendas";
import { getCommittee } from "@/lib/db/committees";
import { getMyEvaluation, listMyAgendaStates } from "@/lib/db/evaluations";
import { formatKoreanDateTime } from "@/lib/format";
import { evaluationWindow } from "@/lib/rules/evaluation";
import { draftStorageKey } from "@/lib/rules/evaluation-draft";
import { isUuid } from "@/lib/rules/ids";

import { submitEvaluationAction } from "./actions";

export const metadata: Metadata = { title: "평가 입력" };

export default function EvaluatePage(props: PageProps<"/m/[token]/a/[agendaId]/evaluate">) {
  return (
    <Suspense fallback={<PageContainer><p className="text-muted">불러오는 중…</p></PageContainer>}>
      <Evaluate {...props} />
    </Suspense>
  );
}

async function Evaluate({ params }: PageProps<"/m/[token]/a/[agendaId]/evaluate">) {
  const { token, agendaId } = await params;
  const check = await resolveMemberLink(token);
  if (!check.ok) return <LinkDenied reason={check.reason} />;
  const { meeting, meetingMemberId, memberId, memberName } = check.access;

  const agenda = isUuid(agendaId) ? await getMeetingAgenda(meeting.id, agendaId) : null;
  const shell = (children: React.ReactNode) => (
    <MemberShell token={token} meetingTitle={meeting.title} memberName={memberName}>
      <p className="mt-1 text-sm">
        <Link href={`/m/${token}`} className="text-primary hover:underline">
          ← 안건 목록
        </Link>
      </p>
      {children}
    </MemberShell>
  );
  const notice = (text: string) => (
    <p role="status" className="mt-4 rounded-lg border border-border bg-surface p-5 text-base">
      {text}
    </p>
  );

  if (!agenda) return shell(<p role="alert" className="mt-4 rounded-lg border border-border bg-surface p-5">이 회의의 안건이 아니거나 찾을 수 없는 안건입니다.</p>);

  const [committee, mine, states] = await Promise.all([
    getCommittee(meeting.committeeId),
    getMyEvaluation(agenda.id, memberId),
    listMyAgendaStates(memberId, [agenda.id]),
  ]);
  if (!committee) return shell(notice("평가 방식을 불러오지 못했습니다. 담당자에게 문의하세요."));

  const title = (
    <h1 className="mt-2 text-xl font-bold">
      {agenda.position}. {agenda.title}
    </h1>
  );

  // 내 점수를 읽기 전용으로 보여 줄 때 (마감 후·대리 입력)
  const myScores = mine ? (
    <table className="mt-4 w-full max-w-md text-left">
      <tbody>
        {committee.criteria.map((c, i) => (
          <tr key={i} className="border-b border-border">
            <td className="py-2">{c.name}</td>
            <td className="py-2 text-right">{mine.scores[i] ?? "-"}점</td>
          </tr>
        ))}
        <tr>
          <td className="py-2 font-semibold">합계</td>
          <td className="py-2 text-right font-semibold">{mine.total}점</td>
        </tr>
      </tbody>
    </table>
  ) : null;

  if (states.get(agenda.id)?.recused) {
    return shell(<>{title}{notice("이 안건은 제척되어 평가하지 않습니다.")}</>);
  }

  const 시점 = evaluationWindow(meeting, new Date());
  if (시점 === "closed") {
    return shell(<>{title}{notice(mine ? "마감된 회의라 점수를 바꿀 수 없습니다. 내가 낸 점수는 아래와 같습니다." : "평가가 마감되었습니다.")}{myScores}</>);
  }
  if (시점 === "not-started") {
    return shell(<>{title}{notice(`회의가 시작된 뒤에 평가할 수 있습니다. (회의 시작: ${formatKoreanDateTime(meeting.startsAt)} 한국 시간)`)}</>);
  }
  if (mine?.isProxy) {
    return shell(<>{title}{notice("담당자가 대리 입력한 평가라 직접 고칠 수 없습니다. 고쳐야 하면 담당자에게 요청하세요.")}{myScores}</>);
  }

  return shell(
    <>
      {title}
      <p className="mt-1 text-sm text-muted">
        항목마다 0점부터 배점까지 정수로 입력하세요. {mine ? "이미 제출한 점수입니다. 마감 전까지 고쳐서 다시 제출할 수 있습니다." : ""}
      </p>
      <div className="mt-4 rounded-lg border border-border bg-surface p-5">
        <EvaluationForm
          action={submitEvaluationAction.bind(null, token, agenda.id)}
          criteria={committee.criteria}
          initialScores={mine ? mine.scores : null}
          draftKey={draftStorageKey(meetingMemberId, agenda.id)}
        />
      </div>
    </>,
  );
}
