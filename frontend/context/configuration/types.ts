export type CushionShape =
  | "box"
  | "rectangle"
  | "round"
  | "square"
  | "tapered";

export type MeasurementUnit = "cm" | "in";

export type MaterialId =
  | "cotton-canvas"
  | "linen-blend"
  | "polyester-weave";
export type FitPreference = "close" | "relaxed" | "standard";
export type ClosureType = "envelope" | "slip-on" | "zipper";
export type SeamStyle = "piped" | "plain";

export interface ConfigurationState {
  readonly shape: CushionShape | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly backWidth: number | null;
  readonly thickness: number | null;
  readonly unit: MeasurementUnit;
  readonly patternId: string | null;
  readonly patternScale: number;
  readonly materialId: MaterialId;
  readonly fitPreference: FitPreference;
  readonly closureType: ClosureType;
  readonly seamStyle: SeamStyle;
}

export type ConfigurationAction =
  | {
      readonly type: "restoreConfiguration";
      readonly configuration: Readonly<ConfigurationState>;
    }
  | { readonly type: "setShape"; readonly shape: CushionShape | null }
  | { readonly type: "setWidth"; readonly width: number | null }
  | {
      readonly type: "setSquareWidth";
      readonly width: number | null;
    }
  | { readonly type: "setHeight"; readonly height: number | null }
  | {
      readonly type: "setBackWidth";
      readonly backWidth: number | null;
    }
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
  | { readonly type: "setMaterialId"; readonly materialId: MaterialId }
  | {
      readonly type: "setFitPreference";
      readonly fitPreference: FitPreference;
    }
  | {
      readonly type: "setClosureType";
      readonly closureType: ClosureType;
    }
  | { readonly type: "setSeamStyle"; readonly seamStyle: SeamStyle }
  | { readonly type: "resetConfiguration" };
