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

export interface PatternDefinition {
  readonly categoryId: PatternCategoryId;
  readonly colorIds: readonly PatternColorId[];
  readonly description: string;
  readonly id: string;
  readonly name: string;
  readonly previewClassName: string;
}

export const curatedPatterns = [
  {
    id: "prototype-botanical",
    name: "Botanical sample",
    description: "An organic, leaf-inspired prototype direction.",
    categoryId: "botanical",
    colorIds: ["ivory", "green", "terracotta"],
    previewClassName: "prototype-pattern-botanical",
  },
  {
    id: "fern-trail",
    name: "Fern trail",
    description: "Layered fronds arranged along a gentle diagonal trail.",
    categoryId: "botanical",
    colorIds: ["ivory", "green"],
    previewClassName: "pattern-fern-trail",
  },
  {
    id: "meadow-sprig",
    name: "Meadow sprig",
    description: "Small branching sprigs scattered across an open ground.",
    categoryId: "botanical",
    colorIds: ["ivory", "blue", "gold"],
    previewClassName: "pattern-meadow-sprig",
  },
  {
    id: "prototype-geometric",
    name: "Geometric sample",
    description: "A warm, structured prototype direction.",
    categoryId: "geometric",
    colorIds: ["ivory", "green", "terracotta"],
    previewClassName: "prototype-pattern-geometric",
  },
  {
    id: "diamond-path",
    name: "Diamond path",
    description: "Nested diamonds repeat in crisp offset rows.",
    categoryId: "geometric",
    colorIds: ["ivory", "blue", "charcoal"],
    previewClassName: "pattern-diamond-path",
  },
  {
    id: "arch-grid",
    name: "Arch grid",
    description: "Rounded arches alternate within a compact tiled grid.",
    categoryId: "geometric",
    colorIds: ["ivory", "terracotta", "gold"],
    previewClassName: "pattern-arch-grid",
  },
  {
    id: "harbor-stripe",
    name: "Harbor stripe",
    description: "Broad blue bands alternate with fine light pinstripes.",
    categoryId: "striped",
    colorIds: ["ivory", "blue"],
    previewClassName: "pattern-harbor-stripe",
  },
  {
    id: "orchard-stripe",
    name: "Orchard stripe",
    description: "Uneven green and gold lines form a relaxed rhythm.",
    categoryId: "striped",
    colorIds: ["ivory", "green", "gold"],
    previewClassName: "pattern-orchard-stripe",
  },
  {
    id: "ribbon-stripe",
    name: "Ribbon stripe",
    description: "Slim rose bands cross wider terracotta ribbons.",
    categoryId: "striped",
    colorIds: ["ivory", "terracotta", "rose"],
    previewClassName: "pattern-ribbon-stripe",
  },
  {
    id: "prototype-woven",
    name: "Woven sample",
    description: "A quiet, small-scale prototype direction.",
    categoryId: "woven",
    colorIds: ["ivory", "charcoal"],
    previewClassName: "prototype-pattern-woven",
  },
  {
    id: "basket-check",
    name: "Basket check",
    description: "Alternating blocks suggest an oversized basket weave.",
    categoryId: "woven",
    colorIds: ["ivory", "blue", "charcoal"],
    previewClassName: "pattern-basket-check",
  },
  {
    id: "linen-crosshatch",
    name: "Linen crosshatch",
    description: "Fine crossing lines create a loose textured grid.",
    categoryId: "woven",
    colorIds: ["ivory", "gold"],
    previewClassName: "pattern-linen-crosshatch",
  },
  {
    id: "terrace-wave",
    name: "Terrace wave",
    description: "Layered waves move in alternating cool bands.",
    categoryId: "abstract",
    colorIds: ["ivory", "green", "blue"],
    previewClassName: "pattern-terrace-wave",
  },
  {
    id: "pebble-drift",
    name: "Pebble drift",
    description: "Soft-edged pebble forms gather in offset clusters.",
    categoryId: "abstract",
    colorIds: ["ivory", "terracotta", "charcoal"],
    previewClassName: "pattern-pebble-drift",
  },
  {
    id: "confetti-grid",
    name: "Confetti grid",
    description: "Playful dashes and dots repeat on a spacious grid.",
    categoryId: "abstract",
    colorIds: ["ivory", "green", "gold", "rose"],
    previewClassName: "pattern-confetti-grid",
  },
] as const satisfies readonly PatternDefinition[];

