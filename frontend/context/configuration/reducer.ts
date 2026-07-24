import type { ConfigurationAction, ConfigurationState } from "./types";
import {
  convertMeasurement,
  isNullableCommittedMeasurement,
} from "./measurements";

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
      return isNullableCommittedMeasurement(action.width)
        ? { ...state, width: action.width }
        : state;
    case "setSquareWidth":
      return isNullableCommittedMeasurement(action.width)
        ? { ...state, width: action.width, height: action.width }
        : state;
    case "setHeight":
      return isNullableCommittedMeasurement(action.height)
        ? { ...state, height: action.height }
        : state;
    case "setThickness":
      return isNullableCommittedMeasurement(action.thickness)
        ? { ...state, thickness: action.thickness }
        : state;
    case "setMeasurementUnit": {
      if (action.unit === state.unit) {
        return state;
      }

      const measurements = [state.width, state.height, state.thickness];

      if (!measurements.every(isNullableCommittedMeasurement)) {
        return state;
      }

      return {
        ...state,
        width: convertMeasurement(state.width, state.unit, action.unit),
        height: convertMeasurement(state.height, state.unit, action.unit),
        thickness: convertMeasurement(
          state.thickness,
          state.unit,
          action.unit,
        ),
        unit: action.unit,
      };
    }
    case "setPatternId":
      return { ...state, patternId: action.patternId };
    case "setPatternScale":
      return { ...state, patternScale: action.patternScale };
    case "resetConfiguration":
      return initialConfigurationState;
  }
}
