import { publicEnvironment } from "../config/environment";

// The one HTTP transport every API client sends through. It owns the URL, the
// headers, the time limit and reading the body; it knows nothing about
// sessions, retries or wording, which each client layers on top.

/** Each request (each attempt, for the public client's retries) gets this long. */
export const REQUEST_TIMEOUT_MS = 20_000;

export type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export interface HttpRequest {
  /** Path below the configured API URL; leading slashes are ignored. */
  readonly path: string;
  readonly method?: HttpMethod;
  /** Query parameters; undefined values are left out. */
  readonly query?: Readonly<Record<string, string | undefined>>;
  /** Sent as JSON, with `Content-Type: application/json`. */
  readonly body?: unknown;
  /** Sent as `Authorization: Bearer <token>`. */
  readonly token?: string | null;
  readonly cache?: RequestCache;
  /** Cancels the request; it then rejects with kind `aborted`. */
  readonly signal?: AbortSignal;
}

export interface HttpResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Headers;
  /** The parsed JSON body; undefined when the body is empty or unreadable. */
  readonly body: unknown;
  /** A non-empty body that is not JSON. */
  readonly unreadable: boolean;
}

/**
 * Why no response arrived. `configuration`: no API URL was built in, so
 * nothing was sent. `aborted`: the caller cancelled. The others are the
 * time limit and any failure to reach the service.
 */
export type TransportFailure =
  "aborted" | "configuration" | "network" | "timeout";

export class TransportError extends Error {
  readonly kind: TransportFailure;

  constructor(kind: TransportFailure) {
    super(`The API request failed (${kind}).`);
    this.name = "TransportError";
    this.kind = kind;
  }
}

function buildUrl(request: HttpRequest): string {
  const baseUrl = publicEnvironment.apiUrl;

  if (!baseUrl) {
    throw new TransportError("configuration");
  }

  const url = new URL(`${baseUrl}/${request.path.replace(/^\/+/, "")}`);

  for (const [name, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(name, value);
    }
  }

  return url.toString();
}

function readBody(text: string): { body: unknown; unreadable: boolean } {
  if (!text) {
    return { body: undefined, unreadable: false };
  }

  try {
    return { body: JSON.parse(text) as unknown, unreadable: false };
  } catch {
    return { body: undefined, unreadable: true };
  }
}

export async function send(request: HttpRequest): Promise<HttpResponse> {
  const url = buildUrl(request);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  request.signal?.addEventListener("abort", cancel, { once: true });

  try {
    if (request.signal?.aborted) {
      throw new TransportError("aborted");
    }

    const headers: Record<string, string> = {};
    if (request.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (request.token) {
      headers.Authorization = `Bearer ${request.token}`;
    }

    const response = await globalThis.fetch(url, {
      body:
        request.body === undefined ? undefined : JSON.stringify(request.body),
      headers,
      method: request.method ?? "GET",
      signal: controller.signal,
      ...(request.cache === undefined ? {} : { cache: request.cache }),
    });
    const { body, unreadable } = readBody(await response.text());

    return {
      body,
      headers: response.headers,
      ok: response.ok,
      status: response.status,
      unreadable,
    };
  } catch (error) {
    if (error instanceof TransportError) {
      throw error;
    }
    if (request.signal?.aborted) {
      throw new TransportError("aborted");
    }

    throw new TransportError(timedOut ? "timeout" : "network");
  } finally {
    globalThis.clearTimeout(timeout);
    request.signal?.removeEventListener("abort", cancel);
    controller.abort();
  }
}

/** A delay-seconds Retry-After header; dates and junk are ignored. */
export function retryAfterSeconds(headers: Headers): number | undefined {
  const value = headers.get("Retry-After")?.trim() ?? "";
  if (!/^\d{1,6}$/.test(value)) return undefined;
  const seconds = Number(value);
  return seconds > 0 ? seconds : undefined;
}
