"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { PatternCard } from "@/components/configurator/pattern-card";
import { CushionModel } from "@/components/configurator/cushion-model";
import {
  PatternFilter,
  type PatternFilterOption,
} from "@/components/configurator/pattern-filter";
import { Button, ErrorMessage, LoadingState } from "@/components/ui";
import {
  DEFAULT_SOLID_COLOR,
  getBuiltInPatternId,
  getSolidColor,
  hasValidMeasurementsForShape,
  normalizeHexColor,
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
import { YourPatterns } from "./your-patterns";

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

export const INITIAL_PATTERN_RESULT_LIMIT = 6;

function normalizePatternSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function patternMatchesSearch(
  pattern: PatternCatalogueState["visiblePatterns"][number],
  normalizedQuery: string,
): boolean {
  if (normalizedQuery === "") {
    return true;
  }

  return [
    pattern.name,
    pattern.description,
    getPatternCategoryLabel(pattern.categoryId),
    ...getPatternColorLabels(pattern.colorIds),
  ].some((value) =>
    value.toLocaleLowerCase().includes(normalizedQuery),
  );
}

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
  const resultAnnouncementId = `${generatedId}-result-announcement`;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllMatchingPatterns, setShowAllMatchingPatterns] =
    useState(false);
  const [resultAnnouncement, setResultAnnouncement] = useState("");
  const solidColor = getSolidColor(state.pattern);
  const [solidColorDraft, setSolidColorDraft] = useState(
    solidColor ?? DEFAULT_SOLID_COLOR,
  );
  const [solidColorError, setSolidColorError] = useState<string | null>(null);
  const { categoryId, colorId } = catalogue.filters;
  const filtersAreActive =
    categoryId !== ALL_PATTERN_CATEGORIES ||
    colorId !== ALL_PATTERN_COLORS;
  const normalizedSearchQuery = normalizePatternSearch(searchQuery);
  const searchIsActive = normalizedSearchQuery !== "";
  const discoveryCriteriaAreActive = filtersAreActive || searchIsActive;
  const hasCompleteCatalogue = catalogue.allPatterns.length > 0;
  const matchingPatterns = useMemo(
    () =>
      catalogue.visiblePatterns.filter((pattern) =>
        patternMatchesSearch(pattern, normalizedSearchQuery),
      ),
    [catalogue.visiblePatterns, normalizedSearchQuery],
  );
  const displayedPatterns = showAllMatchingPatterns
    ? matchingPatterns
    : matchingPatterns.slice(0, INITIAL_PATTERN_RESULT_LIMIT);
  const undisclosedPatternCount =
    matchingPatterns.length - displayedPatterns.length;
  const canTogglePatternDisclosure =
    matchingPatterns.length > INITIAL_PATTERN_RESULT_LIMIT;
  const builtInPatternId = getBuiltInPatternId(state.pattern);
  const selectedPattern = getPatternById(
    catalogue.allPatterns,
    builtInPatternId,
  );
  const catalogueIsSettled =
    catalogue.phase === "ready" || catalogue.phase === "empty";
  const selectedPatternMatchesCriteria =
    selectedPattern !== null &&
    matchingPatterns.some((pattern) => pattern.id === selectedPattern.id);
  const selectedPatternIsDisplayed =
    selectedPattern !== null &&
    displayedPatterns.some((pattern) => pattern.id === selectedPattern.id);
  const selectedPatternIsHiddenByCriteria =
    selectedPattern !== null &&
    catalogueIsSettled &&
    !selectedPatternMatchesCriteria;
  const selectedPatternIsUndisclosed =
    selectedPattern !== null &&
    catalogueIsSettled &&
    selectedPatternMatchesCriteria &&
    !selectedPatternIsDisplayed;
  const selectedPatternIsUnavailable =
    hasCompleteCatalogue &&
    builtInPatternId !== null &&
    selectedPattern === null;

  const resultCountMessage =
    catalogue.phase === "loading"
      ? catalogue.message
      : catalogue.phase === "error"
        ? "Pattern results could not be loaded."
        : discoveryCriteriaAreActive
          ? displayedPatterns.length === matchingPatterns.length
            ? `${matchingPatterns.length} of ${catalogue.allPatterns.length} patterns match. Showing all matches.`
            : `${matchingPatterns.length} of ${catalogue.allPatterns.length} patterns match. Showing ${displayedPatterns.length}.`
          : displayedPatterns.length === catalogue.allPatterns.length
            ? `Showing all ${catalogue.allPatterns.length} patterns.`
            : `Showing ${displayedPatterns.length} of ${catalogue.allPatterns.length} patterns.`;

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setResultAnnouncement(resultCountMessage);
    }, 250);

    return () => globalThis.clearTimeout(timer);
  }, [resultCountMessage]);

  if (
    !hasValidMeasurementsForShape(
      state.shape,
      state.width,
      state.height,
      state.thickness,
      state.unit,
      state.backWidth,
    )
  ) {
    return null;
  }

  const clearDiscoveryCriteria = () => {
    setSearchQuery("");
    setShowAllMatchingPatterns(false);
    if (filtersAreActive) {
      onFiltersChange({
        categoryId: ALL_PATTERN_CATEGORIES,
        colorId: ALL_PATTERN_COLORS,
      });
    }
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  };

  const updateSearchQuery = (value: string) => {
    setSearchQuery(value);
    setShowAllMatchingPatterns(false);
  };

  const updateFilters = (filters: PatternFilters) => {
    setShowAllMatchingPatterns(false);
    onFiltersChange(filters);
  };

  const selectSolidColor = () => {
    const color = solidColor ??
      normalizeHexColor(solidColorDraft) ??
      DEFAULT_SOLID_COLOR;
    setSolidColorDraft(color);
    setSolidColorError(null);
    dispatch({ type: "setSolidColor", color });
  };

  const updateSolidColor = (value: string) => {
    setSolidColorDraft(value);
    const normalized = normalizeHexColor(value);
    if (normalized === null) {
      setSolidColorError(
        "Enter a six-digit hexadecimal color, such as #B8AFA3.",
      );
      return;
    }
    setSolidColorError(null);
    dispatch({ type: "setSolidColor", color: normalized });
  };

  const displayedSolidColorDraft = solidColorError === null
    ? solidColor ?? solidColorDraft
    : solidColorDraft;

  const commitSolidColor = () => {
    const normalized = normalizeHexColor(displayedSolidColorDraft);
    if (normalized !== null) {
      setSolidColorDraft(normalized);
    }
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
          Choose fabric color or pattern
        </legend>
        <p
          id={supportingTextId}
          className="mt-2 max-w-3xl break-words text-body text-text-muted"
        >
          This choice is required. Choose a plain fabric color, one of your
          private patterns, or a built-in pattern. Pattern scale can be
          adjusted in the preview when a printed pattern is selected.
        </p>

        <h3 className="mt-layout font-display text-section-title font-heading">
          Plain fabric
        </h3>
        <p className="mt-2 max-w-3xl break-words text-supporting text-text-muted">
          Solid color stays available independently of pattern search and
          filters.
        </p>
        <div className="mt-component grid min-w-0 gap-component sm:grid-cols-2 lg:grid-cols-3">
          <PatternCard
            id={`${generatedId}-solid-color`}
            name="solid-fabric-choice"
            value="solid-color"
            required
            checked={solidColor !== null}
            patternName="Solid color"
            patternCategory="Plain fabric"
            patternColors={solidColor ?? DEFAULT_SOLID_COLOR}
            description="Use one continuous fabric color across the cushion."
            preview={
              <span
                className="block h-3/5 w-4/5 rounded-panel border border-border-strong shadow-card"
                style={{
                  backgroundColor: solidColor ?? DEFAULT_SOLID_COLOR,
                }}
              />
            }
            onChange={selectSolidColor}
          />
        </div>
        {solidColor !== null ? (
          <div
            className="mt-component max-w-2xl rounded-card border border-border-strong bg-surface-subtle p-control-x py-4"
            role="group"
            aria-labelledby={`${generatedId}-solid-color-heading`}
          >
            <h4
              id={`${generatedId}-solid-color-heading`}
              className="text-body font-control text-text-primary"
            >
              Choose your fabric color
            </h4>
            <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
              <div>
                <label
                  htmlFor={`${generatedId}-native-color`}
                  className="block text-label font-control text-text-primary"
                >
                  Fabric color picker
                </label>
                <input
                  id={`${generatedId}-native-color`}
                  type="color"
                  value={solidColor}
                  className="mt-2 h-12 w-20 cursor-pointer rounded-control border border-border-strong bg-surface p-1"
                  onChange={(event) =>
                    updateSolidColor(event.currentTarget.value)
                  }
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor={`${generatedId}-hex-color`}
                  className="block text-label font-control text-text-primary"
                >
                  Hexadecimal color
                </label>
                <input
                  id={`${generatedId}-hex-color`}
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={7}
                  value={displayedSolidColorDraft}
                  aria-invalid={solidColorError !== null}
                  aria-describedby={`${generatedId}-hex-help${solidColorError ? ` ${generatedId}-hex-error` : ""}`}
                  className="mt-2 min-h-12 w-full rounded-control border border-border-strong bg-surface px-control-x py-control-y font-mono text-body uppercase text-text-primary"
                  onChange={(event) =>
                    updateSolidColor(event.currentTarget.value)
                  }
                  onBlur={commitSolidColor}
                />
              </div>
            </div>
            <p
              id={`${generatedId}-hex-help`}
              className="mt-2 text-supporting text-text-muted"
            >
              Enter six hexadecimal digits. The saved value is normalized to
              uppercase, including the leading #.
            </p>
            {solidColorError ? (
              <p
                id={`${generatedId}-hex-error`}
                className="mt-2 text-supporting text-error-text"
                role="alert"
              >
                {solidColorError}
              </p>
            ) : null}
            <figure className="mt-4 rounded-card border border-border bg-surface p-3">
              <div aria-hidden="true" className="mx-auto max-w-xl">
                <CushionModel
                  patternName="Solid color"
                  patternScale={state.patternScale}
                  seamStyle={state.seamStyle}
                  solidColor={solidColor}
                />
              </div>
              <figcaption className="text-center text-supporting text-text-muted">
                Live cushion preview · Solid color {solidColor}
              </figcaption>
            </figure>
            <p className="sr-only" role="status" aria-live="polite">
              Solid fabric color {solidColor} selected.
            </p>
          </div>
        ) : null}

        <YourPatterns />

        <h3 className="mt-layout font-display text-section-title font-heading">
          Built-in patterns
        </h3>
        <p className="mt-2 max-w-3xl break-words text-supporting text-text-muted">
          Search and filters apply only to built-in patterns. Solid color and
          your private patterns remain available above.
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
                No built-in patterns are available
              </h3>
              <p className="mt-1 break-words text-supporting text-text-muted">
                The API returned an empty catalogue. Solid fabric remains
                available, and your current configuration has been preserved.
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
              <div className="max-w-2xl">
                <label
                  htmlFor={`${generatedId}-pattern-search`}
                  className="block text-label font-control tracking-label text-text-primary"
                >
                  Search built-in patterns
                </label>
                <input
                  ref={searchInputRef}
                  id={`${generatedId}-pattern-search`}
                  type="search"
                  value={searchQuery}
                  aria-describedby={resultCountId}
                  className="mt-2 min-h-12 w-full min-w-0 rounded-control border border-border-strong bg-surface px-control-x py-control-y text-body text-text-primary transition-[background-color,border-color,box-shadow] placeholder:text-text-muted motion-reduce:transition-none"
                  placeholder="Name, description, category, or color"
                  onChange={(event) =>
                    updateSearchQuery(event.currentTarget.value)
                  }
                />
              </div>
              <div className="grid min-w-0 gap-component lg:grid-cols-2">
                <PatternFilter
                  className="mt-component"
                  legend="Filter by category"
                  name={`${generatedId}-pattern-category`}
                  options={categoryFilterOptions}
                  value={categoryId}
                  onChange={(nextCategoryId) =>
                    updateFilters({
                      categoryId: nextCategoryId,
                      colorId,
                    })
                  }
                />
                <PatternFilter
                  className="mt-component"
                  legend="Filter by color"
                  name={`${generatedId}-pattern-color`}
                  options={colorFilterOptions}
                  value={colorId}
                  onChange={(nextColorId) =>
                    updateFilters({
                      categoryId,
                      colorId: nextColorId,
                    })
                  }
                />
              </div>
              <div className="mt-component flex min-w-0 flex-wrap items-center justify-between gap-3">
                <p
                  id={resultCountId}
                  className="min-w-0 break-words text-supporting text-text-muted"
                >
                  {resultCountMessage}
                </p>
                <Button
                  variant="secondary"
                  disabled={!discoveryCriteriaAreActive}
                  aria-describedby={resultCountId}
                  onClick={clearDiscoveryCriteria}
                >
                  Clear search and filters
                </Button>
              </div>
              <p
                id={resultAnnouncementId}
                className="sr-only"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {resultAnnouncement}
              </p>
            </div>

            {selectedPatternIsHiddenByCriteria ? (
              <div
                className="mt-component rounded-card border border-border-strong bg-surface-subtle p-control-x py-4"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <h3 className="text-body font-control text-text-primary">
                  Selected pattern hidden by discovery criteria
                </h3>
                <p className="mt-1 break-words text-supporting text-text-muted">
                  {selectedPattern.name} remains selected for your
                  configuration and preview.
                </p>
                <Button
                  className="mt-3"
                  variant="secondary"
                  onClick={clearDiscoveryCriteria}
                >
                  Clear search and filters to show selected pattern
                </Button>
              </div>
            ) : null}

            {selectedPatternIsUndisclosed ? (
              <div className="mt-component rounded-card border border-border-strong bg-surface-subtle p-control-x py-4">
                <h3 className="text-body font-control text-text-primary">
                  Selected pattern outside the initial results
                </h3>
                <p className="mt-1 break-words text-supporting text-text-muted">
                  {selectedPattern.name} remains selected for your
                  configuration and preview. Show all matching patterns to
                  return to its card.
                </p>
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
            ) : matchingPatterns.length === 0 ? (
              <div
                className="mt-component rounded-card border border-border-strong bg-surface-subtle p-card"
                aria-labelledby={`${generatedId}-no-matches-title`}
              >
                <h3
                  id={`${generatedId}-no-matches-title`}
                  className="text-body font-control text-text-primary"
                >
                  No patterns match your search and filters
                </h3>
                <p className="mt-1 break-words text-supporting text-text-muted">
                  Your current fabric selection has not changed. Solid fabric
                  remains available above. Clear the current discovery
                  criteria to show the complete pattern catalogue.
                </p>
                <Button
                  className="mt-3"
                  variant="secondary"
                  onClick={clearDiscoveryCriteria}
                >
                  Clear search and filters
                </Button>
              </div>
            ) : (
              <div
                id={`${generatedId}-pattern-results`}
                aria-describedby={resultCountId}
                className="mt-layout grid min-w-0 gap-component sm:grid-cols-2 lg:grid-cols-3"
              >
                {displayedPatterns.map((pattern) => {
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
                      checked={builtInPatternId === pattern.id}
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
                          type: "setBuiltInPattern",
                          patternId: pattern.id,
                        })
                      }
                    />
                  );
                })}
              </div>
            )}

            {catalogueIsSettled && canTogglePatternDisclosure ? (
              <div className="mt-component flex min-w-0 flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  aria-controls={`${generatedId}-pattern-results`}
                  aria-expanded={showAllMatchingPatterns}
                  onClick={() =>
                    setShowAllMatchingPatterns((current) => !current)
                  }
                >
                  {showAllMatchingPatterns
                    ? "Show fewer patterns"
                    : `Show all ${matchingPatterns.length} patterns (${undisclosedPatternCount} more)`}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </fieldset>
    </section>
  );
}
