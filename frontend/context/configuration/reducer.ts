import type { ConfigurationAction, ConfigurationState } from "./types";

export const initialConfigurationState: ConfigurationState = {
  shape: null,
  width: null,
  height: null,
  thickness: null,
  unit: "cm",
  patternId: null,
  patternScale: 1,
};

export function configurationReducer(
  state: ConfigurationState,
  action: ConfigurationAction,
): ConfigurationState {
  switch (action.type) {
    case "setShape":
      return { ...state, shape: action.shape };
    case "setWidth":
      return { ...state, width: action.width };
    case "setHeight":
      return { ...state, height: action.height };
    case "setThickness":
      return { ...state, thickness: action.thickness };
    case "setMeasurementUnit":
      return { ...state, unit: action.unit };
    case "setPatternId":
      return { ...state, patternId: action.patternId };
    case "setPatternScale":
      return { ...state, patternScale: action.patternScale };
    case "resetConfiguration":
      return initialConfigurationState;
  }
}
