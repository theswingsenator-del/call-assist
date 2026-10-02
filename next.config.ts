import type { NextConfig } from "next";

const buildId = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || Date.now().toString(36);

const noCache = [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }];

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [...noCache, { key: "Content-Type", value: "application/javascript; charset=utf-8" }],
      },
      { source: "/manifest.json", headers: noCache },
      {
        source: "/pdf.worker.min.mjs",
        headers: [{ key: "Content-Type", value: "application/javascript; charset=utf-8" }],
      },
    ];
  },
};

export default nextConfig;
