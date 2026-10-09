import type { ComponentPropsWithoutRef } from "react";

import { classNames } from "./class-names";

export type SurfaceTone = "default" | "subtle" | "page" | "emphasis" | "danger";
export type SurfaceElevation = "flat" | "hairline" | "card" | "raised";
export type SurfacePadding = "card" | "compact" | "none";
export type SurfaceRadius = "panel" | "card";

const toneClasses: Record<SurfaceTone, string> = {
  default: "border border-border bg-surface",
  subtle: "border border-border bg-surface-subtle",
  page: "border border-border bg-page",
  emphasis: "border border-brand bg-surface",
  danger: "border border-error-border bg-surface",
};

const elevationClasses: Record<SurfaceElevation, string> = {
  flat: "shadow-none",
  hairline: "shadow-hairline",
  card: "shadow-card",
  raised: "shadow-raised",
};

const paddingClasses: Record<SurfacePadding, string> = {
  card: "p-card",
  compact: "p-4",
  none: "",
};

const radiusClasses: Record<SurfaceRadius, string> = {
  panel: "rounded-panel",
  card: "rounded-card",
};

export interface SurfaceStyleOptions {
  className?: string | false | null;
  elevation?: SurfaceElevation;
  padding?: SurfacePadding;
  radius?: SurfaceRadius;
  tone?: SurfaceTone;
}

export function surfaceClasses({
  className,
  elevation = "hairline",
  padding = "card",
  radius = "panel",
  tone = "default",
}: SurfaceStyleOptions = {}): string {
  return classNames(
    "min-w-0",
    toneClasses[tone],
    elevationClasses[elevation],
    paddingClasses[padding],
    radiusClasses[radius],
    className,
  );
}

type SurfaceElement =
  "article" | "aside" | "div" | "figure" | "header" | "section";

export interface SurfaceProps
  extends
    ComponentPropsWithoutRef<"div">,
    Omit<SurfaceStyleOptions, "className"> {
  as?: SurfaceElement;
}

/** A panel or card: the one place surfaces get their border, fill and depth. */
export function Surface({
  as: Element = "div",
  className,
  elevation,
  padding,
  radius,
  tone,
  ...elementProps
}: SurfaceProps) {
  return (
    <Element
      {...elementProps}
      className={surfaceClasses({
        className,
        elevation,
        padding,
        radius,
        tone,
      })}
    />
  );
}
