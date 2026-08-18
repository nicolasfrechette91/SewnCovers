import { publicEnvironment } from "../config/environment";
import {
  DEFAULT_CLOSURE_TYPE,
  DEFAULT_FIT_PREFERENCE,
  DEFAULT_MATERIAL_ID,
  DEFAULT_SEAM_STYLE,
} from "../data/cover-options";

export const API_REQUEST_TIMEOUT_MS = 20_000;
export const API_RETRY_LIMIT = 2;
export const API_COLD_START_DELAY_MS = 2_000;

const RETRY_DELAYS_MS = [500, 1_000] as const;
const TRANSIENT_HTTP_STATUSES = new Set([
  408, 425, 429, 500, 502, 503, 504,
]);
const ERROR_CODES = new Set<ApiErrorCode>([
  "design_not_found",
  "field_required",
  "internal_error",
  "invalid_format",
  "invalid_json",
  "invalid_precision",
  "invalid_public_id",
  "invalid_type",
  "invalid_value",
  "measurement_out_of_range",
  "method_not_allowed",
  "pattern_unavailable",
  "public_id_unavailable",
  "resource_not_found",
  "shape_measurements_mismatch",
  "square_dimensions_mismatch",
  "storage_unavailable",
  "unknown_field",
  "unsupported_value",
  "value_out_of_range",
]);

export type ApiErrorCategory =
  | "backend-contract"
  | "configuration"
  | "http"
  | "malformed-response"
  | "network"
  | "timeout";

export type ApiErrorCode =
  | "design_not_found"
  | "field_required"
  | "internal_error"
  | "invalid_format"
  | "invalid_json"
  | "invalid_precision"
  | "invalid_public_id"
  | "invalid_type"
  | "invalid_value"
  | "measurement_out_of_range"
  | "method_not_allowed"
  | "pattern_unavailable"
  | "public_id_unavailable"
  | "resource_not_found"
  | "shape_measurements_mismatch"
  | "square_dimensions_mismatch"
  | "storage_unavailable"
  | "unknown_field"
  | "unsupported_value"
  | "value_out_of_range";

export interface ApiErrorDetail {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly location: readonly (number | string)[];
}

export interface ApiErrorResponse {
  readonly errors: readonly ApiErrorDetail[];
}

export interface HealthResponse {
  readonly process: "healthy";
  readonly database: "healthy" | "unavailable" | "unconfigured";
}

export interface PatternResponse {
  readonly categoryId: string;
  readonly colorIds: readonly string[];
  readonly description: string;
  readonly id: string;
  readonly name: string;
  readonly previewClassName: string;
}

export type CushionShape =
  | "box"
  | "rectangle"
  | "round"
  | "square"
  | "tapered";
export type MeasurementUnit = "cm" | "in";

export interface CreateDesignRequest {
  readonly height: number;
  readonly backWidth: number | null;
  readonly patternId: string;
  readonly patternScale: number;
  readonly materialId: "cotton-canvas" | "linen-blend" | "polyester-weave";
  readonly fitPreference: "close" | "relaxed" | "standard";
  readonly closureType: "envelope" | "slip-on" | "zipper";
  readonly seamStyle: "piped" | "plain";
  readonly shape: CushionShape;
  readonly thickness: number;
  readonly unit: MeasurementUnit;
  readonly width: number;
}

export interface DesignResponse extends CreateDesignRequest {
  readonly publicId: string;
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

  constructor(
    category: ApiErrorCategory,
    message: string,
    options: {
      readonly errors?: readonly ApiErrorDetail[];
      readonly status?: number;
    } = {},
  ) {
    super(message);
    this.name = "ApiClientError";
    this.category = category;
    this.errors = options.errors ?? [];
    this.status = options.status;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasAtMostDecimalPlaces(value: number, places: number): boolean {
  const [coefficient, rawExponent = "0"] = value
    .toString()
    .toLowerCase()
    .split("e");
  const [, fraction = ""] = coefficient.split(".");
  const exponent = Number(rawExponent);
  const decimalPlaces = Math.max(0, fraction.length - exponent);
  return decimalPlaces <= places;
}

function parseHealthResponse(value: unknown): HealthResponse | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["process", "database"]) ||
    value.process !== "healthy" ||
    !["healthy", "unavailable", "unconfigured"].includes(
      String(value.database),
    )
  ) {
    return undefined;
  }

  return value as unknown as HealthResponse;
}

