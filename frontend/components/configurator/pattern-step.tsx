"use client";

import { useId, useRef } from "react";

import { PatternCard } from "@/components/configurator/pattern-card";
import {
  PatternFilter,
  type PatternFilterOption,
} from "@/components/configurator/pattern-filter";
import { Button, ErrorMessage, LoadingState } from "@/components/ui";
import {
  hasValidMeasurementsForShape,
  useConfiguration,
} from "@/context/configuration";
import {
  ALL_PATTERN_CATEGORIES,
  ALL_PATTERN_COLORS,
  getPatternById,
  getPatternCategoryLabel,
  getPatternColorLabels,
  patternCategories,
  patternColors,
  type PatternCategoryFilter,
  type PatternColorFilter,
  type PatternFilters,
} from "@/data/patterns";
import type { PatternCatalogueState } from "@/services/pattern-catalogue";

const categoryFilterOptions: readonly PatternFilterOption<PatternCategoryFilter>[] =
  [
    {
      value: ALL_PATTERN_CATEGORIES,
      label: "All categories",
    },
    ...patternCategories.map((category) => ({
      value: category.id,
      label: category.label,
    })),
  ];

const colorFilterOptions: readonly PatternFilterOption<PatternColorFilter>[] =
  [
    {
      value: ALL_PATTERN_COLORS,
      label: "All colors",
    },
    ...patternColors.map((color) => ({
      value: color.id,
      label: color.label,
    })),
  ];

export interface PatternStepProps {
  catalogue: PatternCatalogueState;
  focusTargetId?: string;
  onFiltersChange: (filters: PatternFilters) => void;
  onRetry: () => void;
}

