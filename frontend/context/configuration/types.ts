export type CushionShape = "box" | "rectangle" | "square";

export type MeasurementUnit = "cm" | "in";

export interface ConfigurationState {
  readonly shape: CushionShape | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly thickness: number | null;
  readonly unit: MeasurementUnit;
  readonly patternId: string | null;
  readonly patternScale: number;
}

export type ConfigurationAction =
  | { readonly type: "setShape"; readonly shape: CushionShape | null }
  | { readonly type: "setWidth"; readonly width: number | null }
  | {
      readonly type: "setSquareWidth";
      readonly width: number | null;
    }
  | { readonly type: "setHeight"; readonly height: number | null }
  | {
      readonly type: "setThickness";
      readonly thickness: number | null;
    }
  | {
      readonly type: "setMeasurementUnit";
      readonly unit: MeasurementUnit;
    }
  | {
      readonly type: "setPatternId";
      readonly patternId: string | null;
    }
  | { readonly type: "setPatternScale"; readonly patternScale: number }
  | { readonly type: "resetConfiguration" };