function parsePatternResponse(value: unknown): PatternResponse | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "name",
      "description",
      "categoryId",
      "colorIds",
      "previewClassName",
    ]) ||
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

  return value as unknown as PatternResponse;
}

function parsePatternList(
  value: unknown,
): readonly PatternResponse[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const patterns = value.map(parsePatternResponse);
  return patterns.every(
    (pattern): pattern is PatternResponse => pattern !== undefined,
  )
    ? patterns
    : undefined;
}

function parseDesignResponse(value: unknown): DesignResponse | undefined {
  const legacyKeys = [
    "shape",
    "width",
    "height",
    "thickness",
    "unit",
    "patternId",
    "patternScale",
    "publicId",
  ] as const;
  const expandedKeys = [
    "shape",
    "width",
    "height",
    "backWidth",
    "thickness",
    "unit",
    "patternId",
    "patternScale",
    "materialId",
    "fitPreference",
    "closureType",
    "seamStyle",
    "publicId",
  ] as const;
  const isLegacy = isRecord(value) && hasExactKeys(value, legacyKeys);

  if (
    !isRecord(value) ||
    (!isLegacy && !hasExactKeys(value, expandedKeys)) ||
    !["box", "rectangle", "round", "square", "tapered"].includes(
      String(value.shape),
    ) ||
    !isFiniteNumber(value.width) ||
    value.width <= 0 ||
    !hasAtMostDecimalPlaces(value.width, 2) ||
    !isFiniteNumber(value.height) ||
    value.height <= 0 ||
    !hasAtMostDecimalPlaces(value.height, 2) ||
    !isFiniteNumber(value.thickness) ||
    value.thickness <= 0 ||
    !hasAtMostDecimalPlaces(value.thickness, 2) ||
    !["cm", "in"].includes(String(value.unit)) ||
    typeof value.patternId !== "string" ||
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value.patternId) ||
    !isFiniteNumber(value.patternScale) ||
    value.patternScale < 0.5 ||
    value.patternScale > 2 ||
    !hasAtMostDecimalPlaces(value.patternScale, 1) ||
    typeof value.publicId !== "string" ||
    !/^[A-Za-z0-9_-]{22}$/.test(value.publicId)
  ) {
    return undefined;
  }

  if (isLegacy) {
    return {
      ...(value as unknown as Omit<
        DesignResponse,
        | "backWidth"
        | "closureType"
        | "fitPreference"
        | "materialId"
        | "seamStyle"
      >),
      backWidth: null,
      closureType: DEFAULT_CLOSURE_TYPE,
      fitPreference: DEFAULT_FIT_PREFERENCE,
      materialId: DEFAULT_MATERIAL_ID,
      seamStyle: DEFAULT_SEAM_STYLE,
    };
  }

  if (
    (value.backWidth !== null &&
      (!isFiniteNumber(value.backWidth) ||
        value.backWidth <= 0 ||
        !hasAtMostDecimalPlaces(value.backWidth, 2))) ||
    !["cotton-canvas", "linen-blend", "polyester-weave"].includes(
      String(value.materialId),
    ) ||
    !["close", "relaxed", "standard"].includes(
      String(value.fitPreference),
    ) ||
    !["envelope", "slip-on", "zipper"].includes(
      String(value.closureType),
    ) ||
    !["piped", "plain"].includes(String(value.seamStyle))
  ) {
    return undefined;
  }

  return value as unknown as DesignResponse;
}

