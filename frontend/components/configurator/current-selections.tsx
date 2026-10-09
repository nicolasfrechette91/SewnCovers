"use client";

import { formatMeasurement, useConfiguration } from "@/context/configuration";
import {
  closureOptions,
  findCoverOption,
  fitOptions,
  materialOptions,
  seamOptions,
} from "@/data/cover-options";
import { getCushionShapeDefinition } from "@/data/shapes";

import { Surface } from "@/components/ui";
import { classNames } from "../ui/class-names";
import { ShapeIllustration } from "./shape-illustration";

export type CurrentSelectionsStage = "measurements" | "details" | "pattern";

const stageOrder: Readonly<Record<CurrentSelectionsStage, number>> = {
  measurements: 0,
  details: 1,
  pattern: 2,
};

export interface CurrentSelectionsProps {
  className?: string;
  /** Display name of the chosen fabric, once one is selected. */
  fabricName?: string | null;
  /** Solid fabric colour, shown as a swatch beside the fabric name. */
  fabricSolidColor?: string | null;
  stage: CurrentSelectionsStage;
}

interface SelectionRow {
  key: string;
  label: string;
  value: string;
  mono?: boolean;
}

/**
 * A read-only work ticket of the choices made so far. It is deliberately
 * non-interactive: stage navigation lives in the progress track and the
 * stage actions, so keyboard order through the configurator is unchanged.
 */
export function CurrentSelections({
  className,
  fabricName,
  fabricSolidColor,
  stage,
}: CurrentSelectionsProps) {
  const { state } = useConfiguration();

  if (state.shape === null) {
    return null;
  }

  const definition = getCushionShapeDefinition(state.shape);
  const reached = stageOrder[stage];
  const measurementValues = {
    backWidth: state.backWidth,
    height: state.height,
    thickness: state.thickness,
    width: state.width,
  } as const;
  const rows: SelectionRow[] = [
    { key: "shape", label: "Shape", value: definition.name },
  ];

  for (const { field, label } of definition.measurementFields) {
    const value = measurementValues[field];
    rows.push({
      key: field,
      label,
      mono: value !== null,
      value:
        value === null
          ? "Not yet measured"
          : `${formatMeasurement(value)} ${state.unit}`,
    });
  }

  if (reached >= stageOrder.details) {
    rows.push(
      {
        key: "material",
        label: "Material",
        value: findCoverOption(materialOptions, state.materialId).name,
      },
      {
        key: "fit",
        label: "Fit",
        value: findCoverOption(fitOptions, state.fitPreference).name,
      },
      {
        key: "closure",
        label: "Opening",
        value: findCoverOption(closureOptions, state.closureType).name,
      },
      {
        key: "edge",
        label: "Edge",
        value: findCoverOption(seamOptions, state.seamStyle).name,
      },
    );
  }

  if (reached >= stageOrder.pattern) {
    rows.push({
      key: "fabric",
      label: "Fabric",
      value: fabricName ?? "Not yet chosen",
    });
  }

  return (
    <Surface
      as="aside"
      aria-labelledby="current-selections-title"
      radius="card"
      padding="none"
      className={classNames("print-hidden", className)}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <p
          id="current-selections-title"
          className="font-mono text-eyebrow uppercase tracking-eyebrow text-accent-strong"
        >
          Current selections
        </p>
        <ShapeIllustration
          shape={state.shape}
          className="hidden h-8 w-14 shrink-0 lg:block"
        />
      </div>
      <span aria-hidden="true" className="stitch-rule block" />
      <dl className="flex flex-wrap gap-x-5 gap-y-2 px-4 pt-3 pb-4 lg:flex-col lg:flex-nowrap lg:gap-y-0 lg:divide-y lg:divide-dashed lg:divide-border">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex min-w-0 items-baseline gap-2 lg:justify-between lg:gap-3 lg:py-2"
          >
            <dt className="shrink-0 font-mono text-eyebrow uppercase tracking-eyebrow text-text-muted">
              {row.label}
            </dt>
            <dd
              className={classNames(
                "flex min-w-0 items-center gap-2 break-words text-supporting text-text-primary lg:text-right",
                row.mono && "font-mono tabular-nums",
              )}
            >
              {row.key === "fabric" && fabricSolidColor ? (
                <span
                  aria-hidden="true"
                  className="fabric-swatch inline-block size-3 shrink-0 rounded-pill border border-border-strong"
                  style={{ backgroundColor: fabricSolidColor }}
                />
              ) : null}
              <span className="min-w-0">{row.value}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Surface>
  );
}
