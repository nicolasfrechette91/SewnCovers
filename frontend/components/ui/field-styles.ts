const controlFrame =
  "min-h-12 min-w-0 rounded-control border border-border-strong bg-surface px-control-x py-control-y text-body text-text-primary transition-[background-color,border-color,box-shadow] duration-(--duration-fast) placeholder:text-text-muted hover:border-brand motion-reduce:transition-none disabled:cursor-not-allowed disabled:border-dashed disabled:border-control-disabled-border disabled:bg-control-disabled-surface disabled:text-control-disabled-text aria-invalid:border-error-border aria-invalid:bg-error-surface";

/**
 * A read-only text field reads as a fixed value. Browsers also match
 * :read-only on <select>, so these classes stay off selects.
 */
const readOnlyClasses =
  "read-only:bg-surface-subtle read-only:hover:border-border-strong";

/** Text inputs and textareas: one frame, full width. */
export const controlClasses = `w-full ${controlFrame} ${readOnlyClasses}`;

/** The same frame at a fixed 6rem, for short values such as a quantity. */
export const narrowControlClasses = `w-24 ${controlFrame} ${readOnlyClasses}`;

/** Selects share the frame but never take the read-only look. */
export const selectClasses = `w-full ${controlFrame}`;
export const narrowSelectClasses = `w-24 ${controlFrame}`;

export const fieldLabelClasses =
  "text-label font-control tracking-label text-text-primary";

export const fieldHelpClasses = "text-supporting text-text-muted";

export const fieldErrorClasses =
  "text-supporting font-emphasis text-error-text";

export const checkboxClasses =
  "mt-nudge size-5 shrink-0 cursor-pointer accent-brand disabled:cursor-not-allowed";
