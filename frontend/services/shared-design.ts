import { hasValidMeasurementsForShape } from "../context/configuration/measurements";
import { normalizePatternScale } from "../context/configuration/pattern-scale";
import type { ConfigurationState } from "../context/configuration/types";
import type { PatternCatalogueResult } from "../data/patterns";
import { hasSupportedCoverOptions } from "../data/cover-options";
import type {
  ApiRequestStatus,
  DesignResponse,
  SewnCoversApiClient,
} from "./api-client";
import {
  PUBLIC_DESIGN_ID_PATTERN,
  readDesignResponse,
} from "./design-contract";

export type SharedDesignLoadState =
  | { readonly phase: "idle" }
  | { readonly message: string; readonly phase: "loading" }
  | {
      readonly message: "Shared design found. Loading its pattern\u2026";
      readonly phase: "waiting-patterns";
    }
  | {
      readonly message: "Shared design restored. You can keep configuring it without saving a new copy.";
      readonly phase: "restored";
    }
  | {
      readonly message: string;
      readonly phase:
        | "catalogue-error"
        | "error"
        | "malformed-id"
        | "malformed-response"
        | "not-found"
        | "pattern-unavailable"
        | "superseded";
    };

export type SharedDesignIdResult =
  | { readonly status: "malformed" }
  | { readonly status: "none" }
  | { readonly publicId: string; readonly status: "valid" };

type SharedDesignListener = (state: SharedDesignLoadState) => void;
type RestoreConfiguration = (
  configuration: Readonly<ConfigurationState>,
) => void;

const initialState: SharedDesignLoadState = Object.freeze({
  phase: "idle",
});

// The restore reads the record again with the shared reader (a test or
// another client may hand over the raw record), then checks it can be
// configured here: the requested public id, measurements in range for the
// shape, a pattern scale on the step, and cover choices this build offers.
function configurationFromResponse(
  response: DesignResponse,
  requestedPublicId: string,
): Readonly<ConfigurationState> | null {
  const design = readDesignResponse(response);
  if (
    !design ||
    design.publicId !== requestedPublicId ||
    !hasValidMeasurementsForShape(
      design.shape,
      design.width,
      design.height,
      design.thickness,
      design.unit,
      design.backWidth,
    ) ||
    normalizePatternScale(design.patternScale) !== design.patternScale ||
    !hasSupportedCoverOptions(design)
  ) {
    return null;
  }
  const pattern =
    design.solidColor !== null
      ? { kind: "solid" as const, color: design.solidColor }
      : design.patternId !== null
        ? { kind: "built-in" as const, patternId: design.patternId }
        : null;
  if (pattern === null) return null;

  return Object.freeze({
    shape: design.shape,
    width: design.width,
    height: design.height,
    backWidth: design.backWidth,
    thickness: design.thickness,
    unit: design.unit,
    pattern,
    patternScale: design.patternScale,
    materialId: design.materialId,
    fitPreference: design.fitPreference,
    closureType: design.closureType,
    seamStyle: design.seamStyle,
  });
}

function stateFromStatus(
  status: ApiRequestStatus,
): SharedDesignLoadState | null {
  if (
    status.state === "connecting" ||
    status.state === "cold-start" ||
    status.state === "retrying"
  ) {
    return {
      message: status.message,
      phase: "loading",
    };
  }

  return null;
}

function isUnknownDesignError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    readonly errors?: readonly { readonly code?: unknown }[];
    readonly status?: unknown;
  };

  return (
    candidate.status === 404 &&
    Array.isArray(candidate.errors) &&
    candidate.errors.some(({ code }) => code === "design_not_found")
  );
}

function isMalformedResponseError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { readonly category?: unknown }).category === "malformed-response"
  );
}

export function readSharedDesignId(search: string): SharedDesignIdResult {
  try {
    const searchParams = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search,
    );
    const values = searchParams.getAll("design");

    if (values.length === 0) {
      return { status: "none" };
    }

    if (values.length !== 1 || !PUBLIC_DESIGN_ID_PATTERN.test(values[0])) {
      return { status: "malformed" };
    }

    return { publicId: values[0], status: "valid" };
  } catch {
    return { status: "malformed" };
  }
}

export class SharedDesignController {
  readonly #client: SewnCoversApiClient;
  readonly #getConfigurationRevision: () => number;
  readonly #listeners = new Set<SharedDesignListener>();
  readonly #restoreConfiguration: RestoreConfiguration;
  #catalogue: PatternCatalogueResult = { status: "loading" };
  #configurationRevision = 0;
  #pendingConfiguration: Readonly<ConfigurationState> | null = null;
  #publicId: string | null = null;
  #requestVersion = 0;
  #state: SharedDesignLoadState = initialState;

  constructor(
    client: SewnCoversApiClient,
    restoreConfiguration: RestoreConfiguration,
    getConfigurationRevision: () => number,
  ) {
    this.#client = client;
    this.#restoreConfiguration = restoreConfiguration;
    this.#getConfigurationRevision = getConfigurationRevision;
  }

  getSnapshot = (): SharedDesignLoadState => this.#state;

