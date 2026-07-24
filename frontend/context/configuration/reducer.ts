import type { ConfigurationAction, ConfigurationState } from "./types";
import {
  convertMeasurement,
  isNullableCommittedMeasurement,
} from "./measurements";
import {
  normalizePatternScale,
  PATTERN_SCALE_DEFAULT,
} from "./pattern-scale";

export const initialConfigurationState: ConfigurationState = {
  shape: null,
  width: null,
  height: null,
  thickness: null,
  unit: "cm",
  patternId: null,
  patternScale: PATTERN_SCALE_DEFAULT,
};

export function configurationReducer(
  state: ConfigurationState,
  action: ConfigurationAction,
): ConfigurationState {
  switch (action.type) {
    case "setShape":
      return action.shape === "square"
        ? { ...state, shape: action.shape, height: state.width }
        : { ...state, shape: action.shape };
    case "setWidth":
      if (!isNullableCommittedMeasurement(action.width)) {
        return state;
      }

      return state.shape === "square"
        ? { ...state, width: action.width, height: action.width }
        : { ...state, width: action.width };
    case "setSquareWidth":
      return isNullableCommittedMeasurement(action.width)
        ? { ...state, width: action.width, height: action.width }
        : state;
    case "setHeight":
      return state.shape !== "square" &&
        isNullableCommittedMeasurement(action.height)
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
    case "setPatternScale": {
      const patternScale = normalizePatternScale(action.patternScale);

      return patternScale === null
        ? state
        : { ...state, patternScale };
    }
    case "resetConfiguration":
      return initialConfigurationState;
  }
}
