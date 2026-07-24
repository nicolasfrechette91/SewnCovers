import type {
  CushionShape,
  MeasurementField,
} from "@/context/configuration";

export interface CushionShapeDefinition {
  readonly description: string;
  readonly id: CushionShape;
  readonly label: string;
  readonly measurementFields: readonly MeasurementField[];
  readonly name: string;
  readonly secondDimensionLabel: "Depth" | "Height" | null;
}

export const cushionShapeDefinitions = [
  {
    id: "square",
    name: "Square",
    label: "Square cushion",
    description: "A cushion with a face that is as wide as it is tall.",
    measurementFields: ["width", "thickness"],
    secondDimensionLabel: null,
  },
  {
    id: "rectangle",
    name: "Rectangle",
    label: "Rectangle cushion",
    description:
      "A cushion with independently measured width and height.",
    measurementFields: ["width", "height", "thickness"],
    secondDimensionLabel: "Height",
  },
  {
    id: "box",
    name: "Box / bench",
    label: "Box / bench cushion",
    description:
      "A cushion measured across its top by width and depth, plus thickness.",
    measurementFields: ["width", "height", "thickness"],
    secondDimensionLabel: "Depth",
  },
] as const satisfies readonly CushionShapeDefinition[];

export function getCushionShapeDefinition(
  shape: CushionShape,
): (typeof cushionShapeDefinitions)[number] {
  return cushionShapeDefinitions.find(
    (definition) => definition.id === shape,
  )!;
}

export function getMeasurementLabel(
  shape: CushionShape,
  field: MeasurementField,
): "Depth" | "Height" | "Thickness" | "Width" {
  if (field === "height") {
    return shape === "box" ? "Depth" : "Height";
  }

  return field === "width" ? "Width" : "Thickness";
}