export type CuratedPattern = (typeof curatedPatterns)[number];
export type PatternId = CuratedPattern["id"];
export type PatternPreviewClassName = CuratedPattern["previewClassName"];

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

export type PatternCatalogueResult<
  Pattern extends PatternDefinition = PatternDefinition,
> =
  | { readonly status: "empty" }
  | { readonly issues: readonly string[]; readonly status: "error" }
  | { readonly patterns: readonly Pattern[]; readonly status: "ready" };

function findDuplicateValues(values: readonly string[]): readonly string[] {
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

export function validatePatternCatalogue<
  Pattern extends PatternDefinition,
>(
  patterns: readonly Pattern[],
): PatternCatalogueResult<Pattern> {
  if (patterns.length === 0) {
    return { status: "empty" };
  }

  const issues: string[] = [];
  const categoryIds = new Set<string>(
    patternCategories.map((category) => category.id),
  );
  const colorIds = new Set<string>(
    patternColors.map((color) => color.id),
  );

  if (
    patterns.length < PATTERN_CATALOGUE_MINIMUM ||
    patterns.length > PATTERN_CATALOGUE_MAXIMUM
  ) {
    issues.push(
      `The catalogue must contain ${PATTERN_CATALOGUE_MINIMUM}-${PATTERN_CATALOGUE_MAXIMUM} patterns.`,
    );
  }

  const identityFields = [
    {
      label: "IDs",
      values: patterns.map((pattern) => pattern.id),
    },
    {
      label: "names",
      values: patterns.map((pattern) => pattern.name.toLocaleLowerCase()),
    },
    {
      label: "preview style handles",
      values: patterns.map((pattern) => pattern.previewClassName),
    },
  ] as const;

  identityFields.forEach(({ label, values }) => {
    const duplicates = findDuplicateValues(values);

    if (duplicates.length > 0) {
      issues.push(`Pattern ${label} must be unique.`);
    }
  });

  patterns.forEach((pattern) => {
    if (
      pattern.id.trim() === "" ||
      pattern.name.trim() === "" ||
      pattern.description.trim() === "" ||
      pattern.previewClassName.trim() === ""
    ) {
      issues.push("Every pattern requires complete display metadata.");
    }

    if (pattern.colorIds.length === 0) {
      issues.push(`Pattern "${pattern.id}" requires at least one color.`);
    }

    if (!categoryIds.has(pattern.categoryId)) {
      issues.push(`Pattern "${pattern.id}" has an unknown category.`);
    }

    if (pattern.colorIds.some((colorId) => !colorIds.has(colorId))) {
      issues.push(`Pattern "${pattern.id}" has an unknown color.`);
    }

    if (findDuplicateValues(pattern.colorIds).length > 0) {
      issues.push(`Pattern "${pattern.id}" has duplicate color tags.`);
    }
  });

  return issues.length > 0
    ? { status: "error", issues: Array.from(new Set(issues)) }
    : { status: "ready", patterns };
}

export const patternCatalogue = validatePatternCatalogue(curatedPatterns);

export function filterPatterns<Pattern extends PatternDefinition>(
  patterns: readonly Pattern[],
  filters: PatternFilters,
): readonly Pattern[] {
  return patterns.filter(
    (pattern) =>
      (filters.categoryId === ALL_PATTERN_CATEGORIES ||
        pattern.categoryId === filters.categoryId) &&
      (filters.colorId === ALL_PATTERN_COLORS ||
        pattern.colorIds.includes(filters.colorId)),
  );
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
  patternId: string | null,
): CuratedPattern | null {
  if (patternId === null || patternCatalogue.status !== "ready") {
    return null;
  }

  return (
    patternCatalogue.patterns.find(
      (pattern) => pattern.id === patternId,
    ) ?? null
  );
}