  subscribe = (listener: SharedDesignListener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  start(search: string, catalogue: PatternCatalogueResult): void {
    this.cancel();
    this.#publicId = null;
    this.#catalogue = catalogue;
    const result = readSharedDesignId(search);

    if (result.status === "none") {
      this.#publish(initialState);
      return;
    }

    if (result.status === "malformed") {
      this.#publish({
        message:
          "This shared-design link is incomplete. Your own design hasn\u2019t changed.",
        phase: "malformed-id",
      });
      return;
    }

    this.#publicId = result.publicId;
    void this.#load();
  }

  retry(): void {
    if (this.#publicId === null) {
      return;
    }

    this.#requestVersion += 1;
    this.#pendingConfiguration = null;
    void this.#load();
  }

  updateCatalogue(catalogue: PatternCatalogueResult): void {
    this.#catalogue = catalogue;
    this.#reconcile();
  }

  configurationChanged(): void {
    if (
      this.#state.phase !== "loading" &&
      this.#state.phase !== "waiting-patterns" &&
      this.#state.phase !== "catalogue-error" &&
      this.#state.phase !== "pattern-unavailable"
    ) {
      return;
    }

    if (this.#getConfigurationRevision() !== this.#configurationRevision) {
      this.#requestVersion += 1;
      this.#pendingConfiguration = null;
      this.#publish({
        message:
          "The shared design wasn\u2019t opened because you changed your design. Your changes are kept.",
        phase: "superseded",
      });
    }
  }

  dismiss(): void {
    this.cancel();
    this.#publicId = null;
    this.#publish(initialState);
  }

  cancel(): void {
    this.#requestVersion += 1;
    this.#pendingConfiguration = null;
  }

  #publish(state: SharedDesignLoadState): void {
    this.#state = Object.freeze(state);
    this.#listeners.forEach((listener) => listener(this.#state));
  }

  async #load(): Promise<void> {
    if (this.#publicId === null) {
      return;
    }

    const publicId = this.#publicId;
    const requestVersion = this.#requestVersion + 1;
    this.#requestVersion = requestVersion;
    this.#configurationRevision = this.#getConfigurationRevision();
    this.#publish({
      message: "Connecting to SewnCovers\u2026",
      phase: "loading",
    });

    try {
      const response = await this.#client.getDesign(publicId, {
        onStatus: (status) => {
          if (requestVersion !== this.#requestVersion) {
            return;
          }

          const nextState = stateFromStatus(status);
          if (nextState !== null) {
            this.#publish(nextState);
          }
        },
      });

      if (requestVersion !== this.#requestVersion) {
        return;
      }

      const configuration = configurationFromResponse(response, publicId);

      if (configuration === null) {
        this.#publish({
          message:
            "This shared design couldn\u2019t be read. Your own design hasn\u2019t changed.",
          phase: "malformed-response",
        });
        return;
      }

      this.#pendingConfiguration = configuration;
      this.#reconcile();
    } catch (error) {
      if (requestVersion !== this.#requestVersion) {
        return;
      }

      if (isUnknownDesignError(error)) {
        this.#publish({
          message:
            "We couldn\u2019t find this shared design. Check that the link is complete. Your own design hasn\u2019t changed.",
          phase: "not-found",
        });
        return;
      }

      if (isMalformedResponseError(error)) {
        this.#publish({
          message:
            "This shared design couldn\u2019t be read. Your own design hasn\u2019t changed.",
          phase: "malformed-response",
        });
        return;
      }

      this.#publish({
        message:
          "The shared design couldn\u2019t be loaded. Your own design hasn\u2019t changed. Please try again.",
        phase: "error",
      });
    }
  }

  #reconcile(): void {
    if (this.#pendingConfiguration === null) {
      return;
    }

    if (this.#getConfigurationRevision() !== this.#configurationRevision) {
      this.#requestVersion += 1;
      this.#pendingConfiguration = null;
      this.#publish({
        message:
          "The shared design wasn\u2019t opened because you changed your design. Your changes are kept.",
        phase: "superseded",
      });
      return;
    }

    if (this.#pendingConfiguration.pattern?.kind === "solid") {
      const configuration = this.#pendingConfiguration;
      this.#pendingConfiguration = null;
      this.#restoreConfiguration(configuration);
      this.#publish({
        message:
          "Shared design restored. You can keep configuring it without saving a new copy.",
        phase: "restored",
      });
      return;
    }

    if (this.#catalogue.status === "loading") {
      this.#publish({
        message: "Shared design found. Loading its pattern\u2026",
        phase: "waiting-patterns",
      });
      return;
    }

    if (this.#catalogue.status === "error") {
      this.#publish({
        message:
          "The shared design was found, but its pattern couldn\u2019t be loaded. Your own design hasn\u2019t changed.",
        phase: "catalogue-error",
      });
      return;
    }

    if (
      this.#catalogue.status === "empty" ||
      !this.#catalogue.patterns.some(
        ({ id }) =>
          this.#pendingConfiguration?.pattern?.kind === "built-in" &&
          id === this.#pendingConfiguration.pattern.patternId,
      )
    ) {
      this.#publish({
        message:
          "The shared design\u2019s pattern is no longer available. Your own design hasn\u2019t changed.",
        phase: "pattern-unavailable",
      });
      return;
    }

    const configuration = this.#pendingConfiguration;
    this.#pendingConfiguration = null;
    this.#restoreConfiguration(configuration);
    this.#publish({
      message:
        "Shared design restored. You can keep configuring it without saving a new copy.",
      phase: "restored",
    });
  }
}
