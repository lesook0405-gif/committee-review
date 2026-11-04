// Plan 6장 영향 분석 — 기본 안내 화면을 서비스 첫 화면(로그인 안내)으로 바꾼다.
import { AppHeader } from "@/components/AppHeader";
import { LinkButton } from "@/components/Button";
import { PageContainer } from "@/components/PageContainer";

export default function Home() {
  return (
    <>
      <AppHeader />
      <PageContainer title="심사위원회 운영 서비스" description="안건 열람부터 위원 평가, 자동 집계까지 종이 없이 진행합니다.">
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold">담당 팀원 · 팀장</h2>
            <p className="mt-2 text-muted">미리 등록된 계정으로 로그인해 위원회와 회의를 관리하고 결과를 확인합니다.</p>
            <LinkButton href="/login" className="mt-4 w-full sm:w-auto">
              로그인
            </LinkButton>
          </section>
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold">위원</h2>
            <p className="mt-2 text-muted">
              담당자에게 메일이나 문자로 받은 링크를 눌러 들어오세요. 링크 하나로 그 회의의 안건을 읽고 평가할 수 있습니다.
            </p>
          </section>
        </div>
      </PageContainer>
    </>
  );
}
