export interface AuditFinding {
  /** The rule that failed, as a short stable name. */
  readonly rule:
    | "data-heading"
    | "empty-heading"
    | "generic-name"
    | "heading-outline"
    | "label-in-name"
    | "landmark";
  readonly detail: string;
}

/**
 * Structural accessibility checks over the document in front of it:
 *
 * - heading outline: exactly one h1, starting at h1, no skipped levels, no
 *   empty headings, and no heading that is really a data value (a price, an
 *   email address, an order reference);
 * - landmarks: every navigation landmark contains links and, when there are
 *   several, each has its own name;
 * - label in name: a button or link with an aria-label has a name that starts
 *   with its visible label (WCAG 2.5.3, so voice control works);
 * - no aria-label or aria-labelledby on an element whose role is generic.
 *
 * This function is serialised into the page by Playwright and also run
 * against jsdom, so it must stay self-contained: it may use only the DOM
 * globals and nothing from this module's scope.
 */
export function auditDocument(): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const add = (rule: AuditFinding["rule"], detail: string) => {
    findings.push({ rule, detail });
  };
  const normalise = (text: string | null | undefined) =>
    (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const describe = (element: Element) => {
    const text = normalise(element.textContent).slice(0, 60);
    return `<${element.tagName.toLowerCase()}> "${text}"`;
  };
  const isHidden = (element: Element) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      if (
        node.hasAttribute("hidden") ||
        node.getAttribute("aria-hidden") === "true" ||
        getComputedStyle(node).display === "none"
      ) {
        return true;
      }
    }
    return false;
  };
  const visibleElements = (selector: string) =>
    Array.from(document.querySelectorAll(selector)).filter(
      (element) => !isHidden(element),
    );
  // What a sighted person reads on the control: its text without anything
  // hidden or marked aria-hidden (icons, decorative glyphs). Element
  // boundaries count as word breaks, as they do for the block and flex
  // children a label is usually split into.
  const visibleText = (root: Element) => {
    let text = "";
    const walk = (node: Node) => {
      if (node.nodeType === 3) {
        text += node.textContent ?? "";
      } else if (node.nodeType === 1) {
        const element = node as Element;
        if (
          element !== root &&
          (element.getAttribute("aria-hidden") === "true" ||
            element.hasAttribute("hidden") ||
            getComputedStyle(element).display === "none")
        ) {
          return;
        }
        text += " ";
        element.childNodes.forEach(walk);
        text += " ";
      }
    };
    walk(root);
    return normalise(text);
  };

  // Headings -----------------------------------------------------------------
  const headingLevel = (heading: Element) => {
    const explicit = Number(heading.getAttribute("aria-level"));
    if (explicit > 0) return explicit;
    return /^H[1-6]$/.test(heading.tagName) ? Number(heading.tagName[1]) : 2;
  };
  const headings = visibleElements('h1, h2, h3, h4, h5, h6, [role="heading"]');
  const h1s = headings.filter((heading) => headingLevel(heading) === 1);
  if (h1s.length !== 1) {
    add(
      "heading-outline",
      `expected exactly one h1, found ${h1s.length}: ${h1s.map(describe).join(", ") || "none"}`,
    );
  }
  let previousLevel = 0;
  for (const heading of headings) {
    const level = headingLevel(heading);
    if (level > previousLevel + 1) {
      add(
        "heading-outline",
        previousLevel === 0
          ? `the outline starts at h${level}, not h1: ${describe(heading)}`
          : `h${previousLevel} is followed by h${level}: ${describe(heading)}`,
      );
    }
    previousLevel = level;

    const text = (heading.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text === "") {
      add("empty-heading", `an empty h${level}`);
    } else if (
      /\$\s?\d/.test(text) ||
      /\bCAD\b/.test(text) ||
      /\S@\S/.test(text) ||
      /\bSC-[A-Z0-9-]{4,}/.test(text)
    ) {
      add(
        "data-heading",
        `a data value is a heading (price, email or order reference): ${describe(heading)}`,
      );
    }
  }

  // Landmarks ----------------------------------------------------------------
  const navigations = visibleElements('nav, [role="navigation"]');
  const navigationNames = new Map<string, number>();
  for (const navigation of navigations) {
    if (visibleElements("a[href]").every((link) => !navigation.contains(link))) {
      add("landmark", `a navigation landmark contains no links: ${describe(navigation)}`);
    }
    const labelledBy = navigation.getAttribute("aria-labelledby");
    const name = normalise(
      navigation.getAttribute("aria-label") ??
        (labelledBy ? document.getElementById(labelledBy)?.textContent : ""),
    );
    navigationNames.set(name, (navigationNames.get(name) ?? 0) + 1);
  }
  if (navigations.length > 1) {
    for (const [name, count] of navigationNames) {
      if (name === "" || count > 1) {
        add(
          "landmark",
          name === ""
            ? "one of several navigation landmarks has no name"
            : `${count} navigation landmarks share the name "${name}"`,
        );
      }
    }
  }

  // Label in name ------------------------------------------------------------
  const labelled = visibleElements(
    'button, a[href], [role="button"], [role="link"], input[type="button"], input[type="submit"], input[type="reset"], summary',
  ).filter((control) => normalise(control.getAttribute("aria-label")) !== "");
  for (const control of labelled) {
    const label = visibleText(control);
    const name = normalise(control.getAttribute("aria-label"));
    if (label !== "" && !name.startsWith(label)) {
      add(
        "label-in-name",
        `the name "${name}" does not start with the visible label "${label}"`,
      );
    }
  }

  // Names on generic elements ------------------------------------------------
  const generic = visibleElements(
    "div, span, data, p, i, b, em, strong, code, small",
  ).filter(
    (element) =>
      !element.hasAttribute("role") &&
      (element.hasAttribute("aria-label") ||
        element.hasAttribute("aria-labelledby")),
  );
  for (const element of generic) {
    add(
      "generic-name",
      `aria-label or aria-labelledby on a generic element (give it a role or move it): ${describe(element)}`,
    );
  }

  return findings;
}
