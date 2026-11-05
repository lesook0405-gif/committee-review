// Design Ref: §3.2 ④ 회의 상세 (/admin/meetings/{id})
// 작업 9: 회의 정보, 일시 수정(시작 전만), 참석 위원 추가·제외·다시 추가.
// 작업 10: 안건 목록과 안건 PDF 올리기(담당 팀원·마감 전만).
// 작업 11: 위원 링크 복사·발급·재발급·차단(담당 팀원만, 링크 만료 전까지). 팀장에게는 링크 영역을 보내지 않는다.
// 작업 13: 안건별 "열람 N / M"·"회의 전 열람 N / M" (M = 그 안건의 평가 대상 수).
// 제출 현황(작업 20), 안건 교체(작업 14)는 다음 작업에서 이 화면에 붙인다.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ActionButton } from "@/components/ActionButton";
import { AgendaUploadForm } from "@/components/AgendaUploadForm";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { PageContainer } from "@/components/PageContainer";
import { StartsAtForm } from "@/components/StartsAtForm";
import { requireStaff } from "@/lib/auth/session";
import { listAgendaViewCounts } from "@/lib/db/agenda-views";
import { listAgendas, type AgendaRow } from "@/lib/db/agendas";
import { getMeeting, listParticipants, type ParticipantRow } from "@/lib/db/meetings";
import { formatKoreanDateTime } from "@/lib/format";
import { formatFileSize } from "@/lib/rules/agenda";
import { isUuid } from "@/lib/rules/ids";
import { isBeforeStart, isoToKstInput } from "@/lib/rules/meeting";
import { isLinkExpired, linkExpiresAt, type LinkState } from "@/lib/rules/member-link";
import type { ViewCounts } from "@/lib/rules/status";

import { addParticipantAction, removeParticipantAction, updateStartsAtAction } from "../actions";
import { confirmAgendaUploadAction, prepareAgendaUploadAction } from "../agenda-actions";
import { blockLinkAction, reissueLinkAction, revealLinkAction } from "../link-actions";

export const metadata: Metadata = { title: "회의 상세" };

export default function MeetingPage(props: PageProps<"/admin/meetings/[id]">) {
  return (
    <PageContainer>
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
        <Meeting {...props} />
      </Suspense>
    </PageContainer>
  );
}

