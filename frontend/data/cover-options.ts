import type {
  ClosureType,
  ConfigurationState,
  FitPreference,
  MaterialId,
  SeamStyle,
} from "@/context/configuration";

interface CoverOption<Id extends string> {
  readonly description: string;
  readonly id: Id;
  readonly name: string;
}

export const materialOptions = [
  {
    id: "cotton-canvas",
    name: "Cotton canvas",
    description:
      "A structured woven look for a crisp, substantial visual direction.",
  },
  {
    id: "linen-blend",
    name: "Linen blend",
    description:
      "A softly textured woven look with a more relaxed visual character.",
  },
  {
    id: "polyester-weave",
    name: "Polyester weave",
    description:
      "A smooth, even woven look for a clean visual direction.",
  },
] as const satisfies readonly CoverOption<MaterialId>[];

export const fitOptions = [
  {
    id: "close",
    name: "Closer fit",
    description:
      "A neater visual profile with less apparent ease; entered measurements stay unchanged.",
  },
  {
    id: "standard",
    name: "Standard fit",
    description:
      "A balanced visual profile and the safe default for existing saved designs.",
  },
  {
    id: "relaxed",
    name: "More relaxed fit",
    description:
      "A softer visual profile with more apparent ease; entered measurements stay unchanged.",
  },
] as const satisfies readonly CoverOption<FitPreference>[];

export const closureOptions = [
  {
    id: "zipper",
    name: "Zipper access",
    description:
      "Plan for an opening that uses a zipper to remove or insert the cushion.",
  },
  {
    id: "envelope",
    name: "Envelope opening",
    description:
      "Plan for overlapping fabric panels instead of a separate fastener.",
  },
  {
    id: "slip-on",
    name: "Open-ended slip-on",
    description:
      "Plan for one open end that the cushion slides through.",
  },
] as const satisfies readonly CoverOption<ClosureType>[];

export const seamOptions = [
  {
    id: "plain",
    name: "Plain seam",
    description: "Keep the edge visually simple without a separate cord detail.",
  },
  {
    id: "piped",
    name: "Piped edge",
    description: "Add a visible corded edge detail around the main face.",
  },
] as const satisfies readonly CoverOption<SeamStyle>[];

export const DEFAULT_MATERIAL_ID: MaterialId = "cotton-canvas";
export const DEFAULT_FIT_PREFERENCE: FitPreference = "standard";
export const DEFAULT_CLOSURE_TYPE: ClosureType = "zipper";
export const DEFAULT_SEAM_STYLE: SeamStyle = "plain";

export function findCoverOption<Id extends string>(
  options: readonly CoverOption<Id>[],
  id: Id,
): CoverOption<Id> {
  return options.find((option) => option.id === id)!;
}

export function hasSupportedCoverOptions(
  configuration: Pick<
    ConfigurationState,
    "closureType" | "fitPreference" | "materialId" | "seamStyle"
  >,
): boolean {
  return (
    materialOptions.some(({ id }) => id === configuration.materialId) &&
    fitOptions.some(({ id }) => id === configuration.fitPreference) &&
    closureOptions.some(({ id }) => id === configuration.closureType) &&
    seamOptions.some(({ id }) => id === configuration.seamStyle)
  );
}
