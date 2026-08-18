import type {
  CushionShape,
  MeasurementField,
} from "@/context/configuration";

export interface CushionShapeDefinition {
  readonly description: string;
  readonly id: CushionShape;
  readonly label: string;
  readonly measurementFields: readonly ShapeMeasurementDefinition[];
  readonly name: string;
  readonly equalFaceDimensions: boolean;
}

export interface ShapeMeasurementDefinition {
  readonly example: Readonly<Record<"cm" | "in", string>>;
  readonly field: MeasurementField;
  readonly label: string;
  readonly tip: string;
}

export const cushionShapeDefinitions = [
  {
    id: "square",
    name: "Square",
    label: "Square cushion",
    description: "A cushion with a face that is as wide as it is tall.",
    measurementFields: [
      {
        field: "width",
        label: "Width",
        tip: "Measure straight across the square face from edge to edge. Height will match this value.",
        example: { cm: "45", in: "17.75" },
      },
      {
        field: "thickness",
        label: "Thickness",
        tip: "Measure straight across the side profile at its fullest point.",
        example: { cm: "8", in: "3.15" },
      },
    ],
    equalFaceDimensions: true,
  },
  {
    id: "rectangle",
    name: "Rectangle",
    label: "Rectangle cushion",
    description:
      "A cushion with independently measured width and height.",
    measurementFields: [
      { field: "width", label: "Width", tip: "Measure from side to side across the face.", example: { cm: "80", in: "31.5" } },
      { field: "height", label: "Height", tip: "Measure from top to bottom across the face.", example: { cm: "50", in: "19.7" } },
      { field: "thickness", label: "Thickness", tip: "Measure straight across the side profile at its fullest point.", example: { cm: "10", in: "3.95" } },
    ],
    equalFaceDimensions: false,
  },
  {
    id: "box",
    name: "Box / bench",
    label: "Box / bench cushion",
    description:
      "A cushion measured across its top by width and depth, plus thickness.",
    measurementFields: [
      { field: "width", label: "Width", tip: "Measure from side to side across the top.", example: { cm: "180", in: "70.85" } },
      { field: "height", label: "Depth", tip: "Measure from front to back across the top.", example: { cm: "60", in: "23.6" } },
      { field: "thickness", label: "Thickness", tip: "Measure straight across the side profile at its fullest point.", example: { cm: "12", in: "4.7" } },
    ],
    equalFaceDimensions: false,
  },
  {
    id: "round",
    name: "Round",
    label: "Round cushion",
    description: "A circular cushion measured across its widest point.",
    measurementFields: [
      { field: "width", label: "Diameter", tip: "Measure through the centre from edge to edge at the widest point.", example: { cm: "50", in: "19.7" } },
      { field: "thickness", label: "Thickness", tip: "Measure straight across the side profile at its fullest point.", example: { cm: "8", in: "3.15" } },
    ],
    equalFaceDimensions: true,
  },
  {
    id: "tapered",
    name: "Tapered / trapezoid",
    label: "Tapered / trapezoid cushion",
    description: "A four-sided cushion with different front and back widths.",
    measurementFields: [
      { field: "width", label: "Front width", tip: "Measure the wider front edge from corner to corner.", example: { cm: "80", in: "31.5" } },
      { field: "backWidth", label: "Back width", tip: "Measure the opposite back edge from corner to corner.", example: { cm: "65", in: "25.6" } },
      { field: "height", label: "Depth", tip: "Measure through the centre from the front edge to the back edge.", example: { cm: "55", in: "21.65" } },
      { field: "thickness", label: "Thickness", tip: "Measure straight across the side profile at its fullest point.", example: { cm: "10", in: "3.95" } },
    ],
    equalFaceDimensions: false,
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
): string {
  return getCushionShapeDefinition(shape).measurementFields.find(
    (measurement) => measurement.field === field,
  )?.label ?? field;
}

export function getShapeMeasurementDefinition(
  shape: CushionShape,
  field: MeasurementField,
): ShapeMeasurementDefinition {
  return getCushionShapeDefinition(shape).measurementFields.find(
    (measurement) => measurement.field === field,
  )!;
}
