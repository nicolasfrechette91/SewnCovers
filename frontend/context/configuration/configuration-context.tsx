"use client";

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useRef,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";

import { subscribeToDraftReset } from "../../services/configurator-draft";
import {
  configurationReducer,
  initialConfigurationState,
} from "./reducer";
import type { ConfigurationAction, ConfigurationState } from "./types";

interface ConfigurationContextValue {
  readonly state: ConfigurationState;
  readonly dispatch: Dispatch<ConfigurationAction>;
  readonly getRevision: () => number;
}

const ConfigurationContext = createContext<
  ConfigurationContextValue | undefined
>(undefined);

export function ConfigurationProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [state, reducerDispatch] = useReducer(
    configurationReducer,
    initialConfigurationState,
  );
  const revision = useRef(0);
  const dispatch = useCallback<Dispatch<ConfigurationAction>>((action) => {
    revision.current += 1;
    reducerDispatch(action);
  }, []);
  const getRevision = useCallback(() => revision.current, []);

  // Signing out removes account-linked drafts from storage; drop the same
  // data from the in-memory design so it cannot be written back.
  useEffect(
    () =>
      subscribeToDraftReset((kind) =>
        dispatch({
          type: kind === "cleared" ? "resetConfiguration" : "clearCustomPattern",
        }),
      ),
    [dispatch],
  );

  return (
    <ConfigurationContext.Provider
      value={{ state, dispatch, getRevision }}
    >
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
