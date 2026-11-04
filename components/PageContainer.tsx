// 화면 본문을 감싸는 상자 — 휴대폰은 좌우 16px, 태블릿 이상은 24px 여백. 너무 넓어지지 않게 최대 폭을 둔다.
import type { ReactNode } from "react";

type PageContainerProps = {
  /** 화면 제목 (h1) */
  title?: string;
  /** 제목 아래 설명 */
  description?: ReactNode;
  children: ReactNode;
};

export function PageContainer({ title, description, children }: PageContainerProps) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      {title ? (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {description ? <p className="mt-2 text-base text-muted">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </main>
  );
}
