import {
  hasValidMeasurementsForShape,
} from "../context/configuration/measurements";
import { normalizePatternScale } from "../context/configuration/pattern-scale";
import type { ConfigurationState } from "../context/configuration/types";
import type { PatternCatalogueResult } from "../data/patterns";
import type {
  ApiRequestStatus,
  DesignResponse,
  SewnCoversApiClient,
} from "./api-client";

const PUBLIC_DESIGN_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const PATTERN_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DESIGN_RESPONSE_KEYS = [
  "shape",
  "width",
  "height",
  "thickness",
  "unit",
  "patternId",
  "patternScale",
  "publicId",
] as const;

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

function hasExactKeys(
  value: object,
  expectedKeys: readonly string[],
): boolean {
  const keys = Object.keys(value);

  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}

function hasAtMostDecimalPlaces(
  value: number,
  places: number,
): boolean {
  if (!Number.isFinite(value)) {
    return false;
  }

  const [coefficient, rawExponent = "0"] = value
    .toString()
    .toLowerCase()
    .split("e");
  const [, fraction = ""] = coefficient.split(".");
  const exponent = Number(rawExponent);

  return Math.max(0, fraction.length - exponent) <= places;
}

function configurationFromResponse(
  response: DesignResponse,
  requestedPublicId: string,
): Readonly<ConfigurationState> | null {
  if (
    !hasExactKeys(response, DESIGN_RESPONSE_KEYS) ||
    response.publicId !== requestedPublicId ||
    !["box", "rectangle", "square"].includes(response.shape) ||
    !["cm", "in"].includes(response.unit) ||
    !hasAtMostDecimalPlaces(response.width, 2) ||
    !hasAtMostDecimalPlaces(response.height, 2) ||
    !hasAtMostDecimalPlaces(response.thickness, 2) ||
    !hasValidMeasurementsForShape(
      response.shape,
      response.width,
      response.height,
      response.thickness,
      response.unit,
    ) ||
    !PATTERN_ID_PATTERN.test(response.patternId) ||
    !hasAtMostDecimalPlaces(response.patternScale, 1) ||
    normalizePatternScale(response.patternScale) !==
      response.patternScale
  ) {
    return null;
  }

  return Object.freeze({
    shape: response.shape,
    width: response.width,
    height: response.height,
    thickness: response.thickness,
    unit: response.unit,
    patternId: response.patternId,
    patternScale: response.patternScale,
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
    (error as { readonly category?: unknown }).category ===
      "malformed-response"
  );
}

export function readSharedDesignId(
  search: string,
): SharedDesignIdResult {
  try {
    const searchParams = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search,
    );
    const values = searchParams.getAll("design");

    if (values.length === 0) {
      return { status: "none" };
    }

    if (
      values.length !== 1 ||
      !PUBLIC_DESIGN_ID_PATTERN.test(values[0])
    ) {
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
          "This shared-design link is malformed. Your current configuration has been kept.",
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

    if (
      this.#getConfigurationRevision() !==
      this.#configurationRevision
    ) {
      this.#requestVersion += 1;
      this.#pendingConfiguration = null;
      this.#publish({
        message:
          "Shared-design loading stopped because you changed the configuration. Your changes have been kept.",
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
    this.#configurationRevision =
      this.#getConfigurationRevision();
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

      const configuration = configurationFromResponse(
        response,
        publicId,
      );

      if (configuration === null) {
        this.#publish({
          message:
            "The shared design data could not be verified. Your current configuration has been kept.",
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
            "This shared design is unknown or has expired. Your current configuration has been kept.",
          phase: "not-found",
        });
        return;
      }

      if (isMalformedResponseError(error)) {
        this.#publish({
          message:
            "The shared design data could not be verified. Your current configuration has been kept.",
          phase: "malformed-response",
        });
        return;
      }

      this.#publish({
        message:
          "The shared design could not be loaded. Your current configuration has been kept. Please try again.",
        phase: "error",
      });
    }
  }

  #reconcile(): void {
    if (this.#pendingConfiguration === null) {
      return;
    }

    if (
      this.#getConfigurationRevision() !==
      this.#configurationRevision
    ) {
      this.#requestVersion += 1;
      this.#pendingConfiguration = null;
      this.#publish({
        message:
          "Shared-design loading stopped because you changed the configuration. Your changes have been kept.",
        phase: "superseded",
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
          "The shared design was found, but its pattern could not be loaded. Your current configuration has been kept.",
        phase: "catalogue-error",
      });
      return;
    }

    if (
      this.#catalogue.status === "empty" ||
      !this.#catalogue.patterns.some(
        ({ id }) => id === this.#pendingConfiguration?.patternId,
      )
    ) {
      this.#publish({
        message:
          "The shared design\u2019s pattern is no longer available. Your current configuration has been kept.",
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
