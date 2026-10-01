// Comparing designs and links: which link a draft came from, whether it is
// saved, and whether opening a link would overwrite unsaved work. Loaded with
// the configurator's draft session and the save panels, not on every page.

import {
  readDraft,
  storableConfiguration,
  writeDraft,
  type ConfiguratorDraft,
  type DraftProjectLink,
} from "./configurator-draft";

export interface FingerprintSource {
  readonly shape: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly backWidth: number | null;
  readonly thickness: number | null;
  readonly unit: string;
  readonly pattern: unknown;
  readonly patternScale: number;
  readonly materialId: string;
  readonly fitPreference: string;
  readonly closureType: string;
  readonly seamStyle: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A short, non-reversible digest, so links and designs are compared without being stored. */
export function hashValue(value: string): string {
  let first = 0xdeadbeef;
  let second = 0x41c6ce57;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909);
  second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909);
  return (4294967296 * (2097151 & second) + (first >>> 0)).toString(36);
}

/** Identifies a design's saved values, for configurator state and saved project versions alike. */
export function designFingerprint(configuration: FingerprintSource): string {
  const pattern = isRecord(configuration.pattern) ? configuration.pattern : null;
  const patternKey =
    pattern?.kind === "built-in"
      ? [pattern.kind, pattern.patternId]
      : pattern?.kind === "solid"
        ? [pattern.kind, pattern.color]
        : pattern?.kind === "custom"
          ? [pattern.kind, pattern.assetId, pattern.derivativeId, pattern.processingVersion]
          : null;
  return hashValue(
    JSON.stringify([
      configuration.shape,
      configuration.width,
      configuration.height,
      configuration.shape === "tapered" ? configuration.backWidth : null,
      configuration.thickness,
      configuration.unit,
      patternKey,
      configuration.patternScale,
      configuration.materialId,
      configuration.fitPreference,
      configuration.closureType,
      configuration.seamStyle,
    ]),
  );
}

/**
 * A shared or project link replaced the design: remember where it came from,
 * so reopening the same link, or a later sign-in, can tell unsaved changes
 * from an untouched copy.
 */
export function recordLinkRestore(
  ref: string,
  configuration: FingerprintSource,
  project: Omit<DraftProjectLink, "fingerprint"> | null = null,
): void {
  const fingerprint = designFingerprint(configuration);
  writeDraft({
    configuration: storableConfiguration(configuration),
    step: "shape",
    highestStep: 0,
    origin: { ref: hashValue(ref), fingerprint },
    project: project ? { ...project, fingerprint } : null,
    cart: null,
    publicDesign: ref.startsWith("design:")
      ? { publicId: ref.slice("design:".length), fingerprint }
      : null,
  });
}

/** A public design link was created for this exact design. */
export function recordPublicDesign(
  publicId: string,
  configuration: FingerprintSource,
): void {
  if (readDraft() === null) return;
  writeDraft({
    publicDesign: { publicId, fingerprint: designFingerprint(configuration) },
  });
}

/**
 * True when opening a link would overwrite work the visitor can't get back:
 * a design that isn't saved to a project, isn't an untouched copy of a link,
 * and isn't the public design the link itself points to.
 */
export function draftNeedsProtection(
  draft: ConfiguratorDraft | null,
  fingerprint: string | null,
  linkRef: string,
): boolean {
  if (!draft || fingerprint === null) return false;
  if (draft.project?.fingerprint === fingerprint) return false;
  if (draft.origin?.fingerprint === fingerprint) return false;
  return !(
    draft.publicDesign?.fingerprint === fingerprint &&
    linkRef === `design:${draft.publicDesign.publicId}`
  );
}

/** The link in the current URL that loads a saved design, if any. */
export function linkRefFromSearch(search: string): string | null {
  const parameters = new URLSearchParams(search);
  const design = parameters.get("design");
  if (design !== null) return `design:${design}`;
  const share = parameters.get("share");
  if (share !== null) return `share:${share}`;
  const project = parameters.get("project");
  const version = parameters.get("version");
  return project !== null || version !== null
    ? `project:${project ?? ""}:${version ?? ""}`
    : null;
}
