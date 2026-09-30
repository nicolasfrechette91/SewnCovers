import type { ComponentPropsWithoutRef } from "react";

import { classNames } from "./class-names";

export type BadgeTone = "neutral" | "brand" | "accent" | "notice" | "success" | "danger";
export type BadgeVariant = "outline" | "solid";

const outlineTones: Record<BadgeTone, string> = {
  neutral: "border-border-strong bg-surface text-text-muted",
  brand: "border-brand bg-surface text-brand",
  accent: "border-accent-strong bg-surface text-accent-strong",
  notice: "border-notice-border bg-notice-surface text-notice-text",
  success: "border-success-border bg-success-surface text-success-text",
  danger: "border-error-border bg-error-surface text-error-text",
};

const solidTones: Record<BadgeTone, string> = {
  neutral: "border-text-muted bg-text-muted text-on-brand",
  brand: "border-brand bg-brand text-on-brand",
  accent: "border-accent-strong bg-accent-strong text-on-brand",
  notice: "border-notice-text bg-notice-text text-on-brand",
  success: "border-success-text bg-success-text text-on-brand",
  danger: "border-error-text bg-error-text text-on-brand",
};

export function badgeClasses(
  tone: BadgeTone = "neutral",
  variant: BadgeVariant = "outline",
  className?: string | false | null,
): string {
  return classNames(
    "inline-flex max-w-full items-center gap-1 rounded-control-small border px-2 py-1 font-mono text-eyebrow uppercase tracking-eyebrow break-words",
    variant === "solid" ? solidTones[tone] : outlineTones[tone],
    className,
  );
}

export interface BadgeProps extends ComponentPropsWithoutRef<"span"> {
  tone?: BadgeTone;
  variant?: BadgeVariant;
}

/** A small status tag. Never interactive, so it never looks like a button. */
export function Badge({ className, tone, variant, ...spanProps }: BadgeProps) {
  return <span {...spanProps} className={badgeClasses(tone, variant, className)} />;
}
