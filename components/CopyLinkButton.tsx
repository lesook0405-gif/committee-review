"use client";
// [링크 복사] — 누를 때만 서버에서 링크를 받아 클립보드에 복사한다. (링크값을 화면에 미리 넣어 두지 않음)
// 브라우저가 자동 복사를 막으면 링크를 칸에 보여 주어 직접 복사할 수 있게 한다.
import { useState, useTransition } from "react";

import { Button } from "@/components/Button";

type Reveal = () => Promise<{ errors: string[]; path?: string }>;

export function CopyLinkButton({ reveal, ariaLabel }: { reveal: Reveal; ariaLabel: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "manual" | "error"; text: string; url?: string } | null>(null);

  function 복사() {
    startTransition(async () => {
      const 결과 = await reveal();
      if (결과.errors.length > 0 || !결과.path) {
        setMessage({ kind: "error", text: 결과.errors.join(" ") || "링크를 불러오지 못했습니다." });
        return;
      }
      const url = `${window.location.origin}${결과.path}`;
      try {
        await navigator.clipboard.writeText(url);
        setMessage({ kind: "ok", text: "링크를 복사했습니다. 메일이나 문자에 붙여 넣어 보내 주세요." });
      } catch {
        setMessage({ kind: "manual", text: "자동 복사가 막혀 있습니다. 아래 링크를 직접 복사해 주세요.", url });
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant="secondary" onClick={복사} disabled={pending} aria-label={ariaLabel}>
        {pending ? "불러오는 중…" : "링크 복사"}
      </Button>
      {message ? (
        <span role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-danger" : "text-success"}`}>
          {message.text}
        </span>
      ) : null}
      {message?.url ? (
        <input
          readOnly
          value={message.url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="위원 링크"
          className="min-h-11 w-72 max-w-full rounded-md border border-border bg-background px-3 text-sm"
        />
      ) : null}
    </span>
  );
}
