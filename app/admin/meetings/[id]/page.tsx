// Design Ref: §3.2 ④ 회의 상세 (/admin/meetings/{id})
// 작업 9: 회의 정보, 일시 수정(시작 전만), 참석 위원 추가·제외·다시 추가.
// 작업 10: 안건 목록과 안건 PDF 올리기(담당 팀원·마감 전만).
// 작업 11: 위원 링크 복사·발급·재발급·차단(담당 팀원만, 링크 만료 전까지). 팀장에게는 링크 영역을 보내지 않는다.
// 작업 13: 안건별 "열람 N / M"·"회의 전 열람 N / M" (M = 그 안건의 평가 대상 수).
// 작업 14: 평가 기록이 0건인 안건만 [교체] (제외·제척 위원 기록, 대리 입력 포함). 교체하면 열람 기록 초기화.
// 작업 18: 안건별 [제척 관리] — 담당 팀원이 마감 전까지 위원을 제척하고 해제한다. 팀장에게는 제척된 위원 이름만 보인다.
// 작업 19: 담당 팀원의 [대리 입력·수정] 바로가기 (/admin/meetings/{id}/proxy).
// 작업 20: 안건별 "제출 N / M", 회의 전체 "미제출 N명", 전원 제출 시에만 눌 수 있는 [평가 마감](담당 팀원만, 되돌릴 수 없음).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ActionButton } from "@/components/ActionButton";
import { LinkButton } from "@/components/Button";
import { CloseMeetingButton } from "@/components/CloseMeetingButton";
import { AgendaReplaceButton } from "@/components/AgendaReplaceButton";
import { AgendaUploadForm } from "@/components/AgendaUploadForm";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { PageContainer } from "@/components/PageContainer";
import { StartsAtForm } from "@/components/StartsAtForm";
import { requireStaff } from "@/lib/auth/session";
import { listAgendaViewCounts } from "@/lib/db/agenda-views";
import { getSubmissionStatus } from "@/lib/db/submission-status";
import { listAgendaRecusals } from "@/lib/db/recusals";
import { listAgendaEvaluationCounts, listAgendas, type AgendaRow } from "@/lib/db/agendas";
import { getMeeting, listParticipants, type ParticipantRow } from "@/lib/db/meetings";
import { formatKoreanDateTime } from "@/lib/format";
import { formatFileSize } from "@/lib/rules/agenda";
import { isUuid } from "@/lib/rules/ids";
import { isBeforeStart, isoToKstInput } from "@/lib/rules/meeting";
import { isLinkExpired, linkExpiresAt, type LinkState } from "@/lib/rules/member-link";
import type { SubmissionCounts, ViewCounts } from "@/lib/rules/status";

