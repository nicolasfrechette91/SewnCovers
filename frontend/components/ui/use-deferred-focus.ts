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
  const queued = useRef<{ request: number; target: FocusTarget } | null>(null);
  const requests = useRef(0);
  const [request, setRequest] = useState(0);

  useEffect(() => {
    // Only the render that carries the request may take it. An earlier
    // render's effects can still be waiting when a request comes in (a press
    // right after mount), before the element to focus exists.
    const pending = queued.current;
    if (pending === null || pending.request !== request) return;
    queued.current = null;
    pending.target()?.focus();
  }, [request]);

  return useCallback((target: FocusTarget) => {
    requests.current += 1;
    queued.current = { request: requests.current, target };
    setRequest(requests.current);
  }, []);
}
