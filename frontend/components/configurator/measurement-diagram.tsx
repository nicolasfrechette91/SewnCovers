import type { CushionShape } from "@/context/configuration";
import { getCushionShapeDefinition } from "@/data/shapes";

function DimensionLine({
  label,
  labelX,
  labelY,
  x1,
  x2,
  y1,
  y2,
}: Readonly<{
  label: string;
  labelX?: number;
  labelY?: number;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}>) {
  const resolvedLabelX = labelX ?? (x1 + x2) / 2;
  const resolvedLabelY = labelY ?? (y1 + y2) / 2 - 7;

  return (
    <>
      <line
        className="measurement-diagram-line"
        x1={x1}
        x2={x2}
        y1={y1}
        y2={y2}
      />
      <line
        className="measurement-diagram-line"
        x1={x1}
        x2={x1}
        y1={y1 - 5}
        y2={y1 + 5}
      />
      <line
        className="measurement-diagram-line"
        x1={x2}
        x2={x2}
        y1={y2 - 5}
        y2={y2 + 5}
      />
      <text
        className="measurement-diagram-label"
        x={resolvedLabelX}
        y={resolvedLabelY}
        textAnchor="middle"
      >
        {label}
      </text>
    </>
  );
}

function SquareDiagram() {
  return (
    <>
      <rect
        className="measurement-diagram-face"
        x="28"
        y="28"
        width="112"
        height="112"
        rx="10"
      />
      <DimensionLine
        label="Width"
        x1={28}
        x2={140}
        y1={160}
        y2={160}
      />
      <rect
        className="measurement-diagram-face"
        x="190"
        y="66"
        width="96"
        height="42"
        rx="8"
      />
      <DimensionLine
        label="Thickness"
        labelX={238}
        labelY={54}
        x1={296}
        x2={296}
        y1={66}
        y2={108}
      />
    </>
  );
}

function RectangleDiagram() {
  return (
    <>
      <rect
        className="measurement-diagram-face"
        x="38"
        y="42"
        width="152"
        height="96"
        rx="10"
      />
      <DimensionLine
        label="Width"
        x1={38}
        x2={190}
        y1={162}
        y2={162}
      />
      <DimensionLine
        label="Height"
        labelX={58}
        labelY={31}
        x1={24}
        x2={24}
        y1={42}
        y2={138}
      />
      <rect
        className="measurement-diagram-face"
        x="232"
        y="70"
        width="62"
        height="36"
        rx="7"
      />
      <DimensionLine
        label="Thickness"
        labelX={263}
        labelY={55}
        x1={304}
        x2={304}
        y1={70}
        y2={106}
      />
    </>
  );
}

function BoxDiagram() {
  return (
    <>
      <polygon
        className="measurement-diagram-face"
        points="44,62 196,30 250,70 98,102"
      />
      <polygon
        className="measurement-diagram-side"
        points="98,102 250,70 250,122 98,154"
      />
      <polygon
        className="measurement-diagram-side"
        points="44,62 98,102 98,154 44,114"
      />
      <DimensionLine
        label="Width"
        x1={98}
        x2={250}
        y1={174}
        y2={142}
      />
      <DimensionLine
        label="Depth"
        labelX={69}
        labelY={27}
        x1={34}
        x2={88}
        y1={46}
        y2={86}
      />
      <DimensionLine
        label="Thickness"
        labelX={270}
        labelY={58}
        x1={268}
        x2={268}
        y1={70}
        y2={122}
      />
    </>
  );
}

export function MeasurementDiagram({
  shape,
}: Readonly<{ shape: CushionShape }>) {
  const definition = getCushionShapeDefinition(shape);
  const caption =
    shape === "square"
      ? "Measure Width across the square face and Thickness across the side profile. Height uses the same committed value as Width."
      : shape === "rectangle"
        ? "Measure Width and Height independently across the rectangular face, then measure Thickness across the side profile."
        : "Measure Width from side to side and Depth from front to back across the top, then measure Thickness across the side profile.";

  return (
    <figure className="min-w-0 rounded-card border border-border bg-surface-subtle px-control-x py-4 sm:p-card">
      <p className="text-label font-control tracking-label text-text-primary">
        {definition.name} measurement guide
      </p>
      <div className="mt-component min-w-0 rounded-control border border-border bg-surface p-2 sm:p-3">
        <svg
          aria-hidden="true"
          className="measurement-diagram block h-auto w-full"
          viewBox="0 0 320 190"
          preserveAspectRatio="xMidYMid meet"
          focusable="false"
        >
          {shape === "square" ? <SquareDiagram /> : null}
          {shape === "rectangle" ? <RectangleDiagram /> : null}
          {shape === "box" ? <BoxDiagram /> : null}
        </svg>
      </div>
      <figcaption className="mt-component text-supporting text-text-muted">
        {caption}
      </figcaption>
    </figure>
  );
}
