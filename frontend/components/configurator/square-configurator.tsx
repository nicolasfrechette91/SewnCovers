"use client";

import { useConfiguration } from "@/context/configuration";
import { getPrototypePatternById } from "@/data/patterns";

import { ShapeSelectionStep } from "./shape-selection-step";
import { SquareMeasurementStep } from "./square-measurement-step";
import {
  hasValidSquareMeasurements,
  SquarePatternStep,
} from "./square-pattern-step";
import { SquarePreviewStep } from "./square-preview-step";
import {
  StepIndicator,
  type StepIndicatorStep,
} from "./step-indicator";

const configuratorSteps = [
  { id: "shape", label: "Shape" },
  { id: "measurements", label: "Measurements" },
  { id: "pattern", label: "Pattern" },
  { id: "preview", label: "Preview" },
  { id: "review", label: "Review" },
] as const satisfies readonly StepIndicatorStep[];

export function SquareConfigurator() {
  const { state } = useConfiguration();
  const measurementsAreValid =
    state.shape === "square" &&
    hasValidSquareMeasurements(
      state.width,
      state.thickness,
      state.unit,
    );
  const patternIsSelected =
    getPrototypePatternById(state.patternId) !== null;
  const currentStepId =
    measurementsAreValid && patternIsSelected
      ? "preview"
      : measurementsAreValid
        ? "pattern"
        : state.shape === "square"
          ? "measurements"
          : "shape";

  return (
    <>
      <StepIndicator
        className="mt-layout"
        currentStepId={currentStepId}
        steps={configuratorSteps}
      />

      <section aria-label="Shape selection" className="mt-layout">
        <ShapeSelectionStep />
      </section>

      <SquareMeasurementStep />
      <SquarePatternStep />
      <SquarePreviewStep />
    </>
  );
}
