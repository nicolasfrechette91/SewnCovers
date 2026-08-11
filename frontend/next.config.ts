import type { NextConfig } from "next";

import { createBuildEnvironment } from "./config/build-environment";

const isGitHubPagesBuild =
  process.env.SEWNCOVERS_GITHUB_PAGES === "true";
const isBrowserTestBuild = process.env.SEWNCOVERS_E2E === "true";
const basePath = isGitHubPagesBuild ? "/SewnCovers" : "";

createBuildEnvironment(
  process.env.NEXT_PUBLIC_API_URL,
  isGitHubPagesBuild && !isBrowserTestBuild ? "github-pages" : "ordinary",
);

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
