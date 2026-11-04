// 없는 주소로 들어왔을 때 보여 주는 한국어 안내 화면
import { AppHeader } from "@/components/AppHeader";
import { LinkButton } from "@/components/Button";
import { PageContainer } from "@/components/PageContainer";

export default function NotFound() {
  return (
    <>
      <AppHeader />
      <PageContainer title="페이지를 찾을 수 없습니다" description="주소가 잘못되었거나, 링크가 만료·변경되었을 수 있습니다.">
        <p className="text-muted">위원이시라면 담당자에게 새 링크를 요청하세요.</p>
        <LinkButton href="/" variant="secondary" className="mt-6">
          첫 화면으로
        </LinkButton>
      </PageContainer>
    </>
  );
}
