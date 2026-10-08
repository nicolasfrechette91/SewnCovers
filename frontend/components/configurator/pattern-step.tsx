"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { PatternCard } from "@/components/configurator/pattern-card";
import {
  PatternFilter,
  type PatternFilterOption,
} from "@/components/configurator/pattern-filter";
import {
  Button,
  cardTitleClasses,
  controlClasses,
  ErrorMessage,
  fieldErrorClasses,
  fieldLabelClasses,
  LoadingState,
  noticeClasses,
  StitchDivider,
} from "@/components/ui";
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

import { FabricPreview } from "./fabric-preview";
import type { SelectedPatternPresentation } from "./preview-step";
import { YourPatterns } from "./your-patterns";

const categoryFilterOptions: readonly PatternFilterOption<PatternCategoryFilter>[] =
  [
    {
      value: ALL_PATTERN_CATEGORIES,
      label: "All styles",
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
      label: "All colours",
    },
    ...patternColors.map((color) => ({
      value: color.id,
      label: color.label,
    })),
  ];

// Two columns from 360 px keep all fifteen patterns within easy reach on a
// phone; one column below that keeps the cards readable at 320 px.
const patternGridClasses =
  "grid min-w-0 gap-3 min-[360px]:grid-cols-2 sm:gap-4 xl:grid-cols-3";

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
  /** The chosen fabric as the live preview draws it; null before a choice. */
  selectedFabric?: SelectedPatternPresentation | null;
}

