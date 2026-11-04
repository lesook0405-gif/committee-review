// CLAUDE.md 화면 규칙 — 태블릿에서 손가락으로 누르기 편하게 버튼 높이를 최소 44px(min-h-11)로 맞춘다.
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger";

const 모양: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "border border-border bg-surface text-foreground hover:bg-background",
  danger: "bg-danger text-white hover:opacity-90",
};

const 공통 =
  "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-base font-semibold " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
  "disabled:cursor-not-allowed disabled:opacity-50";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

/** 누르면 동작하는 버튼 */
export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={`${공통} ${모양[variant]} ${className}`} {...props} />;
}

type LinkButtonProps = { href: string; variant?: Variant; className?: string; children: ReactNode };

/** 버튼처럼 보이는 링크 (다른 화면으로 이동) */
export function LinkButton({ href, variant = "primary", className = "", children }: LinkButtonProps) {
  return (
    <Link href={href} className={`${공통} ${모양[variant]} ${className}`}>
      {children}
    </Link>
  );
}
