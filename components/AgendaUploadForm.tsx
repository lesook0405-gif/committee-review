"use client";
// Design Ref: §5.1 안건 PDF 올리기 — 3단계
//   ① 서버에 업로드 주소 요청(제목·파일 이름·크기만 보냄) → ② 그 주소로 브라우저가 보관함에 직접 올림 → ③ 서버에 "다 올렸다" 알려 다시 확인·등록
// 파일이 서버를 거치지 않으므로 30MB PDF도 서버 요청 크기 제한(1MB)에 걸리지 않는다.
// 담당 팀원·진행 중 회의에서만 이 양식을 보여 주고, 서버에서도 다시 막는다.
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/Button";
import { AGENDA_MAX_BYTES, formatFileSize } from "@/lib/rules/agenda";

type Prepare = (input: { title: string; fileName: string; size: number }) => Promise<{ errors: string[]; path?: string; uploadUrl?: string }>;
type Confirm = (input: { path: string; title: string }) => Promise<{ errors: string[]; saved?: boolean }>;

type Step = "idle" | "preparing" | "uploading" | "checking";

const 단계_글자: Record<Step, string> = {
  idle: "안건 올리기",
  preparing: "준비 중…",
  uploading: "파일 올리는 중…",
  checking: "PDF 확인 중…",
};

export function AgendaUploadForm({ prepare, confirm }: { prepare: Prepare; confirm: Confirm }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function 파일_고름(selected: File | null) {
    setSaved(null);
    setErrors([]);
    setFile(selected);
    // 제목이 비어 있으면 파일 이름(.pdf 뺀 것)을 제목으로 미리 넣어 준다
    if (selected && title.trim() === "") setTitle(selected.name.replace(/\.pdf$/i, ""));
  }

  async function 올리기() {
    setSaved(null);
    // 화면에서 먼저 알려 주는 검사 (서버도 똑같이 다시 검사한다)
    const 문제: string[] = [];
    if (title.trim() === "") 문제.push("안건 제목을 입력해 주세요.");
    if (!file) 문제.push("PDF 파일을 선택해 주세요.");
    else if (!file.name.toLowerCase().endsWith(".pdf")) 문제.push("PDF 파일만 올릴 수 있습니다.");
    else if (file.size > AGENDA_MAX_BYTES) 문제.push("30MB 이하의 PDF만 올릴 수 있습니다. 선택한 파일이 30MB를 넘습니다.");
    else if (file.size === 0) 문제.push("빈 파일은 올릴 수 없습니다.");
    setErrors(문제);
    if (문제.length > 0 || !file) return;

    try {
      setStep("preparing");
      const 주소 = await prepare({ title, fileName: file.name, size: file.size });
      if (주소.errors.length > 0 || !주소.uploadUrl || !주소.path) {
        setErrors(주소.errors.length > 0 ? 주소.errors : ["업로드를 준비하지 못했습니다."]);
        return;
      }

      setStep("uploading");
      const 응답 = await fetch(주소.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": "application/pdf", "x-upsert": "false" },
      });
      if (!응답.ok) {
        // 보관함도 PDF·30MB 제한을 따로 걸어 두었으므로, 여기서 거부되면 대부분 형식·크기 문제다
        setErrors(["파일을 올리지 못했습니다. PDF 파일이고 30MB 이하인지 확인한 뒤 다시 시도해 주세요."]);
        return;
      }

      setStep("checking");
      const 결과 = await confirm({ path: 주소.path, title });
      if (결과.errors.length > 0) {
        setErrors(결과.errors);
        return;
      }
      setSaved(title.trim());
      setTitle("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch {
      setErrors(["네트워크 문제로 올리지 못했습니다. 다시 시도해 주세요."]);
    } finally {
      setStep("idle");
    }
  }

  const 처리_중 = step !== "idle";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // 서버 처리 결과로 화면(안건 목록)이 새로 그려지므로 전환(transition) 안에서 실행한다
        startTransition(올리기);
      }}
      className="space-y-3"
    >
      <label className="block">
        <span className="text-sm font-semibold">안건 제목</span>
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          disabled={처리_중}
          placeholder="예: 가상기업 C 투자 심사"
          className="mt-1 block min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base focus:border-primary focus:outline-2 focus:outline-primary"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">PDF 파일</span>
        <span className="ml-2 text-sm text-muted">PDF만 · 30MB 이하 · 내부 결재를 마친 최종 안건</span>
        <input
          ref={fileInput}
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          disabled={처리_중}
          onChange={(e) => 파일_고름(e.target.files?.[0] ?? null)}
          className="mt-1 block min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-base file:mr-3 file:min-h-9 file:rounded file:border-0 file:bg-background file:px-3 file:font-semibold"
        />
      </label>
      {file ? <p className="text-sm text-muted">선택한 파일: {file.name} ({formatFileSize(file.size)})</p> : null}
      <Button type="submit" disabled={처리_중}>
        {단계_글자[step]}
      </Button>
      {errors.length > 0 ? (
        <p role="alert" className="text-sm text-danger">
          {errors.join(" ")}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm text-success">
          “{saved}” 안건을 올렸습니다.
        </p>
      ) : null}
    </form>
  );
}
