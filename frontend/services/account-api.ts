import { withBasePath } from "../config/base-path";
import { publicEnvironment } from "../config/environment";
import {
  CLOSURE_TYPES,
  CUSHION_SHAPES,
  FIT_PREFERENCES,
  MATERIAL_IDS,
  MEASUREMENT_UNITS,
  SEAM_STYLES,
} from "../context/configuration/types";
import type { CreateDesignRequest } from "./api-client";
import {
  retryAfterSeconds,
  send,
  TransportError,
  type HttpMethod,
  type HttpRequest,
  type HttpResponse,
} from "./http";
import {
  anyRecord,
  flag,
  isRecord,
  knownOrUnknown,
  listOf,
  literal,
  matching,
  numeric,
  oneOf,
  orNull,
  recordOf,
  text,
  textOrNull,
  type FieldReaders,
  type Reader,
} from "./validation";

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

export const ACCOUNT_ROLES = ["customer", "administrator"] as const;
export const PROJECT_PRIVACY = ["private", "shared"] as const;

export interface Account {
  readonly email: string;
  readonly createdAt: string;
  readonly role: (typeof ACCOUNT_ROLES)[number];
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
  readonly privacy: (typeof PROJECT_PRIVACY)[number];
}

export interface ProjectDetail extends ProjectSummary {
  readonly createdAt: string;
  readonly currentVersion: ProjectVersion;
  readonly activeShares: readonly ShareGrant[];
}

export const UPLOAD_STATES = [
  "awaiting_upload",
  "uploaded",
  "processing",
  "awaiting_moderation",
  "approved",
  "rejected",
  "failed",
  "deleted",
  "expired",
] as const;
export type UploadState = (typeof UPLOAD_STATES)[number];
export const MODERATION_STATES = [
  "not_started",
  "pending",
  "approved",
  "rejected",
  "unavailable",
  "failed",
] as const;
export type ModerationState = (typeof MODERATION_STATES)[number];
const UPLOAD_METHODS = ["POST", "PUT"] as const;

export interface CustomUpload {
  readonly id: string;
  readonly label: string;
  /** "unknown" for a state this build does not know (shown, never acted on). */
  readonly state: UploadState | "unknown";
  readonly moderationState: ModerationState | "unknown";
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

/**
 * What to tell people about a failed request: the API's own message (written
 * for people), or the screen's `fallback` for anything else.
 */
export function describeError(error: unknown, fallback: string): string {
  return error instanceof AccountApiError ? error.message : fallback;
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

// Readers: each reads the fields this build knows (see recordOf), so a field
// the API adds later is ignored; a missing or wrong known field makes the
// response malformed. Upload and moderation states are only shown, so an
// unknown one reads as "unknown" (shown as "Unknown status"); every other
// enumerated value is checked strictly. docs/architecture.md has the policy.

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SOLID_COLOR_PATTERN = /^#[0-9A-F]{6}$/;

const numberOrNull = orNull(numeric);

function readPatternChoice(value: unknown): ProjectPatternChoice | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === "built-in") {
    return typeof value.patternId === "string"
      ? { kind: "built-in", patternId: value.patternId }
      : undefined;
  }
  if (value.kind === "solid") {
    return typeof value.color === "string" &&
      SOLID_COLOR_PATTERN.test(value.color)
      ? { kind: "solid", color: value.color }
      : undefined;
  }
  return value.kind === "custom" &&
    typeof value.assetId === "string" &&
    typeof value.derivativeId === "string" &&
    typeof value.processingVersion === "string"
    ? {
        kind: "custom",
        assetId: value.assetId,
        derivativeId: value.derivativeId,
        processingVersion: value.processingVersion,
      }
    : undefined;
}

const readConfiguration = recordOf<ProjectConfigurationRequest>({
  shape: oneOf(CUSHION_SHAPES),
  width: numeric,
  height: numeric,
  backWidth: numberOrNull,
  thickness: numeric,
  unit: oneOf(MEASUREMENT_UNITS),
  pattern: readPatternChoice,
  patternScale: numeric,
  materialId: oneOf(MATERIAL_IDS),
  fitPreference: oneOf(FIT_PREFERENCES),
  closureType: oneOf(CLOSURE_TYPES),
  seamStyle: oneOf(SEAM_STYLES),
});

const readAccount = recordOf<Account>({
  email: text,
  createdAt: text,
  role: oneOf(ACCOUNT_ROLES),
});

