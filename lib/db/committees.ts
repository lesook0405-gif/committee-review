// Design Ref: §6.2 committees 표 읽기·쓰기 (설계안 C: 저장소 읽기·쓰기는 lib/db/에만)
// 권한 확인은 이 함수를 부르는 서버 처리(app/admin/committees/actions.ts)와 화면에서 먼저 한다.
import "server-only";

import type { CommitteeCreateInput, ScoringInput } from "@/lib/rules/committee";

import { createAdminClient } from "./supabase";

export type Criterion = { name: string; maxScore: number };

export type CommitteeSummary = {
  id: string;
  name: string;
  memberCount: number;
  latestMeetingAt: string | null;
};

export type CommitteeDetail = {
  id: string;
  name: string;
  criteria: Criterion[];
  passScore: number;
  excludeExtremes: boolean;
  lockedAt: string | null;
};

// 데이터베이스에 저장된 평가 항목(JSON)을 화면에서 쓰는 모양으로 바꾼다
function toCriteria(value: unknown): Criterion[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    name: String((item as { name?: unknown }).name ?? ""),
    maxScore: Number((item as { maxScore?: unknown }).maxScore ?? 0),
  }));
}

/** 위원회 목록 (이름순) — 위원 수, 가장 최근 회의 일시 포함 */
export async function listCommittees(): Promise<CommitteeSummary[]> {
  const { data, error } = await createAdminClient()
    .from("committees")
    .select("id, name, members(count), meetings(starts_at)")
    .order("name");
  if (error) throw new Error(`위원회 목록을 불러오지 못했습니다. (${error.message})`);

  return data.map((row) => {
    const meetingTimes = (row.meetings ?? []).map((m) => m.starts_at).sort();
    return {
      id: row.id,
      name: row.name,
      memberCount: row.members?.[0]?.count ?? 0,
      latestMeetingAt: meetingTimes.at(-1) ?? null,
    };
  });
}

/** 위원회 하나 (없으면 null) */
export async function getCommittee(id: string): Promise<CommitteeDetail | null> {
  const { data, error } = await createAdminClient()
    .from("committees")
    .select("id, name, criteria, pass_score, exclude_extremes, locked_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`위원회를 불러오지 못했습니다. (${error.message})`);
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    criteria: toCriteria(data.criteria),
    passScore: data.pass_score,
    excludeExtremes: data.exclude_extremes,
    lockedAt: data.locked_at,
  };
}

/** 위원회 등록 → 새 위원회 ID */
export async function createCommittee(input: CommitteeCreateInput): Promise<string> {
  const { data, error } = await createAdminClient()
    .from("committees")
    .insert({
      name: input.name,
      criteria: input.criteria,
      pass_score: input.passScore,
      exclude_extremes: input.excludeExtremes,
    })
    .select("id")
    .single();
  if (error) throw new Error(`위원회를 저장하지 못했습니다. (${error.message})`);
  return data.id;
}

export type UpdateScoringResult = "updated" | "locked" | "not-found";

/**
 * 평가 방식 수정 — 잠기지 않은 위원회만 바꾼다.
 * "잠기지 않았을 때만" 조건을 저장 명령 자체에 넣어, 확인과 저장 사이에 첫 평가가 들어와도 바뀌지 않게 한다.
 */
export async function updateScoring(id: string, input: ScoringInput): Promise<UpdateScoringResult> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("committees")
    .update({
      criteria: input.criteria,
      pass_score: input.passScore,
      exclude_extremes: input.excludeExtremes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("locked_at", null)
    .select("id");
  if (error) throw new Error(`평가 방식을 저장하지 못했습니다. (${error.message})`);
  if (data.length > 0) return "updated";

  // 바뀐 행이 없으면: 위원회가 없거나, 잠겨 있다
  const { data: existing } = await db.from("committees").select("id").eq("id", id).maybeSingle();
  return existing ? "locked" : "not-found";
}
