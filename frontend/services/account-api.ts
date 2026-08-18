import { publicEnvironment } from "../config/environment";
import type { CreateDesignRequest } from "./api-client";

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
  readonly configuration: CreateDesignRequest;
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

function isConfiguration(value: unknown): value is CreateDesignRequest {
  if (!isRecord(value)) return false;
  const keys = [
    "shape", "width", "height", "backWidth", "thickness", "unit",
    "patternId", "patternScale", "materialId", "fitPreference",
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
    typeof value.patternId === "string" &&
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
  createProject(token: string, name: string, configuration: CreateDesignRequest) {
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
  createVersion(token: string, projectId: string, configuration: CreateDesignRequest) {
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
    const parser: Parser<{ readonly configuration: CreateDesignRequest }> = (value): value is { readonly configuration: CreateDesignRequest } =>
      isRecord(value) && Object.keys(value).length === 1 && isConfiguration(value.configuration);
    return request(`/shares/${encodeURIComponent(shareToken)}`, { parser });
  },
};

export function withBasePath(path: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildProjectShareUrl(token: string): string {
  return `${window.location.origin}${withBasePath(`/configure/?share=${encodeURIComponent(token)}`)}`;
}