const readSession = recordOf<SessionMetadata>({
  id: numeric,
  createdAt: text,
  expiresAt: text,
  revokedAt: textOrNull,
  current: flag,
});

const readVersion = recordOf<ProjectVersion>({
  id: text,
  versionNumber: numeric,
  configuration: readConfiguration,
  createdAt: text,
  isCurrent: flag,
});

const SHARE_FIELDS: FieldReaders<ShareGrant> = {
  id: text,
  versionId: text,
  versionNumber: numeric,
  createdAt: text,
};
const readShare = recordOf(SHARE_FIELDS);
const readCreatedShare = recordOf<CreatedShare>({
  ...SHARE_FIELDS,
  shareToken: text,
});

const PROJECT_SUMMARY_FIELDS: FieldReaders<ProjectSummary> = {
  id: text,
  name: text,
  versionCount: numeric,
  updatedAt: text,
  privacy: oneOf(PROJECT_PRIVACY),
};
const readProjectSummary = recordOf(PROJECT_SUMMARY_FIELDS);
const readProjectDetail = recordOf<ProjectDetail>({
  ...PROJECT_SUMMARY_FIELDS,
  createdAt: text,
  currentVersion: readVersion,
  activeShares: listOf(readShare),
});

const UPLOAD_FIELDS: FieldReaders<CustomUpload> = {
  id: text,
  label: text,
  state: knownOrUnknown(UPLOAD_STATES),
  moderationState: knownOrUnknown(MODERATION_STATES),
  contentType: text,
  byteSize: numeric,
  width: numberOrNull,
  height: numberOrNull,
  processingVersion: text,
  tileDerivativeId: textOrNull,
  thumbnailDerivativeId: textOrNull,
  processingAttempts: numeric,
  moderationAttempts: numeric,
  retryEligible: flag,
  referencedByVersions: numeric,
  createdAt: text,
  updatedAt: text,
  deletedAt: textOrNull,
};
const readUpload = recordOf(UPLOAD_FIELDS);

function readStringMap(
  value: unknown,
): Readonly<Record<string, string>> | undefined {
  return isRecord(value) &&
    Object.values(value).every((item) => typeof item === "string")
    ? (Object.fromEntries(Object.entries(value)) as Record<string, string>)
    : undefined;
}

const readUploadOperation = recordOf<UploadOperation>({
  method: oneOf(UPLOAD_METHODS),
  url: text,
  headers: readStringMap,
  fields: readStringMap,
  expiresAt: text,
});

const readUploadIntent = recordOf<UploadIntent>({
  ...UPLOAD_FIELDS,
  upload: readUploadOperation,
});

const readAssetAccess = recordOf<AssetAccess>({
  url: text,
  expiresAt: text,
  contentType: literal("image/png"),
});

const readAuthSession = recordOf<AuthSession>({
  account: readAccount,
  token: matching(SESSION_TOKEN_PATTERN),
  expiresAt: text,
});

const readSharedConfiguration = recordOf<{
  readonly configuration: ProjectConfigurationRequest;
}>({ configuration: readConfiguration });

const readDeletedUpload = recordOf<{
  readonly id: string;
  readonly state: "deleted";
  readonly referencedByVersions: number;
}>({ id: text, state: literal("deleted"), referencedByVersions: numeric });

// The account export is a file the visitor downloads: kept whole, as sent.
const readExport = anyRecord;

const readSessionList = listOf(readSession);
const readProjectList = listOf(readProjectSummary);
const readVersionList = listOf(readVersion);
const readUploadList = listOf(readUpload);

/** For calls a screen loads: cancelled when the screen no longer needs them. */
export interface CallOptions {
  readonly signal?: AbortSignal;
}

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

/**
 * Calls `listener` whenever this tab's stored token is set or removed (for
 * `useSyncExternalStore`). Session storage is per tab, so other tabs are
 * never notified: each tab keeps its own session.
 */
export function subscribeToSessionToken(listener: () => void): () => void {
  window.addEventListener(AUTH_CHANGED_EVENT, listener);
  return () => window.removeEventListener(AUTH_CHANGED_EVENT, listener);
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
  readonly parser?: Reader<T>;
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
  const parsed = options.parser?.(body);
  if (parsed === undefined) {
    throw new AccountApiError(
      wording.malformed,
      response.status,
      "malformed_response",
    );
  }
  return parsed;
}

