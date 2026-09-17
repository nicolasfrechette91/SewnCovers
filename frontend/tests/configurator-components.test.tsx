import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import React, { useEffect } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react";

import {
  ConfigurationProvider,
  useConfiguration,
} from "../context/configuration/configuration-context";
import { AuthProvider } from "../context/auth";
import type { ConfigurationState } from "../context/configuration/types";
import { ShapeSelectionStep } from "../components/configurator/shape-selection-step";
import { MeasurementStep } from "../components/configurator/measurement-step";
import { CoverDetailsStep } from "../components/configurator/cover-details-step";
import {
  INITIAL_PATTERN_RESULT_LIMIT,
  PatternStep,
} from "../components/configurator/pattern-step";
import { PreviewStep } from "../components/configurator/preview-step";
import { CushionModel } from "../components/configurator/cushion-model";
import { StepIndicator } from "../components/configurator/step-indicator";
import { deriveReviewReadiness } from "../components/configurator/review-summary";
import { SaveSharePanel } from "../components/configurator/save-share-panel";
import type { PatternDefinition } from "../data/patterns";
import {
  ALL_PATTERN_CATEGORIES,
  ALL_PATTERN_COLORS,
} from "../data/patterns";
import {
  DesignSaveController,
  mapConfigurationToCreateDesign,
} from "../services/design-save";
import type {
  ApiRequestOptions,
  CreateDesignRequest,
  DesignResponse,
  SewnCoversApiClient,
} from "../services/api-client";
import type { PatternCatalogueState } from "../services/pattern-catalogue";

afterEach(() => {
  cleanup();
});

const fernPattern: PatternDefinition = {
  id: "fern-trail",
  name: "Fern Trail",
  description: "Layered fern leaves.",
  categoryId: "botanical",
  colorIds: ["ivory", "green"],
  previewClassName: "pattern-fern-trail",
};
const diamondPattern: PatternDefinition = {
  id: "diamond-path",
  name: "Diamond Path",
  description: "A compact geometric repeat.",
  categoryId: "geometric",
  colorIds: ["ivory", "blue", "charcoal"],
  previewClassName: "pattern-diamond-path",
};
const discoveryPatterns: readonly PatternDefinition[] = [
  fernPattern,
  {
    id: "meadow-sprig",
    name: "Meadow Sprig",
    description: "Small branching sprigs across an open ground.",
    categoryId: "botanical",
    colorIds: ["ivory", "blue", "gold"],
    previewClassName: "pattern-meadow-sprig",
  },
  {
    id: "prototype-geometric",
    name: "Geometric Sample",
    description: "A warm structured direction.",
    categoryId: "geometric",
    colorIds: ["ivory", "terracotta"],
    previewClassName: "prototype-pattern-geometric",
  },
  diamondPattern,
  {
    id: "arch-grid",
    name: "Arch Grid",
    description: "Rounded arches in a compact tiled grid.",
    categoryId: "geometric",
    colorIds: ["ivory", "terracotta", "gold"],
    previewClassName: "pattern-arch-grid",
  },
  {
    id: "harbor-stripe",
    name: "Harbor Stripe",
    description: "Broad blue bands with fine light pinstripes.",
    categoryId: "striped",
    colorIds: ["ivory", "blue"],
    previewClassName: "pattern-harbor-stripe",
  },
  {
    id: "orchard-stripe",
    name: "Orchard Stripe",
    description: "Uneven green and gold lines.",
    categoryId: "striped",
    colorIds: ["ivory", "green", "gold"],
    previewClassName: "pattern-orchard-stripe",
  },
  {
    id: "ribbon-stripe",
    name: "Ribbon Stripe",
    description: "Slim rose bands cross terracotta ribbons.",
    categoryId: "striped",
    colorIds: ["ivory", "terracotta", "rose"],
    previewClassName: "pattern-ribbon-stripe",
  },
  {
    id: "prototype-woven",
    name: "Woven Sample",
    description: "A quiet small-scale direction.",
    categoryId: "woven",
    colorIds: ["ivory", "charcoal"],
    previewClassName: "prototype-pattern-woven",
  },
  {
    id: "basket-check",
    name: "Basket Check",
    description: "Blocks suggest an oversized basket weave.",
    categoryId: "woven",
    colorIds: ["ivory", "blue", "charcoal"],
    previewClassName: "pattern-basket-check",
  },
  {
    id: "linen-crosshatch",
    name: "Linen Crosshatch",
    description: "Fine crossing lines make a textured grid.",
    categoryId: "woven",
    colorIds: ["ivory", "gold"],
    previewClassName: "pattern-linen-crosshatch",
  },
  {
    id: "terrace-wave",
    name: "Terrace Wave",
    description: "Layered waves move in alternating cool bands.",
    categoryId: "abstract",
    colorIds: ["ivory", "green", "blue"],
    previewClassName: "pattern-terrace-wave",
  },
  {
    id: "pebble-drift",
    name: "Pebble Drift",
    description: "Soft-edged pebble forms gather in clusters.",
    categoryId: "abstract",
    colorIds: ["ivory", "terracotta", "charcoal"],
    previewClassName: "pattern-pebble-drift",
  },
  {
    id: "confetti-grid",
    name: "Confetti Grid",
    description: "Playful dashes and dots on a spacious grid.",
    categoryId: "abstract",
    colorIds: ["ivory", "green", "gold", "rose"],
    previewClassName: "pattern-confetti-grid",
  },
  {
    id: "prototype-botanical",
    name: "Botanical Sample",
    description: "An organic leaf-inspired direction.",
    categoryId: "botanical",
    colorIds: ["ivory", "green", "terracotta"],
    previewClassName: "prototype-pattern-botanical",
  },
];
const completeConfiguration: ConfigurationState = {
  shape: "rectangle",
  width: 80,
  height: 40,
  backWidth: null,
  thickness: 10,
  unit: "cm",
  pattern: { kind: "built-in", patternId: "fern-trail" },
  patternScale: 1.2,
  materialId: "cotton-canvas",
  fitPreference: "standard",
  closureType: "zipper",
  seamStyle: "plain",
};

