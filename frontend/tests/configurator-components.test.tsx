import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import React, { useEffect } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import {
  ConfigurationProvider,
  useConfiguration,
} from "../context/configuration/configuration-context";
import type { ConfigurationState } from "../context/configuration/types";
import { ShapeSelectionStep } from "../components/configurator/shape-selection-step";
import { MeasurementStep } from "../components/configurator/measurement-step";
import { PatternStep } from "../components/configurator/pattern-step";
import { PreviewStep } from "../components/configurator/preview-step";
import { SaveSharePanel } from "../components/configurator/save-share-panel";
import type { PatternDefinition } from "../data/patterns";
import {
  ALL_PATTERN_CATEGORIES,
  ALL_PATTERN_COLORS,
} from "../data/patterns";
import { DesignSaveController } from "../services/design-save";
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
const completeConfiguration: ConfigurationState = {
  shape: "rectangle",
  width: 80,
  height: 40,
  thickness: 10,
  unit: "cm",
  patternId: "fern-trail",
  patternScale: 1.2,
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
      <span data-testid="current-pattern">{state.patternId ?? "none"}</span>
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
    <ConfigurationProvider>
      {configuration ? (
        <SeedConfiguration configuration={configuration} />
      ) : null}
      {children}
      <StateProbe />
    </ConfigurationProvider>,
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
      name: "Selected pattern hidden by filters",
    }),
  );
  assert.ok(screen.getByText(/Fern Trail remains selected/i));
  assert.equal(screen.getByTestId("current-pattern").textContent, "fern-trail");
  assert.ok(screen.getByRole("radio", { name: "Diamond Path" }));
  assert.equal(screen.queryByRole("radio", { name: "Fern Trail" }), null);

  fireEvent.click(
    screen.getByRole("button", {
      name: "Clear filters to show selected pattern",
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
    patternId: "removed-pattern",
  };
  const { rerender } = render(
    <ConfigurationProvider>
      <SeedConfiguration configuration={unavailableConfiguration} />
      <PatternStep
        catalogue={catalogueState()}
        onFiltersChange={() => undefined}
        onRetry={() => undefined}
      />
      <StateProbe />
    </ConfigurationProvider>,
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
    <ConfigurationProvider>
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
    </ConfigurationProvider>,
  );
  assert.ok(
    screen.getByRole("heading", {
      name: "No patterns match these filters",
    }),
  );
  assert.equal(
    screen.getByTestId("current-pattern").textContent,
    "removed-pattern",
  );
});

test("renders proportional dimensions, shape, pattern, and adjustable scale", () => {
  const { container } = renderWithConfiguration(
    <PreviewStep selectedPattern={fernPattern} />,
    completeConfiguration,
  );

  const preview = screen.getByRole("figure", { name: "Cushion preview" });
  assert.match(preview.textContent ?? "", /Current proportional preview/);
  assert.match(preview.textContent ?? "", /Rectangle/);
  assert.match(preview.textContent ?? "", /Fern Trail/);
  assert.match(preview.textContent ?? "", /80 cm/);
  assert.match(preview.textContent ?? "", /40 cm/);
  assert.match(preview.textContent ?? "", /10 cm/);
  assert.match(preview.textContent ?? "", /1\.2×/);

  const svg = container.querySelector(
    'svg[data-preview-shape="rectangle"]',
  );
  assert.ok(svg);
  const face = svg.querySelector("foreignObject");
  assert.ok(face);
  const width = Number(face.getAttribute("width"));
  const height = Number(face.getAttribute("height"));
  assert.ok(Math.abs(width / height - 2) < 0.001);
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

test("renders the correct preview visual for square and box cushions", () => {
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
      container.querySelector(
        `svg[data-preview-shape="${configuration.shape}"]`,
      ),
    );
    unmount();
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
    completeConfiguration,
    completeConfiguration,
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
