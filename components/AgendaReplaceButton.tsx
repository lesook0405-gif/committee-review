"use client";
// [교체] — 첫 평가 전 안건 PDF를 새 파일로 바꾼다. (PRD 5번: 교체하면 그 안건의 열람 기록이 초기화된다)
// 누르면 파일 선택 칸이 펼쳐지고, 새 안건 올리기와 같은 3단계(주소 발급 → 직접 업로드 → 서버 확인·교체)로 처리한다.
import { useState, useTransition } from "react";

import { Button } from "@/components/Button";
import { pdfFileProblems, putPdf } from "@/components/pdf-upload";
import { formatFileSize } from "@/lib/rules/agenda";

type Prepare = (input: { fileName: string; size: number }) => Promise<{ errors: string[]; path?: string; uploadUrl?: string }>;
type Confirm = (input: { path: string }) => Promise<{ errors: string[]; saved?: boolean }>;

export function AgendaReplaceButton({ prepare, confirm, agendaLabel }: { prepare: Prepare; confirm: Confirm; agendaLabel: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <Button variant="secondary" onClick={() => { setOpen(true); setDone(false); }} aria-label={`${agendaLabel} PDF 교체`}>
          교체
        </Button>
        {done ? <span role="status" className="text-sm text-success">PDF를 교체했습니다. 열람 기록이 초기화되었습니다.</span> : null}
      </span>
    );
  }

  function 교체() {
    const 문제 = pdfFileProblems(file);
    setErrors(문제);
    if (문제.length > 0 || !file) return;
    startTransition(async () => {
      try {
        const 주소 = await prepare({ fileName: file.name, size: file.size });
        if (주소.errors.length > 0 || !주소.uploadUrl || !주소.path) {
          setErrors(주소.errors.length > 0 ? 주소.errors : ["업로드를 준비하지 못했습니다."]);
          return;
        }
        const 업로드_문제 = await putPdf(주소.uploadUrl, file);
        if (업로드_문제) {
          setErrors([업로드_문제]);
          return;
        }
        const 결과 = await confirm({ path: 주소.path });
        if (결과.errors.length > 0) {
          setErrors(결과.errors);
          return;
        }
        setOpen(false);
        setFile(null);
        setDone(true);
      } catch {
        setErrors(["네트워크 문제로 교체하지 못했습니다. 다시 시도해 주세요."]);
      }
    });
  }

  return (
    <div className="w-full rounded-md border border-border bg-background p-3">
      <p className="text-sm">
        <strong>{agendaLabel}</strong>의 PDF를 바꿉니다. 바꾸면 위원들의 열람 기록이 초기화되어 &quot;열람 0&quot;부터 다시 셉니다.
      </p>
      <input
        type="file"
        accept="application/pdf,.pdf"
        aria-label={`${agendaLabel} 새 PDF 파일`}
        disabled={pending}
        onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErrors([]); }}
        className="mt-2 block min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-base file:mr-3 file:min-h-9 file:rounded file:border-0 file:bg-background file:px-3 file:font-semibold"
      />
      {file ? <p className="mt-1 text-sm text-muted">선택한 파일: {file.name} ({formatFileSize(file.size)})</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={교체} disabled={pending}>
          {pending ? "교체 중…" : "교체하기"}
        </Button>
        <Button variant="secondary" onClick={() => { setOpen(false); setFile(null); setErrors([]); }} disabled={pending}>
          취소
        </Button>
      </div>
      {errors.length > 0 ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
