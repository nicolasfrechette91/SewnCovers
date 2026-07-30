"use client";

import { useCallback, useEffect, useState } from "react";

import {
  PatternCatalogueController,
  type PatternCatalogueState,
} from "@/services/pattern-catalogue";

import { apiClient } from "./api-client";
import type { PatternFilters } from "../data/patterns";

export interface PatternCatalogueRuntime {
  readonly retry: () => void;
  readonly setFilters: (filters: PatternFilters) => void;
  readonly state: PatternCatalogueState;
}

export function usePatternCatalogue(): PatternCatalogueRuntime {
  const [controller] = useState(
    () => new PatternCatalogueController(apiClient),
  );
  const [state, setState] = useState(controller.getSnapshot);

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    void controller.loadInitial();

    return () => {
      unsubscribe();
      controller.cancelPending();
    };
  }, [controller]);

  const retry = useCallback(() => {
    void controller.retry();
  }, [controller]);
  const setFilters = useCallback(
    (filters: PatternFilters) => {
      void controller.setFilters(filters);
    },
    [controller],
  );

  return { retry, setFilters, state };
}