function SeedConfiguration({
  configuration,
}: Readonly<{ configuration: ConfigurationState }>) {
  const { dispatch } = useConfiguration();

  useEffect(() => {
    dispatch({ type: "restoreConfiguration", configuration });
  }, [configuration, dispatch]);

  return null;
}

function StateProbe() {
  const { state, dispatch } = useConfiguration();

  return (
    <div>
      <span data-testid="current-shape">{state.shape ?? "none"}</span>
      <span data-testid="current-width">{state.width ?? "none"}</span>
      <span data-testid="current-height">{state.height ?? "none"}</span>
      <span data-testid="current-pattern">{state.pattern?.kind === "built-in" ? state.pattern.patternId : state.pattern?.label ?? "none"}</span>
      <span data-testid="current-material">{state.materialId}</span>
      <span data-testid="current-fit">{state.fitPreference}</span>
      <span data-testid="current-closure">{state.closureType}</span>
      <span data-testid="current-seam">{state.seamStyle}</span>
      <button
        type="button"
        onClick={() => dispatch({ type: "resetConfiguration" })}
      >
        Reset test configuration
      </button>
    </div>
  );
}

function renderWithConfiguration(
  children: React.ReactNode,
  configuration?: ConfigurationState,
) {
  return render(
    <AuthProvider>
      <ConfigurationProvider>
        {configuration ? (
          <SeedConfiguration configuration={configuration} />
        ) : null}
        {children}
        <StateProbe />
      </ConfigurationProvider>
    </AuthProvider>,
  );
}

function catalogueState(
  overrides: Partial<PatternCatalogueState> = {},
): PatternCatalogueState {
  return {
    allPatterns: [fernPattern, diamondPattern],
    filters: {
      categoryId: ALL_PATTERN_CATEGORIES,
      colorId: ALL_PATTERN_COLORS,
    },
    issues: [],
    message: "Patterns loaded.",
    phase: "ready",
    visiblePatterns: [fernPattern, diamondPattern],
    ...overrides,
  };
}

test("communicates staged progress and enables only completed steps for revisiting", () => {
  const selectedSteps: string[] = [];

  render(
    <StepIndicator
      currentStepId="measurements"
      completedStepIds={["shape"]}
      revisitableStepIds={["shape"]}
      onStepSelect={(stepId) => selectedSteps.push(stepId)}
      steps={[
        { id: "shape", label: "Shape" },
        { id: "measurements", label: "Measurements" },
        { id: "pattern", label: "Pattern" },
      ]}
    />,
  );

  assert.ok(screen.getByText("Stage 2 of 3"));
  assert.equal(
    screen.getByText("Measurements").closest("li")?.getAttribute(
      "aria-current",
    ),
    "step",
  );
  assert.match(
    screen.getByText("Shape").closest("li")?.textContent ?? "",
    /Complete/,
  );
  assert.match(
    screen.getByText("Pattern").closest("li")?.textContent ?? "",
    /Upcoming/,
  );
  assert.equal(
    screen.queryByRole("button", { name: /Return to Pattern/ }),
    null,
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: "Return to Shape, completed stage 1 of 3",
    }),
  );
  assert.deepEqual(selectedSteps, ["shape"]);
});

test("selects accessible shape choices and resets context state", () => {
  renderWithConfiguration(<ShapeSelectionStep />);

  const square = screen.getByRole("radio", {
    name: "Square cushion",
  }) as HTMLInputElement;
  const rectangle = screen.getByRole("radio", {
    name: "Rectangle cushion",
  }) as HTMLInputElement;
  const box = screen.getByRole("radio", {
    name: "Box / bench cushion",
  }) as HTMLInputElement;
  assert.equal(square.checked, false);
  assert.equal(rectangle.checked, false);
  assert.equal(box.checked, false);
  assert.equal(square.required, true);
  assert.equal(rectangle.required, true);
  assert.equal(box.required, true);
  assert.ok(screen.getByText(/this choice is required/i));

  fireEvent.click(square);
  assert.equal(square.checked, true);
  assert.equal(screen.getByTestId("current-shape").textContent, "square");

  fireEvent.click(rectangle);
  assert.equal(rectangle.checked, true);
  assert.equal(screen.getByTestId("current-shape").textContent, "rectangle");

  fireEvent.click(screen.getByRole("button", {
    name: "Reset test configuration",
  }));
  assert.equal(screen.getByTestId("current-shape").textContent, "none");
});

