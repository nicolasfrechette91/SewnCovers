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
    description: "Firm and crisp, with a matte, tightly woven finish.",
  },
  {
    id: "linen-blend",
    name: "Linen blend",
    description: "Soft and slightly textured, with a relaxed, natural look.",
  },
  {
    id: "polyester-weave",
    name: "Polyester weave",
    description: "Smooth and even, with a clean, uniform look.",
  },
] as const satisfies readonly CoverOption<MaterialId>[];

export const fitOptions = [
  {
    id: "close",
    name: "Closer fit",
    description: "Snug and smooth, with crisp edges.",
  },
  {
    id: "standard",
    name: "Standard fit",
    description: "Neat without being tight. Suits most cushions.",
  },
  {
    id: "relaxed",
    name: "More relaxed fit",
    description: "A little looser, for a soft, lived-in look.",
  },
] as const satisfies readonly CoverOption<FitPreference>[];

export const closureOptions = [
  {
    id: "zipper",
    name: "Zipper access",
    description: "A zipper along one edge, so the cover comes off easily.",
  },
  {
    id: "envelope",
    name: "Envelope opening",
    description: "Overlapping panels at the back, with no zipper or buttons.",
  },
  {
    id: "slip-on",
    name: "Open-ended slip-on",
    description: "One open end that the cushion slides into.",
  },
] as const satisfies readonly CoverOption<ClosureType>[];

export const seamOptions = [
  {
    id: "plain",
    name: "Plain seam",
    description: "A clean, simple edge.",
  },
  {
    id: "piped",
    name: "Piped edge",
    description:
      "A thin fabric-covered cord along the edges, for a tailored look.",
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
