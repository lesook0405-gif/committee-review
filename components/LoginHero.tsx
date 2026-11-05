// 서비스 첫 화면(/ 와 /login)에서 함께 쓰는 로그인 화면 틀
// 건물 사이로 올려다본 사진 배경 + 왼쪽 큰 문구 + 오른쪽 로그인 카드 + 하단 위원 안내
// (PRD 6번: 가입 화면·외부 계정 로그인은 만들지 않는다. 그래서 가입·구글 로그인·비밀번호 찾기는 두지 않는다.)
import Image from "next/image";
import type { ReactNode } from "react";

import { HeroVideo } from "./HeroVideo";
import "./login-hero.css";

export function LoginHero({ children }: { children: ReactNode }) {
  return (
    <main className="lh-stage">
      <div className="lh-plate" aria-hidden="true" />
      <HeroVideo />
      <div className="lh-shade" aria-hidden="true" />

      <div className="lh-layout">
        <section className="lh-hero">
          <div className="lh-topbar">
            <div className="lh-brand">
              <span className="lh-brandName">기업본부 심사위원회</span>
            </div>
            {/* 작은 화면(세로·가로 휴대폰)에서만 보이는 맨 위 줄 오른쪽 로고 */}
            <div className="lh-org">
              <Image src="/kamco-logo.png" alt="캠코(한국자산관리공사)" width={2000} height={1279} className="lh-orgLogo" />
            </div>
          </div>

          <div className="lh-pitch">
            <h1 className="lh-headline">
              <span className="lh-line"><span>안건 열람부터</span></span>
              <span className="lh-line"><span>평가·집계까지,</span></span>
              <span className="lh-line"><span>종이 없이.</span></span>
            </h1>
            <aside className="lh-members" aria-label="위원 안내">
              <div className="lh-membersHead">
                <span className="lh-membersIcon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
                    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
                  </svg>
                </span>
                <p className="lh-membersTitle">위원이신가요?</p>
                <span className="lh-membersBadge">로그인 필요 없음</span>
              </div>
              <ol className="lh-steps">
                <li>
                  <span className="lh-stepNo">1</span>
                  <div>
                    <strong>개인 링크로 바로 접속</strong>
                    <span className="lh-stepText">담당 팀원이 메일이나 문자로 보낸 링크를 눌러 들어오세요.</span>
                  </div>
                </li>
                <li>
                  <span className="lh-stepNo">2</span>
                  <div>
                    <strong>위원님 전용 링크</strong>
                    <span className="lh-stepText">다른 분께 전달하지 마세요. 평가 마감 7일 뒤 만료됩니다.</span>
                  </div>
                </li>
                <li>
                  <span className="lh-stepNo">3</span>
                  <div>
                    <strong>링크가 열리지 않나요?</strong>
                    <span className="lh-stepText">담당 팀원에게 다시 발급을 요청해 주세요.</span>
                  </div>
                </li>
              </ol>
            </aside>
          </div>
        </section>

        <section className="lh-panel" aria-label="로그인">
          <div className="lh-card">
            {/* 넓은 화면에서는 카드의 오른쪽 위 모서리가 페이지의 상단 우측이다 */}
            <Image src="/kamco-logo.png" alt="캠코(한국자산관리공사)" width={2000} height={1279} priority className="lh-orgCard" />
            <div className="lh-formWrap">
              <h2 className="lh-title">위원회 관리를 시작합니다</h2>
              <p className="lh-lead">미리 등록된 계정으로 로그인해 위원회와 회의를 관리하세요.</p>
              {children}
              <p className="lh-foot">
                <strong>담당 팀원 · 팀장</strong> 전용입니다. 가입 화면은 없으며, 계정은 미리 등록된 분만 사용할 수 있습니다.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
