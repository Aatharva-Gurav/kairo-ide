import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

function readPackageVersion(relativePath: string): string | undefined {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

const appVersion = readPackageVersion("package.json") ?? "0.1.0";
const monacoVersion =
  readPackageVersion(path.join("node_modules", "monaco-editor", "package.json")) ?? "0.58.0";

const nextConfig: NextConfig = {
  output: "export",
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_MONACO_VERSION: monacoVersion,
  },
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  compress: true,
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@icons-pack/react-simple-icons",
      "@base-ui/react",
    ],
  },
};

export default nextConfig;
