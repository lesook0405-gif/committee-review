"use client";
// 로그인 첫 화면 배경 영상 — 사진 위에 얹어 4초짜리 영상을 무한 반복한다.
// 첫 화면이 준비되면 0.8초에 걸쳐 서서히 나타나고, 움직임 줄이기 설정이면 아예 재생하지 않는다. (영상이 안 나와도 사진은 그대로 보인다)
import { useState, useSyncExternalStore } from "react";

import "./login-hero.css";

const 영상_주소 =
  "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/197f7e27-faac-4bdc-916c-615ac962bf86.mp4";

const 줄이기_설정 = "(prefers-reduced-motion: reduce)";
function 설정_구독(알림: () => void) {
  const m = window.matchMedia(줄이기_설정);
  m.addEventListener("change", 알림);
  return () => m.removeEventListener("change", 알림);
}

export function HeroVideo() {
  const [준비됨, set준비됨] = useState(false);
  // 서버에서는 "줄이기 아님"으로 그리고, 브라우저에서 실제 설정을 읽는다
  const 재생안함 = useSyncExternalStore(
    설정_구독,
    () => window.matchMedia(줄이기_설정).matches,
    () => false,
  );

  if (재생안함) return null;
  return (
    <video
      className={`lh-video ${준비됨 ? "lh-videoReady" : ""}`}
      src={영상_주소}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      onLoadedData={() => set준비됨(true)}
    />
  );
}
