import { publicEnvironment } from "../config/environment";
import { AccountApiError, removeSessionToken } from "./account-api";

export interface LegalDocument {
  readonly id: string;
  readonly documentType: string;
  readonly version: number;
  readonly title: string;
  readonly body: string;
  readonly effectiveAt: string;
  readonly reviewRequired: boolean;
}

export interface ProductionWork {
  readonly id: string;
  readonly orderReference: string;
  readonly lineIndex: number;
  readonly state: string;
  readonly qualityState: string;
  readonly revision: number;
  readonly specification: Readonly<Record<string, unknown>>;
  readonly checklist: readonly Readonly<Record<string, unknown>>[];
  readonly issues: readonly Readonly<Record<string, unknown>>[];
  readonly history: readonly Readonly<Record<string, unknown>>[];
  readonly demonstration: true;
}

export interface ProductionQueue {
  readonly items: readonly ProductionWork[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface ReadinessReport {
  readonly ready: boolean;
  readonly checks: readonly {
    readonly code: string;
    readonly level: "error" | "warning" | "information";
    readonly message: string;
  }[];
  readonly disclaimer: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function request<T>(
  path: string,
  options: {
    readonly method?: "GET" | "POST" | "PUT";
    readonly body?: unknown;
    readonly token?: string;
    readonly validate: (value: unknown) => value is T;
  },
): Promise<T> {
  if (!publicEnvironment.apiUrl) {
    throw new AccountApiError("The public API URL is not configured.");
  }
  const response = await fetch(
    `${publicEnvironment.apiUrl}/${path.replace(/^\/+/, "")}`,
    {
      method: options.method ?? "GET",
      headers: {
        ...(options.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...(options.token
          ? { Authorization: `Bearer ${options.token}` }
          : {}),
      },
      body:
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
      cache: "no-store",
    },
  );
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AccountApiError("The API returned an unreadable response.");
  }
  if (response.status === 401 && options.token) removeSessionToken();
  if (!response.ok) {
    const first =
      isRecord(body) && Array.isArray(body.errors) && isRecord(body.errors[0])
        ? body.errors[0]
        : undefined;
    throw new AccountApiError(
      first && typeof first.message === "string"
        ? first.message
        : "The request could not be completed.",
      response.status,
    );
  }
  if (!options.validate(body)) {
    throw new AccountApiError("The API response was malformed.");
  }
  return body;
}

const isWork = (value: unknown): value is ProductionWork =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.orderReference === "string" &&
  typeof value.revision === "number" &&
  isRecord(value.specification) &&
  Array.isArray(value.checklist) &&
  Array.isArray(value.issues) &&
  Array.isArray(value.history) &&
  value.demonstration === true;

export const assuranceApi = {
  acknowledge(
    token: string,
    documentType: "terms" | "commerce" | "uploads",
    purpose: "account_terms" | "sandbox_checkout" | "upload_rights",
  ) {
    return request("account/acknowledgements", {
      method: "POST",
      token,
      body: { documentType, documentVersion: 1, purpose },
      validate: (
        value,
      ): value is {
        id: number;
        documentType: string;
        documentVersion: number;
        purpose: string;
        acknowledgedAt: string;
      } =>
        isRecord(value) &&
        typeof value.id === "number" &&
        typeof value.documentType === "string" &&
        typeof value.documentVersion === "number" &&
        typeof value.purpose === "string" &&
        typeof value.acknowledgedAt === "string",
    });
  },
  productionQueue(token: string, query = "") {
    return request(`admin/production-work${query}`, {
      token,
      validate: (value): value is ProductionQueue =>
        isRecord(value) &&
        Array.isArray(value.items) &&
        value.items.every(isWork) &&
        typeof value.total === "number",
    });
  },
  work(token: string, id: string) {
    return request(`admin/production-work/${encodeURIComponent(id)}`, {
      token,
      validate: isWork,
    });
  },
  checklist(
    token: string,
    work: ProductionWork,
    itemKey: string,
    status: "pending" | "complete" | "failed",
  ) {
    return request(
      `admin/production-work/${encodeURIComponent(work.id)}/checklist/${encodeURIComponent(itemKey)}`,
      {
        method: "PUT",
        token,
        body: { status, expectedRevision: work.revision },
        validate: isWork,
      },
    );
  },
  createIssue(
    token: string,
    work: ProductionWork,
    code: string,
    reason: string,
  ) {
    return request(
      "admin/production-work/" +
        encodeURIComponent(work.id) +
        "/issues",
      {
        method: "POST",
        token,
        body: { code, reason, expectedRevision: work.revision },
        validate: isWork,
      },
    );
  },
  transition(
    token: string,
    work: ProductionWork,
    targetState: string,
    reason?: string,
  ) {
    return request(
      `admin/production-work/${encodeURIComponent(work.id)}/transition`,
      {
        method: "POST",
        token,
        body: {
          targetState,
          expectedRevision: work.revision,
          reasonCode: reason ? "manual_review" : undefined,
          reason,
        },
        validate: isWork,
      },
    );
  },
  quality(token: string, work: ProductionWork, passed: boolean, reason: string) {
    return request(
      `admin/production-work/${encodeURIComponent(work.id)}/quality/${passed ? "pass" : "fail"}`,
      {
        method: "POST",
        token,
        body: {
          code: passed ? "manual_review" : "quality_failure",
          reason,
          expectedRevision: work.revision,
        },
        validate: isWork,
      },
    );
  },
  packet(token: string, id: string) {
    return request(`admin/production-work/${encodeURIComponent(id)}/packet`, {
      method: "POST",
      token,
      validate: (
        value,
      ): value is {
        content: string;
        checksum: string;
        generatedAt: string;
      } =>
        isRecord(value) &&
        typeof value.content === "string" &&
        typeof value.checksum === "string" &&
        typeof value.generatedAt === "string",
    });
  },
  readiness() {
    return request("readiness", {
      validate: (value): value is ReadinessReport =>
        isRecord(value) &&
        typeof value.ready === "boolean" &&
        typeof value.disclaimer === "string" &&
        Array.isArray(value.checks) &&
        value.checks.every(
          (check) =>
            isRecord(check) &&
            typeof check.code === "string" &&
            ["error", "warning", "information"].includes(
              String(check.level),
            ) &&
            typeof check.message === "string",
        ),
    });
  },
};
