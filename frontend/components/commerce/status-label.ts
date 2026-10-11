/**
 * A status as people read it ("ready_to_ship" → "Ready to ship"); a status
 * this build does not know reads as "Unknown status".
 */
export function statusLabel(value: string): string {
  return value === "unknown"
    ? "Unknown status"
    : value
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toUpperCase());
}
