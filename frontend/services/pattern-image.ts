/**
 * Fetches a custom pattern's tile from the short-lived, already authorised URL
 * the selection flow obtained, so the preview can show it through a local
 * object URL that the image CSP allows without broadening it. No credentials
 * are sent, nothing is cached, and there is no time limit (an image keeps
 * loading as long as the preview shows it). Rejects when the tile is refused.
 */
export async function fetchPatternImage(
  url: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "omit",
    signal,
  });
  if (!response.ok) throw new Error("Pattern unavailable");
  return response.blob();
}
