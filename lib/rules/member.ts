// Design Ref: §5.2 위원 명단 입력 — "형식 검사 → 저장 / 명단 표(서버에서 휴대폰 가운데를 가려서 보냄)"
// PRD 7번: 위원 이름·메일·휴대폰 번호는 개인정보다. 화면에 휴대폰 번호를 보여 줄 때는 가운데를 가린다.
import { z } from "zod";

/** 휴대폰 번호에서 숫자만 남긴다 ("010-1234-5678", "010 1234 5678" → "01012345678") */
function digitsOnly(phone: string): string {
  return phone.replace(/[\s-]/g, "");
}

/** 휴대폰 번호를 "010-1234-5678" 모양으로 맞춘다. 휴대폰 번호 형식이 아니면 null */
export function normalizePhone(phone: string): string | null {
  const digits = digitsOnly(phone.trim());
  const match = /^(01[016789])(\d{3,4})(\d{4})$/.exec(digits);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/** 화면용으로 가운데를 가린다 ("010-1234-5678" → "010-****-5678"). 형식을 알 수 없으면 전부 가린다. */
export function maskPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  if (!normalized) return "***";
  const [head, middle, tail] = normalized.split("-");
  return `${head}-${"*".repeat(middle.length)}-${tail}`;
}

export const memberSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "위원 이름을 입력해 주세요." })
    .max(50, { error: "위원 이름은 50자 이하로 입력해 주세요." }),
  email: z
    .string()
    .trim()
    .pipe(z.email({ error: "메일 주소 형식이 올바르지 않습니다." })),
  phone: z
    .string()
    .transform((value, ctx) => {
      const normalized = normalizePhone(value);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: "휴대폰 번호 형식이 올바르지 않습니다. (예: 010-1234-5678)" });
        return z.NEVER;
      }
      return normalized;
    }),
});

export type MemberInput = z.infer<typeof memberSchema>;

/** 화면 입력칸(FormData) → 검사 전 값 */
export function readMemberForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  };
}
