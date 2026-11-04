// Design Ref: §6.2 members 표 읽기·쓰기 / §8 "휴대폰 번호는 서버에서 가린 값으로 바꿔 보낸다. 전체 번호는 담당 팀원의 수정 화면에만"
import "server-only";

import { maskPhone, type MemberInput } from "@/lib/rules/member";

import { createAdminClient } from "./supabase";

/** 명단 표용 — 휴대폰 번호는 이미 가린 값만 들어 있다 (전체 번호는 브라우저로 보내지 않는다) */
export type MemberRow = {
  id: string;
  name: string;
  email: string;
  phoneMasked: string;
};

/** 수정 화면용 — 전체 번호 포함 (담당 팀원 수정 화면에서만 사용) */
export type MemberForEdit = {
  id: string;
  committeeId: string;
  name: string;
  email: string;
  phone: string;
};

/** 위원회의 위원 명단 (이름순, 번호는 가려서) */
export async function listMembers(committeeId: string): Promise<MemberRow[]> {
  const { data, error } = await createAdminClient()
    .from("members")
    .select("id, name, email, phone")
    .eq("committee_id", committeeId)
    .order("name");
  if (error) throw new Error(`위원 명단을 불러오지 못했습니다. (${error.message})`);
  return data.map((m) => ({ id: m.id, name: m.name, email: m.email, phoneMasked: maskPhone(m.phone) }));
}

/** 위원 한 명 (그 위원회 소속이 아니면 null) */
export async function getMemberForEdit(committeeId: string, memberId: string): Promise<MemberForEdit | null> {
  const { data, error } = await createAdminClient()
    .from("members")
    .select("id, committee_id, name, email, phone")
    .eq("id", memberId)
    .eq("committee_id", committeeId)
    .maybeSingle();
  if (error) throw new Error(`위원 정보를 불러오지 못했습니다. (${error.message})`);
  if (!data) return null;
  return { id: data.id, committeeId: data.committee_id, name: data.name, email: data.email, phone: data.phone };
}

/** 위원 추가 */
export async function createMember(committeeId: string, input: MemberInput): Promise<void> {
  const { error } = await createAdminClient()
    .from("members")
    .insert({ committee_id: committeeId, name: input.name, email: input.email, phone: input.phone });
  if (error) throw new Error(`위원을 저장하지 못했습니다. (${error.message})`);
}

/** 위원 정보 수정 — 그 위원회 소속 위원만 바꾼다. 바뀐 위원이 없으면 false */
export async function updateMember(committeeId: string, memberId: string, input: MemberInput): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("members")
    .update({ name: input.name, email: input.email, phone: input.phone })
    .eq("id", memberId)
    .eq("committee_id", committeeId)
    .select("id");
  if (error) throw new Error(`위원 정보를 저장하지 못했습니다. (${error.message})`);
  return data.length > 0;
}
