// Design Ref: §3.2 ④ 회의 상세의 [대리 입력·수정] — 기기 문제로 위원이 앱에서 제출하지 못했을 때 담당 팀원이 종이 점수를 대신 입력한다.
// 담당 팀원만 쓸 수 있다(팀장은 거부). 평가 대상 위원(참석 중, 그 안건에서 제척되지 않은 위원)만 나온다.
// 위원이 앱에서 직접 낸 점수는 마감 전에는 담당 팀원에게도 보여 주지 않고 "제출함"으로만 표시한다.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LinkButton } from "@/components/Button";
import { PageContainer } from "@/components/PageContainer";
import { requireStaff } from "@/lib/auth/session";
import { getProxyBoard } from "@/lib/db/evaluations";
import { getMeeting } from "@/lib/db/meetings";
import { formatKoreanDateTime } from "@/lib/format";
import { evaluationWindow } from "@/lib/rules/evaluation";
import { isUuid } from "@/lib/rules/ids";

export const metadata: Metadata = { title: "대리 입력" };

export default function ProxyListPage(props: PageProps<"/admin/meetings/[id]/proxy">) {
  return (
    <PageContainer>
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
        <ProxyList {...props} />
      </Suspense>
    </PageContainer>
  );
}

async function ProxyList({ params }: PageProps<"/admin/meetings/[id]/proxy">) {
  const staff = await requireStaff();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const meeting = await getMeeting(id);
  if (!meeting) notFound();

  const back = (
    <p className="mb-2 text-sm">
      <Link href={`/admin/meetings/${meeting.id}`} className="text-primary hover:underline">
        ← {meeting.title}
      </Link>
    </p>
  );
  // 팀장은 화면에서도 서버에서도 막는다 (평가 정보를 읽기 전에 돌려보냄)
  if (staff.role !== "staff") {
    return (
      <>
        {back}
        <h1 className="text-2xl font-bold">대리 입력</h1>
        <p role="alert" className="mt-4 rounded-lg border border-border bg-surface p-5">
          대리 입력은 담당 팀원만 할 수 있습니다. 팀장 계정은 열람만 할 수 있습니다.
        </p>
      </>
    );
  }

  const 시점 = evaluationWindow(meeting, new Date());
  const board = await getProxyBoard(meeting.id);

  return (
    <>
      {back}
      <h1 className="text-2xl font-bold">대리 입력·수정</h1>
      <p className="mt-1 text-muted">
        {meeting.title} · {formatKoreanDateTime(meeting.startsAt)} (한국 시간)
      </p>
      <p className="mt-3 rounded-md bg-background px-4 py-3 text-sm">
        기기 문제로 위원이 앱에서 제출하지 못했을 때, 종이로 받은 점수를 대신 입력합니다. 아직 제출하지 않은 평가 대상 위원에게만 할 수 있고, 대리 입력한 기록은
        마감 전까지 담당 팀원만 고칠 수 있습니다. 대리 입력도 첫 평가로 보아 평가 방식이 잠기고 안건 PDF를 교체할 수 없게 됩니다.
      </p>
      {시점 === "closed" ? (
        <p role="status" className="mt-3 rounded-md border border-border bg-surface px-4 py-3">
          마감된 회의라 대리 입력하거나 고칠 수 없습니다.
        </p>
      ) : 시점 === "not-started" ? (
        <p role="status" className="mt-3 rounded-md border border-border bg-surface px-4 py-3">
          회의가 시작된 뒤에 입력할 수 있습니다.
        </p>
      ) : null}

      {board.length === 0 ? (
        <p className="mt-6 text-muted">아직 올린 안건이 없습니다.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {board.map((a) => (
            <section key={a.agendaId} className="rounded-lg border border-border bg-surface p-5">
              <h2 className="mb-2 text-lg font-semibold">
                {a.position}. {a.title}
              </h2>
              {a.cells.length === 0 ? (
                <p className="text-muted">평가 대상 위원이 없습니다.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {a.cells.map((c) => (
                    <li key={c.memberId} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <span className="font-semibold">{c.name}</span>
                        <span className="ml-2 text-sm text-muted">
                          {c.state === "none" ? "미제출" : c.state === "submitted" ? "위원이 앱에서 제출함" : `대리 입력됨 · 합계 ${c.proxyTotal}점`}
                        </span>
                      </span>
                      {시점 === "open" && c.state !== "submitted" ? (
                        <LinkButton
                          href={`/admin/meetings/${meeting.id}/proxy/${a.agendaId}/${c.memberId}`}
                          variant={c.state === "none" ? "primary" : "secondary"}
                          prefetch={false}
                        >
                          {c.state === "none" ? `${c.name} 대리 입력` : `${c.name} 대리 입력 수정`}
                        </LinkButton>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
