import {
  accountRequest,
  type AccountRequestOptions,
  type CallOptions,
  type FailureWording,
} from "./account-api";
import {
  anyRecord,
  flag,
  knownOrUnknown,
  listOf,
  literal,
  numeric,
  recordOf,
  text,
  type Reader,
} from "./validation";

export const READINESS_LEVELS = ["error", "warning", "information"] as const;

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
    /** "unknown" for a level this build does not know (only shown). */
    readonly level: (typeof READINESS_LEVELS)[number] | "unknown";
    readonly message: string;
  }[];
  readonly disclaimer: string;
}

/** Queue filters; a missing one means all. */
export interface ProductionQueueFilters {
  readonly state?: string;
  readonly issueState?: string;
  readonly search?: string;
}

const ASSURANCE_WORDING: FailureWording = {
  network: "The service could not be reached. Try again.",
  timeout: "The request timed out. Try again.",
  unreadable: "The API returned an unreadable response.",
  malformed: "The API response was malformed.",
};

// Operations data is never served from the browser cache (the API also sends
// no-store on these responses).
function request<T>(
  path: string,
  options: Omit<
    AccountRequestOptions<T>,
    "cache" | "empty" | "parser" | "wording"
  > & {
    readonly method?: "GET" | "POST" | "PUT";
    readonly parser: Reader<T>;
  },
): Promise<T> {
  return accountRequest(path, {
    ...options,
    cache: "no-store",
    wording: ASSURANCE_WORDING,
  });
}

// Readers: each reads the fields this build knows (see recordOf); a field
// the API adds later is ignored. A work item's specification, checklist,
// issues and history are records the screen reads defensively, kept whole.

const recordList = listOf(anyRecord);

const readWork = recordOf<ProductionWork>({
  id: text,
  orderReference: text,
  lineIndex: numeric,
  state: text,
  qualityState: text,
  revision: numeric,
  specification: anyRecord,
  checklist: recordList,
  issues: recordList,
  history: recordList,
  demonstration: literal(true),
});

const readQueue = recordOf<ProductionQueue>({
  items: listOf(readWork),
  page: numeric,
  pageSize: numeric,
  total: numeric,
});

const readAcknowledgement = recordOf<{
  readonly id: number;
  readonly documentType: string;
  readonly documentVersion: number;
  readonly purpose: string;
  readonly acknowledgedAt: string;
}>({
  id: numeric,
  documentType: text,
  documentVersion: numeric,
  purpose: text,
  acknowledgedAt: text,
});

const readPacket = recordOf<{
  readonly content: string;
  readonly checksum: string;
  readonly generatedAt: string;
}>({ content: text, checksum: text, generatedAt: text });

const readReadiness = recordOf<ReadinessReport>({
  ready: flag,
  checks: listOf(
    recordOf<ReadinessReport["checks"][number]>({
      code: text,
      level: knownOrUnknown(READINESS_LEVELS),
      message: text,
    }),
  ),
  disclaimer: text,
});

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
      parser: readAcknowledgement,
    });
  },
  productionQueue(
    token: string,
    filters: ProductionQueueFilters = {},
    { signal }: CallOptions = {},
  ) {
    return request("admin/production-work", {
      token,
      query: {
        page: "1",
        pageSize: "20",
        state: filters.state,
        issueState: filters.issueState,
        search: filters.search,
      },
      signal,
      parser: readQueue,
    });
  },
  work(token: string, id: string) {
    return request(`admin/production-work/${encodeURIComponent(id)}`, {
      token,
      parser: readWork,
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
        parser: readWork,
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
      "admin/production-work/" + encodeURIComponent(work.id) + "/issues",
      {
        method: "POST",
        token,
        body: { code, reason, expectedRevision: work.revision },
        parser: readWork,
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
        parser: readWork,
      },
    );
  },
  quality(
    token: string,
    work: ProductionWork,
    passed: boolean,
    reason: string,
  ) {
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
        parser: readWork,
      },
    );
  },
  packet(token: string, id: string) {
    return request(`admin/production-work/${encodeURIComponent(id)}/packet`, {
      method: "POST",
      token,
      parser: readPacket,
    });
  },
  readiness() {
    return request("readiness", {
      parser: readReadiness,
    });
  },
};
