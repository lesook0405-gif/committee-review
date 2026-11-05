"use client";
// 안건 열람 화면이 위원 브라우저에 실제로 그려진 순간 첫 열람을 기록한다. (화면에는 아무것도 그리지 않음)
// 링크 미리 불러오기(prefetch)나 검색 로봇이 서버에서 화면만 받아 가는 경우에는 기록되지 않는다.
import { useEffect, useTransition } from "react";

export function RecordView({ record }: { record: () => Promise<{ ok: boolean }> }) {
  const [, startTransition] = useTransition();
  useEffect(() => {
    startTransition(async () => {
      await record(); // 이미 연 적이 있으면 서버에서 처음 시각을 그대로 둔다
    });
  }, [record]);
  return null;
}
