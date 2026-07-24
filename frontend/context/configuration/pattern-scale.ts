export const PATTERN_SCALE_MIN = 0.5;
export const PATTERN_SCALE_MAX = 2;
export const PATTERN_SCALE_STEP = 0.1;
export const PATTERN_SCALE_DEFAULT = 1;

const PATTERN_SCALE_DECIMAL_PLACES = 1;

export function isPatternScaleWithinRange(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= PATTERN_SCALE_MIN &&
    value <= PATTERN_SCALE_MAX
  );
}

export function normalizePatternScale(value: number): number | null {
  if (!isPatternScaleWithinRange(value)) {
    return null;
  }

  const normalized = Number(value.toFixed(PATTERN_SCALE_DECIMAL_PLACES));

  return isPatternScaleWithinRange(normalized) ? normalized : null;
}

export function formatPatternScale(value: number): string {
  const normalized = normalizePatternScale(value);

  return normalized === null
    ? ""
    : `${normalized.toFixed(PATTERN_SCALE_DECIMAL_PLACES)}×`;
}
