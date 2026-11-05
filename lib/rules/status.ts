// Design Ref: §5.3 집계·현황 계산 규칙 — 화면과 분리한 숫자 규칙
//   평가 대상(안건별) = 회의 참석 위원 − 회의에서 제외된 위원 − 그 안건에서 제척된 위원
//   M = 그 안건의 평가 대상 수
//   열람 N = 평가 대상 중 그 안건을 한 번이라도 연 위원 수
//   회의 전 열람 N = 평가 대상 중 회의 시작 시각 전에 처음 연 위원 수
// "제출 N"·"미제출 N명"은 평가 기능(PLAN 작업 15·20)에서 이 파일에 더한다.

/** 그 안건의 평가 대상 위원 ID (참석 중이고 그 안건에 제척되지 않은 위원) */
export function eligibleMemberIds(participatingMemberIds: readonly string[], recusedMemberIds: readonly string[]): string[] {
  const 제척 = new Set(recusedMemberIds);
  return [...new Set(participatingMemberIds)].filter((id) => !제척.has(id));
}

export type ViewCounts = {
  /** 평가 대상 수 (분모 M) */
  eligible: number;
  /** 열람 N */
  viewed: number;
  /** 회의 전 열람 N */
  viewedBeforeStart: number;
};

/**
 * 안건 하나의 "열람 N / M"과 "회의 전 열람 N / M".
 * 제외·제척된 위원의 열람 기록은 지우지 않고 남아 있지만, 평가 대상이 아니므로 숫자에서 뺀다.
 */
export function agendaViewCounts(input: {
  eligibleMemberIds: readonly string[];
  views: readonly { memberId: string; firstViewedAt: string }[];
  startsAt: string;
}): ViewCounts {
  const 대상 = new Set(input.eligibleMemberIds);
  const 시작 = new Date(input.startsAt).getTime();
  const 연_위원 = new Map<string, number>();
  for (const v of input.views) {
    if (!대상.has(v.memberId)) continue;
    const t = new Date(v.firstViewedAt).getTime();
    const 이전 = 연_위원.get(v.memberId);
    if (이전 === undefined || t < 이전) 연_위원.set(v.memberId, t); // 같은 위원 기록이 겹쳐 와도 가장 이른 시각 하나만
  }
  let 회의전 = 0;
  for (const t of 연_위원.values()) if (t < 시작) 회의전 += 1; // 시작 시각 "전"이므로 같은 시각은 포함하지 않음
  return { eligible: 대상.size, viewed: 연_위원.size, viewedBeforeStart: 회의전 };
}

// ─────────────────────────────────────────────
// 제출 현황 (PLAN 작업 20)
//   제출 N      = 평가 대상 중 그 안건에 평가를 낸 위원 수 (위원이 직접 낸 평가와 담당 팀원의 대리 입력 모두 포함)
//   미제출 N명  = 평가 대상인 안건 중 하나라도 안 낸 위원 수 (회의 전체 기준)
// 제외·제척된 위원이 이미 낸 평가는 지우지 않고 남아 있지만, 평가 대상이 아니므로 숫자에서 뺀다.
// 마감 가능 여부를 정하는 데이터베이스 함수(close_meeting)도 같은 정의로 센다.
// ─────────────────────────────────────────────

export type SubmissionCounts = {
  /** 평가 대상 수 (분모 M) */
  eligible: number;
  /** 제출 N */
  submitted: number;
};

/** 안건 하나의 "제출 N / M" */
export function agendaSubmissionCounts(input: {
  eligibleMemberIds: readonly string[];
  /** 그 안건에 평가 기록이 있는 위원 ID (평가 대상이 아닌 위원이 섞여 있어도 된다) */
  evaluatedMemberIds: readonly string[];
}): SubmissionCounts {
  const 대상 = new Set(input.eligibleMemberIds);
  const 낸 = new Set(input.evaluatedMemberIds.filter((id) => 대상.has(id)));
  return { eligible: 대상.size, submitted: 낸.size };
}

/**
 * 미제출 위원 — 한 안건이라도 "평가 대상인데 평가 기록이 없는" 위원의 ID.
 * 모든 안건에서 제척된 위원처럼 평가 대상인 안건이 하나도 없는 위원은 세지 않는다.
 */
export function missingMemberIds(
  agendas: readonly { eligibleMemberIds: readonly string[]; evaluatedMemberIds: readonly string[] }[],
): string[] {
  const 미제출 = new Set<string>();
  for (const a of agendas) {
    const 낸 = new Set(a.evaluatedMemberIds);
    for (const id of a.eligibleMemberIds) if (!낸.has(id)) 미제출.add(id);
  }
  return [...미제출];
}