test("warns before an equal-dimension shape replaces a meaningful height", () => {
  renderWithConfiguration(<ShapeSelectionStep />, completeConfiguration);

  fireEvent.click(screen.getByRole("radio", { name: "Round cushion" }));
  assert.equal(screen.getByTestId("current-shape").textContent, "rectangle");
  assert.ok(screen.getByRole("heading", { name: "Confirm equal dimensions" }));
  assert.match(screen.getByText(/Changing shape will make/i).textContent ?? "", /80 cm/);

  fireEvent.keyDown(screen.getByRole("heading", { name: "Confirm equal dimensions" }).parentElement!, {
    key: "Escape",
  });
  assert.equal(screen.queryByRole("heading", { name: "Confirm equal dimensions" }), null);
  assert.equal(screen.getByTestId("current-height").textContent, "40");

  fireEvent.click(screen.getByRole("radio", { name: "Round cushion" }));
  fireEvent.click(screen.getByRole("button", { name: "Use width for both dimensions" }));
  assert.equal(screen.getByTestId("current-shape").textContent, "round");
  assert.equal(screen.getByTestId("current-width").textContent, "80");
  assert.equal(screen.getByTestId("current-height").textContent, "80");
});

test("shows shape-specific measurement fields and user-visible validation", () => {
  const squareConfiguration: ConfigurationState = {
    ...completeConfiguration,
    shape: "square",
    width: 50,
    height: 50,
    thickness: 8,
  };
  renderWithConfiguration(<MeasurementStep />, squareConfiguration);

  assert.ok(screen.getByRole("textbox", { name: "Width (cm)" }));
  assert.ok(screen.getByRole("textbox", { name: "Thickness (cm)" }));
  assert.equal(
    screen.queryByRole("textbox", { name: "Height (cm)" }),
    null,
  );

  const width = screen.getByRole("textbox", { name: "Width (cm)" });
  fireEvent.change(width, { target: { value: "45.125" } });
  fireEvent.blur(width);
  assert.match(
    screen.getByRole("status").textContent ?? "",
    /no more than two decimal places/i,
  );
  assert.equal(screen.getByTestId("current-width").textContent, "50");

  fireEvent.change(width, { target: { value: "45,25" } });
  fireEvent.blur(width);
  assert.equal(screen.queryByRole("status"), null);
  assert.equal(screen.getByTestId("current-width").textContent, "45.25");
  assert.equal(screen.getByTestId("current-height").textContent, "45.25");
});

test("associates tapered guidance and relationship errors with each measurement", () => {
  renderWithConfiguration(
    <MeasurementStep />,
    {
      ...completeConfiguration,
      shape: "tapered",
      width: 80,
      backWidth: 65,
      height: 55,
    },
  );

  const frontWidth = screen.getByRole("textbox", { name: "Front width (cm)" });
  const backWidth = screen.getByRole("textbox", { name: "Back width (cm)" });
  assert.ok(screen.getByRole("textbox", { name: "Depth (cm)" }));
  const frontDescriptionId = frontWidth.getAttribute("aria-describedby");
  assert.ok(frontDescriptionId);
  assert.ok(document.getElementById(frontDescriptionId));
  assert.match(screen.getByText(/Measure the wider front edge/i).textContent ?? "", /Example: 80 cm/);

  const guidance = screen.getByText("More measuring tips");
  assert.equal(guidance.closest("details")?.hasAttribute("open"), false);
  fireEvent.click(guidance);
  assert.equal(guidance.closest("details")?.hasAttribute("open"), true);

  fireEvent.change(backWidth, { target: { value: "80" } });
  const error = screen.getByRole("status");
  assert.match(error.textContent ?? "", /smaller than front width/i);
  assert.ok((backWidth.getAttribute("aria-describedby") ?? "").includes(error.id));
});

test("selects material, fit, closure, and seam independently", () => {
  renderWithConfiguration(<CoverDetailsStep />, completeConfiguration);

  assert.equal((screen.getByRole("radio", { name: "Cotton canvas" }) as HTMLInputElement).checked, true);
  assert.equal((screen.getByRole("radio", { name: "Standard fit" }) as HTMLInputElement).checked, true);
  fireEvent.click(screen.getByRole("radio", { name: "Linen blend" }));
  fireEvent.click(screen.getByRole("radio", { name: "More relaxed fit" }));
  fireEvent.click(screen.getByRole("radio", { name: "Envelope opening" }));
  fireEvent.click(screen.getByRole("radio", { name: "Piped edge" }));

  assert.equal(screen.getByTestId("current-material").textContent, "linen-blend");
  assert.equal(screen.getByTestId("current-fit").textContent, "relaxed");
  assert.equal(screen.getByTestId("current-closure").textContent, "envelope");
  assert.equal(screen.getByTestId("current-seam").textContent, "piped");
  assert.match(screen.getByText(/never rewrites your measurements/i).textContent ?? "", /never rewrites/i);
});

