"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

/**
 * Server data a screen shows, loaded for a key. `data` and `error` belong to
 * the current key only: when the key changes they reset (unless
 * `keepPreviousData`), and a response for an earlier key is discarded.
 */
export interface Resource<T> {
  /**
   * The last successful result for this key, kept through reloads and
   * failures. With `keepPreviousData`, the previous key's result stands in
   * until the new key has one, including when the new key fails.
   */
  readonly data: T | undefined;
  /** The last failure for this key, until the next success or `clearError()`. */
  readonly error: unknown;
  /** The first load or a key change, or a `reload()` that is not in the background. */
  readonly loading: boolean;
  /**
   * Loads the current key again. A background reload keeps `loading` false
   * while there is data to show. Settles (never rejects) when that request
   * ends, so a caller can await it before moving focus or announcing.
   */
  readonly reload: (options?: {
    readonly background?: boolean;
  }) => Promise<void>;
  /**
   * Replaces the data shown, after a mutation that returned the new value.
   * `fallback` is the value to change when this key failed to load (a list
   * that failed can still show an item just added); without one, or before
   * anything settled, nothing changes.
   */
  readonly update: (change: (data: T) => T, fallback?: T) => void;
  /** Forgets the failure, for a screen whose banner an action replaces. */
  readonly clearError: () => void;
}

interface Settled<T> {
  readonly key: string;
  readonly generation: number;
  readonly data: T | undefined;
  readonly error: unknown;
}

/**
 * Loads `key` with `load` when the key is not null, cancelling the request
 * (through the signal) when the key changes or the component unmounts.
 * Loading is derived from what has settled, so nothing sets state in the
 * effect body: state changes only when a request settles or the screen acts.
 */
export function useResource<Key extends string, T>(
  key: Key | null,
  load: (key: Key, signal: AbortSignal) => Promise<T>,
  { keepPreviousData = false }: { readonly keepPreviousData?: boolean } = {},
): Resource<T> {
  const [request, setRequest] = useState({ generation: 0, background: false });
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const generations = useRef(0);
  const waiting = useRef(new Map<number, () => void>());
  const run = useEffectEvent((current: Key, signal: AbortSignal) =>
    load(current, signal),
  );
  const { generation } = request;

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    const { signal } = controller;
    // Settles every reload this request answers, including one superseded
    // by a later reload before it ever ran.
    const finish = () => {
      for (const [requested, resolve] of waiting.current) {
        if (requested > generation) continue;
        waiting.current.delete(requested);
        resolve();
      }
    };
    let pending: Promise<T>;
    try {
      pending = run(key, signal);
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending
      .then(
        (data) => {
          if (signal.aborted) return;
          setSettled({ key, generation, data, error: undefined });
        },
        (error: unknown) => {
          if (signal.aborted) return;
          setSettled((previous) => ({
            key,
            generation,
            data:
              previous?.key === key || keepPreviousData
                ? previous?.data
                : undefined,
            error,
          }));
        },
      )
      .finally(finish);
    return () => {
      controller.abort();
      finish();
    };
  }, [key, generation, keepPreviousData]);

  const reload = useCallback(
    (options: { readonly background?: boolean } = {}) => {
      if (key === null) return Promise.resolve();
      generations.current += 1;
      const next = generations.current;
      setRequest({ generation: next, background: options.background ?? false });
      return new Promise<void>((resolve) => {
        waiting.current.set(next, resolve);
      });
    },
    [key],
  );

  const update = useCallback(
    (change: (data: T) => T, fallback?: T) => {
      setSettled((previous) => {
        if (previous === null || (previous.key !== key && !keepPreviousData))
          return previous;
        const base = previous.data ?? fallback;
        return base === undefined
          ? previous
          : { ...previous, data: change(base) };
      });
    },
    [key, keepPreviousData],
  );

  const clearError = useCallback(() => {
    setSettled((previous) =>
      previous !== null && previous.key === key
        ? { ...previous, error: undefined }
        : previous,
    );
  }, [key]);

  const current = settled !== null && settled.key === key ? settled : null;
  const upToDate = current !== null && current.generation === generation;
  return {
    data:
      current?.data ??
      (keepPreviousData && key !== null ? settled?.data : undefined),
    error: current?.error,
    loading:
      key !== null &&
      !upToDate &&
      !(request.background && current?.data !== undefined),
    reload,
    update,
    clearError,
  };
}
