import {
  REQUEST_TIMEOUT_MS,
  send,
  TransportError,
  type HttpResponse,
} from "./http";
import {
  readDesignResponse,
  type CreateDesignRequest,
  type DesignResponse,
} from "./design-contract";
import { isOneOf, isRecord, readList } from "./validation";

export type { CreateDesignRequest, DesignResponse } from "./design-contract";

export const API_REQUEST_TIMEOUT_MS = REQUEST_TIMEOUT_MS;
export const API_RETRY_LIMIT = 2;
export const API_COLD_START_DELAY_MS = 2_000;

const RETRY_DELAYS_MS = [500, 1_000] as const;
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const DATABASE_STATES = ["healthy", "unavailable", "unconfigured"] as const;

export type ApiErrorCategory =
  | "backend-contract"
  | "configuration"
  | "http"
  | "malformed-response"
  | "network"
  | "timeout";

export interface ApiErrorDetail {
  /** A stable code; one this build does not know still reads as a failure. */
  readonly code: string;
  readonly message: string;
  readonly location: readonly (number | string)[];
}

export interface ApiErrorResponse {
  readonly errors: readonly ApiErrorDetail[];
  /** Server request id, also in X-Request-ID; quoted when reporting a problem. */
  readonly requestId?: string;
}

export interface HealthResponse {
  readonly process: "healthy";
  readonly database: "healthy" | "unavailable" | "unconfigured";
  /** Deployed commit SHA; absent from APIs older than the field, null locally. */
  readonly commit?: string | null;
}

/** Whether this API accepts custom pattern uploads at all. */
export interface UploadAvailabilityResponse {
  readonly enabled: boolean;
}

export interface PatternResponse {
  readonly categoryId: string;
  readonly colorIds: readonly string[];
  readonly description: string;
  readonly id: string;
  readonly name: string;
  readonly previewClassName: string;
}

export interface PatternQuery {
  readonly category?: string;
  readonly color?: string;
}

export type ApiRequestStatus =
  | {
      readonly message: "Connecting to SewnCovers\u2026";
      readonly state: "connecting";
    }
  | {
      readonly message: "The SewnCovers API may be waking up. This can take up to a minute.";
      readonly state: "cold-start";
    }
  | {
      readonly message: string;
      readonly retry: number;
      readonly retryLimit: typeof API_RETRY_LIMIT;
      readonly state: "retrying";
    }
  | {
      readonly message: "SewnCovers is connected.";
      readonly state: "success";
    }
  | {
      readonly category: ApiErrorCategory;
      readonly message: string;
      readonly state: "failure";
    };

export interface ApiRequestOptions {
  readonly onStatus?: (status: ApiRequestStatus) => void;
}

export class ApiClientError extends Error {
  readonly category: ApiErrorCategory;
  readonly errors: readonly ApiErrorDetail[];
  readonly status: number | undefined;
  readonly requestId: string | undefined;

  constructor(
    category: ApiErrorCategory,
    message: string,
    options: {
      readonly errors?: readonly ApiErrorDetail[];
      readonly status?: number;
      readonly requestId?: string;
    } = {},
  ) {
    super(message);
    this.name = "ApiClientError";
    this.category = category;
    this.errors = options.errors ?? [];
    this.status = options.status;
    this.requestId = options.requestId;
  }
}

export interface SewnCoversApiClient {
  createDesign(
    request: CreateDesignRequest,
    options?: ApiRequestOptions,
  ): Promise<DesignResponse>;
  getDesign(
    publicId: string,
    options?: ApiRequestOptions,
  ): Promise<DesignResponse>;
  getHealth(options?: ApiRequestOptions): Promise<HealthResponse>;
  getUploadAvailability(
    options?: ApiRequestOptions,
  ): Promise<UploadAvailabilityResponse>;
  listPatterns(
    query?: PatternQuery,
    options?: ApiRequestOptions,
  ): Promise<readonly PatternResponse[]>;
}

interface RequestDefinition<ResponseBody> {
  readonly body?: CreateDesignRequest;
  readonly expectedStatuses: readonly number[];
  readonly method: "GET" | "POST";
  readonly onStatus?: (status: ApiRequestStatus) => void;
  readonly parse: (value: unknown) => ResponseBody | undefined;
  readonly path: string;
  readonly query?: PatternQuery;
}

// Each reader builds its result from the fields this build knows: a field
// the API adds later is ignored, while a missing or wrong known field makes
// the response malformed (docs/architecture.md, "Reading responses").