test("preserves a selected pattern when filters hide it and exposes recovery", () => {
  const filterChanges: unknown[] = [];
  renderWithConfiguration(
    <PatternStep
      catalogue={catalogueState({
        filters: {
          categoryId: "geometric",
          colorId: ALL_PATTERN_COLORS,
        },
        visiblePatterns: [diamondPattern],
      })}
      onFiltersChange={(filters) => filterChanges.push(filters)}
      onRetry={() => undefined}
    />,
    completeConfiguration,
  );

  assert.ok(
    screen.getByRole("heading", {
      name: "Selected pattern hidden by discovery criteria",
    }),
  );
  assert.ok(screen.getByText(/Fern Trail remains selected/i));
  assert.equal(screen.getByTestId("current-pattern").textContent, "fern-trail");
  const diamond = screen.getByRole("radio", {
    name: "Diamond Path",
  }) as HTMLInputElement;
  assert.equal(diamond.required, true);
  assert.ok(screen.getByText(/this choice is required/i));
  assert.equal(screen.queryByRole("radio", { name: "Fern Trail" }), null);

  fireEvent.click(
    screen.getByRole("button", {
      name: "Clear search and filters to show selected pattern",
    }),
  );
  assert.deepEqual(filterChanges, [
    {
      categoryId: ALL_PATTERN_CATEGORIES,
      colorId: ALL_PATTERN_COLORS,
    },
  ]);
});

test("announces unavailable selections and filtered empty results without losing state", () => {
  const unavailableConfiguration = {
    ...completeConfiguration,
    pattern: { kind: "built-in" as const, patternId: "removed-pattern" },
  };
  const { rerender } = render(
    <AuthProvider><ConfigurationProvider>
        <SeedConfiguration configuration={unavailableConfiguration} />
        <PatternStep
          catalogue={catalogueState()}
          onFiltersChange={() => undefined}
          onRetry={() => undefined}
        />
        <StateProbe />
      </ConfigurationProvider></AuthProvider>,
  );

  assert.ok(
    screen.getByRole("heading", {
      name: "Selected pattern unavailable",
    }),
  );
  assert.ok(screen.getByText(/other configuration choices remain unchanged/i));
  assert.equal(
    screen.getByTestId("current-pattern").textContent,
    "removed-pattern",
  );

  rerender(
    <AuthProvider><ConfigurationProvider>
      <SeedConfiguration configuration={unavailableConfiguration} />
      <PatternStep
        catalogue={catalogueState({
          filters: {
            categoryId: "woven",
            colorId: "rose",
          },
          phase: "empty",
          visiblePatterns: [],
        })}
        onFiltersChange={() => undefined}
        onRetry={() => undefined}
      />
      <StateProbe />
    </ConfigurationProvider></AuthProvider>,
  );
  assert.ok(
    screen.getByRole("heading", {
      name: "No patterns match your search and filters",
    }),
  );
  assert.equal(
    screen.getByTestId("current-pattern").textContent,
    "removed-pattern",
  );
});

test("limits built-in results initially and reveals them without moving focus", () => {
  const { container } = renderWithConfiguration(
    <PatternStep
      catalogue={catalogueState({
        allPatterns: discoveryPatterns,
        visiblePatterns: discoveryPatterns,
      })}
      onFiltersChange={() => undefined}
      onRetry={() => undefined}
    />,
    completeConfiguration,
  );

  assert.equal(
    container.querySelectorAll(".pattern-card-input").length,
    INITIAL_PATTERN_RESULT_LIMIT,
  );
  assert.ok(screen.getByText("Showing 6 of 15 patterns."));
  assert.equal(screen.queryByRole("radio", { name: "Orchard Stripe" }), null);

  const showAll = screen.getByRole("button", {
    name: "Show all 15 patterns (9 more)",
  });
  showAll.focus();
  fireEvent.click(showAll);

  assert.equal(container.querySelectorAll(".pattern-card-input").length, 15);
  assert.equal(document.activeElement, showAll);
  assert.ok(screen.getByRole("radio", { name: "Confetti Grid" }));
  assert.ok(screen.getByRole("button", { name: "Show fewer patterns" }));

  fireEvent.click(showAll);
  assert.equal(
    container.querySelectorAll(".pattern-card-input").length,
    INITIAL_PATTERN_RESULT_LIMIT,
  );
});

test("searches names and supported metadata case-insensitively with trimmed input", () => {
  renderWithConfiguration(
    <PatternStep
      catalogue={catalogueState({
        allPatterns: discoveryPatterns,
        visiblePatterns: discoveryPatterns,
      })}
      onFiltersChange={() => undefined}
      onRetry={() => undefined}
    />,
    completeConfiguration,
  );

  const search = screen.getByRole("searchbox", {
    name: "Search built-in patterns",
  });

  fireEvent.change(search, { target: { value: "  dIaMoNd PaTh  " } });
  assert.ok(screen.getByRole("radio", { name: "Diamond Path" }));
  assert.equal(screen.queryByRole("radio", { name: "Fern Trail" }), null);
  assert.ok(screen.getByText("1 of 15 patterns match. Showing all matches."));

  fireEvent.change(search, { target: { value: "cool bands" } });
  assert.ok(screen.getByRole("radio", { name: "Terrace Wave" }));

  fireEvent.change(search, { target: { value: "woven" } });
  assert.ok(screen.getByRole("radio", { name: "Woven Sample" }));
  assert.ok(screen.getByRole("radio", { name: "Basket Check" }));
  assert.ok(screen.getByRole("radio", { name: "Linen Crosshatch" }));

  fireEvent.change(search, { target: { value: "rose" } });
  assert.ok(screen.getByRole("radio", { name: "Ribbon Stripe" }));
  assert.ok(screen.getByRole("radio", { name: "Confetti Grid" }));
});

