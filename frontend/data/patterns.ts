import type { PatternResponse } from "@/services/api-client";

export const PATTERN_CATALOGUE_MINIMUM = 12;
export const PATTERN_CATALOGUE_MAXIMUM = 20;

export const patternCategories = [
  { id: "botanical", label: "Botanical" },
  { id: "geometric", label: "Geometric" },
  { id: "striped", label: "Striped" },
  { id: "woven", label: "Woven" },
  { id: "abstract", label: "Abstract" },
] as const;

export const patternColors = [
  { id: "ivory", label: "Ivory" },
  { id: "green", label: "Green" },
  { id: "terracotta", label: "Terracotta" },
  { id: "blue", label: "Blue" },
  { id: "gold", label: "Gold" },
  { id: "charcoal", label: "Charcoal" },
  { id: "rose", label: "Rose" },
] as const;

export type PatternCategoryId = (typeof patternCategories)[number]["id"];
export type PatternColorId = (typeof patternColors)[number]["id"];

const patternArtworkById = {
  "prototype-botanical": "prototype-pattern-botanical",
  "fern-trail": "pattern-fern-trail",
  "meadow-sprig": "pattern-meadow-sprig",
  "prototype-geometric": "prototype-pattern-geometric",
  "diamond-path": "pattern-diamond-path",
  "arch-grid": "pattern-arch-grid",
  "harbor-stripe": "pattern-harbor-stripe",
  "orchard-stripe": "pattern-orchard-stripe",
  "ribbon-stripe": "pattern-ribbon-stripe",
  "prototype-woven": "prototype-pattern-woven",
  "basket-check": "pattern-basket-check",
  "linen-crosshatch": "pattern-linen-crosshatch",
  "terrace-wave": "pattern-terrace-wave",
  "pebble-drift": "pattern-pebble-drift",
  "confetti-grid": "pattern-confetti-grid",
} as const satisfies Readonly<Record<string, string>>;

export type PatternPreviewClassName =
  (typeof patternArtworkById)[keyof typeof patternArtworkById];

export interface PatternDefinition {
  readonly categoryId: PatternCategoryId;
  readonly colorIds: readonly PatternColorId[];
  readonly description: string;
  readonly id: string;
  readonly name: string;
  readonly previewClassName: PatternPreviewClassName;
}

export const ALL_PATTERN_CATEGORIES = "all-categories";
export const ALL_PATTERN_COLORS = "all-colors";

export type PatternCategoryFilter =
  | typeof ALL_PATTERN_CATEGORIES
  | PatternCategoryId;
export type PatternColorFilter =
  | typeof ALL_PATTERN_COLORS
  | PatternColorId;

export interface PatternFilters {
  readonly categoryId: PatternCategoryFilter;
  readonly colorId: PatternColorFilter;
}

export type PatternCatalogueResult =
  | { readonly status: "empty" }
  | { readonly issues: readonly string[]; readonly status: "error" }
  | { readonly status: "loading" }
  | {
      readonly patterns: readonly PatternDefinition[];
      readonly status: "ready";
    };

function findDuplicateValues(
  values: readonly string[],
): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  values.forEach((value) => {
    if (seen.has(value)) {
      duplicates.add(value);
    }

    seen.add(value);
  });

  return Array.from(duplicates);
}

function isPatternCategoryId(value: string): value is PatternCategoryId {
  return patternCategories.some((category) => category.id === value);
}

function isPatternColorId(value: string): value is PatternColorId {
  return patternColors.some((color) => color.id === value);
}

