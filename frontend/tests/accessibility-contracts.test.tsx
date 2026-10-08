import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";

import { AccountNavigation } from "../components/account/account-navigation";
import { CushionPreview } from "../components/configurator/cushion-preview";
import { StepIndicator } from "../components/configurator/step-indicator";
import { SummaryOutputActions } from "../components/configurator/summary-output-actions";
import { SiteFooter } from "../components/layout/site-footer";
import { SiteHeader } from "../components/layout/site-header";
import { ErrorMessage } from "../components/ui";
import { AuthProvider } from "../context/auth";
import { auditDocument } from "../e2e/support/document-audit";
import { deriveReviewReadiness } from "../components/configurator/review-summary";
import type { ConfigurationState } from "../context/configuration";

afterEach(() => {
  cleanup();
});

// Components that are rendered here have no h1 of their own, so only the
// rules that concern their own markup are asserted.
function findings(rule: string) {
  return auditDocument().filter((finding) => finding.rule === rule);
}

test("the print and download buttons are named by their visible text", () => {
  const configuration: ConfigurationState = {
    shape: "rectangle",
    width: 80,
    height: 40,
    backWidth: null,
    thickness: 10,
    unit: "cm",
    pattern: { kind: "solid", color: "#3f6c7f" },
    patternScale: 1,
    materialId: "cotton-canvas",
    fitPreference: "standard",
    closureType: "zipper",
    seamStyle: "plain",
  };
  // A solid colour needs nothing from the pattern catalogue.
  const readiness = deriveReviewReadiness(configuration, {
    status: "error",
    issues: ["catalogue offline"],
  });
  assert.equal(readiness.status, "ready");
  if (readiness.status !== "ready") return;

  render(<SummaryOutputActions summary={readiness.summary} />);
  const print = screen.getByRole("button", { name: "Print summary" });
  const download = screen.getByRole("button", { name: "Download summary (.txt)" });
  assert.equal(print.hasAttribute("aria-label"), false);
  assert.equal(download.hasAttribute("aria-label"), false);
  assert.deepEqual(findings("label-in-name"), []);
});

test("the stage buttons start their name with the visible label and are not a landmark", () => {
  const { container } = render(
    <StepIndicator
      currentStepId="measurements"
      completedStepIds={["shape"]}
      revisitableStepIds={["shape"]}
      steps={[
        { id: "shape", label: "Shape" },
        { id: "measurements", label: "Measurements" },
        { id: "pattern", label: "Pattern" },
      ]}
      onStepSelect={() => undefined}
    />,
  );

  assert.equal(container.querySelector("nav"), null);
  assert.ok(screen.getByRole("group", { name: "Configuration progress" }));
  const shape = screen.getByRole("button", { name: "Shape complete, stage 1 of 3" });
  assert.match(shape.textContent ?? "", /Shape/);
  assert.deepEqual(findings("label-in-name"), []);
  assert.deepEqual(findings("landmark"), []);
});

test("the site header, footer and account navigation are navigation landmarks with links", () => {
  render(
    <AuthProvider>
      <SiteHeader
        currentHref="/"
        primaryItems={[{ href: "/configure/", label: "Configure" }]}
        utilityItems={[{ href: "/account/", label: "Account" }]}
      />
      <AccountNavigation currentHref="/account/" />
      <SiteFooter navigationItems={[{ href: "/legal/", label: "Legal and privacy" }]} />
    </AuthProvider>,
  );

  const navigations = screen.getAllByRole("navigation");
  assert.deepEqual(
    navigations.map((navigation) => navigation.getAttribute("aria-label")).sort(),
    ["Footer navigation", "Primary navigation"],
  );
  for (const navigation of navigations) {
    assert.ok(navigation.querySelector("a[href]"), navigation.getAttribute("aria-label") ?? "");
  }
  assert.deepEqual(findings("landmark"), []);
  assert.deepEqual(findings("label-in-name"), []);
});

