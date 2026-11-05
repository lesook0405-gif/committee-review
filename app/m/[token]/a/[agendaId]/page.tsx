// Design Ref: §3.2 ⑦ 위원: 안건 열람 (/m/{링크값}/a/{안건}) — 화면 대부분을 PDF가 차지한다.
// Design Ref: §7 — "링크 유효, 이 회의의 안건" 확인 뒤 5분만 유효한 임시 주소로 연다. 보관함은 비공개라 이 주소 없이는 열리지 않는다.
// 첫 열람 시각 기록은 PLAN 작업 13, 아래 [평가하기]는 작업 15에서 붙인다.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LinkDenied, MemberShell } from "@/components/MemberShell";
import { PageContainer } from "@/components/PageContainer";
import { resolveMemberLink } from "@/lib/auth/member-link";
import { createAgendaViewUrl, getMeetingAgenda } from "@/lib/db/agendas";
import { isUuid } from "@/lib/rules/ids";

export const metadata: Metadata = { title: "안건 열람" };

export default function AgendaViewPage(props: PageProps<"/m/[token]/a/[agendaId]">) {
  return (
    <Suspense fallback={<PageContainer><p className="text-muted">불러오는 중…</p></PageContainer>}>
      <AgendaView {...props} />
    </Suspense>
  );
}

async function AgendaView({ params }: PageProps<"/m/[token]/a/[agendaId]">) {
  const { token, agendaId } = await params;
  const check = await resolveMemberLink(token);
  if (!check.ok) return <LinkDenied reason={check.reason} />;
  const { meeting, memberName } = check.access;

  // 다른 회의의 안건 ID를 넣어도 이 회의 안건이 아니면 열지 않는다
  const agenda = isUuid(agendaId) ? await getMeetingAgenda(meeting.id, agendaId) : null;
  if (!agenda) {
    return (
      <MemberShell token={token} meetingTitle={meeting.title} memberName={memberName}>
        <p role="alert" className="rounded-lg border border-border bg-surface p-5">
          이 회의의 안건이 아니거나 찾을 수 없는 안건입니다.
        </p>
        <BackLink token={token} />
      </MemberShell>
    );
  }

  const pdfUrl = await createAgendaViewUrl(agenda.pdf_path);

  return (
    <MemberShell token={token} meetingTitle={meeting.title} memberName={memberName}>
      <BackLink token={token} />
      <h1 className="mt-2 text-xl font-bold">
        {agenda.position}. {agenda.title}
      </h1>
      <iframe
        src={pdfUrl}
        title={`안건 ${agenda.position}. ${agenda.title} PDF`}
        referrerPolicy="no-referrer"
        className="mt-3 h-[75vh] w-full rounded-lg border border-border bg-surface"
      />
      <p className="mt-3 text-sm text-muted">
        PDF가 보이지 않으면{" "}
        <a href={pdfUrl} target="_blank" rel="noreferrer noopener" className="font-semibold text-primary hover:underline">
          새 창에서 열기
        </a>
        를 눌러 주세요. 보안을 위해 이 주소는 5분 뒤 만료되며, 화면을 새로 열면 다시 볼 수 있습니다.
      </p>
    </MemberShell>
  );
}

function BackLink({ token }: { token: string }) {
  return (
    <p className="mt-3 text-sm">
      <Link href={`/m/${token}`} className="text-primary hover:underline">
        ← 안건 목록
      </Link>
    </p>
  );
}
