/** Text-like controls: inputs, selects and textareas share one frame. */
export const controlClasses =
  "min-h-12 w-full min-w-0 rounded-control border border-border-strong bg-surface px-control-x py-control-y text-body text-text-primary transition-[background-color,border-color,box-shadow] duration-(--duration-fast) placeholder:text-text-muted hover:border-brand motion-reduce:transition-none disabled:cursor-not-allowed disabled:border-dashed disabled:border-control-disabled-border disabled:bg-control-disabled-surface disabled:text-control-disabled-text aria-invalid:border-error-border aria-invalid:bg-error-surface read-only:bg-surface-subtle read-only:hover:border-border-strong";

export const fieldLabelClasses =
  "text-label font-control tracking-label text-text-primary";

export const fieldHelpClasses = "text-supporting text-text-muted";

export const fieldErrorClasses =
  "text-supporting font-emphasis text-error-text";

export const checkboxClasses =
  "mt-0.5 size-5 shrink-0 cursor-pointer accent-brand disabled:cursor-not-allowed";
