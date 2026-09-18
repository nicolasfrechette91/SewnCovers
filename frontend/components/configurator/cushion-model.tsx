import { useId, type CSSProperties } from "react";

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
}

const cushionPath =
  "M91 91 C76 111 75 151 82 191 C74 241 77 305 103 337 C143 374 478 376 523 340 C550 309 555 244 548 190 C555 145 550 107 531 88 C493 56 132 58 91 91 Z";
const seamPath =
  "M105 101 C91 121 91 155 97 192 C90 240 94 294 116 323 C158 353 466 355 510 326 C533 298 538 242 532 191 C538 151 533 118 518 101 C475 75 148 76 105 101 Z";

export function CushionModel({
  patternClassName = "",
  patternName,
  patternScale,
  patternUrl,
  solidColor,
  seamStyle = "plain",
}: CushionModelProps) {
  const id = useId().replaceAll(":", "");
  const clipId = `cushion-clip-${id}`;
  const bodyGradientId = `cushion-body-${id}`;
  const shadeGradientId = `cushion-shade-${id}`;
  const highlightGradientId = `cushion-highlight-${id}`;
  const foldGradientId = `cushion-fold-${id}`;
  const shadowGradientId = `cushion-shadow-${id}`;
  const hasFabric = Boolean(patternName || solidColor);
  const patternStyle: CushionPatternStyle = {
    "--pattern-scale": patternScale,
    backgroundImage: patternUrl ? `url("${patternUrl}")` : undefined,
    backgroundColor: solidColor,
    backgroundSize: patternUrl
      ? `${Math.round(145 * patternScale)}px auto`
      : undefined,
  };

  return (
    <svg
      className="cushion-preview-model"
      viewBox="0 0 640 430"
      preserveAspectRatio="xMidYMid meet"
      focusable="false"
      data-pattern-applied={hasFabric ? "true" : "false"}
      data-fabric-kind={solidColor ? "solid" : patternName ? "pattern" : "neutral"}
      data-preview-model="cushion"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={cushionPath} />
        </clipPath>
        <linearGradient id={bodyGradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#e8dfd0" />
          <stop offset="0.5" stopColor="#d8cbbb" />
          <stop offset="1" stopColor="#bbae9d" />
        </linearGradient>
        <linearGradient id={shadeGradientId} x1="0" x2="0.92" y1="0" y2="1">
          <stop offset="0" stopColor="#fffaf0" stopOpacity="0.22" />
          <stop offset="0.48" stopColor="#fffaf0" stopOpacity="0" />
          <stop offset="0.82" stopColor="#594c3e" stopOpacity="0.14" />
          <stop offset="1" stopColor="#30271f" stopOpacity="0.25" />
        </linearGradient>
        <radialGradient id={highlightGradientId} cx="48%" cy="42%" r="62%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.26" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.07" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={foldGradientId} x1="0" x2="1">
          <stop offset="0" stopColor="#30271f" stopOpacity="0" />
          <stop offset="0.5" stopColor="#30271f" stopOpacity="0.18" />
          <stop offset="1" stopColor="#30271f" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={shadowGradientId}>
          <stop offset="0" stopColor="#4b3b2c" stopOpacity="0.3" />
          <stop offset="0.72" stopColor="#4b3b2c" stopOpacity="0.12" />
          <stop offset="1" stopColor="#4b3b2c" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse
        className="cushion-preview-shadow"
        cx="320"
        cy="360"
        rx="238"
        ry="35"
        fill={`url(#${shadowGradientId})`}
      />
      <path
        className="cushion-preview-base"
        d={cushionPath}
        fill={`url(#${bodyGradientId})`}
      />
      {hasFabric ? (
        <foreignObject
          className="cushion-preview-pattern-viewport"
          x="72"
          y="52"
          width="490"
          height="326"
          clipPath={`url(#${clipId})`}
        >
          <div
            className={`${solidColor ? "cushion-preview-solid" : `prototype-pattern ${patternClassName}`} cushion-preview-face cushion-preview-pattern`}
            style={patternStyle}
          />
        </foreignObject>
      ) : null}
      <path
        className="cushion-preview-shading"
        d={cushionPath}
        fill={`url(#${shadeGradientId})`}
      />
      <path
        className="cushion-preview-highlight"
        d={cushionPath}
        fill={`url(#${highlightGradientId})`}
      />

      <path className="cushion-preview-fold" d="M93 93 C121 105 135 131 143 167" />
      <path className="cushion-preview-fold" d="M530 89 C502 106 491 132 484 164" />
      <path className="cushion-preview-fold" d="M103 338 C132 321 146 298 151 270" />
      <path className="cushion-preview-fold" d="M523 339 C497 320 483 298 478 272" />
      <path
        className="cushion-preview-lower-fold"
        d="M135 326 C230 346 407 348 504 327"
        stroke={`url(#${foldGradientId})`}
      />
      <path
        className={`cushion-preview-seam ${seamStyle === "piped" ? "cushion-preview-seam-piped" : ""}`}
        d={seamPath}
      />
      <path className="cushion-preview-edge" d={cushionPath} />
    </svg>
  );
}
