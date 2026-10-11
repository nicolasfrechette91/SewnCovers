import { hasValidMeasurementsForShape } from "../context/configuration/measurements";
import { normalizePatternScale } from "../context/configuration/pattern-scale";
import type { ConfigurationState } from "../context/configuration/types";
import { hasSupportedCoverOptions } from "../data/cover-options";
import type {
  ApiRequestStatus,
  CreateDesignRequest,
  DesignResponse,
  SewnCoversApiClient,
} from "./api-client";
import type { ProjectConfigurationRequest } from "./account-api";
import { normalizeBasePath } from "../config/base-path";
import { PATTERN_ID_PATTERN, readDesignResponse } from "./design-contract";
import { hasAtMostDecimalPlaces, isRecord } from "./validation";

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
  message: "Save this reviewed configuration to create a public share link.",
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

// The saved record must be the design that was sent: read it with the shared
// reader (fields this build does not know are ignored), then compare every
// field of the request. A share link is only offered for that record.
function responseMatchesRequest(
  value: unknown,
  request: CreateDesignRequest,
): value is DesignResponse {
  const saved = readDesignResponse(value);
  return (
    saved !== undefined &&
    saved.shape === request.shape &&
    saved.width === request.width &&
    saved.height === request.height &&
    saved.backWidth === request.backWidth &&
    saved.thickness === request.thickness &&
    saved.unit === request.unit &&
    saved.patternId === request.patternId &&
    saved.solidColor === request.solidColor &&
    saved.patternScale === request.patternScale &&
    saved.materialId === request.materialId &&
    saved.fitPreference === request.fitPreference &&
    saved.closureType === request.closureType &&
    saved.seamStyle === request.seamStyle
  );
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
    pattern,
    patternScale,
    materialId,
    seamStyle,
    shape,
    thickness,
    unit,
    width,
  } = configuration;
  const normalizedScale = normalizePatternScale(patternScale);
  const legacyPatternId =
    isRecord(configuration) && typeof configuration.patternId === "string"
      ? configuration.patternId
      : null;
  const patternId =
    pattern?.kind === "built-in" ? pattern.patternId : legacyPatternId;
  const solidColor = pattern?.kind === "solid" ? pattern.color : null;

  if (
    shape === null ||
    width === null ||
    height === null ||
    thickness === null ||
    (patternId === null) === (solidColor === null) ||
    (patternId !== null && !PATTERN_ID_PATTERN.test(patternId)) ||
    (solidColor !== null && !/^#[0-9A-F]{6}$/.test(solidColor)) ||
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
    solidColor,
    patternScale: normalizedScale,
    backWidth: shape === "tapered" ? backWidth : null,
    materialId,
    fitPreference,
    closureType,
    seamStyle,
  });
}

export function mapConfigurationToProjectConfiguration(
  configuration: ConfigurationState,
): ProjectConfigurationRequest {
  const validationState: ConfigurationState =
    configuration.pattern?.kind === "custom" ||
    configuration.pattern?.kind === "solid"
      ? {
          ...configuration,
          pattern: { kind: "built-in", patternId: "terrace-wave" },
        }
      : configuration;
  const validated = mapConfigurationToCreateDesign(validationState);
  if (configuration.pattern === null) {
    throw new InvalidReviewedConfigurationError();
  }
  const { patternId, solidColor: _solidColor, ...common } = validated;
  void _solidColor;
  if (
    configuration.pattern.kind === "built-in" &&
    patternId !== configuration.pattern.patternId
  ) {
    throw new InvalidReviewedConfigurationError();
  }
  const pattern =
    configuration.pattern.kind === "built-in"
      ? {
          kind: "built-in" as const,
          patternId: configuration.pattern.patternId,
        }
      : configuration.pattern.kind === "custom"
        ? {
            kind: "custom" as const,
            assetId: configuration.pattern.assetId,
            derivativeId: configuration.pattern.derivativeId,
            processingVersion: configuration.pattern.processingVersion,
          }
        : {
            kind: "solid" as const,
            color: configuration.pattern.color,
          };
  return Object.freeze({ ...common, pattern });
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

  constructor(client: SewnCoversApiClient, shareUrlFactory: ShareUrlFactory) {
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
          if (status.state === "connecting" || status.state === "cold-start") {
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