import { addParticipantAction, removeParticipantAction, updateStartsAtAction } from "../actions";
import {
  confirmAgendaReplaceAction,
  confirmAgendaUploadAction,
  prepareAgendaReplaceAction,
  prepareAgendaUploadAction,
} from "../agenda-actions";
import { blockLinkAction, reissueLinkAction, revealLinkAction } from "../link-actions";
import { closeMeetingAction } from "../close-actions";
import { setRecusalAction } from "../recusal-actions";

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
  const agendaIds = agendas.map((a) => a.id);
  const [viewCounts, evaluationCounts, recusals, submissions] = await Promise.all([
    listAgendaViewCounts(meeting.id, meeting.startsAt, agendaIds),
    listAgendaEvaluationCounts(agendaIds),
    listAgendaRecusals(agendaIds),
    getSubmissionStatus(meeting.id, agendaIds),
  ]);
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

      <AgendaSection agendas={agendas} viewCounts={viewCounts} submissionCounts={submissions.perAgenda} evaluationCounts={evaluationCounts} recusals={recusals} participants={participants.filter((p) => p.state === "participating")} meetingId={meeting.id} canEdit={canEdit} role={staff.role} />

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-2 text-lg font-semibold">제출 현황</h2>
        {agendas.length === 0 ? (
          <p className="text-muted">안건이 올라오면 제출 현황이 표시됩니다.</p>
        ) : submissions.missing.length === 0 ? (
          <p className="font-semibold text-success">평가 대상 위원이 모든 안건을 제출했습니다.</p>
        ) : (
          <p>
            <strong className="text-lg">미제출 {submissions.missing.length}명</strong>
            <span className="ml-2 text-muted">{submissions.missing.map((m) => m.name).join(", ")}</span>
          </p>
        )}
        <p className="mt-1 text-sm text-muted">
          미제출은 평가 대상인 안건 중 한 안건이라도 제출하지 않은 위원 수입니다. 제척된 안건은 세지 않습니다. 대리 입력도 제출로 셉니다.
        </p>

        {canEdit ? (
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border-t border-border pt-4">
            <div>
              <h3 className="font-semibold">대리 입력</h3>
              <p className="text-sm text-muted">위원이 기기 문제로 제출하지 못했다면, 종이로 받은 점수를 대신 입력합니다.</p>
              <div className="mt-2">
                <LinkButton href={`/admin/meetings/${meeting.id}/proxy`} variant="secondary" prefetch={false}>
                  대리 입력·수정
                </LinkButton>
              </div>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">평가 마감</h3>
              <CloseMeetingButton
                action={closeMeetingAction.bind(null, meeting.id)}
                disabledReason={
                  agendas.length === 0
                    ? "안건을 올린 뒤에 마감할 수 있습니다."
                    : isBeforeStart(meeting.startsAt, new Date())
                      ? "회의가 시작된 뒤에 마감할 수 있습니다."
                      : submissions.missing.length > 0
                        ? `평가 대상 위원 전원이 제출해야 마감할 수 있습니다. (미제출 ${submissions.missing.length}명)`
                        : null
                }
              />
            </div>
          </div>
        ) : null}
        {!isOpen ? (
          <p className="mt-4 border-t border-border pt-4 font-semibold">
            평가가 마감되었습니다{meeting.closedAt ? ` · ${formatKoreanDateTime(meeting.closedAt)}` : ""}. 마감된 회의는 점수를 낼 수도 고칠 수도 없습니다.
          </p>
        ) : null}
      </section>

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
  submissionCounts,
  evaluationCounts,
  recusals,
  participants,
  meetingId,
  canEdit,
  role,
}: {
  agendas: AgendaRow[];
  viewCounts: Map<string, ViewCounts>;
  /** 안건별 제출 N / M */
  submissionCounts: Map<string, SubmissionCounts>;
  /** 안건별 평가 기록 수 — 0건일 때만 [교체] (제외·제척 위원 기록, 대리 입력 포함) */
  evaluationCounts: Map<string, number>;
  /** 안건별 제척된 위원 ID */
  recusals: Map<string, Set<string>>;
  /** 이 회의에 참석 중인 위원 (제척 대상 후보) */
  participants: ParticipantRow[];
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
                <SubmitCountText counts={submissionCounts.get(a.id)} />
                <span className="text-muted">{formatKoreanDateTime(a.uploadedAt)} 올림</span>
              </span>
              {canEdit ? (
                (evaluationCounts.get(a.id) ?? 0) === 0 ? (
                  <AgendaReplaceButton
                    prepare={prepareAgendaReplaceAction.bind(null, meetingId, a.id)}
                    confirm={confirmAgendaReplaceAction.bind(null, meetingId, a.id)}
                    agendaLabel={`${a.position}번 안건`}
                  />
                ) : (
                  <span className="text-sm text-muted">평가 기록이 있어 PDF를 교체할 수 없습니다</span>
                )
              ) : null}
              <RecusalPanel
                agenda={a}
                meetingId={meetingId}
                participants={participants}
                recusedIds={recusals.get(a.id) ?? new Set()}
                evaluated={evaluationCounts.get(a.id) ?? 0}
                canEdit={canEdit}
              />
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

/** "제출 3 / 5" — 화면 읽기 프로그램에는 "제출 5명 중 3명"으로 읽힌다 */
function SubmitCountText({ counts }: { counts: SubmissionCounts | undefined }) {
  const n = counts?.submitted ?? 0;
  const m = counts?.eligible ?? 0;
  return (
    <span aria-label={`제출 ${m}명 중 ${n}명`}>
      <span className="text-muted">제출</span> <strong>{n}</strong> / {m}
    </span>
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

/** 안건 하나의 제척 관리: 제척된 위원 안내와, 담당 팀원에게는 위원별 [제척]/[제척 해제] 버튼 */
function RecusalPanel({
  agenda,
  meetingId,
  participants,
  recusedIds,
  evaluated,
  canEdit,
}: {
  agenda: AgendaRow;
  meetingId: string;
  participants: ParticipantRow[];
  recusedIds: Set<string>;
  evaluated: number;
  canEdit: boolean;
}) {
  const 제척됨 = participants.filter((p) => recusedIds.has(p.memberId));
  // 참석에서 빠진 뒤에도 남아 있는 제척 기록은 이름을 알 수 없어 건수에서만 뺀다 (평가 대상이 아니므로 숫자에 영향 없음)
  if (!canEdit && 제척됨.length === 0) return null;
  return (
    <details className="w-full rounded-md border border-border bg-background px-3 py-2">
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 font-semibold">
        {canEdit ? "제척 관리" : "제척"}
        <span className="text-sm font-normal text-muted">
          {제척됨.length === 0 ? "제척된 위원 없음" : `제척 ${제척됨.length}명: ${제척됨.map((p) => p.name).join(", ")}`}
        </span>
      </summary>
      {canEdit ? (
        <div className="pt-2">
          <p className="mb-2 text-sm text-muted">
            제척한 위원은 이 안건의 평가 대상에서 빠집니다(열람·제출 숫자의 분모도 줄어듭니다). 마감 전까지 해제할 수 있습니다.
            {evaluated > 0 ? " 이미 낸 평가는 지워지지 않고 집계에서만 빠지며, 해제하면 다시 반영됩니다." : ""}
          </p>
          <ul className="divide-y divide-border">
            {participants.map((p) => {
              const 제척 = recusedIds.has(p.memberId);
              return (
                <li key={p.memberId} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-1">
                  <span>
                    {p.name} {제척 ? <span className="ml-1 text-sm font-semibold text-danger">제척됨</span> : null}
                  </span>
                  <ActionButton
                    action={setRecusalAction.bind(null, meetingId, agenda.id, p.memberId, !제척)}
                    label={제척 ? "제척 해제" : "제척"}
                    ariaLabel={`${agenda.position}번 안건 ${p.name} ${제척 ? "제척 해제" : "제척"}`}
                    variant={제척 ? "secondary" : "danger"}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </details>
  );
}
