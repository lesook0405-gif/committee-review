// 위원 정보 수정 화면 (/admin/committees/{id}/members/{memberId}) — 담당 팀원만
// Design Ref: §8 "전체 휴대폰 번호는 담당 팀원의 수정 화면에만 보낸다"
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { MemberForm } from "@/components/MemberForm";
import { PageContainer } from "@/components/PageContainer";
import { requireStaff } from "@/lib/auth/session";
import { getMemberForEdit } from "@/lib/db/members";
import { isUuid } from "@/lib/rules/ids";

import { updateMemberAction } from "../actions";

export const metadata: Metadata = { title: "위원 정보 수정" };

export default function EditMemberPage(props: PageProps<"/admin/committees/[id]/members/[memberId]">) {
  return (
    <PageContainer title="위원 정보 수정">
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
        <EditMember {...props} />
      </Suspense>
    </PageContainer>
  );
}

async function EditMember({ params }: PageProps<"/admin/committees/[id]/members/[memberId]">) {
  const staff = await requireStaff();
  const { id, memberId } = await params;
  const 명단으로 = `/admin/committees/${id}?tab=members`;

  // 팀장에게는 전체 번호가 담긴 수정 화면을 아예 보내지 않는다
  if (staff.role !== "staff") {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <p>팀장 계정은 열람만 할 수 있습니다. 위원 정보 수정은 담당 팀원 계정으로 해 주세요.</p>
        <Link href={명단으로} className="mt-4 inline-flex min-h-11 items-center text-primary hover:underline">
          ← 위원 명단으로
        </Link>
      </div>
    );
  }

  if (!isUuid(id) || !isUuid(memberId)) notFound();
  const member = await getMemberForEdit(id, memberId);
  if (!member) notFound();

  return (
    <div className="space-y-4">
      <Link href={명단으로} className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">
        ← 위원 명단으로
      </Link>
      <div className="rounded-lg border border-border bg-surface p-5">
        <MemberForm
          mode="edit"
          action={updateMemberAction.bind(null, id, memberId)}
          initial={{ name: member.name, email: member.email, phone: member.phone }}
        />
      </div>
    </div>
  );
}
