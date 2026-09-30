import Link from "next/link";
import type { ComponentPropsWithRef } from "react";

import {
  buttonClasses,
  textLinkClasses,
  type ButtonSize,
  type ButtonVariant,
} from "./button-styles";
import { classNames } from "./class-names";

type LinkProps = ComponentPropsWithRef<typeof Link>;

export interface ButtonLinkProps extends LinkProps {
  size?: ButtonSize;
  variant?: ButtonVariant;
}

/**
 * A navigation link styled as a button. Children render directly inside the
 * anchor (no wrapper), which keeps exported markup such as
 * `>Start configuring</a>` stable for verify-static-export.
 */
export function ButtonLink({
  className,
  size = "default",
  variant = "primary",
  ...linkProps
}: ButtonLinkProps) {
  return (
    <Link
      {...linkProps}
      className={buttonClasses({ className, element: "link", size, variant })}
    />
  );
}

export type TextLinkProps = LinkProps;

export function TextLink({ className, ...linkProps }: TextLinkProps) {
  return (
    <Link {...linkProps} className={classNames(textLinkClasses, className)} />
  );
}
