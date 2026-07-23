import { classNames } from "./class-names";

type LoadingSpinnerSize = "default" | "compact";

interface LoadingSpinnerProps {
  className?: string;
  size?: LoadingSpinnerSize;
}

const sizeClasses: Record<LoadingSpinnerSize, string> = {
  default: "size-5",
  compact: "size-4",
};

export function LoadingSpinner({
  className,
  size = "default",
}: LoadingSpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={classNames(
        "inline-block shrink-0 rounded-pill border-2 border-current border-t-transparent motion-safe:animate-spin motion-reduce:animate-none",
        sizeClasses[size],
        className,
      )}
    />
  );
}
