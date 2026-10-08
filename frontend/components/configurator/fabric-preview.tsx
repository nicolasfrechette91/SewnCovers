"use client";

import {
  formatPatternScale,
  useConfiguration,
} from "@/context/configuration";
import { getCushionShapeDefinition } from "@/data/shapes";

import { classNames } from "../ui/class-names";
import { CushionModel } from "./cushion-model";
import type { SelectedPatternPresentation } from "./preview-step";

export interface FabricPreviewProps {
  className?: string;
  /** The chosen fabric, or null before one is chosen. */
  fabric: SelectedPatternPresentation | null;
}

/**
 * The Pattern stage's live preview: the chosen colour or built-in pattern on
 * the cushion's own silhouette, at the current pattern size. An uploaded
 * pattern is fetched and checked on the Preview stage, so here the cushion
 * stays neutral and the caption says where to see it.
 */
export function FabricPreview({ className, fabric }: FabricPreviewProps) {
  const { state } = useConfiguration();

  if (state.shape === null) {
    return null;
  }

  const shapeName = getCushionShapeDefinition(state.shape).name.toLowerCase();
  const isUpload = Boolean(fabric?.previewUrl);
  const shown = fabric !== null && !isUpload ? fabric : null;
  const caption =
    fabric === null
      ? "Choose a colour or pattern to see it on your cushion."
      : isUpload
        ? "Your own pattern appears on the next step."
        : fabric.solidColor
          ? `Solid colour on your ${shapeName} cushion`
          : `${fabric.name} on your ${shapeName} cushion, pattern size ${formatPatternScale(state.patternScale)}`;

  return (
    <figure
      className={classNames(
        "fabric-preview cutting-mat min-w-0 rounded-card border border-border p-3",
        className,
      )}
    >
      <div aria-hidden="true" className="mx-auto max-w-sm">
        <CushionModel
          patternClassName={shown?.solidColor ? undefined : shown?.previewClassName}
          patternName={shown?.name}
          patternScale={state.patternScale}
          seamStyle={state.seamStyle}
          solidColor={shown?.solidColor}
          shape={state.shape}
          width={state.width}
          height={state.height}
          backWidth={state.backWidth}
          thickness={state.thickness}
        />
      </div>
      <figcaption className="mt-2 break-words text-center text-supporting text-text-muted">
        {caption}
      </figcaption>
    </figure>
  );
}
