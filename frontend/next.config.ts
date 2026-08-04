import type { NextConfig } from "next";

import "./config/environment";

const isGitHubPagesBuild =
  process.env.SEWNCOVERS_GITHUB_PAGES === "true";
const basePath = isGitHubPagesBuild ? "/sewncovers" : "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
