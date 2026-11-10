import type { NextConfig } from "next";
import path from "node:path";
import { existsSync } from "node:fs";

// single source of configuration: the monorepo root .env
const rootEnv = path.join(__dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // lets a production build run alongside `next dev` (NEXT_DIST_DIR=.next-build)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@propertyx/shared", "@propertyx/database", "@propertyx/auth", "@propertyx/search", "@propertyx/ai", "@propertyx/payments", "@propertyx/notifications", "@propertyx/core", "@propertyx/ui"],
  serverExternalPackages: ["sharp", "postgres", "bcryptjs"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // storage.ts resolves upload dirs from process.cwd() at runtime, so the tracer adds the whole app
  // directory to every function — including .next/cache, which Vercel restores from earlier builds.
  // That pushed each function past the size limit (~350 MB), so routes could not be grouped and the
  // Hobby plan's 12-function cap was exceeded. Globs are joined to this dir (they match on Linux builds).
  outputFileTracingExcludes: {
    "**/*": ["**/.next/cache/**/*", "**/*.tsbuildinfo"],
  },
  images: {
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  experimental: { serverActions: { bodySizeLimit: "15mb" } },
  async redirects() {
    return [
      {
        source: "/society/:slug",
        destination: "/area/:slug",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self)" },
        ],
      },
    ];
  },
};
export default config;
