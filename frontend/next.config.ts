import type { NextConfig } from "next";
import { readdirSync } from "node:fs";

// This frontend receives only scoped server settings from its launcher/deployment.
// Refuse automatic dotenv loading even when Next is invoked directly.
if (readdirSync(process.cwd()).some((name) => /^\.env(?:\.|$)/.test(name) && name !== ".env.example")) {
  throw new Error("Frontend dotenv files are not supported. Use the application root configuration and scoped launcher settings.");
}

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  devIndicators: false,
  turbopack: { root: process.cwd() },
  experimental: {
    cpus: 2,
    turbopackFileSystemCacheForBuild: false,
    turbopackFileSystemCacheForDev: false,
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
};
export default config;
