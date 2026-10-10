import { publicEnvironment } from "../config/environment";
import type { CreateDesignRequest } from "./api-client";
import {
  retryAfterSeconds,
  send,
  TransportError,
  type HttpMethod,
  type HttpRequest,
  type HttpResponse,
} from "./http";

export type ProjectPatternChoice =
  | { readonly kind: "built-in"; readonly patternId: string }
  | { readonly kind: "solid"; readonly color: string }
  | {
      readonly kind: "custom";
      readonly assetId: string;
      readonly derivativeId: string;
      readonly processingVersion: string;
    };

export type ProjectConfigurationRequest = Omit<
  CreateDesignRequest,
  "patternId" | "solidColor"
> & { readonly pattern: ProjectPatternChoice };

const TOKEN_KEY = "sewncovers.session-token";
export const AUTH_CHANGED_EVENT = "sewncovers:auth-changed";

export interface Account {
  readonly email: string;
  readonly createdAt: string;
  readonly role: "customer" | "administrator";
}

export interface AuthSession {
  readonly account: Account;
  readonly token: string;
  readonly expiresAt: string;
}

export interface SessionMetadata {
  readonly id: number;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly current: boolean;
}

export interface ProjectVersion {
  readonly id: string;
  readonly versionNumber: number;
  readonly configuration: ProjectConfigurationRequest;
  readonly createdAt: string;
  readonly isCurrent: boolean;
}

export interface ShareGrant {
  readonly id: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly createdAt: string;
}

export interface CreatedShare extends ShareGrant {
  readonly shareToken: string;
}

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly versionCount: number;
  readonly updatedAt: string;
  readonly privacy: "private" | "shared";
}

export interface ProjectDetail extends ProjectSummary {
  readonly createdAt: string;
  readonly currentVersion: ProjectVersion;
  readonly activeShares: readonly ShareGrant[];
}

export type UploadState =
  | "awaiting_upload"
  | "uploaded"
  | "processing"
  | "awaiting_moderation"
  | "approved"
  | "rejected"
  | "failed"
  | "deleted"
  | "expired";

export interface CustomUpload {
  readonly id: string;
  readonly label: string;
  readonly state: UploadState;
  readonly moderationState:
    | "not_started"
    | "pending"
    | "approved"
    | "rejected"
    | "unavailable"
    | "failed";
  readonly contentType: string;
  readonly byteSize: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly processingVersion: string;
  readonly tileDerivativeId: string | null;
  readonly thumbnailDerivativeId: string | null;
  readonly processingAttempts: number;
  readonly moderationAttempts: number;
  readonly retryEligible: boolean;
  readonly referencedByVersions: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface UploadOperation {
  readonly method: "POST" | "PUT";
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly fields: Readonly<Record<string, string>>;
  readonly expiresAt: string;
}

export interface UploadIntent extends CustomUpload {
  readonly upload: UploadOperation;
}

export interface AssetAccess {
  readonly url: string;
  readonly expiresAt: string;
  readonly contentType: "image/png";
}

/** Set when the account exists but the terms acknowledgement was not saved. */
export const ACKNOWLEDGEMENT_FAILED_CODE = "acknowledgement_failed";

export class AccountApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Seconds from the Retry-After header of a 429 or 503, when sent. */
  readonly retryAfterSeconds: number | undefined;
  /** Server request id, also in X-Request-ID; quoted when reporting a problem. */
  readonly requestId: string | undefined;

  constructor(
    message: string,
    status = 0,
    code = "request_failed",
    details: {
      readonly retryAfterSeconds?: number;
      readonly requestId?: string;
    } = {},
  ) {
    super(message);
    this.name = "AccountApiError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.requestId = details.requestId;
  }
}