function parseApiErrorResponse(
  value: unknown,
): ApiErrorResponse | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["errors"]) ||
    !Array.isArray(value.errors) ||
    value.errors.length === 0
  ) {
    return undefined;
  }

  const errors: ApiErrorDetail[] = [];

  for (const error of value.errors) {
    if (
      !isRecord(error) ||
      !hasExactKeys(error, ["code", "message", "location"]) ||
      typeof error.code !== "string" ||
      !ERROR_CODES.has(error.code as ApiErrorCode) ||
      typeof error.message !== "string" ||
      !Array.isArray(error.location) ||
      error.location.length === 0 ||
      !error.location.every(
        (segment) =>
          typeof segment === "string" ||
          (typeof segment === "number" && Number.isInteger(segment)),
      )
    ) {
      return undefined;
    }

    errors.push(error as unknown as ApiErrorDetail);
  }

  return { errors };
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
      return error.status === 422
        ? "The API rejected the request. Review the affected fields and try again."
        : "The SewnCovers service could not complete the request. Please try again.";
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

function buildUrl(path: string, query?: PatternQuery): string {
  const baseUrl = publicEnvironment.apiUrl;

  if (!baseUrl) {
    throw configurationError();
  }

  const url = new URL(`${baseUrl}/${path.replace(/^\/+/, "")}`);

  if (query?.category !== undefined) {
    url.searchParams.set("category", query.category);
  }
  if (query?.color !== undefined) {
    url.searchParams.set("color", query.color);
  }

  return url.toString();
}

async function parseResponseJson(response: Response): Promise<unknown> {
  const responseText = await response.text();

  if (!responseText) {
    return undefined;
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return undefined;
  }
}

async function performAttempt<ResponseBody>(
  definition: RequestDefinition<ResponseBody>,
): Promise<ResponseBody> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, API_REQUEST_TIMEOUT_MS);

  try {
    const response = await globalThis.fetch(
      buildUrl(definition.path, definition.query),
      {
        body:
          definition.body === undefined
            ? undefined
            : JSON.stringify(definition.body),
        headers:
          definition.body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        method: definition.method,
        signal: controller.signal,
      },
    );
    const body = await parseResponseJson(response);

    if (definition.expectedStatuses.includes(response.status)) {
      const parsed = definition.parse(body);

      if (parsed !== undefined) {
        return parsed;
      }
    }

    if (response.status < 200 || response.status >= 300) {
      const backendError = parseApiErrorResponse(body);

      if (backendError) {
        throw new ApiClientError(
          "backend-contract",
          "The API returned a documented request failure.",
          { errors: backendError.errors, status: response.status },
        );
      }

      throw new ApiClientError(
        "http",
        "The API returned an unexpected HTTP response.",
        { status: response.status },
      );
    }

    if (!definition.expectedStatuses.includes(response.status)) {
      throw new ApiClientError(
        "http",
        "The API returned an unexpected HTTP response.",
        { status: response.status },
      );
    }

    throw new ApiClientError(
      "malformed-response",
      "The API response did not match its public schema.",
      { status: response.status },
    );
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }

    if (timedOut) {
      throw new ApiClientError(
        "timeout",
        "The API request exceeded its time limit.",
      );
    }

    throw new ApiClientError(
      "network",
      "The API request could not reach the service.",
    );
  } finally {
    globalThis.clearTimeout(timeout);
    controller.abort();
  }
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
    (error.category === "http" ||
      error.category === "backend-contract") &&
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
    listPatterns(
      query: PatternQuery = {},
      options: ApiRequestOptions = {},
    ) {
      return request({
        expectedStatuses: [200],
        method: "GET",
        onStatus: options.onStatus,
        parse: parsePatternList,
        path: "/patterns",
        query,
      });
    },
    createDesign(
      design: CreateDesignRequest,
      options: ApiRequestOptions = {},
    ) {
      return request({
        body: design,
        expectedStatuses: [201],
        method: "POST",
        onStatus: options.onStatus,
        parse: parseDesignResponse,
        path: "/designs",
      });
    },
    getDesign(
      publicId: string,
      options: ApiRequestOptions = {},
    ) {
      return request({
        expectedStatuses: [200],
        method: "GET",
        onStatus: options.onStatus,
        parse: parseDesignResponse,
        path: `/designs/${encodeURIComponent(publicId)}`,
      });
    },
  };

  return Object.freeze(client);
}

export const apiClient = createApiClient();
