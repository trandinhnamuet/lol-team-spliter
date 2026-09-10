import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg dùng require động (pg-native tuỳ chọn) — để Node load trực tiếp, không bundle
  serverExternalPackages: ["pg"],
};

export default nextConfig;
