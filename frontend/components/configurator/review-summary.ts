import {
  formatMeasurement,
  formatPatternScale,
  hasValidMeasurementsForShape,
  isMeasurementWithinRange,
  isPatternScaleWithinRange,
  type ConfigurationState,
  type CushionShape,
  type MeasurementUnit,
} from "@/context/configuration";
import {
  getPatternCategoryLabel,
  getPatternColorLabels,
  type PatternCatalogueResult,
  type PatternDefinition,
} from "@/data/patterns";
import {
  getCushionShapeDefinition,
  getMeasurementLabel,
} from "@/data/shapes";

export const PROTOTYPE_NOTICE =
  "SewnCovers is currently a prototype. This summary is not an order, quote, or manufacturing specification. Measurements and pattern choices are for demonstration purposes only. Saving creates only a public prototype configuration link. No purchase, payment, fabrication, delivery, or order submission occurs.";

export const SUMMARY_DOWNLOAD_FILENAME =
  "sewncovers-configuration-summary.txt";

export type ReviewSection =
  | "measurements"
  | "pattern"
  | "patternScale"
  | "shape";

export interface ReviewIssue {
  readonly id: string;
  readonly message: string;
  readonly section: ReviewSection;
}

export interface ReviewSummaryField {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

export interface ReviewSummary {
  readonly fields: readonly ReviewSummaryField[];
  readonly prototypeNotice: string;
}

export type ReviewReadiness =
  | {
      readonly issues: readonly ReviewIssue[];
      readonly status: "incomplete";
    }
  | {
      readonly status: "ready";
      readonly summary: ReviewSummary;
    };

const unitLabels = {
  cm: "Centimetres (cm)",
  in: "Inches (in)",
} as const;

function formatMeasurementWithUnit(
  value: number,
  unit: ConfigurationState["unit"],
): string {
  return `${formatMeasurement(value)} ${unit}`;
}

function getInvalidMeasurementMessage(
  state: ConfigurationState,
): string | null {
  if (state.shape === null) {
    return null;
  }

  const shape = state.shape;
  const definition = getCushionShapeDefinition(shape);
  const invalidLabels: string[] = definition.measurementFields
    .filter(
      (field) =>
        !isMeasurementWithinRange(
          state[field],
          field,
          state.unit,
        ),
    )
    .map((field) => getMeasurementLabel(shape, field));

  if (
    shape === "square" &&
    isMeasurementWithinRange(state.width, "width", state.unit) &&
    (state.height !== state.width ||
      !isMeasurementWithinRange(
        state.height,
        "height",
        state.unit,
      ))
  ) {
    invalidLabels.push("equal face dimensions");
  }

  if (invalidLabels.length === 0) {
    return `Check the ${definition.name} measurements.`;
  }

  const formattedLabels =
    invalidLabels.length === 1
      ? invalidLabels[0]
      : `${invalidLabels.slice(0, -1).join(", ")} and ${invalidLabels.at(-1)}`;

  return `Enter valid ${formattedLabels.toLowerCase()} for the ${definition.name} cushion.`;
}

interface ReviewSummaryInput {
  readonly height: number;
  readonly patternScale: number;
  readonly shape: CushionShape;
  readonly thickness: number;
  readonly unit: MeasurementUnit;
  readonly width: number;
}

function buildSummary(
  configuration: ReviewSummaryInput,
  pattern: PatternDefinition,
): ReviewSummary {
  const {
    height,
    patternScale,
    shape,
    thickness,
    unit,
    width,
  } = configuration;
  const definition = getCushionShapeDefinition(shape);
  const fields: ReviewSummaryField[] = [
    {
      id: "shape",
      label: "Shape",
      value: definition.name,
    },
    {
      id: "width",
      label: "Width",
      value: formatMeasurementWithUnit(width, unit),
    },
  ];

  if (shape === "square") {
    fields.push({
      id: "equal-face-dimensions",
      label: "Equal face dimensions",
      value: `${formatMeasurement(width)} × ${formatMeasurement(height)} ${unit} (width × height)`,
    });
  } else {
    fields.push({
      id: "second-dimension",
      label: getMeasurementLabel(shape, "height"),
      value: formatMeasurementWithUnit(height, unit),
    });
  }

  fields.push(
    {
      id: "unit",
      label: "Unit",
      value: unitLabels[unit],
    },
    {
      id: "thickness",
      label: "Thickness",
      value: formatMeasurementWithUnit(thickness, unit),
    },
    {
      id: "pattern",
      label: "Pattern",
      value: pattern.name,
    },
    {
      id: "pattern-category",
      label: "Pattern category",
      value: getPatternCategoryLabel(pattern.categoryId),
    },
    {
      id: "pattern-colors",
      label: "Pattern colors",
      value: getPatternColorLabels(pattern.colorIds).join(", "),
    },
    {
      id: "pattern-scale",
      label: "Pattern scale",
      value: formatPatternScale(patternScale),
    },
  );

  return {
    fields,
    prototypeNotice: PROTOTYPE_NOTICE,
  };
}

export function deriveReviewReadiness(
  state: ConfigurationState,
  catalogueResult: PatternCatalogueResult,
): ReviewReadiness {
  if (state.shape === null) {
    return {
      status: "incomplete",
      issues: [
        {
          id: "shape-required",
          message: "Choose a cushion shape.",
          section: "shape",
        },
      ],
    };
  }

  const issues: ReviewIssue[] = [];
  const measurementsAreValid = hasValidMeasurementsForShape(
    state.shape,
    state.width,
    state.height,
    state.thickness,
    state.unit,
  );

  if (!measurementsAreValid) {
    issues.push({
      id: "measurements-invalid",
      message:
        getInvalidMeasurementMessage(state) ??
        "Enter all required measurements.",
      section: "measurements",
    });
  }

  let selectedPattern: PatternDefinition | null = null;

  if (catalogueResult.status === "loading") {
    issues.push({
      id: "catalogue-loading",
      message:
        "Wait for the pattern catalogue to finish loading.",
      section: "pattern",
    });
  } else if (catalogueResult.status === "error") {
    issues.push({
      id: "catalogue-invalid",
      message:
        "The API pattern catalogue is unavailable, so a selected pattern cannot be verified.",
      section: "pattern",
    });
  } else if (catalogueResult.status === "empty") {
    issues.push({
      id: "catalogue-empty",
      message:
        "The pattern catalogue is empty, so no pattern can be selected.",
      section: "pattern",
    });
  } else if (state.patternId === null) {
    issues.push({
      id: "pattern-required",
      message: "Choose a pattern.",
      section: "pattern",
    });
  } else {
    selectedPattern =
      catalogueResult.patterns.find(
        (pattern) => pattern.id === state.patternId,
      ) ?? null;

    if (selectedPattern === null) {
      issues.push({
        id: "pattern-unresolved",
        message:
          "The selected pattern is unavailable. Choose another pattern.",
        section: "pattern",
      });
    }
  }

  if (!isPatternScaleWithinRange(state.patternScale)) {
    issues.push({
      id: "pattern-scale-invalid",
      message: "Choose a pattern scale from 0.5× to 2.0×.",
      section: "patternScale",
    });
  }

  if (issues.length > 0 || selectedPattern === null) {
    return { status: "incomplete", issues };
  }

  const { height, thickness, width } = state;

  if (height === null || thickness === null || width === null) {
    return {
      status: "incomplete",
      issues: [
        {
          id: "measurements-invalid",
          message: "Enter all required measurements.",
          section: "measurements",
        },
      ],
    };
  }

  return {
    status: "ready",
    summary: buildSummary(
      {
        height,
        patternScale: state.patternScale,
        shape: state.shape,
        thickness,
        unit: state.unit,
        width,
      },
      selectedPattern,
    ),
  };
}

export function serializeReviewSummary(summary: ReviewSummary): string {
  const fieldLines = summary.fields.map(
    (field) => `${field.label}: ${field.value}`,
  );

  return [
    "SewnCovers configuration summary",
    "",
    ...fieldLines,
    "",
    "Prototype notice",
    summary.prototypeNotice,
    "",
  ].join("\n");
}
