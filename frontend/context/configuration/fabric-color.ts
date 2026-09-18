export const DEFAULT_SOLID_COLOR = "#B8AFA3";

const HEX_COLOR_PATTERN = /^#?([0-9a-f]{6})$/i;

export function normalizeHexColor(value: string): string | null {
  const match = HEX_COLOR_PATTERN.exec(value.trim());
  return match ? `#${match[1].toUpperCase()}` : null;
}

export function isNormalizedHexColor(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^#[0-9A-F]{6}$/.test(value)
  );
}
