import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 위원 화면 주소에는 링크값이 들어 있으므로, 다른 사이트(PDF 보관함 등)로 넘어갈 때 주소를 알려 주지 않는다
  async headers() {
    return [{ source: "/m/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
