export type PrototypePatternPreviewClassName =
  | "prototype-pattern-botanical"
  | "prototype-pattern-geometric"
  | "prototype-pattern-woven";

export interface PrototypePattern {
  readonly description: string;
  readonly id: string;
  readonly name: string;
  readonly previewClassName: PrototypePatternPreviewClassName;
}

export const prototypePatterns = [
  {
    id: "prototype-botanical",
    name: "Botanical sample",
    description: "An organic, leaf-inspired prototype direction.",
    previewClassName: "prototype-pattern-botanical",
  },
  {
    id: "prototype-geometric",
    name: "Geometric sample",
    description: "A warm, structured prototype direction.",
    previewClassName: "prototype-pattern-geometric",
  },
  {
    id: "prototype-woven",
    name: "Woven sample",
    description: "A quiet, small-scale prototype direction.",
    previewClassName: "prototype-pattern-woven",
  },
] as const satisfies readonly PrototypePattern[];

export function getPrototypePatternById(
  patternId: string | null,
): (typeof prototypePatterns)[number] | null {
  if (patternId === null) {
    return null;
  }

  return (
    prototypePatterns.find((pattern) => pattern.id === patternId) ?? null
  );
}
