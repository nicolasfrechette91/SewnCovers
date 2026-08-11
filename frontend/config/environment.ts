const API_URL_VARIABLE = "NEXT_PUBLIC_API_URL";

export type PublicEnvironment = Readonly<{
  apiUrl: string | undefined;
}>;

export class PublicEnvironmentError extends Error {
  readonly category = "configuration";

  constructor(message?: string) {
    super(
      message ??
        `${API_URL_VARIABLE} must be an absolute HTTP or HTTPS URL without credentials, a query, or a fragment.`,
    );
    this.name = "PublicEnvironmentError";
  }
}

function invalidApiUrlError(): PublicEnvironmentError {
  return new PublicEnvironmentError();
}

export function parsePublicApiUrl(
  value: string | undefined,
): string | undefined {
  const candidate = value?.trim();

  if (!candidate) {
    return undefined;
  }

  let parsed: URL;

  try {
    parsed = new URL(candidate);
  } catch {
    throw invalidApiUrlError();
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw invalidApiUrlError();
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, "");

  return `${parsed.origin}${normalizedPath}`;
}

export function createPublicEnvironment(
  apiUrlValue: string | undefined,
): PublicEnvironment {
  const apiUrl = parsePublicApiUrl(apiUrlValue);

  return Object.freeze({
    apiUrl,
  });
}

export const publicEnvironment = createPublicEnvironment(
  process.env.NEXT_PUBLIC_API_URL,
);
