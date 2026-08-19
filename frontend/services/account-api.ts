import { publicEnvironment } from "../config/environment";
import type { CreateDesignRequest } from "./api-client";

export type ProjectPatternChoice =
  | { readonly kind: "built-in"; readonly patternId: string }
  | {
      readonly kind: "custom";
      readonly assetId: string;
      readonly derivativeId: string;
      readonly processingVersion: string;
    };

export type ProjectConfigurationRequest = Omit<
  CreateDesignRequest,
  "patternId"
> & { readonly pattern: ProjectPatternChoice };

const TOKEN_KEY = "sewncovers.session-token";
export const AUTH_CHANGED_EVENT = "sewncovers:auth-changed";

export interface Account {
  readonly email: string;
  readonly createdAt: string;
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

export class AccountApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 0, code = "request_failed") {
    super(message);
    this.name = "AccountApiError";
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPatternChoice(value: unknown): value is ProjectPatternChoice {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "built-in") {
    return (
      Object.keys(value).length === 2 &&
      typeof value.patternId === "string"
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
    "shape", "width", "height", "backWidth", "thickness", "unit",
    "pattern", "patternScale", "materialId", "fitPreference",
    "closureType", "seamStyle",
  ];
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key)) &&
    ["box", "rectangle", "round", "square", "tapered"].includes(String(value.shape)) &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    (value.backWidth === null || typeof value.backWidth === "number") &&
    typeof value.thickness === "number" &&
    ["cm", "in"].includes(String(value.unit)) &&
    isPatternChoice(value.pattern) &&
    typeof value.patternScale === "number" &&
    ["cotton-canvas", "linen-blend", "polyester-weave"].includes(String(value.materialId)) &&
    ["close", "relaxed", "standard"].includes(String(value.fitPreference)) &&
    ["envelope", "slip-on", "zipper"].includes(String(value.closureType)) &&
    ["piped", "plain"].includes(String(value.seamStyle))
  );
}

function isAccount(value: unknown): value is Account {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    typeof value.email === "string" &&
    typeof value.createdAt === "string"
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
  return typeof record.createdAt === "string" &&
    isVersion(record.currentVersion) &&
    Array.isArray(record.activeShares) &&
    record.activeShares.every(isShare);
}

