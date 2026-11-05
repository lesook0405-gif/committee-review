// Design Ref: §3.2 ⑥ 위원: 안건 목록 (/m/{링크값}) — 이 링크를 받은 회의의 안건만 보인다.
// 관리 버튼(업로드·수정·삭제)은 없다. 안건마다 내 상태에 따라 [평가하기]·"제출 완료"+[수정]·"대리 입력됨"·"제척"을 보여 준다.
// ([수정]은 자기 평가를 고치는 버튼이라 관리 버튼이 아니다. 제척 표시는 PLAN 작업 18에서 담당 팀원이 정하면 여기에 나타난다.)
import type { Metadata } from "next";
import { Suspense } from "react";

import { LinkButton } from "@/components/Button";
import { LinkDenied, MemberShell } from "@/components/MemberShell";
import { PageContainer } from "@/components/PageContainer";
import { resolveMemberLink } from "@/lib/auth/member-link";
import { listAgendas } from "@/lib/db/agendas";
import { listMyAgendaStates, type MyAgendaState } from "@/lib/db/evaluations";
import { formatKoreanDateTime } from "@/lib/format";
import { evaluationWindow } from "@/lib/rules/evaluation";

export const metadata: Metadata = { title: "안건 목록" };

export default function MemberHomePage(props: PageProps<"/m/[token]">) {
  return (
    <Suspense fallback={<PageContainer><p className="text-muted">불러오는 중…</p></PageContainer>}>
      <MemberHome {...props} />
    </Suspense>
  );
}

async function MemberHome({ params }: PageProps<"/m/[token]">) {
  const { token } = await params;
  const check = await resolveMemberLink(token);
  if (!check.ok) return <LinkDenied reason={check.reason} />;

  const { meeting, memberId, memberName } = check.access;
  const agendas = await listAgendas(meeting.id);
  const states = await listMyAgendaStates(memberId, agendas.map((a) => a.id));
  const 시점 = evaluationWindow(meeting, new Date());

  return (
    <MemberShell token={token} meetingTitle={meeting.title} memberName={memberName}>
      <p className="text-sm text-muted">{meeting.committeeName}</p>
      <h1 className="text-2xl font-bold">{meeting.title}</h1>
      <p className="mt-1 text-muted">{formatKoreanDateTime(meeting.startsAt)} (한국 시간)</p>

      <p className="mt-4 rounded-md bg-background px-4 py-3 text-base">
        {시점 === "closed"
          ? "평가가 마감된 회의입니다. 안건은 링크가 만료되기 전까지 볼 수 있습니다."
          : 시점 === "not-started"
            ? "회의 시작 후 평가할 수 있습니다. 회의 전에 안건을 미리 읽어 주세요."
            : "회의가 시작되었습니다. 안건을 읽고 평가해 주세요."}
      </p>

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          안건 <span className="text-base font-normal text-muted">{agendas.length}건</span>
        </h2>
        <LinkButton href={`/m/${token}/my`} variant="secondary" prefetch={false}>
          내 점수 보기
        </LinkButton>
      </div>
      {agendas.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-5 text-muted">아직 올라온 안건이 없습니다.</p>
      ) : (
        <ol className="space-y-3">
          {agendas.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
              <span className="text-lg font-semibold">
                {a.position}. {a.title}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <EvaluationStatus token={token} agendaId={a.id} state={states.get(a.id)} window={시점} />
                <LinkButton href={`/m/${token}/a/${a.id}`} variant="secondary" prefetch={false}>
                  열람
                </LinkButton>
              </span>
            </li>
          ))}
        </ol>
      )}
    </MemberShell>
  );
}

/** 안건 하나의 평가 상태 표시와 버튼 (위원 화면은 상태별로 다르게 보인다) */
function EvaluationStatus({
  token,
  agendaId,
  state,
  window,
}: {
  token: string;
  agendaId: string;
  state: MyAgendaState | undefined;
  window: "not-started" | "open" | "closed";
}) {
  const 글 = "text-sm text-muted";
  if (state?.recused) return <span className={글}>제척</span>;
  if (state?.submitted && state.isProxy) return <span className={글}>대리 입력됨</span>;
  if (state?.submitted) {
    return window === "open" ? (
      <>
        <span className="text-sm font-semibold text-success">제출 완료</span>
        <LinkButton href={`/m/${token}/a/${agendaId}/evaluate`} variant="secondary" prefetch={false}>
          수정
        </LinkButton>
      </>
    ) : (
      <span className="text-sm font-semibold text-success">제출 완료</span>
    );
  }
  if (window === "open") {
    return (
      <LinkButton href={`/m/${token}/a/${agendaId}/evaluate`} prefetch={false}>
        평가하기
      </LinkButton>
    );
  }
  if (window === "closed") return <span className={글}>평가 마감</span>;
  return <span className={글}>회의 시작 후 평가</span>;
}
