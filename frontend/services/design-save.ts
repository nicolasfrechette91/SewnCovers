import {
  hasValidMeasurementsForShape,
} from "../context/configuration/measurements";
import { normalizePatternScale } from "../context/configuration/pattern-scale";
import type { ConfigurationState } from "../context/configuration/types";
import { hasSupportedCoverOptions } from "../data/cover-options";
import type {
  ApiRequestStatus,
  CreateDesignRequest,
  DesignResponse,
  SewnCoversApiClient,
} from "./api-client";

const PATTERN_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const PUBLIC_DESIGN_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const RESPONSE_KEYS = [
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

export type DesignSaveState =
  | {
      readonly message: "Save this reviewed configuration to create a public share link.";
      readonly phase: "idle";
    }
  | {
      readonly message: string;
      readonly phase: "saving";
    }
  | {
      readonly message: string;
      readonly phase: "error";
    }
  | {
      readonly message: "Design saved. Your share link is ready.";
      readonly phase: "success";
      readonly publicId: string;
      readonly shareUrl: string;
    };

type DesignSaveListener = (state: DesignSaveState) => void;
type ShareUrlFactory = (publicId: string) => string;

const initialState: DesignSaveState = Object.freeze({
  message:
    "Save this reviewed configuration to create a public share link.",
  phase: "idle",
});

export class InvalidReviewedConfigurationError extends Error {
  constructor() {
    super("Only a complete reviewed configuration can be saved.");
    this.name = "InvalidReviewedConfigurationError";
  }
}

export class InvalidCreatedDesignResponseError extends Error {
  constructor() {
    super("The saved design response could not be verified.");
    this.name = "InvalidCreatedDesignResponseError";
  }
}

export class DesignShareClipboardError extends Error {
  constructor() {
    super("The share link could not be copied.");
    this.name = "DesignShareClipboardError";
  }
}

function hasAtMostDecimalPlaces(
  value: number,
  places: number,
): boolean {
  const [coefficient, rawExponent = "0"] = value
    .toString()
    .toLowerCase()
    .split("e");
  const [, fraction = ""] = coefficient.split(".");
  const exponent = Number(rawExponent);
  const decimalPlaces = Math.max(0, fraction.length - exponent);

  return decimalPlaces <= places;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseMatchesRequest(
  value: unknown,
  request: CreateDesignRequest,
): value is DesignResponse {
  if (!isRecord(value)) {
    return false;
  }

  const actualKeys = Object.keys(value);
  if (
    actualKeys.length !== RESPONSE_KEYS.length ||
    !RESPONSE_KEYS.every((key) => Object.hasOwn(value, key))
  ) {
    return false;
  }

  return (
    value.shape === request.shape &&
    value.width === request.width &&
    value.height === request.height &&
    value.backWidth === request.backWidth &&
    value.thickness === request.thickness &&
    value.unit === request.unit &&
    value.patternId === request.patternId &&
    value.patternScale === request.patternScale &&
    value.materialId === request.materialId &&
    value.fitPreference === request.fitPreference &&
    value.closureType === request.closureType &&
    value.seamStyle === request.seamStyle &&
    typeof value.publicId === "string" &&
    PUBLIC_DESIGN_ID_PATTERN.test(value.publicId)
  );
}

function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim();

  if (trimmed === "" || trimmed === "/") {
    return "";
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function messageFromFailureStatus(status: ApiRequestStatus): string | null {
  return status.state === "failure" ? status.message : null;
}

export function mapConfigurationToCreateDesign(
  configuration: ConfigurationState,
): CreateDesignRequest {
  const {
    backWidth,
    closureType,
    fitPreference,
    height,
    patternId,
    patternScale,
    materialId,
    seamStyle,
    shape,
    thickness,
    unit,
    width,
  } = configuration;
  const normalizedScale = normalizePatternScale(patternScale);

  if (
    shape === null ||
    width === null ||
    height === null ||
    thickness === null ||
    patternId === null ||
    !PATTERN_ID_PATTERN.test(patternId) ||
    !hasValidMeasurementsForShape(
      shape,
      width,
      height,
      thickness,
      unit,
      backWidth,
    ) ||
    !hasSupportedCoverOptions(configuration) ||
    !hasAtMostDecimalPlaces(width, 2) ||
    !hasAtMostDecimalPlaces(height, 2) ||
    (backWidth !== null && !hasAtMostDecimalPlaces(backWidth, 2)) ||
    !hasAtMostDecimalPlaces(thickness, 2) ||
    normalizedScale === null ||
    normalizedScale !== patternScale
  ) {
    throw new InvalidReviewedConfigurationError();
  }

  return Object.freeze({
    shape,
    width,
    height,
    thickness,
    unit,
    patternId,
    patternScale: normalizedScale,
    backWidth: shape === "tapered" ? backWidth : null,
    materialId,
    fitPreference,
    closureType,
    seamStyle,
  });
}

export function buildDesignShareUrl(
  publicId: string,
  origin: string,
  basePath = "",
): string {
  const normalizedOrigin = origin.replace(/\/+$/, "");
  const encodedPublicId = encodeURIComponent(publicId);

  return `${normalizedOrigin}${normalizeBasePath(basePath)}/configure/?design=${encodedPublicId}`;
}

export async function copyDesignShareUrl(
  shareUrl: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined,
): Promise<void> {
  if (clipboard === undefined) {
    throw new DesignShareClipboardError();
  }

  try {
    await clipboard.writeText(shareUrl);
  } catch {
    throw new DesignShareClipboardError();
  }
}

export class DesignSaveController {
  readonly #client: SewnCoversApiClient;
  readonly #listeners = new Set<DesignSaveListener>();
  readonly #shareUrlFactory: ShareUrlFactory;
  #pending: Promise<void> | null = null;
  #state: DesignSaveState = initialState;

  constructor(
    client: SewnCoversApiClient,
    shareUrlFactory: ShareUrlFactory,
  ) {
    this.#client = client;
    this.#shareUrlFactory = shareUrlFactory;
  }

  getSnapshot = (): DesignSaveState => this.#state;

  subscribe = (listener: DesignSaveListener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  submit(configuration: ConfigurationState): Promise<void> {
    if (this.#pending !== null) {
      return this.#pending;
    }

    if (this.#state.phase === "success") {
      return Promise.resolve();
    }

    const pending = this.#save(configuration).finally(() => {
      if (this.#pending === pending) {
        this.#pending = null;
      }
    });
    this.#pending = pending;

    return pending;
  }

  #publish(state: DesignSaveState): void {
    this.#state = Object.freeze(state);
    this.#listeners.forEach((listener) => listener(this.#state));
  }

  async #save(configuration: ConfigurationState): Promise<void> {
    let request: CreateDesignRequest;

    try {
      request = mapConfigurationToCreateDesign(configuration);
    } catch {
      this.#publish({
        message:
          "This configuration is no longer ready to save. Review the fields and try again.",
        phase: "error",
      });
      return;
    }

    this.#publish({
      message: "Connecting to SewnCovers\u2026",
      phase: "saving",
    });

    try {
      const response = await this.#client.createDesign(request, {
        onStatus: (status) => {
          if (
            status.state === "connecting" ||
            status.state === "cold-start"
          ) {
            this.#publish({
              message: status.message,
              phase: "saving",
            });
            return;
          }

          const failureMessage = messageFromFailureStatus(status);
          if (failureMessage !== null) {
            this.#publish({
              message: failureMessage,
              phase: "error",
            });
          }
        },
      });

      if (!responseMatchesRequest(response, request)) {
        throw new InvalidCreatedDesignResponseError();
      }

      this.#publish({
        message: "Design saved. Your share link is ready.",
        phase: "success",
        publicId: response.publicId,
        shareUrl: this.#shareUrlFactory(response.publicId),
      });
    } catch (error) {
      if (this.#state.phase === "error") {
        return;
      }

      this.#publish({
        message:
          error instanceof InvalidCreatedDesignResponseError
            ? "The saved design response could not be verified. Please try again."
            : "The design could not be saved. Check your connection and try again.",
        phase: "error",
      });
    }
  }
}
