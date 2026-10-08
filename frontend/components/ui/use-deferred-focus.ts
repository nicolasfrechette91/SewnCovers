"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type FocusTarget = () => HTMLElement | null | undefined;

/**
 * Moves focus once the next render has committed, which is when the element
 * to focus exists. Use it where closing a panel unmounts the focused control:
 * `focusLater(() => openerRef.current)` alongside the state change that closes
 * it. Nothing depends on animation-frame timing.
 */
export function useDeferredFocus(): (target: FocusTarget) => void {
  const queued = useRef<FocusTarget | null>(null);
  const [request, setRequest] = useState(0);

  useEffect(() => {
    const target = queued.current;
    queued.current = null;
    target?.()?.focus();
  }, [request]);

  return useCallback((target: FocusTarget) => {
    queued.current = target;
    setRequest((count) => count + 1);
  }, []);
}