function parseHealthResponse(value: unknown): HealthResponse | undefined {
  if (
    !isRecord(value) ||
    value.process !== "healthy" ||
    !isOneOf(DATABASE_STATES, value.database)
  ) {
    return undefined;
  }
  // `commit` is optional so this build reads the API from before and after
  // that field shipped: the frontend and the API deploy independently.
  if (!Object.hasOwn(value, "commit")) {
    return { process: "healthy", database: value.database };
  }
  if (
    value.commit !== null &&
    !(typeof value.commit === "string" && /^[0-9a-f]{40}$/.test(value.commit))
  ) {
    return undefined;
  }
  return { process: "healthy", database: value.database, commit: value.commit };
}

function parseUploadAvailability(
  value: unknown,
): UploadAvailabilityResponse | undefined {
  return isRecord(value) && typeof value.enabled === "boolean"
    ? { enabled: value.enabled }
    : undefined;
}

function parsePatternResponse(value: unknown): PatternResponse | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.description !== "string" ||
    typeof value.categoryId !== "string" ||
    !Array.isArray(value.colorIds) ||
    !value.colorIds.every((colorId) => typeof colorId === "string") ||
    typeof value.previewClassName !== "string"
  ) {
    return undefined;
  }
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    categoryId: value.categoryId,
    colorIds: [...value.colorIds],
    previewClassName: value.previewClassName,
  };
}

function parsePatternList(
  value: unknown,
): readonly PatternResponse[] | undefined {
  return readList(value, parsePatternResponse);
}

function parseLocation(
  value: unknown,
): readonly (number | string)[] | undefined {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (segment) =>
        typeof segment === "string" ||
        (typeof segment === "number" && Number.isInteger(segment)),
    )
    ? [...value]
    : undefined;
}

// The error envelope: other keys, here and in each error, are ignored; a
// code this build does not know is still a documented failure.
function parseApiErrorResponse(value: unknown): ApiErrorResponse | undefined {
  if (
    !isRecord(value) ||
    (Object.hasOwn(value, "requestId") && typeof value.requestId !== "string")
  ) {
    return undefined;
  }
  const errors = readList(value.errors, (error): ApiErrorDetail | undefined => {
    if (
      !isRecord(error) ||
      typeof error.code !== "string" ||
      typeof error.message !== "string"
    ) {
      return undefined;
    }
    // Checked when present; an error that names no location has none.
    const location = Object.hasOwn(error, "location")
      ? parseLocation(error.location)
      : [];
    return location === undefined
      ? undefined
      : { code: error.code, message: error.message, location };
  });
  if (errors === undefined || errors.length === 0) return undefined;
  return typeof value.requestId === "string"
    ? { errors, requestId: value.requestId }
    : { errors };
}

function configurationError(): ApiClientError {
  return new ApiClientError(
    "configuration",
    "SewnCovers cannot connect because NEXT_PUBLIC_API_URL is not configured.",
  );
}

function statusFailureMessage(error: ApiClientError): string {
  switch (error.category) {
    case "configuration":
      return "The public API URL is not configured. Set NEXT_PUBLIC_API_URL and rebuild the frontend.";
    case "timeout":
      return "The SewnCovers API did not respond in time. Please try again.";
    case "network":
      return "The SewnCovers API could not be reached. Check your connection and try again.";
    case "backend-contract":
      switch (error.status) {
        case 422:
          return "The API rejected the request. Review the affected fields and try again.";
        case 429:
          return "Too many designs were saved from your network. Wait a few minutes, then try again.";
        case 413:
          return "The request was larger than the SewnCovers service accepts.";
        default:
          return "The SewnCovers service could not complete the request. Please try again.";
      }
    case "http":
      return "The SewnCovers API returned an unexpected HTTP response. Please try again.";
    case "malformed-response":
      return "The SewnCovers API returned an unreadable response. Please try again.";
  }
}

function emitStatus(
  listener: ((status: ApiRequestStatus) => void) | undefined,
  status: ApiRequestStatus,
): void {
  try {
    listener?.(status);
  } catch {
    // Status observers cannot change request behavior or expose request details.
  }
}

function transportFailure(error: unknown): ApiClientError {
  if (error instanceof TransportError && error.kind === "configuration") {
    return configurationError();
  }

  if (error instanceof TransportError && error.kind === "timeout") {
    return new ApiClientError(
      "timeout",
      "The API request exceeded its time limit.",
    );
  }

  return new ApiClientError(
    "network",
    "The API request could not reach the service.",
  );
}

