"use client";

import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";

import {
  configurationReducer,
  initialConfigurationState,
} from "./reducer";
import type { ConfigurationAction, ConfigurationState } from "./types";

interface ConfigurationContextValue {
  readonly state: ConfigurationState;
  readonly dispatch: Dispatch<ConfigurationAction>;
}

const ConfigurationContext = createContext<
  ConfigurationContextValue | undefined
>(undefined);

export function ConfigurationProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [state, dispatch] = useReducer(
    configurationReducer,
    initialConfigurationState,
  );

  return (
    <ConfigurationContext.Provider value={{ state, dispatch }}>
      {children}
    </ConfigurationContext.Provider>
  );
}

export function useConfiguration(): ConfigurationContextValue {
  const context = useContext(ConfigurationContext);

  if (context === undefined) {
    throw new Error(
      "useConfiguration must be used within a ConfigurationProvider.",
    );
  }

  return context;
}