export function PatternStep({
  catalogue,
  focusTargetId,
  onFiltersChange,
  onRetry,
}: PatternStepProps) {
  const { state, dispatch } = useConfiguration();
  const generatedId = useId();
  const supportingTextId = `${generatedId}-supporting-text`;
  const resultCountId = `${generatedId}-result-count`;
  const categoryFilterRef = useRef<HTMLFieldSetElement>(null);
  const { categoryId, colorId } = catalogue.filters;
  const filtersAreActive =
    categoryId !== ALL_PATTERN_CATEGORIES ||
    colorId !== ALL_PATTERN_COLORS;
  const hasCompleteCatalogue = catalogue.allPatterns.length > 0;
  const selectedPattern = getPatternById(
    catalogue.allPatterns,
    state.patternId,
  );
  const selectedPatternIsHidden =
    selectedPattern !== null &&
    (catalogue.phase === "ready" || catalogue.phase === "empty") &&
    !catalogue.visiblePatterns.some(
      (pattern) => pattern.id === selectedPattern.id,
    );
  const selectedPatternIsUnavailable =
    hasCompleteCatalogue &&
    state.patternId !== null &&
    selectedPattern === null;

  if (
    !hasValidMeasurementsForShape(
      state.shape,
      state.width,
      state.height,
      state.thickness,
      state.unit,
    )
  ) {
    return null;
  }

  const clearFilters = () => {
    onFiltersChange({
      categoryId: ALL_PATTERN_CATEGORIES,
      colorId: ALL_PATTERN_COLORS,
    });
    requestAnimationFrame(() => {
      categoryFilterRef.current
        ?.querySelector<HTMLInputElement>("input")
        ?.focus();
    });
  };

  const errorState = (
    <ErrorMessage className="mt-component">
      <div>
        <h3 className="text-body font-control">
          Pattern catalogue unavailable
        </h3>
        <p className="mt-1">{catalogue.message}</p>
        {catalogue.issues.length > 0 ? (
          <ul className="mt-2 list-disc pl-5">
            {catalogue.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
        <Button className="mt-3" variant="secondary" onClick={onRetry}>
          Try loading patterns again
        </Button>
      </div>
    </ErrorMessage>
  );

  return (
    <section
      aria-label="Pattern selection"
      className="mt-layout scroll-mt-layout"
    >
      <fieldset
        aria-describedby={supportingTextId}
        className="min-w-0 rounded-panel border border-border bg-surface p-card shadow-raised"
      >
        <legend
          id={focusTargetId}
          tabIndex={focusTargetId ? -1 : undefined}
          className="configurator-edit-target max-w-full scroll-mt-layout px-1 font-display text-section-title font-heading tracking-heading text-text-primary"
        >
          Choose a pattern
        </legend>
        <p
          id={supportingTextId}
          className="mt-2 max-w-3xl break-words text-body text-text-muted"
        >
          This choice is required. Compare pattern directions loaded from
          SewnCovers. Choose one pattern for this configuration, then adjust
          its scale in the preview.
        </p>

        {!hasCompleteCatalogue ? (
          catalogue.phase === "loading" ? (
            <div className="mt-component rounded-card border border-border bg-surface-subtle p-card">
              <LoadingState label={catalogue.message} />
            </div>
          ) : catalogue.phase === "error" ? (
            errorState
          ) : (
            <div
              className="mt-component rounded-card border border-border-strong bg-surface-subtle p-card"
              aria-labelledby={`${generatedId}-empty-catalogue-title`}
            >
              <h3
                id={`${generatedId}-empty-catalogue-title`}
                className="text-body font-control text-text-primary"
              >
                No patterns are available
              </h3>
              <p className="mt-1 break-words text-supporting text-text-muted">
                The API returned an empty catalogue. Your current
                configuration has been preserved.
              </p>
              <Button
                className="mt-3"
                variant="secondary"
                onClick={onRetry}
              >
                Check for patterns again
              </Button>
            </div>
          )
        ) : (
          <>
            <div className="mt-component rounded-card border border-border bg-surface-subtle p-control-x py-4">
              <div className="grid min-w-0 gap-component lg:grid-cols-2">
                <PatternFilter
                  ref={categoryFilterRef}
                  legend="Filter by category"
                  name={`${generatedId}-pattern-category`}
                  options={categoryFilterOptions}
                  value={categoryId}
                  onChange={(nextCategoryId) =>
                    onFiltersChange({
                      categoryId: nextCategoryId,
                      colorId,
                    })
                  }
                />
                <PatternFilter
                  legend="Filter by color"
                  name={`${generatedId}-pattern-color`}
                  options={colorFilterOptions}
                  value={colorId}
                  onChange={(nextColorId) =>
                    onFiltersChange({
                      categoryId,
                      colorId: nextColorId,
                    })
                  }
                />
              </div>
              <div className="mt-component flex min-w-0 flex-wrap items-center justify-between gap-3">
                <p
                  id={resultCountId}
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  className="min-w-0 break-words text-supporting text-text-muted"
                >
                  {catalogue.phase === "loading"
                    ? catalogue.message
                    : catalogue.phase === "error"
                      ? "Pattern results could not be loaded."
                      : filtersAreActive
                        ? `Showing ${catalogue.visiblePatterns.length} of ${catalogue.allPatterns.length} patterns.`
                        : `Showing all ${catalogue.allPatterns.length} patterns.`}
                </p>
                <Button
                  variant="secondary"
                  disabled={!filtersAreActive}
                  aria-describedby={resultCountId}
                  onClick={clearFilters}
                >
                  Clear filters
                </Button>
              </div>
            </div>

            {selectedPatternIsHidden ? (
              <div
                className="mt-component rounded-card border border-border-strong bg-surface-subtle p-control-x py-4"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <h3 className="text-body font-control text-text-primary">
                  Selected pattern hidden by filters
                </h3>
                <p className="mt-1 break-words text-supporting text-text-muted">
                  {selectedPattern.name} remains selected for your
                  configuration and preview.
                </p>
                <Button
                  className="mt-3"
                  variant="secondary"
                  onClick={clearFilters}
                >
                  Clear filters to show selected pattern
                </Button>
              </div>
            ) : null}

            {selectedPatternIsUnavailable ? (
              <ErrorMessage
                className="mt-component"
                role="status"
                aria-live="polite"
              >
                <div>
                  <h3 className="text-body font-control">
                    Selected pattern unavailable
                  </h3>
                  <p className="mt-1">
                    The current pattern identifier does not match the API
                    catalogue. Your other configuration choices remain
                    unchanged; choose any available pattern below to replace
                    it.
                  </p>
                </div>
              </ErrorMessage>
            ) : null}

            {catalogue.phase === "loading" ? (
              <div className="mt-component rounded-card border border-border bg-surface-subtle p-card">
                <LoadingState label={catalogue.message} />
              </div>
            ) : catalogue.phase === "error" ? (
              errorState
            ) : catalogue.visiblePatterns.length === 0 ? (
              <div
                className="mt-component rounded-card border border-border-strong bg-surface-subtle p-card"
                aria-labelledby={`${generatedId}-no-matches-title`}
              >
                <h3
                  id={`${generatedId}-no-matches-title`}
                  className="text-body font-control text-text-primary"
                >
                  No patterns match these filters
                </h3>
                <p className="mt-1 break-words text-supporting text-text-muted">
                  Your current pattern selection has not changed. Clear both
                  filters to request the complete catalogue.
                </p>
                <Button
                  className="mt-3"
                  variant="secondary"
                  onClick={clearFilters}
                >
                  Clear filters and show all patterns
                </Button>
              </div>
            ) : (
              <div
                aria-describedby={resultCountId}
                className="mt-layout grid min-w-0 gap-component sm:grid-cols-2 lg:grid-cols-3"
              >
                {catalogue.visiblePatterns.map((pattern) => {
                  const optionId = `${generatedId}-${pattern.id}`;
                  const colorLabels = getPatternColorLabels(
                    pattern.colorIds,
                  );

                  return (
                    <PatternCard
                      key={pattern.id}
                      id={optionId}
                      name="cushion-pattern"
                      value={pattern.id}
                      required
                      checked={state.patternId === pattern.id}
                      patternName={pattern.name}
                      patternCategory={getPatternCategoryLabel(
                        pattern.categoryId,
                      )}
                      patternColors={colorLabels.join(", ")}
                      description={pattern.description}
                      preview={
                        <span
                          className={`prototype-pattern ${pattern.previewClassName} block size-full`}
                        />
                      }
                      onChange={() =>
                        dispatch({
                          type: "setPatternId",
                          patternId: pattern.id,
                        })
                      }
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </fieldset>
    </section>
  );
}
