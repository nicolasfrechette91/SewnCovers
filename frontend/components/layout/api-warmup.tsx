"use client";

import { useEffect } from "react";

import { scheduleApiWarmup } from "@/services/api-warmup";

/** Wakes the sleeping API once per browser session; renders nothing. */
export function ApiWarmup() {
  useEffect(() => scheduleApiWarmup(), []);

  return null;
}