export function PatternStep({
  catalogue,
  focusTargetId,
  onFiltersChange,
  onRetry,
  selectedFabric = null,
}: PatternStepProps) {
  const { state, dispatch } = useConfiguration();
  const generatedId = useId();
  const supportingTextId = `${generatedId}-supporting-text`;
  const resultCountId = `${generatedId}-result-count`;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
  const selectedPatternIsHiddenByCriteria =
    selectedPattern !== null &&
    catalogueIsSettled &&
    !selectedPatternMatchesCriteria;
  const selectedPatternIsUnavailable =
    hasCompleteCatalogue &&
    builtInPatternId !== null &&
    selectedPattern === null;

  // Every pattern is always shown; the count changes only with the search
  // and filters. One line is both the visible count and the live status.
  const resultCountMessage =
    catalogue.phase === "loading"
      ? catalogue.message
      : catalogue.phase === "error"
        ? "Patterns couldn't be loaded."
        : discoveryCriteriaAreActive
          ? `${matchingPatterns.length} of ${catalogue.allPatterns.length} patterns match`
          : `${catalogue.allPatterns.length} patterns`;
  const [resultAnnouncement, setResultAnnouncement] =
    useState(resultCountMessage);

  // Settles after typing pauses, so each keystroke isn't announced.
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
  };

  const updateFilters = (filters: PatternFilters) => {
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
      setSolidColorError("Enter a six-digit colour code, such as #B8AFA3.");
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

  // The catalogue's contract issues are for developers, not customers.
  const errorState = (
    <ErrorMessage className="mt-component">
      <div>
        <h3 className="text-body font-control">
          Patterns couldn&apos;t be loaded
        </h3>
        <p className="mt-1">{catalogue.message}</p>
        <Button className="mt-3" variant="secondary" onClick={onRetry}>
          Try loading patterns again
        </Button>
      </div>
    </ErrorMessage>
  );

  return (
    <section
      aria-label="Pattern selection"
      className="scroll-mt-layout"
    >
      <fieldset
        aria-describedby={supportingTextId}
        className="fieldset-panel min-w-0 rounded-panel border border-border bg-surface p-card shadow-hairline"
      >
        <legend className="max-w-full pb-2">
          <h1
            id={focusTargetId}
            tabIndex={focusTargetId ? -1 : undefined}
            className="configurator-edit-target scroll-mt-layout font-display text-section-title font-heading tracking-heading text-text-primary"
          >
            Choose a colour or pattern
          </h1>
        </legend>
        <p
          id={supportingTextId}
          className="mt-2 max-w-3xl break-words text-body text-text-muted"
        >
          Pick a plain colour or one of our patterns. You can change the
          pattern size on the next step.
        </p>
        {/* From lg this preview sits in the side column instead. */}
        <FabricPreview
          className="mt-component lg:hidden"
          fabric={selectedFabric}
        />

        <StitchDivider className="mt-component" />
        <h2 className={`mt-component ${cardTitleClasses}`}>Plain colour</h2>
        <div className={`mt-4 ${patternGridClasses}`}>
          <PatternCard
            id={`${generatedId}-solid-color`}
            name="solid-fabric-choice"
            value="solid-color"
            required
            checked={solidColor !== null}
            patternName="Solid colour"
            description="One colour all over. Pick any shade."
            preview={
              <span
                className="cushion-preview-solid block h-3/5 w-4/5 rounded-panel border border-border-strong shadow-card"
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
            className="mt-4 max-w-2xl rounded-card border border-border bg-surface-subtle p-4 sm:p-5"
            role="group"
            aria-labelledby={`${generatedId}-solid-color-heading`}
          >
            <h3
              id={`${generatedId}-solid-color-heading`}
              className="text-subhead font-control text-text-primary"
            >
              Pick your colour
            </h3>
            <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
              <div>
                <label
                  htmlFor={`${generatedId}-native-color`}
                  className={`block ${fieldLabelClasses}`}
                >
                  Colour
                </label>
                <input
                  id={`${generatedId}-native-color`}
                  type="color"
                  value={solidColor}
                  className="mt-2 h-12 w-20 cursor-pointer rounded-control border border-border-strong bg-surface p-1 transition-colors duration-(--duration-fast) hover:border-brand motion-reduce:transition-none"
                  onChange={(event) =>
                    updateSolidColor(event.currentTarget.value)
                  }
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor={`${generatedId}-hex-color`}
                  className={`block ${fieldLabelClasses}`}
                >
                  Colour code
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
                  className={`mt-2 ${controlClasses} font-mono uppercase tabular-nums`}
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
              For an exact shade, type its six-digit code, such as #B8AFA3.
            </p>
            {solidColorError ? (
              <p
                id={`${generatedId}-hex-error`}
                className={`mt-2 ${fieldErrorClasses}`}
                role="alert"
              >
                {solidColorError}
              </p>
            ) : null}
            <p className="sr-only" role="status" aria-live="polite">
              Solid colour selected.
            </p>
          </div>
        ) : null}

        <YourPatterns />

        <StitchDivider className="mt-layout" />
        <h2 className={`mt-component ${cardTitleClasses}`}>Patterns</h2>

        {!hasCompleteCatalogue ? (
          catalogue.phase === "loading" ? (
            <div className="mt-component rounded-card border border-dashed border-border-strong bg-surface p-card">
              <LoadingState label={catalogue.message} />
            </div>
          ) : catalogue.phase === "error" ? (
            errorState
          ) : (
            <div
              className="mt-component rounded-card border border-dashed border-border-strong bg-surface p-card"
              aria-labelledby={`${generatedId}-empty-catalogue-title`}
            >
              <h3
                id={`${generatedId}-empty-catalogue-title`}
                className="text-body font-control text-text-primary"
              >
                No patterns are available right now
              </h3>
              <p className="mt-1 break-words text-supporting text-text-muted">
                You can still choose a plain colour. Your other choices
                haven&apos;t changed.
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
            <div className="mt-4 rounded-card border border-border bg-surface-subtle p-4 sm:p-5">
              <div className="max-w-2xl">
                <label
                  htmlFor={`${generatedId}-pattern-search`}
                  className={`block ${fieldLabelClasses}`}
                >
                  Search patterns
                </label>
                <input
                  ref={searchInputRef}
                  id={`${generatedId}-pattern-search`}
                  type="search"
                  value={searchQuery}
                  aria-describedby={resultCountId}
                  className={`mt-2 ${controlClasses}`}
                  placeholder="For example, stripe or green"
                  onChange={(event) =>
                    updateSearchQuery(event.currentTarget.value)
                  }
                />
              </div>
              <div className="grid min-w-0 gap-component lg:grid-cols-2">
                <PatternFilter
                  className="mt-component"
                  legend="Filter by style"
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
                  legend="Filter by colour"
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
              <div className="mt-component flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-dashed border-border-strong pt-4">
                <p
                  id={resultCountId}
                  className="min-w-0 break-words font-mono text-supporting text-text-muted"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {resultAnnouncement}
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
            </div>

            {selectedPatternIsHiddenByCriteria ? (
              <div
                className={noticeClasses("info", "mt-component")}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <h3 className="text-body font-control text-text-primary">
                  Your pattern is hidden by the filters
                </h3>
                <p className="mt-1 break-words text-supporting text-text-muted">
                  {selectedPattern.name} is still selected.
                </p>
                <Button
                  className="mt-3"
                  variant="secondary"
                  onClick={clearDiscoveryCriteria}
                >
                  Show my pattern
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
                    Your pattern is no longer available
                  </h3>
                  <p className="mt-1">
                    Choose another one below. Your other choices haven&apos;t
                    changed.
                  </p>
                </div>
              </ErrorMessage>
            ) : null}

            {catalogue.phase === "loading" ? (
              <div className="mt-component rounded-card border border-dashed border-border-strong bg-surface p-card">
                <LoadingState label={catalogue.message} />
              </div>
            ) : catalogue.phase === "error" ? (
              errorState
            ) : matchingPatterns.length === 0 ? (
              <div
                className="mt-component rounded-card border border-dashed border-border-strong bg-surface p-card"
                aria-labelledby={`${generatedId}-no-matches-title`}
              >
                <h3
                  id={`${generatedId}-no-matches-title`}
                  className="text-body font-control text-text-primary"
                >
                  No patterns match
                </h3>
                <p className="mt-1 break-words text-supporting text-text-muted">
                  Try another search, or clear the search and filters to see
                  every pattern.
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
                className={`mt-component ${patternGridClasses}`}
              >
                {matchingPatterns.map((pattern) => {
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
          </>
        )}
      </fieldset>
    </section>
  );
}
