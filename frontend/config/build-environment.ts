import {
  createPublicEnvironment,
  type PublicEnvironment,
  PublicEnvironmentError,
} from "./environment";

export const PRODUCTION_API_URL = "https://sewncovers-api.onrender.com";

export type PublicBuildTarget = "github-pages" | "ordinary";

export function createBuildEnvironment(
  apiUrlValue: string | undefined,
  buildTarget: PublicBuildTarget,
): PublicEnvironment {
  const environment = createPublicEnvironment(apiUrlValue);

  if (
    buildTarget === "github-pages" &&
    environment.apiUrl !== PRODUCTION_API_URL
  ) {
    throw new PublicEnvironmentError(
      `NEXT_PUBLIC_API_URL must be exactly ${PRODUCTION_API_URL} for the GitHub Pages production build.`,
    );
  }

  return environment;
}
