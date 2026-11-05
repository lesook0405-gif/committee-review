// Design Ref: §3.2 ⑧와 같은 점수 입력칸으로 담당 팀원이 위원 대신 점수를 입력하거나 대리 입력 기록을 고친다.
// 서버 쪽 확인은 저장할 때 한 번 더 한다(saveProxyAction + 데이터베이스 함수 save_proxy_evaluation).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { EvaluationForm } from "@/components/EvaluationForm";
import { PageContainer } from "@/components/PageContainer";
import { requireStaff } from "@/lib/auth/session";
import { getMeetingAgenda } from "@/lib/db/agendas";
import { getCommittee } from "@/lib/db/committees";
import { getProxyBoard, getProxyScores } from "@/lib/db/evaluations";
import { getMeeting } from "@/lib/db/meetings";
import { evaluationWindow } from "@/lib/rules/evaluation";
import { isUuid } from "@/lib/rules/ids";

import { saveProxyAction } from "../../../../proxy-actions";

export const metadata: Metadata = { title: "대리 입력" };

export default function ProxyFormPage(props: PageProps<"/admin/meetings/[id]/proxy/[agendaId]/[memberId]">) {
  return (
    <PageContainer>
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
        <ProxyForm {...props} />
      </Suspense>
    </PageContainer>
  );
}

async function ProxyForm({ params }: PageProps<"/admin/meetings/[id]/proxy/[agendaId]/[memberId]">) {
  const staff = await requireStaff();
  const { id, agendaId, memberId } = await params;
  if (!isUuid(id) || !isUuid(agendaId) || !isUuid(memberId)) notFound();
  const meeting = await getMeeting(id);
  if (!meeting) notFound();

  const back = (
    <p className="mb-2 text-sm">
      <Link href={`/admin/meetings/${meeting.id}/proxy`} className="text-primary hover:underline">
        ← 대리 입력 목록
      </Link>
    </p>
  );
  const notice = (text: string) => (
    <>
      {back}
      <p role="alert" className="mt-4 rounded-lg border border-border bg-surface p-5">
        {text}
      </p>
    </>
  );

  if (staff.role !== "staff") return notice("대리 입력은 담당 팀원만 할 수 있습니다. 팀장 계정은 열람만 할 수 있습니다.");

  const agenda = await getMeetingAgenda(meeting.id, agendaId);
  if (!agenda) notFound();
  // 평가 대상(참석 중, 이 안건에서 제척되지 않은 위원)만
  const board = await getProxyBoard(meeting.id);
  const cell = board.find((a) => a.agendaId === agenda.id)?.cells.find((c) => c.memberId === memberId);
  if (!cell) return notice("이 안건의 평가 대상 위원이 아닙니다. (회의에 참석하지 않거나 이 안건에서 제척된 위원입니다)");
  if (cell.state === "submitted") return notice(`${cell.name} 위원이 앱에서 직접 제출한 평가가 있어 대리 입력할 수 없습니다.`);

  const 시점 = evaluationWindow(meeting, new Date());
  if (시점 === "closed") return notice("마감된 회의라 대리 입력하거나 고칠 수 없습니다.");
  if (시점 === "not-started") return notice("회의가 시작된 뒤에 입력할 수 있습니다.");

  const [committee, scores] = await Promise.all([getCommittee(meeting.committeeId), getProxyScores(agenda.id, memberId)]);
  if (!committee) notFound();

  return (
    <>
      {back}
      <h1 className="text-2xl font-bold">
        {cell.name} 위원 {scores ? "대리 입력 수정" : "대리 입력"}
      </h1>
      <p className="mt-1 text-muted">
        {agenda.position}. {agenda.title}
      </p>
      <div className="mt-4 rounded-lg border border-border bg-surface p-5">
        <EvaluationForm
          mode="proxy"
          action={saveProxyAction.bind(null, meeting.id, agenda.id, memberId)}
          criteria={committee.criteria}
          initialScores={scores}
          draftKey={null}
        />
      </div>
    </>
  );
}
