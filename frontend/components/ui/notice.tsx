import type { ComponentPropsWithRef, ReactNode } from "react";

import { classNames } from "./class-names";

/**
 * prototype / sandbox: honest disclaimers, styled as a woven care label.
 * info: neutral context. success: a confirmed, completed action.
 */
export type NoticeTone = "prototype" | "sandbox" | "info" | "success";

const toneClasses: Record<NoticeTone, string> = {
  prototype: "care-label",
  sandbox: "care-label",
  info: "rounded-card border border-border bg-surface-subtle text-text-primary",
  success:
    "rounded-card border border-success-border bg-success-surface text-success-text",
};

const titleToneClasses: Record<NoticeTone, string> = {
  prototype:
    "font-mono text-eyebrow uppercase tracking-eyebrow text-notice-text",
  sandbox: "font-mono text-eyebrow uppercase tracking-eyebrow text-notice-text",
  info: "text-label font-control text-text-primary",
  success: "text-label font-control text-success-text",
};

export function noticeClasses(
  tone: NoticeTone = "info",
  className?: string | false | null,
): string {
  return classNames(
    "min-w-0 wrap-anywhere px-5 py-4 text-supporting",
    toneClasses[tone],
    className,
  );
}

export function noticeTitleClasses(tone: NoticeTone = "info"): string {
  return titleToneClasses[tone];
}

type NoticeElement = "aside" | "div" | "section";
type NoticeHeading = "h2" | "h3" | "h4" | "p";

// HTMLElement props, so a ref and handlers fit every element in `as`.
export interface NoticeProps extends Omit<
  ComponentPropsWithRef<"section">,
  "title"
> {
  as?: NoticeElement;
  title?: ReactNode;
  titleAs?: NoticeHeading;
  titleId?: string;
  tone?: NoticeTone;
}

export function Notice({
  as: tagName = "div",
  children,
  className,
  title,
  titleAs: Title = "p",
  titleId,
  tone = "info",
  ...elementProps
}: NoticeProps) {
  // div, aside and section take the same props here; typing the element as a
  // section keeps the HTMLElement ref and handlers valid for all three.
  const Element = tagName as "section";
  return (
    <Element {...elementProps} className={noticeClasses(tone, className)}>
      {title ? (
        <Title id={titleId} className={noticeTitleClasses(tone)}>
          {title}
        </Title>
      ) : null}
      <div className={classNames("min-w-0", title ? "mt-2" : null)}>
        {children}
      </div>
    </Element>
  );
}