async function Meeting({ params }: PageProps<"/admin/meetings/[id]">) {
  const staff = await requireStaff();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const meeting = await getMeeting(id);
  if (!meeting) notFound();

  const [participants, agendas] = await Promise.all([listParticipants(meeting), listAgendas(meeting.id)]);
  const viewCounts = await listAgendaViewCounts(meeting.id, meeting.startsAt, agendas.map((a) => a.id));
  const isOpen = meeting.status === "open";
  const isStaff = staff.role === "staff";
  const canEdit = isStaff && isOpen;
  const linkExpired = isLinkExpired(meeting.closedAt, new Date());
  const beforeStart = isBeforeStart(meeting.startsAt, new Date());
  const 참석 = participants.filter((p) => p.state === "participating");
  const 그외 = participants.filter((p) => p.state !== "participating");

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/admin/committees/${meeting.committeeId}?tab=meetings`} className="text-primary hover:underline">
          ← {meeting.committeeName}
        </Link>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{meeting.title}</h1>
        <span
          className={`rounded px-2 py-0.5 text-sm font-semibold ${isOpen ? "bg-blue-50 text-primary" : "bg-background text-muted"}`}
        >
          {isOpen ? "진행 중" : "마감"}
        </span>
      </div>
      <p className="mt-1 text-muted">
        {formatKoreanDateTime(meeting.startsAt)} (한국 시간) · {beforeStart ? "회의 시작 전" : "회의 시작됨 — 평가 가능"}
      </p>

      {canEdit && beforeStart ? (
        <section className="mt-4 rounded-lg border border-border bg-surface p-5">
          <StartsAtForm action={updateStartsAtAction.bind(null, meeting.id)} initial={isoToKstInput(meeting.startsAt)} />
        </section>
      ) : null}

      <AgendaSection agendas={agendas} viewCounts={viewCounts} meetingId={meeting.id} canEdit={canEdit} role={staff.role} />

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-1 text-lg font-semibold">
          {isStaff ? "참석 위원과 링크" : "참석 위원"} <span className="text-base font-normal text-muted">{참석.length}명</span>
        </h2>
        <p className="mb-3 text-sm text-muted">
          회의에서 제외한 위원은 링크로 접속할 수 없고, 이미 낸 평가는 집계에서 빠집니다. 다시 추가하면 기존 평가가 다시 반영되고 링크는 새로 발급됩니다.
        </p>
        {isStaff ? (
          <p className="mb-3 text-sm text-muted">
            {linkExpired
              ? "평가 마감 후 7일이 지나 위원 링크가 모두 만료되었습니다."
              : "링크는 위원마다 다릅니다. [재발급]하면 예전 링크는 바로 쓸 수 없게 되고, [차단]한 위원도 [재발급]하면 새 링크로 접속할 수 있습니다."}
            {meeting.closedAt && !linkExpired ? ` 링크 만료: ${formatKoreanDateTime(linkExpiresAt(meeting.closedAt)!.toISOString())}` : ""}
          </p>
        ) : null}
        <ParticipantList rows={참석} meetingId={meeting.id} canEdit={canEdit} showLinks={isStaff} />

        {그외.length > 0 ? (
          <>
            <h3 className="mt-5 mb-2 font-semibold">이 회의에 없는 위원</h3>
            <ParticipantList rows={그외} meetingId={meeting.id} canEdit={canEdit} showLinks={isStaff} />
          </>
        ) : null}

        {!isStaff ? <p className="mt-3 text-sm text-muted">팀장 계정은 열람만 할 수 있습니다.</p> : null}
        {isStaff && !isOpen ? <p className="mt-3 text-sm text-muted">마감된 회의라 참석 위원을 바꿀 수 없습니다.</p> : null}
      </section>
    </>
  );
}

function AgendaSection({
  agendas,
  viewCounts,
  meetingId,
  canEdit,
  role,
}: {
  agendas: AgendaRow[];
  viewCounts: Map<string, ViewCounts>;
  meetingId: string;
  canEdit: boolean;
  role: string;
}) {
  return (
    <section className="mt-6 rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-3 text-lg font-semibold">
        안건 <span className="text-base font-normal text-muted">{agendas.length}건</span>
      </h2>
      {agendas.length === 0 ? (
        <p className="text-muted">아직 올린 안건이 없습니다.</p>
      ) : (
        <ol className="divide-y divide-border">
          {agendas.map((a) => (
            <li key={a.id} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-semibold">
                  {a.position}. {a.title}
                </span>
                <span className="ml-2 text-sm text-muted">PDF {formatFileSize(a.sizeBytes)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <ViewCountText label="열람" counts={viewCounts.get(a.id)} pick="viewed" />
                <ViewCountText label="회의 전 열람" counts={viewCounts.get(a.id)} pick="viewedBeforeStart" />
                <span className="text-muted">{formatKoreanDateTime(a.uploadedAt)} 올림</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {canEdit ? (
        <div className="mt-5 border-t border-border pt-5">
          <h3 className="mb-3 font-semibold">+ 안건 PDF 올리기</h3>
          <AgendaUploadForm
            prepare={prepareAgendaUploadAction.bind(null, meetingId)}
            confirm={confirmAgendaUploadAction.bind(null, meetingId)}
          />
        </div>
      ) : null}
      {agendas.length > 0 ? (
        <p className="mt-2 text-sm text-muted">
          M은 그 안건의 평가 대상 수입니다(회의에서 제외된 위원과 제척된 위원은 빼고 셉니다). &quot;회의 전 열람&quot;은 회의 시작 시각 전에 처음 연 위원 수입니다.
        </p>
      ) : null}
      {role !== "staff" ? <p className="mt-3 text-sm text-muted">팀장 계정은 열람만 할 수 있습니다.</p> : null}
      {role === "staff" && !canEdit ? <p className="mt-3 text-sm text-muted">마감된 회의라 안건을 올릴 수 없습니다.</p> : null}
    </section>
  );
}

const 상태_글자: Record<ParticipantRow["state"], string> = {
  participating: "참석",
  removed: "이 회의에서 제외됨",
  "not-added": "추가 안 함",
};

const 링크_글자: Record<LinkState, string> = {
  active: "링크 사용 가능",
  none: "링크 없음",
  blocked: "링크 차단됨",
  removed: "링크 막힘",
  expired: "링크 만료됨",
};

function ParticipantList({
  rows,
  meetingId,
  canEdit,
  showLinks,
}: {
  rows: ParticipantRow[];
  meetingId: string;
  canEdit: boolean;
  /** 담당 팀원만 true — 팀장에게는 링크 상태와 버튼을 아예 보내지 않는다 */
  showLinks: boolean;
}) {
  if (rows.length === 0) return <p className="text-muted">없음</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((p) => (
        <li key={p.memberId} className="flex min-h-11 flex-wrap items-start justify-between gap-2 py-2">
          <span className="py-2">
            <span className="font-semibold">{p.name}</span>
            <span className="ml-2 text-sm text-muted">{상태_글자[p.state]}</span>
            {showLinks && p.state === "participating" ? (
              <span className={`ml-2 text-sm ${p.link === "active" ? "text-success" : "text-muted"}`}>· {링크_글자[p.link]}</span>
            ) : null}
          </span>
          <span className="flex flex-wrap items-start justify-end gap-2">
            {showLinks && p.state === "participating" ? <LinkButtons row={p} meetingId={meetingId} /> : null}
            {canEdit ? (
              p.state === "participating" ? (
                <ActionButton
                  action={removeParticipantAction.bind(null, meetingId, p.memberId)}
                  label="이 회의에서 제외"
                  ariaLabel={`${p.name} 이 회의에서 제외`}
                />
              ) : (
                <ActionButton
                  action={addParticipantAction.bind(null, meetingId, p.memberId)}
                  label={p.state === "removed" ? "다시 추가" : "이 회의에 추가"}
                  ariaLabel={`${p.name} ${p.state === "removed" ? "다시 추가" : "이 회의에 추가"}`}
                  variant="primary"
                />
              )
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 링크 상태별 버튼: 사용 가능 → [링크 복사][재발급][차단] / 차단됨 → [재발급] / 없음 → [링크 발급] / 만료 → 없음 */
function LinkButtons({ row, meetingId }: { row: ParticipantRow; meetingId: string }) {
  const 재발급 = reissueLinkAction.bind(null, meetingId, row.memberId);
  if (row.link === "expired" || row.link === "removed") return null;
  if (row.link === "none") {
    return <ActionButton action={재발급} label="링크 발급" ariaLabel={`${row.name} 링크 발급`} variant="primary" />;
  }
  return (
    <>
      {row.link === "active" ? (
        <CopyLinkButton reveal={revealLinkAction.bind(null, meetingId, row.memberId)} ariaLabel={`${row.name} 링크 복사`} />
      ) : null}
      <ActionButton action={재발급} label="재발급" ariaLabel={`${row.name} 링크 재발급`} />
      {row.link === "active" ? (
        <ActionButton action={blockLinkAction.bind(null, meetingId, row.memberId)} label="차단" ariaLabel={`${row.name} 링크 차단`} variant="danger" />
      ) : null}
    </>
  );
}

/** "열람 3 / 5" — 화면 읽기 프로그램에는 "열람 5명 중 3명"으로 읽힌다 */
function ViewCountText({ label, counts, pick }: { label: string; counts: ViewCounts | undefined; pick: "viewed" | "viewedBeforeStart" }) {
  const n = counts?.[pick] ?? 0;
  const m = counts?.eligible ?? 0;
  return (
    <span aria-label={`${label} ${m}명 중 ${n}명`}>
      <span className="text-muted">{label}</span> <strong>{n}</strong> / {m}
    </span>
  );
}