test("the cushion preview figure is named by its visible heading", () => {
  render(
    <CushionPreview
      title="Preview your rectangle cushion"
      visual={<span>cushion</span>}
    />,
  );
  const heading = screen.getByRole("heading", { level: 1, name: "Preview your rectangle cushion" });
  const figure = screen.getByRole("figure", { name: "Preview your rectangle cushion" });
  assert.equal(figure.getAttribute("aria-labelledby"), heading.id);
  assert.equal(figure.hasAttribute("aria-label"), false);

  cleanup();
  render(<CushionPreview aria-label="Custom name" title="Preview" headingLevel={2} />);
  assert.ok(screen.getByRole("figure", { name: "Custom name" }));
});

test("ErrorMessage shows its heading and rejects props it does not define", () => {
  render(
    <ErrorMessage heading="Production queue unavailable">
      The queue could not be loaded.
    </ErrorMessage>,
  );
  const alert = screen.getByRole("alert");
  assert.match(alert.textContent ?? "", /Production queue unavailable/);
  assert.equal(alert.hasAttribute("title"), false);

  // `title` is a valid attribute on a div, which is how a mistyped `heading`
  // became a tooltip. The props type is an allow-list, so tsc (npm run
  // typecheck) fails here if it ever loosens: the directive below would be
  // unused.
  // @ts-expect-error title is not an ErrorMessage prop; use heading
  const mistyped = <ErrorMessage title="Readiness unavailable">Not ready.</ErrorMessage>;
  // @ts-expect-error neither is an arbitrary HTML attribute
  const arbitrary = <ErrorMessage style={{ display: "none" }}>Not ready.</ErrorMessage>;
  cleanup();
  render(mistyped);
  assert.equal(screen.getByRole("alert").hasAttribute("title"), false);
  assert.equal(React.isValidElement(arbitrary), true);
});

// Forced colours ----------------------------------------------------------------

const frontend = process.cwd();

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(frontend, directory), { withFileTypes: true }).flatMap(
    (entry) => {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(relative);
      return /\.tsx$/.test(entry.name) ? [relative] : [];
    },
  );
}

test("the swatch class keeps its colour and gains an outline in forced-colours mode", () => {
  const css = readFileSync(path.join(frontend, "app/globals.css"), "utf8");
  assert.match(css, /\.fabric-swatch\s*\{\s*forced-color-adjust:\s*none;/);
  const forcedColours = css.slice(css.indexOf("@media (forced-colors: active)"));
  assert.match(forcedColours, /\.fabric-swatch\s*\{\s*border-color:\s*CanvasText;/);
  assert.match(css, /@media print[\s\S]*\.fabric-swatch\s*\{\s*print-color-adjust:\s*exact/);
});

test("every element that paints the customer's colour is a fabric swatch", () => {
  // A colour set inline from the customer's choice is wiped to the page
  // background in forced-colours mode unless the element opts out. Inline
  // `backgroundColor` from data is how a swatch is drawn, so each one must
  // carry the class. (The cushion illustration itself is deliberately drawn in
  // system colours there; see the forced-colors block in globals.css.)
  const exempt = new Set(["components/configurator/cushion-model.tsx"]);
  const offenders = sourceFiles("components").flatMap((file) => {
    const normalised = file.replaceAll("\\", "/");
    if (exempt.has(normalised)) return [];
    const source = readFileSync(path.join(frontend, file), "utf8");
    return [...source.matchAll(/backgroundColor:/g)].flatMap((match) => {
      const before = source.slice(Math.max(0, match.index - 400), match.index);
      const elementStart = before.lastIndexOf("<");
      return before.slice(elementStart).includes("fabric-swatch")
        ? []
        : [`${normalised}: ${before.slice(elementStart, elementStart + 120).replace(/\s+/g, " ")}`];
    });
  });
  assert.deepEqual(offenders, []);
});