function isCustomUpload(value: unknown): value is CustomUpload {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    ["awaiting_upload", "uploaded", "processing", "awaiting_moderation", "approved", "rejected", "failed", "deleted", "expired"].includes(String(value.state)) &&
    ["not_started", "pending", "approved", "rejected", "unavailable", "failed"].includes(String(value.moderationState)) &&
    typeof value.contentType === "string" &&
    typeof value.byteSize === "number" &&
    (value.width === null || typeof value.width === "number") &&
    (value.height === null || typeof value.height === "number") &&
    typeof value.processingVersion === "string" &&
    (value.tileDerivativeId === null || typeof value.tileDerivativeId === "string") &&
    (value.thumbnailDerivativeId === null || typeof value.thumbnailDerivativeId === "string") &&
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

type Parser<T> = (value: unknown) => value is T;

function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function readSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(TOKEN_KEY);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
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

async function request<T>(
  path: string,
  options: {
    readonly method?: "DELETE" | "GET" | "PATCH" | "POST";
    readonly body?: unknown;
    readonly token?: string | null;
    readonly parser?: Parser<T>;
    readonly empty?: boolean;
  } = {},
): Promise<T> {
  if (!publicEnvironment.apiUrl) {
    throw new AccountApiError("The public API URL is not configured.");
  }
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 20_000);
  try {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    const response = await fetch(
      `${publicEnvironment.apiUrl}/${path.replace(/^\/+/, "")}`,
      {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      },
    );
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      throw new AccountApiError("The API returned an unreadable response.", response.status);
    }
    if (response.status === 401 && options.token) clearStoredToken();
    if (!response.ok) {
      const error = isRecord(body) && Array.isArray(body.errors) && isRecord(body.errors[0])
        ? body.errors[0]
        : undefined;
      throw new AccountApiError(
        error && typeof error.message === "string"
          ? error.message
          : "The request could not be completed.",
        response.status,
        error && typeof error.code === "string" ? error.code : "request_failed",
      );
    }
    if (options.empty) return undefined as T;
    if (!options.parser?.(body)) {
      throw new AccountApiError("The API response did not match its documented format.", response.status, "malformed_response");
    }
    return body;
  } catch (error) {
    if (error instanceof AccountApiError) throw error;
    throw new AccountApiError(
      error instanceof DOMException && error.name === "AbortError"
        ? "The request timed out. Try again."
        : "The service could not be reached. Try again.",
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

const isAuthSession: Parser<AuthSession> = (value): value is AuthSession =>
  isRecord(value) &&
  isAccount(value.account) &&
  typeof value.token === "string" &&
  /^[A-Za-z0-9_-]{43}$/.test(value.token) &&
  typeof value.expiresAt === "string";

const isSessionList: Parser<readonly SessionMetadata[]> = (value): value is readonly SessionMetadata[] =>
  Array.isArray(value) && value.every((item) =>
    isRecord(item) &&
    typeof item.id === "number" &&
    typeof item.createdAt === "string" &&
    typeof item.expiresAt === "string" &&
    (item.revokedAt === null || typeof item.revokedAt === "string") &&
    typeof item.current === "boolean"
  );

const isProjectList: Parser<readonly ProjectSummary[]> = (value): value is readonly ProjectSummary[] =>
  Array.isArray(value) && value.every(isProjectSummary);
const isVersionList: Parser<readonly ProjectVersion[]> = (value): value is readonly ProjectVersion[] =>
  Array.isArray(value) && value.every(isVersion);
const isUploadList: Parser<readonly CustomUpload[]> = (value): value is readonly CustomUpload[] =>
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
    return request("/auth/register", { method: "POST", body: { email, password }, parser: isAuthSession });
  },
  login(email: string, password: string) {
    return request("/auth/login", { method: "POST", body: { email, password }, parser: isAuthSession });
  },
  current(token: string) {
    return request("/account", { token, parser: isAccount });
  },
  logout(token: string) {
    return request<void>("/auth/logout", { method: "POST", token, empty: true });
  },
  logoutAll(token: string) {
    return request<void>("/auth/logout-all", { method: "POST", token, empty: true });
  },
  sessions(token: string) {
    return request("/account/sessions", { token, parser: isSessionList });
  },
  revokeSession(token: string, id: number) {
    return request<void>(`/account/sessions/${id}`, { method: "DELETE", token, empty: true });
  },
  export(token: string) {
    return request<Record<string, unknown>>("/account/export", { token, parser: isRecord });
  },
  deleteAccount(token: string, password: string) {
    return request<Record<string, unknown>>("/account/delete", { method: "POST", token, body: { password }, parser: isRecord });
  },
  listProjects(token: string) {
    return request("/projects", { token, parser: isProjectList });
  },
  createProject(token: string, name: string, configuration: ProjectConfigurationRequest) {
    return request("/projects", { method: "POST", token, body: { name, configuration }, parser: isProjectDetail });
  },
  getProject(token: string, projectId: string) {
    return request(`/projects/${encodeURIComponent(projectId)}`, { token, parser: isProjectDetail });
  },
  renameProject(token: string, projectId: string, name: string) {
    return request(`/projects/${encodeURIComponent(projectId)}`, { method: "PATCH", token, body: { name }, parser: isProjectDetail });
  },
  deleteProject(token: string, projectId: string) {
    return request<void>(`/projects/${encodeURIComponent(projectId)}`, { method: "DELETE", token, empty: true });
  },
  listVersions(token: string, projectId: string) {
    return request(`/projects/${encodeURIComponent(projectId)}/versions`, { token, parser: isVersionList });
  },
  getVersion(token: string, projectId: string, versionId: string) {
    return request(`/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}`, { token, parser: isVersion });
  },
  createVersion(token: string, projectId: string, configuration: ProjectConfigurationRequest) {
    return request(`/projects/${encodeURIComponent(projectId)}/versions`, { method: "POST", token, body: { configuration }, parser: isVersion });
  },
  createShare(token: string, projectId: string, versionId: string) {
    const parser: Parser<CreatedShare> = (value): value is CreatedShare =>
      isRecord(value) && isShare(value) && typeof value.shareToken === "string";
    return request(`/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/shares`, { method: "POST", token, parser });
  },
  revokeShare(token: string, projectId: string, grantId: string) {
    return request<void>(`/projects/${encodeURIComponent(projectId)}/shares/${encodeURIComponent(grantId)}`, { method: "DELETE", token, empty: true });
  },
  restoreShare(shareToken: string) {
    const parser: Parser<{ readonly configuration: ProjectConfigurationRequest }> = (value): value is { readonly configuration: ProjectConfigurationRequest } =>
      isRecord(value) && Object.keys(value).length === 1 && isConfiguration(value.configuration);
    return request(`/shares/${encodeURIComponent(shareToken)}`, { parser });
  },
  listUploads(token: string) {
    return request("/uploads", { token, parser: isUploadList });
  },
  createUploadIntent(token: string, label: string, file: File) {
    return request("/uploads", {
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
    return request(`/uploads/${encodeURIComponent(uploadId)}`, { token, parser: isUpload });
  },
  confirmUpload(token: string, uploadId: string, checksum: string) {
    return request(`/uploads/${encodeURIComponent(uploadId)}/complete`, {
      method: "POST", token, body: { checksum }, parser: isUpload,
    });
  },
  renameUpload(token: string, uploadId: string, label: string) {
    return request(`/uploads/${encodeURIComponent(uploadId)}`, {
      method: "PATCH", token, body: { label }, parser: isUpload,
    });
  },
  retryUpload(token: string, uploadId: string) {
    return request(`/uploads/${encodeURIComponent(uploadId)}/retry`, {
      method: "POST", token, parser: isUpload,
    });
  },
  deleteUpload(token: string, uploadId: string) {
    const parser: Parser<{ readonly id: string; readonly state: "deleted"; readonly referencedByVersions: number }> =
      (value): value is { readonly id: string; readonly state: "deleted"; readonly referencedByVersions: number } =>
        isRecord(value) && typeof value.id === "string" && value.state === "deleted" && typeof value.referencedByVersions === "number";
    return request(`/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE", token, parser });
  },
  assetAccess(token: string, uploadId: string, kind: "thumbnail" | "tile") {
    return request(`/uploads/${encodeURIComponent(uploadId)}/assets/${kind}/access`, {
      method: "POST", token, parser: isAssetAccess,
    });
  },
};

export async function sha256File(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function performUpload(operation: UploadOperation, file: File): Promise<void> {
  const target = operation.url.startsWith("/")
    ? `${publicEnvironment.apiUrl}${operation.url}`
    : operation.url;
  let body: BodyInit = file;
  if (operation.method === "POST") {
    const form = new FormData();
    Object.entries(operation.fields).forEach(([key, value]) => form.append(key, value));
    form.append("file", file);
    body = form;
  }
  const response = await fetch(target, {
    method: operation.method,
    headers: operation.method === "PUT" ? operation.headers : undefined,
    body,
  });
  if (!response.ok) throw new AccountApiError("The private upload could not be transferred.", response.status);
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
