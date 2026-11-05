// Design Ref: §3.2 ⑥ 위원: 안건 목록 (/m/{링크값}) — 이 링크를 받은 회의의 안건만 보인다.
// 관리 버튼(업로드·수정·삭제)은 없다. 평가 버튼([평가하기]·[수정]·제척 표시)은 PLAN 작업 15·18에서 붙인다.
import type { Metadata } from "next";
import { Suspense } from "react";

import { LinkButton } from "@/components/Button";
import { LinkDenied, MemberShell } from "@/components/MemberShell";
import { PageContainer } from "@/components/PageContainer";
import { resolveMemberLink } from "@/lib/auth/member-link";
import { listAgendas } from "@/lib/db/agendas";
import { formatKoreanDateTime } from "@/lib/format";
import { isBeforeStart } from "@/lib/rules/meeting";

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

  const { meeting, memberName } = check.access;
  const agendas = await listAgendas(meeting.id);
  const 시작전 = isBeforeStart(meeting.startsAt, new Date());

  return (
    <MemberShell token={token} meetingTitle={meeting.title} memberName={memberName}>
      <p className="text-sm text-muted">{meeting.committeeName}</p>
      <h1 className="text-2xl font-bold">{meeting.title}</h1>
      <p className="mt-1 text-muted">{formatKoreanDateTime(meeting.startsAt)} (한국 시간)</p>

      <p className="mt-4 rounded-md bg-background px-4 py-3 text-base">
        {meeting.status === "closed"
          ? "평가가 마감된 회의입니다. 안건은 링크가 만료되기 전까지 볼 수 있습니다."
          : 시작전
            ? "회의 시작 후 평가할 수 있습니다. 회의 전에 안건을 미리 읽어 주세요."
            : "회의가 시작되었습니다. 안건을 읽고 평가해 주세요."}
      </p>

      <h2 className="mt-6 mb-3 text-lg font-semibold">
        안건 <span className="text-base font-normal text-muted">{agendas.length}건</span>
      </h2>
      {agendas.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-5 text-muted">아직 올라온 안건이 없습니다.</p>
      ) : (
        <ol className="space-y-3">
          {agendas.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
              <span className="text-lg font-semibold">
                {a.position}. {a.title}
              </span>
              <LinkButton href={`/m/${token}/a/${a.id}`} variant="secondary" prefetch={false}>
                열람
              </LinkButton>
            </li>
          ))}
        </ol>
      )}
    </MemberShell>
  );
}
