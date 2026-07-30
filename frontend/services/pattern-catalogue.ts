import {
  ALL_PATTERN_CATEGORIES,
  ALL_PATTERN_COLORS,
  resolvePatternResponses,
  type PatternCatalogueResult,
  type PatternDefinition,
  type PatternFilters,
} from "../data/patterns";
import type {
  ApiRequestStatus,
  PatternQuery,
  SewnCoversApiClient,
} from "./api-client";

export type PatternCataloguePhase =
  | "empty"
  | "error"
  | "loading"
  | "ready";

export interface PatternCatalogueState {
  readonly allPatterns: readonly PatternDefinition[];
  readonly filters: PatternFilters;
  readonly issues: readonly string[];
  readonly message: string;
  readonly phase: PatternCataloguePhase;
  readonly visiblePatterns: readonly PatternDefinition[];
}

type PatternCatalogueListener = (
  state: PatternCatalogueState,
) => void;

export const initialPatternFilters: PatternFilters = Object.freeze({
  categoryId: ALL_PATTERN_CATEGORIES,
  colorId: ALL_PATTERN_COLORS,
});

const initialState: PatternCatalogueState = Object.freeze({
  allPatterns: [],
  filters: initialPatternFilters,
  issues: [],
  message: "Connecting to SewnCovers\u2026",
  phase: "loading",
  visiblePatterns: [],
});

function filtersAreActive(filters: PatternFilters): boolean {
  return (
    filters.categoryId !== ALL_PATTERN_CATEGORIES ||
    filters.colorId !== ALL_PATTERN_COLORS
  );
}

function buildPatternQuery(filters: PatternFilters): PatternQuery {
  return {
    category:
      filters.categoryId === ALL_PATTERN_CATEGORIES
        ? undefined
        : filters.categoryId,
    color:
      filters.colorId === ALL_PATTERN_COLORS
        ? undefined
        : filters.colorId,
  };
}

function stateFromStatus(
  state: PatternCatalogueState,
  status: ApiRequestStatus,
): PatternCatalogueState {
  if (status.state === "failure") {
    return {
      ...state,
      issues: [],
      message: status.message,
      phase: "error",
      visiblePatterns: [],
    };
  }

  if (status.state === "success") {
    return state;
  }

  return {
    ...state,
    issues: [],
    message: status.message,
    phase: "loading",
    visiblePatterns: [],
  };
}

export class PatternCatalogueController {
  readonly #client: SewnCoversApiClient;
  readonly #listeners = new Set<PatternCatalogueListener>();
  #requestVersion = 0;
  #state: PatternCatalogueState = initialState;

  constructor(client: SewnCoversApiClient) {
    this.#client = client;
  }

  getSnapshot = (): PatternCatalogueState => this.#state;

  subscribe = (listener: PatternCatalogueListener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  cancelPending(): void {
    this.#requestVersion += 1;
  }

  loadInitial(): Promise<void> {
    return this.#load(initialPatternFilters);
  }

  retry(): Promise<void> {
    return this.#load(this.#state.filters);
  }

  setFilters(filters: PatternFilters): Promise<void> {
    return this.#load(Object.freeze({ ...filters }));
  }

  #publish(state: PatternCatalogueState): void {
    this.#state = Object.freeze(state);
    this.#listeners.forEach((listener) => listener(this.#state));
  }

  async #load(filters: PatternFilters): Promise<void> {
    const requestVersion = this.#requestVersion + 1;
    this.#requestVersion = requestVersion;
    const completeCatalogue = !filtersAreActive(filters);

    this.#publish({
      ...this.#state,
      filters,
      issues: [],
      message: "Connecting to SewnCovers\u2026",
      phase: "loading",
      visiblePatterns: [],
    });

    try {
      const response = await this.#client.listPatterns(
        buildPatternQuery(filters),
        {
          onStatus: (status) => {
            if (requestVersion !== this.#requestVersion) {
              return;
            }

            this.#publish(stateFromStatus(this.#state, status));
          },
        },
      );

      if (requestVersion !== this.#requestVersion) {
        return;
      }

      const resolved = resolvePatternResponses(response, {
        completeCatalogue,
        filters,
      });

      if (resolved.status === "error") {
        this.#publish({
          ...this.#state,
          issues: resolved.issues,
          message:
            "The pattern data returned by the API could not be displayed.",
          phase: "error",
          visiblePatterns: [],
        });
        return;
      }

      if (resolved.status === "empty") {
        this.#publish({
          ...this.#state,
          allPatterns: completeCatalogue ? [] : this.#state.allPatterns,
          issues: [],
          message: completeCatalogue
            ? "No patterns are currently available."
            : "No patterns match these filters.",
          phase: "empty",
          visiblePatterns: [],
        });
        return;
      }

      if (resolved.status !== "ready") {
        return;
      }

      this.#publish({
        allPatterns: completeCatalogue
          ? resolved.patterns
          : this.#state.allPatterns,
        filters,
        issues: [],
        message: "Patterns loaded.",
        phase: "ready",
        visiblePatterns: resolved.patterns,
      });
    } catch {
      if (
        requestVersion === this.#requestVersion &&
        this.#state.phase !== "error"
      ) {
        this.#publish({
          ...this.#state,
          issues: [],
          message:
            "The SewnCovers API could not load patterns. Please try again.",
          phase: "error",
          visiblePatterns: [],
        });
      }
    }
  }
}

export function getCompleteCatalogueResult(
  state: PatternCatalogueState,
): PatternCatalogueResult {
  if (state.allPatterns.length > 0) {
    return { status: "ready", patterns: state.allPatterns };
  }

  if (state.phase === "loading") {
    return { status: "loading" };
  }

  if (state.phase === "error") {
    return {
      status: "error",
      issues:
        state.issues.length > 0
          ? state.issues
          : [state.message],
    };
  }

  return { status: "empty" };
}
