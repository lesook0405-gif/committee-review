// 화면에 보여 줄 날짜·시간 글자 — 서버(UTC)에서 만들어도 항상 한국 시간으로 보여 준다
const 한국_시간 = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 예: "2026. 11. 20. 14:00" */
export function formatKoreanDateTime(iso: string): string {
  return 한국_시간.format(new Date(iso));
}