export const accountApi = {
  register(email: string, password: string) {
    return accountRequest("/auth/register", {
      method: "POST",
      body: { email, password },
      parser: readAuthSession,
    });
  },
  login(email: string, password: string) {
    return accountRequest("/auth/login", {
      method: "POST",
      body: { email, password },
      parser: readAuthSession,
    });
  },
  current(token: string, { signal }: CallOptions = {}) {
    return accountRequest("/account", { token, parser: readAccount, signal });
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
  sessions(token: string, { signal }: CallOptions = {}) {
    return accountRequest("/account/sessions", {
      token,
      parser: readSessionList,
      signal,
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
      parser: readExport,
    });
  },
  deleteAccount(token: string, password: string) {
    return accountRequest<Record<string, unknown>>("/account/delete", {
      method: "POST",
      token,
      body: { password },
      parser: readExport,
    });
  },
  listProjects(token: string, { signal }: CallOptions = {}) {
    return accountRequest("/projects", {
      token,
      parser: readProjectList,
      signal,
    });
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
      parser: readProjectDetail,
    });
  },
  getProject(token: string, projectId: string, { signal }: CallOptions = {}) {
    return accountRequest(`/projects/${encodeURIComponent(projectId)}`, {
      token,
      parser: readProjectDetail,
      signal,
    });
  },
  renameProject(token: string, projectId: string, name: string) {
    return accountRequest(`/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      token,
      body: { name },
      parser: readProjectDetail,
    });
  },
  deleteProject(token: string, projectId: string) {
    return accountRequest<void>(`/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
      token,
      empty: true,
    });
  },
  listVersions(token: string, projectId: string, { signal }: CallOptions = {}) {
    return accountRequest(
      `/projects/${encodeURIComponent(projectId)}/versions`,
      {
        token,
        parser: readVersionList,
        signal,
      },
    );
  },
  getVersion(
    token: string,
    projectId: string,
    versionId: string,
    { signal }: CallOptions = {},
  ) {
    return accountRequest(
      `/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}`,
      { token, parser: readVersion, signal },
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
        parser: readVersion,
      },
    );
  },
  createShare(token: string, projectId: string, versionId: string) {
    return accountRequest(
      `/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/shares`,
      { method: "POST", token, parser: readCreatedShare },
    );
  },
  revokeShare(token: string, projectId: string, grantId: string) {
    return accountRequest<void>(
      `/projects/${encodeURIComponent(projectId)}/shares/${encodeURIComponent(grantId)}`,
      { method: "DELETE", token, empty: true },
    );
  },
  restoreShare(shareToken: string, { signal }: CallOptions = {}) {
    return accountRequest(`/shares/${encodeURIComponent(shareToken)}`, {
      parser: readSharedConfiguration,
      signal,
    });
  },
  listUploads(token: string, { signal }: CallOptions = {}) {
    return accountRequest("/uploads", {
      token,
      parser: readUploadList,
      signal,
    });
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
      parser: readUploadIntent,
    });
  },
  getUpload(token: string, uploadId: string, { signal }: CallOptions = {}) {
    return accountRequest(`/uploads/${encodeURIComponent(uploadId)}`, {
      token,
      parser: readUpload,
      signal,
    });
  },
  confirmUpload(token: string, uploadId: string, checksum: string) {
    return accountRequest(`/uploads/${encodeURIComponent(uploadId)}/complete`, {
      method: "POST",
      token,
      body: { checksum },
      parser: readUpload,
    });
  },
  renameUpload(token: string, uploadId: string, label: string) {
    return accountRequest(`/uploads/${encodeURIComponent(uploadId)}`, {
      method: "PATCH",
      token,
      body: { label },
      parser: readUpload,
    });
  },
  retryUpload(token: string, uploadId: string) {
    return accountRequest(`/uploads/${encodeURIComponent(uploadId)}/retry`, {
      method: "POST",
      token,
      parser: readUpload,
    });
  },
  deleteUpload(token: string, uploadId: string) {
    return accountRequest(`/uploads/${encodeURIComponent(uploadId)}`, {
      method: "DELETE",
      token,
      parser: readDeletedUpload,
    });
  },
  assetAccess(
    token: string,
    uploadId: string,
    kind: "thumbnail" | "tile",
    { signal }: CallOptions = {},
  ) {
    return accountRequest(
      `/uploads/${encodeURIComponent(uploadId)}/assets/${kind}/access`,
      {
        method: "POST",
        token,
        parser: readAssetAccess,
        signal,
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

export { withBasePath };

export function buildProjectShareUrl(token: string): string {
  return `${window.location.origin}${withBasePath(`/configure/?share=${encodeURIComponent(token)}`)}`;
}