export function resolvePatternResponses(
  patterns: readonly PatternResponse[],
  options: {
    readonly completeCatalogue: boolean;
    readonly filters?: PatternFilters;
  },
): PatternCatalogueResult {
  if (patterns.length === 0) {
    return { status: "empty" };
  }

  const issues: string[] = [];

  if (
    options.completeCatalogue &&
    (patterns.length < PATTERN_CATALOGUE_MINIMUM ||
      patterns.length > PATTERN_CATALOGUE_MAXIMUM)
  ) {
    issues.push(
      `The API catalogue must contain ${PATTERN_CATALOGUE_MINIMUM}-${PATTERN_CATALOGUE_MAXIMUM} patterns.`,
    );
  }

  if (findDuplicateValues(patterns.map((pattern) => pattern.id)).length) {
    issues.push("API pattern IDs must be unique.");
  }

  if (
    findDuplicateValues(
      patterns.map((pattern) => pattern.name.toLocaleLowerCase()),
    ).length
  ) {
    issues.push("API pattern names must be unique.");
  }

  const resolvedPatterns: PatternDefinition[] = [];

  patterns.forEach((pattern) => {
    const artwork =
      patternArtworkById[
        pattern.id as keyof typeof patternArtworkById
      ];

    if (
      pattern.id.trim() === "" ||
      pattern.name.trim() === "" ||
      pattern.description.trim() === "" ||
      pattern.previewClassName.trim() === ""
    ) {
      issues.push("Every API pattern requires complete display metadata.");
    }

    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(pattern.id)) {
      issues.push(`API pattern "${pattern.id}" has an invalid ID.`);
    }

    if (!isPatternCategoryId(pattern.categoryId)) {
      issues.push(`API pattern "${pattern.id}" has an unknown category.`);
    }

    if (pattern.colorIds.length === 0) {
      issues.push(`API pattern "${pattern.id}" requires at least one color.`);
    }

    if (pattern.colorIds.some((colorId) => !isPatternColorId(colorId))) {
      issues.push(`API pattern "${pattern.id}" has an unknown color.`);
    }

    if (findDuplicateValues(pattern.colorIds).length > 0) {
      issues.push(`API pattern "${pattern.id}" has duplicate color tags.`);
    }

    if (
      options.filters?.categoryId !== undefined &&
      options.filters.categoryId !== ALL_PATTERN_CATEGORIES &&
      pattern.categoryId !== options.filters.categoryId
    ) {
      issues.push(
        `API pattern "${pattern.id}" does not match the requested category.`,
      );
    }

    if (
      options.filters?.colorId !== undefined &&
      options.filters.colorId !== ALL_PATTERN_COLORS &&
      !pattern.colorIds.includes(options.filters.colorId)
    ) {
      issues.push(
        `API pattern "${pattern.id}" does not match the requested color.`,
      );
    }

    if (artwork === undefined) {
      issues.push(
        `API pattern "${pattern.id}" has no frontend artwork mapping.`,
      );
    }

    if (
      artwork !== undefined &&
      isPatternCategoryId(pattern.categoryId) &&
      pattern.colorIds.every(isPatternColorId)
    ) {
      resolvedPatterns.push({
        categoryId: pattern.categoryId,
        colorIds: pattern.colorIds,
        description: pattern.description,
        id: pattern.id,
        name: pattern.name,
        previewClassName: artwork,
      });
    }
  });

  return issues.length > 0
    ? { status: "error", issues: Array.from(new Set(issues)) }
    : { status: "ready", patterns: resolvedPatterns };
}

export function getPatternCategoryLabel(
  categoryId: PatternCategoryId,
): string {
  return (
    patternCategories.find((category) => category.id === categoryId)
      ?.label ?? categoryId
  );
}

export function getPatternColorLabels(
  colorIds: readonly PatternColorId[],
): readonly string[] {
  return colorIds.map(
    (colorId) =>
      patternColors.find((color) => color.id === colorId)?.label ??
      colorId,
  );
}

export function getPatternById(
  patterns: readonly PatternDefinition[],
  patternId: string | null,
): PatternDefinition | null {
  if (patternId === null) {
    return null;
  }

  return (
    patterns.find((pattern) => pattern.id === patternId) ?? null
  );
}
