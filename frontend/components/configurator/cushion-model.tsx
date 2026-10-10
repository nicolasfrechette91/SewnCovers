import { useId, type CSSProperties } from "react";

import { classNames } from "@/components/ui/class-names";
import type { CushionShape } from "@/context/configuration";

import {
  buildCushionGeometry,
  CUSHION_VIEWBOX_HEIGHT,
  CUSHION_VIEWBOX_WIDTH,
} from "./cushion-geometry";

type CushionPatternStyle = CSSProperties & {
  "--pattern-scale": number;
};

export interface CushionModelProps {
  readonly patternClassName?: string;
  readonly patternName?: string;
  readonly patternScale: number;
  readonly patternUrl?: string;
  readonly solidColor?: string;
  readonly seamStyle?: "piped" | "plain";
  /** The silhouette to draw; a rectangle when omitted. */
  readonly shape?: CushionShape | null;
  /** Entered measurements, in any single unit; only their ratios are used. */
  readonly width?: number | null;
  readonly height?: number | null;
  readonly backWidth?: number | null;
  readonly thickness?: number | null;
}

export function CushionModel({
  patternClassName = "",
  patternName,
  patternScale,
  patternUrl,
  solidColor,
  seamStyle = "plain",
  shape,
  width,
  height,
  backWidth,
  thickness,
}: CushionModelProps) {
  const id = useId().replaceAll(":", "");
  const clipId = `cushion-clip-${id}`;
  const bodyGradientId = `cushion-body-${id}`;
  const shadeGradientId = `cushion-shade-${id}`;
  const highlightGradientId = `cushion-highlight-${id}`;
  const foldGradientId = `cushion-fold-${id}`;
  const shadowGradientId = `cushion-shadow-${id}`;
  const geometry = buildCushionGeometry({
    shape,
    width,
    height,
    backWidth,
    thickness,
  });
  const hasFabric = Boolean(patternName || solidColor);
  const patternStyle: CushionPatternStyle = {
    "--pattern-scale": patternScale,
    backgroundImage: patternUrl ? `url("${patternUrl}")` : undefined,
    backgroundColor: solidColor,
    backgroundSize: patternUrl
      ? `${Math.round(145 * patternScale)}px auto`
      : undefined,
  };
  const seamClassName =
    seamStyle === "piped"
      ? "cushion-preview-seam cushion-preview-seam-piped"
      : "cushion-preview-seam";
  const { shadow } = geometry;

  return (
    <svg
      className="cushion-preview-model"
      viewBox={`0 0 ${CUSHION_VIEWBOX_WIDTH} ${CUSHION_VIEWBOX_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      focusable="false"
      data-pattern-applied={hasFabric ? "true" : "false"}
      data-fabric-kind={
        solidColor ? "solid" : patternName ? "pattern" : "neutral"
      }
      data-preview-model="cushion"
      data-preview-shape={geometry.shape}
      data-preview-band={geometry.bands.length > 0 ? "true" : "false"}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={geometry.outline} />
        </clipPath>
        <linearGradient id={bodyGradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--shade-cloth-light)" />
          <stop offset="0.5" stopColor="var(--shade-cloth-mid)" />
          <stop offset="1" stopColor="var(--shade-cloth-dark)" />
        </linearGradient>
        <linearGradient id={shadeGradientId} x1="0" x2="0.92" y1="0" y2="1">
          <stop offset="0" stopColor="var(--shade-sheen)" stopOpacity="0.22" />
          <stop offset="0.48" stopColor="var(--shade-sheen)" stopOpacity="0" />
          <stop
            offset="0.82"
            stopColor="var(--shade-penumbra)"
            stopOpacity="0.14"
          />
          <stop offset="1" stopColor="var(--shade-umbra)" stopOpacity="0.25" />
        </linearGradient>
        <radialGradient id={highlightGradientId} cx="48%" cy="42%" r="62%">
          <stop offset="0" stopColor="var(--shade-glint)" stopOpacity="0.26" />
          <stop
            offset="0.55"
            stopColor="var(--shade-glint)"
            stopOpacity="0.07"
          />
          <stop offset="1" stopColor="var(--shade-glint)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={foldGradientId} x1="0" x2="1">
          <stop offset="0" stopColor="var(--shade-umbra)" stopOpacity="0" />
          <stop
            offset="0.5"
            stopColor="var(--shade-umbra)"
            stopOpacity="0.18"
          />
          <stop offset="1" stopColor="var(--shade-umbra)" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={shadowGradientId}>
          <stop offset="0" stopColor="var(--shade-cast)" stopOpacity="0.3" />
          <stop
            offset="0.72"
            stopColor="var(--shade-cast)"
            stopOpacity="0.12"
          />
          <stop offset="1" stopColor="var(--shade-cast)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse
        className="cushion-preview-shadow"
        cx={shadow.cx}
        cy={shadow.cy}
        rx={shadow.rx}
        ry={shadow.ry}
        transform={
          shadow.angle
            ? `rotate(${shadow.angle} ${shadow.cx} ${shadow.cy})`
            : undefined
        }
        fill={`url(#${shadowGradientId})`}
      />
      <path
        className="cushion-preview-base"
        d={geometry.outline}
        fill={`url(#${bodyGradientId})`}
      />
      {hasFabric ? (
        <foreignObject
          className="cushion-preview-pattern-viewport"
          x={geometry.fabricBox.x}
          y={geometry.fabricBox.y}
          width={geometry.fabricBox.width}
          height={geometry.fabricBox.height}
          clipPath={`url(#${clipId})`}
        >
          <div
            className={classNames(
              solidColor ? "cushion-preview-solid" : "prototype-pattern",
              !solidColor && patternClassName,
              "cushion-preview-face cushion-preview-pattern",
            )}
            style={patternStyle}
          />
        </foreignObject>
      ) : null}
      {geometry.bands.map((band) => (
        <path
          key={band.tone}
          className={classNames(
            "cushion-preview-band",
            `cushion-preview-band-${band.tone}`,
          )}
          d={band.d}
          clipPath={`url(#${clipId})`}
        />
      ))}
      <path
        className="cushion-preview-shading"
        d={geometry.outline}
        fill={`url(#${shadeGradientId})`}
      />
      <path
        className="cushion-preview-highlight"
        d={geometry.face}
        fill={`url(#${highlightGradientId})`}
      />

      {geometry.folds.map((fold) => (
        <path key={fold} className="cushion-preview-fold" d={fold} />
      ))}
      {geometry.lowerFold ? (
        <path
          className="cushion-preview-lower-fold"
          d={geometry.lowerFold}
          stroke={`url(#${foldGradientId})`}
        />
      ) : null}
      {geometry.creases.map((crease) => (
        <path key={crease} className="cushion-preview-crease" d={crease} />
      ))}
      {geometry.seams.map((seam) => (
        <path key={seam} className={seamClassName} d={seam} />
      ))}
      <path className="cushion-preview-edge" d={geometry.outline} />
    </svg>
  );
}