test("combines local search with existing filters and keeps filter semantics", () => {
  const filterChanges: unknown[] = [];
  const geometricPatterns = discoveryPatterns.filter(
    (pattern) => pattern.categoryId === "geometric",
  );
  renderWithConfiguration(
    <PatternStep
      catalogue={catalogueState({
        allPatterns: discoveryPatterns,
        filters: {
          categoryId: "geometric",
          colorId: ALL_PATTERN_COLORS,
        },
        visiblePatterns: geometricPatterns,
      })}
      onFiltersChange={(filters) => filterChanges.push(filters)}
      onRetry={() => undefined}
    />,
    completeConfiguration,
  );

  fireEvent.change(
    screen.getByRole("searchbox", { name: "Search built-in patterns" }),
    { target: { value: "blue" } },
  );
  assert.ok(screen.getByRole("radio", { name: "Diamond Path" }));
  assert.equal(screen.queryByRole("radio", { name: "Arch Grid" }), null);
  assert.ok(screen.getByText("1 of 15 patterns match. Showing all matches."));

  fireEvent.click(screen.getByRole("radio", { name: "Botanical" }));
  fireEvent.click(screen.getByRole("radio", { name: "Blue" }));
  assert.deepEqual(filterChanges, [
    { categoryId: "botanical", colorId: ALL_PATTERN_COLORS },
    { categoryId: "geometric", colorId: "blue" },
  ]);
});

test("clears all discovery criteria and disclosure without clearing selection", () => {
  const filterChanges: unknown[] = [];
  const { container } = renderWithConfiguration(
    <PatternStep
      catalogue={catalogueState({
        allPatterns: discoveryPatterns,
        visiblePatterns: discoveryPatterns,
      })}
      onFiltersChange={(filters) => filterChanges.push(filters)}
      onRetry={() => undefined}
    />,
    completeConfiguration,
  );
  const search = screen.getByRole("searchbox", {
    name: "Search built-in patterns",
  }) as HTMLInputElement;

  fireEvent.click(
    screen.getByRole("button", { name: "Show all 15 patterns (9 more)" }),
  );
  fireEvent.change(search, { target: { value: "ivory" } });
  assert.equal(container.querySelectorAll(".pattern-card-input").length, 6);
  fireEvent.click(
    screen.getByRole("button", { name: "Clear search and filters" }),
  );

  assert.equal(search.value, "");
  assert.equal(document.activeElement, search);
  assert.equal(container.querySelectorAll(".pattern-card-input").length, 6);
  assert.equal(screen.getByTestId("current-pattern").textContent, "fern-trail");
  assert.deepEqual(filterChanges, []);
});

test("shows no-results recovery and preserves private/custom separation", () => {
  const customConfiguration: ConfigurationState = {
    ...completeConfiguration,
    pattern: {
      kind: "custom",
      assetId: "AAAAAAAAAAAAAAAAAAAAAA",
      derivativeId: "BBBBBBBBBBBBBBBBBBBBBB",
      processingVersion: "1",
      label: "Private linen study",
      previewUrl: "https://assets.example.test/private-pattern",
    },
  };
  renderWithConfiguration(
    <PatternStep
      catalogue={catalogueState({
        allPatterns: discoveryPatterns,
        visiblePatterns: discoveryPatterns,
      })}
      onFiltersChange={() => undefined}
      onRetry={() => undefined}
    />,
    customConfiguration,
  );

  fireEvent.change(
    screen.getByRole("searchbox", { name: "Search built-in patterns" }),
    { target: { value: "not in this catalogue" } },
  );
  assert.ok(
    screen.getByRole("heading", {
      name: "No patterns match your search and filters",
    }),
  );
  assert.ok(screen.getByRole("region", { name: "Your patterns" }));
  assert.equal(
    screen.getByTestId("current-pattern").textContent,
    "Private linen study",
  );
});

test("preserves undisclosed selection and replaces it through native radio controls", () => {
  const undisclosedConfiguration: ConfigurationState = {
    ...completeConfiguration,
    pattern: { kind: "built-in", patternId: "terrace-wave" },
  };
  renderWithConfiguration(
    <PatternStep
      catalogue={catalogueState({
        allPatterns: discoveryPatterns,
        visiblePatterns: discoveryPatterns,
      })}
      onFiltersChange={() => undefined}
      onRetry={() => undefined}
    />,
    undisclosedConfiguration,
  );

  assert.ok(
    screen.getByRole("heading", {
      name: "Selected pattern outside the initial results",
    }),
  );
  assert.equal(screen.getByTestId("current-pattern").textContent, "terrace-wave");
  fireEvent.click(screen.getByRole("radio", { name: "Diamond Path" }));
  assert.equal(screen.getByTestId("current-pattern").textContent, "diamond-path");
  assert.equal(
    (screen.getByRole("radio", { name: "Diamond Path" }) as HTMLInputElement)
      .checked,
    true,
  );
});

