"use client";

import { useId, useRef, useState } from "react";

import { PatternCard } from "@/components/configurator/pattern-card";
import {
  PatternFilter,
  type PatternFilterOption,
} from "@/components/configurator/pattern-filter";
import { Button, ErrorMessage } from "@/components/ui";
import {
  hasValidMeasurementsForShape,
  useConfiguration,
} from "@/context/configuration";
import {
  ALL_PATTERN_CATEGORIES,
  ALL_PATTERN_COLORS,
  filterPatterns,
  getPatternCategoryLabel,
  getPatternColorLabels,
  patternCatalogue,
  patternCategories,
  patternColors,
  type PatternCatalogueResult,
  type PatternCategoryFilter,
  type PatternColorFilter,
} from "@/data/patterns";

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
  catalogueResult?: PatternCatalogueResult;
}

export function PatternStep({
  catalogueResult = patternCatalogue,
}: PatternStepProps) {
  const { state, dispatch } = useConfiguration();
  const generatedId = useId();
  const supportingTextId = `${generatedId}-supporting-text`;
  const resultCountId = `${generatedId}-result-count`;
  const categoryFilterRef = useRef<HTMLFieldSetElement>(null);
  const [categoryId, setCategoryId] =
    useState<PatternCategoryFilter>(ALL_PATTERN_CATEGORIES);
  const [colorId, setColorId] =
    useState<PatternColorFilter>(ALL_PATTERN_COLORS);

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

  const filtersAreActive =
    categoryId !== ALL_PATTERN_CATEGORIES ||
    colorId !== ALL_PATTERN_COLORS;
  const availablePatterns =
    catalogueResult.status === "ready"
      ? catalogueResult.patterns
      : [];
  const visiblePatterns = filterPatterns(availablePatterns, {
    categoryId,
    colorId,
  });
  const selectedPattern =
    state.patternId === null
      ? null
      : availablePatterns.find(
          (pattern) => pattern.id === state.patternId,
        ) ?? null;
  const selectedPatternIsHidden =
    selectedPattern !== null &&
    !visiblePatterns.some(
      (pattern) => pattern.id === selectedPattern.id,
    );
  const selectedPatternIsUnavailable =
    state.patternId !== null && selectedPattern === null;

  const clearFilters = () => {
    setCategoryId(ALL_PATTERN_CATEGORIES);
    setColorId(ALL_PATTERN_COLORS);
    requestAnimationFrame(() => {
      categoryFilterRef.current
        ?.querySelector<HTMLInputElement>("input")
        ?.focus();
    });
  };

  return (
    <section
      aria-label="Pattern selection"
      className="mt-layout scroll-mt-layout"
    >
      <fieldset
        aria-describedby={supportingTextId}
        className="min-w-0 rounded-panel border border-border bg-surface p-card shadow-raised"
      >
        <legend className="max-w-full px-1 font-display text-section-title font-heading tracking-heading text-text-primary">
          Choose a pattern
        </legend>
        <p
          id={supportingTextId}
          className="mt-2 max-w-3xl break-words text-body text-text-muted"
        >
          Compare locally rendered pattern directions. Choose one pattern
          for this configuration, then adjust its scale in the preview.
        </p>

        {catalogueResult.status === "error" ? (
          <ErrorMessage className="mt-component">
            <div>
              <h3 className="text-body font-control">
                Pattern catalogue unavailable
              </h3>
              <p className="mt-1">
                The local catalogue contains conflicting or incomplete
                records, so no pattern cards or previews were shown.
              </p>
              <ul className="mt-2 list-disc pl-5">
                {catalogueResult.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          </ErrorMessage>
        ) : catalogueResult.status === "empty" ? (
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
              The local catalogue is empty. Your current configuration has
              been preserved; try again after catalogue patterns are added.
            </p>
          </div>
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
                  onChange={setCategoryId}
                />
                <PatternFilter
                  legend="Filter by color"
                  name={`${generatedId}-pattern-color`}
                  options={colorFilterOptions}
                  value={colorId}
                  onChange={setColorId}
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
                  {filtersAreActive
                    ? `Showing ${visiblePatterns.length} of ${availablePatterns.length} patterns.`
                    : `Showing all ${availablePatterns.length} patterns.`}
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
                  configuration.
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
                    The current pattern identifier does not match this
                    catalogue. Your other configuration choices remain
                    unchanged; choose any available pattern below to replace
                    it.
                  </p>
                </div>
              </ErrorMessage>
            ) : null}

            {visiblePatterns.length === 0 ? (
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
                  filters to see the complete catalogue.
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
                {visiblePatterns.map((pattern) => {
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