// One attempt through the shared transport, which owns the URL, the time
// limit and reading the body. An unreadable body counts as no body here.
async function performAttempt<ResponseBody>(
  definition: RequestDefinition<ResponseBody>,
): Promise<ResponseBody> {
  let response: HttpResponse;

  try {
    response = await send({
      body: definition.body,
      method: definition.method,
      path: definition.path,
      query: {
        category: definition.query?.category,
        color: definition.query?.color,
      },
    });
  } catch (error) {
    throw transportFailure(error);
  }

  const { body, status } = response;

  if (definition.expectedStatuses.includes(status)) {
    const parsed = definition.parse(body);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  if (status < 200 || status >= 300) {
    const backendError = parseApiErrorResponse(body);

    if (backendError) {
      throw new ApiClientError(
        "backend-contract",
        "The API returned a documented request failure.",
        {
          errors: backendError.errors,
          requestId: backendError.requestId,
          status,
        },
      );
    }

    throw new ApiClientError(
      "http",
      "The API returned an unexpected HTTP response.",
      { status },
    );
  }

  if (!definition.expectedStatuses.includes(status)) {
    throw new ApiClientError(
      "http",
      "The API returned an unexpected HTTP response.",
      { status },
    );
  }

  throw new ApiClientError(
    "malformed-response",
    "The API response did not match its public schema.",
    { status },
  );
}

function shouldRetry(
  definition: RequestDefinition<unknown>,
  error: ApiClientError,
): boolean {
  if (definition.method !== "GET") {
    return false;
  }

  if (error.category === "network" || error.category === "timeout") {
    return true;
  }

  return (
    (error.category === "http" || error.category === "backend-contract") &&
    error.status !== undefined &&
    TRANSIENT_HTTP_STATUSES.has(error.status)
  );
}

function waitForRetry(retry: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, RETRY_DELAYS_MS[retry - 1]);
  });
}

async function request<ResponseBody>(
  definition: RequestDefinition<ResponseBody>,
): Promise<ResponseBody> {
  emitStatus(definition.onStatus, {
    message: "Connecting to SewnCovers\u2026",
    state: "connecting",
  });

  let coldStartTimer: ReturnType<typeof globalThis.setTimeout> | undefined =
    globalThis.setTimeout(() => {
      coldStartTimer = undefined;
      emitStatus(definition.onStatus, {
        message:
          "The SewnCovers API may be waking up. This can take up to a minute.",
        state: "cold-start",
      });
    }, API_COLD_START_DELAY_MS);

  try {
    for (let retry = 0; retry <= API_RETRY_LIMIT; retry += 1) {
      try {
        const response = await performAttempt(definition);
        emitStatus(definition.onStatus, {
          message: "SewnCovers is connected.",
          state: "success",
        });
        return response;
      } catch (error) {
        const requestError =
          error instanceof ApiClientError
            ? error
            : new ApiClientError(
                "network",
                "The API request could not reach the service.",
              );

        if (
          retry === API_RETRY_LIMIT ||
          !shouldRetry(definition, requestError)
        ) {
          emitStatus(definition.onStatus, {
            category: requestError.category,
            message: statusFailureMessage(requestError),
            state: "failure",
          });
          throw requestError;
        }

        if (coldStartTimer !== undefined) {
          globalThis.clearTimeout(coldStartTimer);
          coldStartTimer = undefined;
        }

        const nextRetry = retry + 1;
        emitStatus(definition.onStatus, {
          message: `The SewnCovers API may be waking up. Retrying (${nextRetry} of ${API_RETRY_LIMIT})\u2026`,
          retry: nextRetry,
          retryLimit: API_RETRY_LIMIT,
          state: "retrying",
        });
        await waitForRetry(nextRetry);
      }
    }

    throw new ApiClientError(
      "network",
      "The API request could not reach the service.",
    );
  } finally {
    if (coldStartTimer !== undefined) {
      globalThis.clearTimeout(coldStartTimer);
    }
  }
}

export function createApiClient(): SewnCoversApiClient {
  const client: SewnCoversApiClient = {
    getHealth(options: ApiRequestOptions = {}) {
      return request({
        expectedStatuses: [200, 503],
        method: "GET",
        onStatus: options.onStatus,
        parse: parseHealthResponse,
        path: "/health",
      });
    },
    getUploadAvailability(options: ApiRequestOptions = {}) {
      return request({
        expectedStatuses: [200],
        method: "GET",
        onStatus: options.onStatus,
        parse: parseUploadAvailability,
        path: "/uploads/availability",
      });
    },
    listPatterns(query: PatternQuery = {}, options: ApiRequestOptions = {}) {
      return request({
        expectedStatuses: [200],
        method: "GET",
        onStatus: options.onStatus,
        parse: parsePatternList,
        path: "/patterns",
        query,
      });
    },
    createDesign(design: CreateDesignRequest, options: ApiRequestOptions = {}) {
      return request({
        body: design,
        expectedStatuses: [201],
        method: "POST",
        onStatus: options.onStatus,
        parse: readDesignResponse,
        path: "/designs",
      });
    },
    getDesign(publicId: string, options: ApiRequestOptions = {}) {
      return request({
        expectedStatuses: [200],
        method: "GET",
        onStatus: options.onStatus,
        parse: readDesignResponse,
        path: `/designs/${encodeURIComponent(publicId)}`,
      });
    },
  };

  return Object.freeze(client);
}

export const apiClient = createApiClient();