test("renders one clipped cushion model with pattern, measurements, and adjustable scale", () => {
  const { container } = renderWithConfiguration(
    <PreviewStep selectedPattern={fernPattern} />,
    completeConfiguration,
  );

  const preview = screen.getByRole("figure", { name: "Cushion preview" });
  assert.match(preview.textContent ?? "", /Selected fabric shown on the cushion/);
  assert.match(preview.textContent ?? "", /Rectangle/);
  assert.match(preview.textContent ?? "", /Fern Trail/);
  assert.match(preview.textContent ?? "", /80 cm/);
  assert.match(preview.textContent ?? "", /40 cm/);
  assert.match(preview.textContent ?? "", /10 cm/);
  assert.match(preview.textContent ?? "", /1\.2×/);

  const svg = container.querySelector('svg[data-preview-model="cushion"]');
  assert.ok(svg);
  assert.equal(svg.getAttribute("viewBox"), "0 0 640 430");
  assert.equal(svg.getAttribute("data-pattern-applied"), "true");
  const face = svg.querySelector("foreignObject.cushion-preview-pattern-viewport");
  assert.ok(face);
  assert.match(face.getAttribute("clip-path") ?? "", /^url\(#cushion-clip-/);
  assert.equal(
    (face.firstElementChild as HTMLElement).style.getPropertyValue(
      "--pattern-scale",
    ),
    "1.2",
  );

  const scale = screen.getByRole("slider", { name: "Pattern size" });
  assert.equal(scale.getAttribute("aria-valuetext"), "1.2× pattern size");
  fireEvent.click(screen.getByRole("button", { name: "Larger" }));
  assert.equal(scale.getAttribute("aria-valuetext"), "1.3× pattern size");
});

test("renders the neutral cushion before a pattern is selected", () => {
  const { container } = render(<CushionModel patternScale={1} />);

  const model = container.querySelector('svg[data-preview-model="cushion"]');
  assert.ok(model);
  assert.equal(model.getAttribute("data-pattern-applied"), "false");
  assert.equal(model.querySelector(".cushion-preview-pattern"), null);
  assert.ok(model.querySelector(".cushion-preview-base"));
  assert.ok(model.querySelector(".cushion-preview-shading"));
  assert.ok(model.querySelector(".cushion-preview-seam"));
});

test("keeps the same preview model for square and box configuration data", () => {
  for (const configuration of [
    {
      ...completeConfiguration,
      shape: "square" as const,
      width: 50,
      height: 50,
    },
    {
      ...completeConfiguration,
      shape: "box" as const,
      width: 180,
      height: 60,
      thickness: 12,
    },
  ]) {
    const { container, unmount } = renderWithConfiguration(
      <PreviewStep selectedPattern={fernPattern} showScaleControls={false} />,
      configuration,
    );
    assert.ok(
      screen.getByRole("region", {
        name:
          configuration.shape === "square"
            ? "Square cushion preview"
            : "Box / bench cushion preview",
      }),
    );
    assert.ok(
      container.querySelector('svg[data-preview-model="cushion"]'),
    );
    assert.equal(
      container.querySelector(".cushion-preview-edge")?.getAttribute("d"),
      "M91 91 C76 111 75 151 82 191 C74 241 77 305 103 337 C143 374 478 376 523 340 C550 309 555 244 548 190 C555 145 550 107 531 88 C493 56 132 58 91 91 Z",
    );
    unmount();
  }
});

test("renders tapered geometry, honest construction details, fit, and review output", () => {
  const taperedConfiguration: ConfigurationState = {
    ...completeConfiguration,
    shape: "tapered",
    width: 80,
    backWidth: 65,
    height: 55,
    materialId: "linen-blend",
    fitPreference: "relaxed",
    closureType: "envelope",
    seamStyle: "piped",
  };
  const { container } = renderWithConfiguration(
    <PreviewStep selectedPattern={fernPattern} showScaleControls={false} />,
    taperedConfiguration,
  );

  const preview = screen.getByRole("region", {
    name: "Tapered / trapezoid cushion preview",
  });
  assert.match(preview.textContent ?? "", /Linen blend/);
  assert.match(preview.textContent ?? "", /More relaxed fit/);
  assert.match(preview.textContent ?? "", /Envelope opening/);
  assert.match(preview.textContent ?? "", /Piped edge/);
  assert.match(preview.textContent ?? "", /does not reshape this reusable cushion model/i);
  const svg = container.querySelector('svg[data-preview-model="cushion"]');
  assert.ok(svg);
  assert.ok(svg.querySelector(".cushion-preview-seam-piped"));

  const readiness = deriveReviewReadiness(taperedConfiguration, {
    patterns: [fernPattern],
    status: "ready",
  });
  assert.equal(readiness.status, "ready");
  if (readiness.status === "ready") {
    assert.deepEqual(
      readiness.summary.fields
        .filter(({ id }) => ["backWidth", "material", "fit-preference", "closure-type", "seam-style"].includes(id))
        .map(({ label, value }) => [label, value]),
      [
        ["Back width", "65 cm"],
        ["Material", "Linen blend"],
        ["Fit preference", "More relaxed fit"],
        ["Closure / access", "Envelope opening"],
        ["Edge finish", "Piped edge"],
      ],
    );
  }
});

test("prevents duplicate saves, preserves input, and recovers after API rejection", async () => {
  let calls = 0;
  let rejectFirst!: (reason?: unknown) => void;
  const firstRequest = new Promise<DesignResponse>((_, reject) => {
    rejectFirst = reject;
  });
  const submitted: CreateDesignRequest[] = [];
  const client = {
    async createDesign(request: CreateDesignRequest) {
      calls += 1;
      submitted.push(request);
      if (calls === 1) {
        return firstRequest;
      }

      return {
        ...request,
        publicId: "AbCdEfGhIjKlMnOpQrSt_1",
      };
    },
  } as SewnCoversApiClient;
  const configuration = structuredClone(completeConfiguration);
  const savingChanges: boolean[] = [];
  const controller = new DesignSaveController(
    client,
    (publicId) => `https://example.test/configure/?design=${publicId}`,
  );

  render(
    <SaveSharePanel
      configuration={configuration}
      controllerFactory={() => controller}
      onSavingChange={(saving) => savingChanges.push(saving)}
    />,
  );

  const save = screen.getByRole("button", {
    name: "Save and create share link",
  });
  fireEvent.click(save);
  fireEvent.click(screen.getByRole("button", {
    name: /Saving design/,
  }));
  assert.equal(calls, 1);
  assert.ok(screen.getByRole("status").textContent?.includes("Connecting"));

  rejectFirst(new Error("private API rejection"));
  assert.ok(
    await screen.findByText(/The design could not be saved/i),
  );
  assert.deepEqual(configuration, completeConfiguration);
  assert.match(
    screen.getByText(/Your configuration is still here/i).textContent ?? "",
    /No automatic retry was attempted/i,
  );

  fireEvent.click(screen.getByRole("button", { name: "Try saving again" }));
  assert.ok(await screen.findByText(/Design saved/i));
  assert.equal(calls, 2);
  assert.deepEqual(submitted, [
    mapConfigurationToCreateDesign(completeConfiguration),
    mapConfigurationToCreateDesign(completeConfiguration),
  ]);
  assert.deepEqual(savingChanges, [true, false, true, false]);
});

test("shows validation and timeout/network failures with explicit retry recovery", async () => {
  let calls = 0;
  const statuses = [
    {
      category: "timeout" as const,
      message: "The SewnCovers API took too long to respond. Try again.",
      state: "failure" as const,
    },
    {
      category: "network" as const,
      message:
        "The SewnCovers API could not be reached. Check your connection and try again.",
      state: "failure" as const,
    },
  ];
  const client = {
    async createDesign(
      _request: CreateDesignRequest,
      options: ApiRequestOptions,
    ): Promise<DesignResponse> {
      const status = statuses[calls];
      calls += 1;
      options.onStatus?.(status);
      throw new Error("private transport failure");
    },
  } as SewnCoversApiClient;
  const controller = new DesignSaveController(client, () => "unused");
  const { rerender } = render(
    <SaveSharePanel
      configuration={{ ...completeConfiguration, width: null }}
      controllerFactory={() => controller}
      onSavingChange={() => undefined}
    />,
  );

  fireEvent.click(screen.getByRole("button", {
    name: "Save and create share link",
  }));
  assert.ok(
    await screen.findByText(/no longer ready to save/i),
  );
  assert.equal(calls, 0);

  const recoveryController = new DesignSaveController(client, () => "unused");
  rerender(
    <SaveSharePanel
      configuration={completeConfiguration}
      controllerFactory={() => recoveryController}
      onSavingChange={() => undefined}
    />,
  );
  fireEvent.click(screen.getByRole("button", {
    name: "Save and create share link",
  }));
  assert.ok(await screen.findByText(/took too long to respond/i));
  fireEvent.click(screen.getByRole("button", { name: "Try saving again" }));
  assert.ok(await screen.findByText(/could not be reached/i));
  assert.equal(calls, 2);
});

test("preview identifies sources, scale bounds, current output and contextual edits", () => {
  const edits: string[] = [];
  const { container } = renderWithConfiguration(<PreviewStep selectedPattern={fernPattern} onEdit={(stage) => edits.push(stage)} />, { ...completeConfiguration, patternScale: 1 });
  assert.ok(screen.getByRole("heading", { name: "Currently previewing" }));
  assert.ok(screen.getByText("Built-in pattern · Selected and shown"));
  const slider = screen.getByRole("slider", { name: "Pattern size" });
  assert.equal((slider as HTMLInputElement).value, "1");
  assert.equal(slider.getAttribute("min"), "0.5");
  assert.equal(slider.getAttribute("max"), "2");
  assert.equal(slider.getAttribute("step"), "0.1");
  for (const value of [0.5, 2]) {
    fireEvent.change(slider, { target: { value: String(value) } });
    assert.equal(container.querySelector<HTMLElement>(".cushion-preview-face")?.style.getPropertyValue("--pattern-scale"), String(value));
    assert.equal(slider.getAttribute("aria-valuetext"), `${value.toFixed(1)}× pattern size`);
  }
  assert.equal((screen.getByRole("button", { name: "Larger" }) as HTMLButtonElement).disabled, true);
  for (const name of ["Edit measurements", "Edit cover details", "Change pattern"]) fireEvent.click(screen.getByRole("button", { name }));
  assert.deepEqual(edits, ["measurements", "details", "pattern"]);
  assert.ok(screen.getByText(/not entered cushion dimensions or demonstration pricing/));
  assert.ok(screen.getByText(/Fit can affect fictional demonstration pricing/));
  assert.ok(screen.getByText(/not a manufacturing specification/));
});

test("preview keeps its silhouette stable for every shape, fit, and unit", () => {
  for (const shape of ["square", "rectangle", "round", "tapered", "box"] as const) {
    for (const unit of ["cm", "in"] as const) {
      let silhouette: string | null = null;
      for (const fitPreference of ["close", "standard", "relaxed"] as const) {
        const configuration = { ...completeConfiguration, shape, unit, width: 40, height: 40, backWidth: shape === "tapered" ? 30 : null, thickness: 5, fitPreference };
        const { container } = renderWithConfiguration(<PreviewStep selectedPattern={fernPattern} />, configuration);
        const model = container.querySelector('svg[data-preview-model="cushion"]');
        const edge = model?.querySelector(".cushion-preview-edge");
        assert.ok(model);
        assert.ok(edge);
        const current = `${model.getAttribute("viewBox")}|${edge.getAttribute("d")}`;
        if (silhouette) assert.equal(current, silhouette);
        silhouette = current;
        assert.ok(screen.getAllByText(`40 ${unit}`).length > 0);
        assert.ok(screen.getByText(/does not reshape this reusable cushion model/));
        assert.ok(screen.getByText(/Fabric feel and drape are not simulated/));
        assert.ok(screen.getByText(/not visible from this view/));
        cleanup();
      }
    }
  }
});

test("custom preview exposes only its label and source, reuses its image, and cleans up", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("image"));
  t.mock.method(URL, "createObjectURL", () => "blob:preview-test");
  const revokeMock = t.mock.method(URL, "revokeObjectURL", () => undefined);
  const configuration: ConfigurationState = { ...completeConfiguration, pattern: { kind: "custom", assetId: "A".repeat(22), derivativeId: "D".repeat(22), processingVersion: "tile-v1", label: "Garden drawing", previewUrl: "https://assets.example.test/private?grant=secret" } };
  const { container } = renderWithConfiguration(<PreviewStep selectedPattern={{ name: "Garden drawing", previewClassName: "", previewUrl: configuration.pattern?.kind === "custom" ? configuration.pattern.previewUrl! : undefined }} />, configuration);
  assert.ok(screen.getByText(/Loading your selected pattern/));
  await waitFor(() => assert.ok(container.querySelector("img")));
  fireEvent.load(container.querySelector("img")!);
  assert.ok(screen.getByText("Custom pattern · Selected and shown"));
  assert.doesNotMatch(container.textContent ?? "", /A{22}|D{22}|https:|secret/);
  fireEvent.change(screen.getByRole("slider", { name: "Pattern size" }), { target: { value: "2" } });
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(container.querySelector("img")?.getAttribute("src"), "blob:preview-test");
  fireEvent.error(container.querySelector("img")!);
  assert.equal(container.querySelector('svg[data-preview-model="cushion"]')?.getAttribute("data-pattern-applied"), "false");
  assert.equal(container.querySelector(".cushion-preview-pattern"), null);
  assert.ok(screen.getAllByRole("status").length > 0);
  assert.ok(screen.getByText(/selected pattern could not be displayed/));
  cleanup();
  assert.equal(revokeMock.mock.callCount(), 1);
  renderWithConfiguration(<PreviewStep selectedPattern={null} />, configuration);
  assert.ok(screen.getByText("Selected pattern unavailable"));
  assert.ok(screen.getByText("Neutral cushion shown"));
});

test("custom preview reports denied derivatives without substitution and ignores late responses", async (t) => {
  const createMock = t.mock.method(URL, "createObjectURL", () => "blob:unused");
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("", { status: 403 }));
  const pattern = { name: "Private drawing", previewClassName: "", previewUrl: "https://assets.example.test/authorized-tile" };
  const { container } = renderWithConfiguration(<PreviewStep selectedPattern={pattern} />, completeConfiguration);
  await screen.findByText(/selected pattern could not be displayed/);
  assert.equal(container.querySelector('svg[data-preview-model="cushion"]')?.getAttribute("data-pattern-applied"), "false");
  assert.equal(createMock.mock.callCount(), 0);
  cleanup();
  let resolveResponse!: (response: Response) => void;
  fetchMock.mock.mockImplementation(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
  const view = renderWithConfiguration(<PreviewStep selectedPattern={pattern} />, completeConfiguration);
  view.unmount();
  await act(async () => { resolveResponse(new Response("image")); });
  assert.equal(createMock.mock.callCount(), 0);
});
