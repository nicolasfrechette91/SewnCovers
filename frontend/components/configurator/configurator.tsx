"use client";

import {
  hasValidMeasurementsForShape,
  useConfiguration,
} from "@/context/configuration";
import { getPrototypePatternById } from "@/data/patterns";

import { MeasurementStep } from "./measurement-step";
import { PatternStep } from "./pattern-step";
import { PreviewStep } from "./preview-step";
import { ShapeSelectionStep } from "./shape-selection-step";
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

export function Configurator() {
  const { state } = useConfiguration();
  const measurementsAreValid = hasValidMeasurementsForShape(
    state.shape,
    state.width,
    state.height,
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
        : state.shape !== null
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

      <MeasurementStep />
      <PatternStep />
      <PreviewStep />
    </>
  );
}
