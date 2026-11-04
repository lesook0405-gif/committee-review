// Design Ref: §5.2 위원회·평가 방식 등록 / §7 "항목 ≤10, 배점 양의 정수, 기준 점수 0~합계 정수"
// PRD 5번 must 2 "AI가 지킬 규칙" — 서버에서 입력값을 검사하는 규칙 (데이터베이스의 같은 규칙과 이중으로 지킨다)
import { z } from "zod";

/** 평가 항목 최대 개수 (PRD: 위원회당 최대 10개) */
export const CRITERIA_MAX_COUNT = 10;
/** 배점 상한 (실수로 아주 큰 숫자를 넣는 것을 막기 위한 안전선) */
export const MAX_SCORE_LIMIT = 1000;

const 평가_항목 = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "평가 항목 이름을 입력해 주세요." })
    .max(50, { error: "평가 항목 이름은 50자 이하로 입력해 주세요." }),
  maxScore: z
    .number({ error: "배점은 숫자로 입력해 주세요." })
    .int({ error: "배점은 정수로 입력해 주세요." })
    .min(1, { error: "배점은 1점 이상이어야 합니다." })
    .max(MAX_SCORE_LIMIT, { error: `배점은 ${MAX_SCORE_LIMIT}점 이하로 입력해 주세요.` }),
});

const 평가_방식_기본 = z.object({
  criteria: z
    .array(평가_항목)
    .min(1, { error: "평가 항목을 1개 이상 입력해 주세요." })
    .max(CRITERIA_MAX_COUNT, { error: `평가 항목은 최대 ${CRITERIA_MAX_COUNT}개까지 둘 수 있습니다.` }),
  passScore: z
    .number({ error: "가결 기준 점수를 숫자로 입력해 주세요." })
    .int({ error: "가결 기준 점수는 정수로 입력해 주세요." })
    .min(0, { error: "가결 기준 점수는 0점 이상이어야 합니다." }),
  excludeExtremes: z.boolean(),
});

/** 배점 합계 */
export function totalMaxScore(criteria: readonly { maxScore: number }[]): number {
  return criteria.reduce((sum, item) => sum + item.maxScore, 0);
}

// 가결 기준 점수는 배점 합계 이하
function 기준_점수_확인(value: z.infer<typeof 평가_방식_기본>, ctx: z.RefinementCtx) {
  const total = totalMaxScore(value.criteria);
  if (value.passScore > total) {
    ctx.addIssue({
      code: "custom",
      path: ["passScore"],
      message: `가결 기준 점수는 배점 합계(${total}점) 이하여야 합니다.`,
    });
  }
}

/** 평가 방식만 고칠 때 */
export const scoringSchema = 평가_방식_기본.superRefine(기준_점수_확인);

/** 위원회를 새로 등록할 때 (이름 + 평가 방식) */
export const committeeCreateSchema = 평가_방식_기본
  .extend({
    name: z
      .string()
      .trim()
      .min(1, { error: "위원회 이름을 입력해 주세요." })
      .max(100, { error: "위원회 이름은 100자 이하로 입력해 주세요." }),
  })
  .superRefine(기준_점수_확인);

export type ScoringInput = z.infer<typeof scoringSchema>;
export type CommitteeCreateInput = z.infer<typeof committeeCreateSchema>;

/** 화면 입력칸(FormData) → 검사 전 값. 빈칸은 숫자가 아닌 값(NaN)이 되어 검사에서 걸린다. */
export function readScoringForm(formData: FormData) {
  const names = formData.getAll("criteriaName").map((v) => String(v));
  const maxes = formData.getAll("criteriaMax").map((v) => String(v).trim());
  const toNumber = (text: string) => (text === "" ? Number.NaN : Number(text));
  return {
    name: String(formData.get("name") ?? ""),
    criteria: names.map((name, i) => ({ name, maxScore: toNumber(maxes[i] ?? "") })),
    passScore: toNumber(String(formData.get("passScore") ?? "").trim()),
    excludeExtremes: formData.get("excludeExtremes") === "on",
  };
}

/** 검사 실패 메시지를 겹치지 않게 모은다 */
export function issueMessages(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => issue.message))];
}