/** Describe a wait for people, rounding up as the API's own messages do. */
export function waitPhrase(seconds: number): string {
  if (seconds < 60)
    return seconds <= 5 ? "a few seconds" : `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPatternChoice(value: unknown): value is ProjectPatternChoice {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "built-in") {
    return (
      Object.keys(value).length === 2 && typeof value.patternId === "string"
    );
  }
  if (value.kind === "solid") {
    return (
      Object.keys(value).length === 2 &&
      typeof value.color === "string" &&
      /^#[0-9A-F]{6}$/.test(value.color)
    );
  }
  return (
    value.kind === "custom" &&
    Object.keys(value).length === 4 &&
    typeof value.assetId === "string" &&
    typeof value.derivativeId === "string" &&
    typeof value.processingVersion === "string"
  );
}

function isConfiguration(value: unknown): value is ProjectConfigurationRequest {
  if (!isRecord(value)) return false;
  const keys = [
    "shape",
    "width",
    "height",
    "backWidth",
    "thickness",
    "unit",
    "pattern",
    "patternScale",
    "materialId",
    "fitPreference",
    "closureType",
    "seamStyle",
  ];
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key)) &&
    ["box", "rectangle", "round", "square", "tapered"].includes(
      String(value.shape),
    ) &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    (value.backWidth === null || typeof value.backWidth === "number") &&
    typeof value.thickness === "number" &&
    ["cm", "in"].includes(String(value.unit)) &&
    isPatternChoice(value.pattern) &&
    typeof value.patternScale === "number" &&
    ["cotton-canvas", "linen-blend", "polyester-weave"].includes(
      String(value.materialId),
    ) &&
    ["close", "relaxed", "standard"].includes(String(value.fitPreference)) &&
    ["envelope", "slip-on", "zipper"].includes(String(value.closureType)) &&
    ["piped", "plain"].includes(String(value.seamStyle))
  );
}

function isAccount(value: unknown): value is Account {
  return (
    isRecord(value) &&
    Object.keys(value).length === 3 &&
    typeof value.email === "string" &&
    typeof value.createdAt === "string" &&
    ["customer", "administrator"].includes(String(value.role))
  );
}

function isVersion(value: unknown): value is ProjectVersion {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.versionNumber === "number" &&
    typeof value.createdAt === "string" &&
    typeof value.isCurrent === "boolean" &&
    isConfiguration(value.configuration)
  );
}

function isShare(value: unknown): value is ShareGrant {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.versionId === "string" &&
    typeof value.versionNumber === "number" &&
    typeof value.createdAt === "string"
  );
}

function isProjectSummary(value: unknown): value is ProjectSummary {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.versionCount === "number" &&
    typeof value.updatedAt === "string" &&
    ["private", "shared"].includes(String(value.privacy))
  );
}

function isProjectDetail(value: unknown): value is ProjectDetail {
  if (!isRecord(value) || !isProjectSummary(value)) return false;
  const record = value as unknown as Record<string, unknown>;
  return (
    typeof record.createdAt === "string" &&
    isVersion(record.currentVersion) &&
    Array.isArray(record.activeShares) &&
    record.activeShares.every(isShare)
  );
}

function isCustomUpload(value: unknown): value is CustomUpload {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    [
      "awaiting_upload",
      "uploaded",
      "processing",
      "awaiting_moderation",
      "approved",
      "rejected",
      "failed",
      "deleted",
      "expired",
    ].includes(String(value.state)) &&
    [
      "not_started",
      "pending",
      "approved",
      "rejected",
      "unavailable",
      "failed",
    ].includes(String(value.moderationState)) &&
    typeof value.contentType === "string" &&
    typeof value.byteSize === "number" &&
    (value.width === null || typeof value.width === "number") &&
    (value.height === null || typeof value.height === "number") &&
    typeof value.processingVersion === "string" &&
    (value.tileDerivativeId === null ||
      typeof value.tileDerivativeId === "string") &&
    (value.thumbnailDerivativeId === null ||
      typeof value.thumbnailDerivativeId === "string") &&
    typeof value.processingAttempts === "number" &&
    typeof value.moderationAttempts === "number" &&
    typeof value.retryEligible === "boolean" &&
    typeof value.referencedByVersions === "number" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (value.deletedAt === null || typeof value.deletedAt === "string")
  );
}

function isUploadOperation(value: unknown): value is UploadOperation {
  return (
    isRecord(value) &&
    ["POST", "PUT"].includes(String(value.method)) &&
    typeof value.url === "string" &&
    isRecord(value.headers) &&
    Object.values(value.headers).every((item) => typeof item === "string") &&
    isRecord(value.fields) &&
    Object.values(value.fields).every((item) => typeof item === "string") &&
    typeof value.expiresAt === "string"
  );
}

export type Parser<T> = (value: unknown) => value is T;

// Browsers that block site storage throw on access; treat that as no session.
function tokenStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  try {
    tokenStorage()?.removeItem(TOKEN_KEY);
  } catch {
    // Nothing stored to clear.
  }
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function readSessionToken(): string | null {
  try {
    const value = tokenStorage()?.getItem(TOKEN_KEY);
    return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeSessionToken(token: string): void {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new AccountApiError("The session response was malformed.");
  }
  window.sessionStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function removeSessionToken(): void {
  clearStoredToken();
}

/** Wording for failures that carry no message from the server. */
export interface FailureWording {
  readonly network: string;
  readonly timeout: string;
  readonly unreadable: string;
  readonly malformed: string;
}

const ACCOUNT_WORDING: FailureWording = {
  network: "The service could not be reached. Try again.",
  timeout: "The request timed out. Try again.",
  unreadable: "The API returned an unreadable response.",
  malformed: "The API response did not match its documented format.",
};

export interface AccountRequestOptions<T> {
  readonly method?: HttpMethod;
  readonly query?: HttpRequest["query"];
  readonly body?: unknown;
  readonly token?: string | null;
  readonly parser?: Parser<T>;
  /** The response has no body worth checking (sign-out, revoke, delete). */
  readonly empty?: boolean;
  readonly cache?: RequestCache;
  readonly signal?: AbortSignal;
  /** Defaults to the account client's wording. */
  readonly wording?: FailureWording;
}

function transportFailure(
  error: TransportError,
  wording: FailureWording,
): AccountApiError {
  switch (error.kind) {
    case "configuration":
      return new AccountApiError("The public API URL is not configured.");
    case "aborted":
      // Only a caller that cancelled sees this, and it never shows it.
      return new AccountApiError("The request was cancelled.", 0, "aborted");
    case "timeout":
      return new AccountApiError(wording.timeout, 0, "timeout");
    case "network":
      return new AccountApiError(wording.network, 0, "network_error");
  }
}

/**
 * The request path shared by the account, commerce and assurance clients.
 * A failure becomes an `AccountApiError` that carries the server's own
 * message (the API writes them for people) or the client's wording. Nothing
 * is retried: these requests include sign-in, checkout and uploads.
 */
export async function accountRequest<T>(
  path: string,
  options: AccountRequestOptions<T> = {},
): Promise<T> {
  const wording = options.wording ?? ACCOUNT_WORDING;
  let response: HttpResponse;
  try {
    response = await send({
      path,
      method: options.method,
      query: options.query,
      body: options.body,
      token: options.token,
      cache: options.cache,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof TransportError) throw transportFailure(error, wording);
    throw error;
  }
  if (response.unreadable) {
    throw new AccountApiError(
      wording.unreadable,
      response.status,
      "unreadable_response",
    );
  }
  const { body } = response;
  const error =
    !response.ok &&
    isRecord(body) &&
    Array.isArray(body.errors) &&
    isRecord(body.errors[0])
      ? body.errors[0]
      : undefined;
  const code =
    error && typeof error.code === "string" ? error.code : "request_failed";
  // A wrong passphrase re-entered to confirm account deletion is also a 401,
  // but the session is still valid, so only other 401s end it.
  if (
    response.status === 401 &&
    options.token &&
    code !== "authentication_failed"
  ) {
    clearStoredToken();
  }
  if (!response.ok) {
    throw new AccountApiError(
      error && typeof error.message === "string"
        ? error.message
        : "The request could not be completed.",
      response.status,
      code,
      {
        retryAfterSeconds: retryAfterSeconds(response.headers),
        requestId:
          isRecord(body) && typeof body.requestId === "string"
            ? body.requestId
            : undefined,
      },
    );
  }
  if (options.empty) return undefined as T;
  if (!options.parser?.(body)) {
    throw new AccountApiError(
      wording.malformed,
      response.status,
      "malformed_response",
    );
  }
  return body;
}

const isAuthSession: Parser<AuthSession> = (value): value is AuthSession =>
  isRecord(value) &&
  isAccount(value.account) &&
  typeof value.token === "string" &&
  /^[A-Za-z0-9_-]{43}$/.test(value.token) &&
  typeof value.expiresAt === "string";

const isSessionList: Parser<readonly SessionMetadata[]> = (
  value,
): value is readonly SessionMetadata[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      isRecord(item) &&
      typeof item.id === "number" &&
      typeof item.createdAt === "string" &&
      typeof item.expiresAt === "string" &&
      (item.revokedAt === null || typeof item.revokedAt === "string") &&
      typeof item.current === "boolean",
  );

const isProjectList: Parser<readonly ProjectSummary[]> = (
  value,
): value is readonly ProjectSummary[] =>
  Array.isArray(value) && value.every(isProjectSummary);
const isVersionList: Parser<readonly ProjectVersion[]> = (
  value,
): value is readonly ProjectVersion[] =>
  Array.isArray(value) && value.every(isVersion);
const isUploadList: Parser<readonly CustomUpload[]> = (
  value,
): value is readonly CustomUpload[] =>
  Array.isArray(value) && value.every(isCustomUpload);
const isUpload: Parser<CustomUpload> = isCustomUpload;
const isUploadIntent: Parser<UploadIntent> = (value): value is UploadIntent =>
  isCustomUpload(value) && isRecord(value) && isUploadOperation(value.upload);
const isAssetAccess: Parser<AssetAccess> = (value): value is AssetAccess =>
  isRecord(value) &&
  typeof value.url === "string" &&
  typeof value.expiresAt === "string" &&
  value.contentType === "image/png";

export const accountApi = {
  register(email: string, password: string) {
    return accountRequest("/auth/register", {
      method: "POST",
      body: { email, password },
      parser: isAuthSession,
    });
  },
  login(email: string, password: string) {
    return accountRequest("/auth/login", {
      method: "POST",
      body: { email, password },
      parser: isAuthSession,
    });
  },
  current(token: string) {
    return accountRequest("/account", { token, parser: isAccount });
  },
  logout(token: string) {
    return accountRequest<void>("/auth/logout", {
      method: "POST",
      token,
      empty: true,
    });
  },
  logoutAll(token: string) {
    return accountRequest<void>("/auth/logout-all", {
      method: "POST",
      token,
      empty: true,
    });
  },
  sessions(token: string) {
    return accountRequest("/account/sessions", {
      token,
      parser: isSessionList,
    });
  },
  revokeSession(token: string, id: number) {
    return accountRequest<void>(`/account/sessions/${id}`, {
      method: "DELETE",
      token,
      empty: true,
    });
  },
  export(token: string) {
    return accountRequest<Record<string, unknown>>("/account/export", {
      token,
      parser: isRecord,
    });
  },
  deleteAccount(token: string, password: string) {
    return accountRequest<Record<string, unknown>>("/account/delete", {
      method: "POST",
      token,
      body: { password },
      parser: isRecord,
    });
  },
  listProjects(token: string) {
    return accountRequest("/projects", { token, parser: isProjectList });
  },
  createProject(
    token: string,
    name: string,
    configuration: ProjectConfigurationRequest,
  ) {
    return accountRequest("/projects", {
      method: "POST",
      token,
      body: { name, configuration },
      parser: isProjectDetail,
    });
  },
  getProject(token: string, projectId: string) {
    return accountRequest(`/projects/${encodeURIComponent(projectId)}`, {
      token,
      parser: isProjectDetail,
    });
  },
  renameProject(token: string, projectId: string, name: string) {
    return accountRequest(`/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      token,
      body: { name },
      parser: isProjectDetail,
    });
  },
  deleteProject(token: string, projectId: string) {
    return accountRequest<void>(`/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
      token,
      empty: true,
    });
  },
  listVersions(token: string, projectId: string) {
    return accountRequest(
      `/projects/${encodeURIComponent(projectId)}/versions`,
      {
        token,
        parser: isVersionList,
      },
    );
  },
  getVersion(token: string, projectId: string, versionId: string) {
    return accountRequest(
      `/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}`,
      { token, parser: isVersion },
    );
  },
  createVersion(
    token: string,
    projectId: string,
    configuration: ProjectConfigurationRequest,
  ) {
    return accountRequest(
      `/projects/${encodeURIComponent(projectId)}/versions`,
      {
        method: "POST",
        token,
        body: { configuration },
        parser: isVersion,
      },
    );
  },
  createShare(token: string, projectId: string, versionId: string) {
    const parser: Parser<CreatedShare> = (value): value is CreatedShare =>
      isRecord(value) && isShare(value) && typeof value.shareToken === "string";
    return accountRequest(
      `/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/shares`,
      { method: "POST", token, parser },
    );
  },
  revokeShare(token: string, projectId: string, grantId: string) {
    return accountRequest<void>(
      `/projects/${encodeURIComponent(projectId)}/shares/${encodeURIComponent(grantId)}`,
      { method: "DELETE", token, empty: true },
    );
  },
  restoreShare(shareToken: string) {
    const parser: Parser<{
      readonly configuration: ProjectConfigurationRequest;
    }> = (
      value,
    ): value is { readonly configuration: ProjectConfigurationRequest } =>
      isRecord(value) &&
      Object.keys(value).length === 1 &&
      isConfiguration(value.configuration);
    return accountRequest(`/shares/${encodeURIComponent(shareToken)}`, {
      parser,
    });
  },
  listUploads(token: string) {
    return accountRequest("/uploads", { token, parser: isUploadList });
  },
  createUploadIntent(token: string, label: string, file: File) {
    return accountRequest("/uploads", {
      method: "POST",
      token,
      body: {
        label,
        contentType: file.type,
        byteSize: file.size,
        crop: null,
      },
      parser: isUploadIntent,
    });
  },
  getUpload(token: string, uploadId: string) {
    return accountRequest(`/uploads/${encodeURIComponent(uploadId)}`, {
      token,
      parser: isUpload,
    });
  },
  confirmUpload(token: string, uploadId: string, checksum: string) {
    return accountRequest(`/uploads/${encodeURIComponent(uploadId)}/complete`, {
      method: "POST",
      token,
      body: { checksum },
      parser: isUpload,
    });
  },
  renameUpload(token: string, uploadId: string, label: string) {
    return accountRequest(`/uploads/${encodeURIComponent(uploadId)}`, {
      method: "PATCH",
      token,
      body: { label },
      parser: isUpload,
    });
  },
  retryUpload(token: string, uploadId: string) {
    return accountRequest(`/uploads/${encodeURIComponent(uploadId)}/retry`, {
      method: "POST",
      token,
      parser: isUpload,
    });
  },
  deleteUpload(token: string, uploadId: string) {
    const parser: Parser<{
      readonly id: string;
      readonly state: "deleted";
      readonly referencedByVersions: number;
    }> = (
      value,
    ): value is {
      readonly id: string;
      readonly state: "deleted";
      readonly referencedByVersions: number;
    } =>
      isRecord(value) &&
      typeof value.id === "string" &&
      value.state === "deleted" &&
      typeof value.referencedByVersions === "number";
    return accountRequest(`/uploads/${encodeURIComponent(uploadId)}`, {
      method: "DELETE",
      token,
      parser,
    });
  },
  assetAccess(token: string, uploadId: string, kind: "thumbnail" | "tile") {
    return accountRequest(
      `/uploads/${encodeURIComponent(uploadId)}/assets/${kind}/access`,
      {
        method: "POST",
        token,
        parser: isAssetAccess,
      },
    );
  },
};

export async function sha256File(file: File): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function performUpload(
  operation: UploadOperation,
  file: File,
): Promise<void> {
  const target = operation.url.startsWith("/")
    ? `${publicEnvironment.apiUrl}${operation.url}`
    : operation.url;
  let body: BodyInit = file;
  if (operation.method === "POST") {
    const form = new FormData();
    Object.entries(operation.fields).forEach(([key, value]) =>
      form.append(key, value),
    );
    form.append("file", file);
    body = form;
  }
  const response = await fetch(target, {
    method: operation.method,
    headers: operation.method === "PUT" ? operation.headers : undefined,
    body,
  });
  if (response.status === 413) {
    throw new AccountApiError(
      "This image is larger than the 10 MB upload limit. Choose a smaller file.",
      413,
      "payload_too_large",
    );
  }
  if (!response.ok)
    throw new AccountApiError(
      "The private upload could not be transferred.",
      response.status,
    );
}

export function resolveAssetUrl(url: string): string {
  return url.startsWith("/") ? `${publicEnvironment.apiUrl}${url}` : url;
}

export function buildSharedAssetUrl(shareToken: string): string {
  return `${publicEnvironment.apiUrl}/shares/${encodeURIComponent(shareToken)}/assets/tile`;
}

export function withBasePath(path: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildProjectShareUrl(token: string): string {
  return `${window.location.origin}${withBasePath(`/configure/?share=${encodeURIComponent(token)}`)}`;
}
