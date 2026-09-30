import { classNames } from "./class-names";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "default" | "compact";

const baseClasses =
  "relative inline-flex min-h-11 min-w-11 max-w-full items-center justify-center gap-icon rounded-control border text-center text-button font-control tracking-label break-words transition-[background-color,border-color,color,box-shadow] duration-(--duration-fast) motion-reduce:transition-none";

// Native buttons gate interaction states behind :enabled so a disabled button
// never looks pressable. Tailwind needs these as complete literal strings.
const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-brand bg-brand text-on-brand shadow-card enabled:hover:border-brand-hover enabled:hover:bg-brand-hover enabled:hover:shadow-raised enabled:active:border-brand-active enabled:active:bg-brand-active enabled:active:shadow-hairline",
  secondary:
    "border-border-strong bg-surface text-text-primary shadow-hairline enabled:hover:border-brand enabled:hover:text-brand enabled:hover:shadow-card enabled:active:bg-surface-subtle enabled:active:text-brand-active enabled:active:shadow-none",
  ghost:
    "border-transparent bg-transparent text-brand underline decoration-1 underline-offset-4 enabled:hover:bg-brand-tint enabled:hover:decoration-2 enabled:active:bg-surface-subtle enabled:active:text-brand-active",
};

const linkVariantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-brand bg-brand text-on-brand shadow-card hover:border-brand-hover hover:bg-brand-hover hover:shadow-raised active:border-brand-active active:bg-brand-active active:shadow-hairline",
  secondary:
    "border-border-strong bg-surface text-text-primary shadow-hairline hover:border-brand hover:text-brand hover:shadow-card active:bg-surface-subtle active:text-brand-active active:shadow-none",
  ghost:
    "border-transparent bg-transparent text-brand underline decoration-1 underline-offset-4 hover:bg-brand-tint hover:decoration-2 active:bg-surface-subtle active:text-brand-active",
};

const disabledClasses =
  "disabled:cursor-not-allowed disabled:border-dashed disabled:border-control-disabled-border disabled:bg-control-disabled-surface disabled:text-control-disabled-text disabled:no-underline disabled:shadow-none";

const sizeClasses: Record<ButtonSize, string> = {
  default: "min-h-12 px-5 py-control-y",
  compact: "min-h-11 px-3 py-2",
};

export interface ButtonStyleOptions {
  className?: string | false | null;
  /** Anchors have no :enabled state, so they use plain interaction variants. */
  element?: "button" | "link";
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export function buttonClasses({
  className,
  element = "button",
  size = "default",
  variant = "primary",
}: ButtonStyleOptions = {}): string {
  return classNames(
    baseClasses,
    element === "button"
      ? buttonVariantClasses[variant]
      : linkVariantClasses[variant],
    element === "button" && disabledClasses,
    sizeClasses[size],
    className,
  );
}

/** Inline, underlined text links that still meet the 44px target size. */
export const textLinkClasses =
  "inline-flex min-h-11 max-w-full items-center rounded-control text-button font-control break-words text-brand underline decoration-1 underline-offset-4 transition-[color,text-decoration-color] duration-(--duration-fast) hover:text-brand-hover hover:decoration-2 active:text-brand-active motion-reduce:transition-none";
