import type { ConfigurationAction, ConfigurationState } from "./types";
import {
  convertMeasurement,
  hasValidMeasurementsForShape,
  isNullableCommittedMeasurement,
  roundMeasurement,
} from "./measurements";
import {
  normalizePatternScale,
  PATTERN_SCALE_DEFAULT,
} from "./pattern-scale";
import {
  DEFAULT_CLOSURE_TYPE,
  DEFAULT_FIT_PREFERENCE,
  DEFAULT_MATERIAL_ID,
  DEFAULT_SEAM_STYLE,
  hasSupportedCoverOptions,
} from "../../data/cover-options";

export const initialConfigurationState: ConfigurationState = {
  shape: null,
  width: null,
  height: null,
  backWidth: null,
  thickness: null,
  unit: "cm",
  patternId: null,
  patternScale: PATTERN_SCALE_DEFAULT,
  materialId: DEFAULT_MATERIAL_ID,
  fitPreference: DEFAULT_FIT_PREFERENCE,
  closureType: DEFAULT_CLOSURE_TYPE,
  seamStyle: DEFAULT_SEAM_STYLE,
};

export function configurationReducer(
  state: ConfigurationState,
  action: ConfigurationAction,
): ConfigurationState {
  switch (action.type) {
    case "restoreConfiguration": {
      const configuration = action.configuration;
      const patternScale = normalizePatternScale(
        configuration.patternScale,
      );

      if (
        configuration.shape === null ||
        !["box", "rectangle", "round", "square", "tapered"].includes(
          configuration.shape,
        ) ||
        !hasValidMeasurementsForShape(
          configuration.shape,
          configuration.width,
          configuration.height,
          configuration.thickness,
          configuration.unit,
          configuration.backWidth,
        ) ||
        configuration.width === null ||
        roundMeasurement(configuration.width) !==
          configuration.width ||
        configuration.height === null ||
        roundMeasurement(configuration.height) !==
          configuration.height ||
        configuration.thickness === null ||
        roundMeasurement(configuration.thickness) !==
          configuration.thickness ||
        configuration.patternId === null ||
        !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(
          configuration.patternId,
        ) ||
        patternScale !== configuration.patternScale ||
        !isNullableCommittedMeasurement(configuration.backWidth) ||
        (configuration.backWidth !== null &&
          roundMeasurement(configuration.backWidth) !==
            configuration.backWidth) ||
        !hasSupportedCoverOptions(configuration)
      ) {
        return state;
      }

      return {
        shape: configuration.shape,
        width: configuration.width,
        height: configuration.height,
        backWidth: configuration.backWidth,
        thickness: configuration.thickness,
        unit: configuration.unit,
        patternId: configuration.patternId,
        patternScale: configuration.patternScale,
        materialId: configuration.materialId,
        fitPreference: configuration.fitPreference,
        closureType: configuration.closureType,
        seamStyle: configuration.seamStyle,
      };
    }
    case "setShape":
      return action.shape === "square" || action.shape === "round"
        ? { ...state, shape: action.shape, height: state.width }
        : { ...state, shape: action.shape };
    case "setWidth":
      if (!isNullableCommittedMeasurement(action.width)) {
        return state;
      }

      return state.shape === "square" || state.shape === "round"
        ? { ...state, width: action.width, height: action.width }
        : { ...state, width: action.width };
    case "setSquareWidth":
      return isNullableCommittedMeasurement(action.width)
        ? { ...state, width: action.width, height: action.width }
        : state;
    case "setHeight":
      return state.shape !== "square" &&
        state.shape !== "round" &&
        isNullableCommittedMeasurement(action.height)
        ? { ...state, height: action.height }
        : state;
    case "setBackWidth":
      return isNullableCommittedMeasurement(action.backWidth)
        ? { ...state, backWidth: action.backWidth }
        : state;
    case "setThickness":
      return isNullableCommittedMeasurement(action.thickness)
        ? { ...state, thickness: action.thickness }
        : state;
    case "setMeasurementUnit": {
      if (action.unit === state.unit) {
        return state;
      }

      const measurements = [
        state.width,
        state.height,
        state.backWidth,
        state.thickness,
      ];

      if (!measurements.every(isNullableCommittedMeasurement)) {
        return state;
      }

      return {
        ...state,
        width: convertMeasurement(state.width, state.unit, action.unit),
        height: convertMeasurement(state.height, state.unit, action.unit),
        backWidth: convertMeasurement(
          state.backWidth,
          state.unit,
          action.unit,
        ),
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
    case "setMaterialId":
      return hasSupportedCoverOptions({
        ...state,
        materialId: action.materialId,
      })
        ? { ...state, materialId: action.materialId }
        : state;
    case "setFitPreference":
      return hasSupportedCoverOptions({
        ...state,
        fitPreference: action.fitPreference,
      })
        ? { ...state, fitPreference: action.fitPreference }
        : state;
    case "setClosureType":
      return hasSupportedCoverOptions({
        ...state,
        closureType: action.closureType,
      })
        ? { ...state, closureType: action.closureType }
        : state;
    case "setSeamStyle":
      return hasSupportedCoverOptions({
        ...state,
        seamStyle: action.seamStyle,
      })
        ? { ...state, seamStyle: action.seamStyle }
        : state;
    case "resetConfiguration":
      return initialConfigurationState;
  }
}
