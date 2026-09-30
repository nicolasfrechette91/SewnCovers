import type { CushionShape } from "../../context/configuration/types";

// Pure geometry for the live cushion preview. Every shape is drawn in the same
// 640 × 430 canvas: the outline is built from measurement ratios (clamped so
// extreme values stay legible), then scaled to fit one shared frame.

export const CUSHION_VIEWBOX_WIDTH = 640;
export const CUSHION_VIEWBOX_HEIGHT = 430;

const FRAME_CENTRE_X = 318;
const FRAME_CENTRE_Y = 214;
const FRAME_MAX_WIDTH = 480;
const FRAME_MAX_HEIGHT = 312;

/** Clamps that keep extreme but valid measurements readable. */
export const CUSHION_PROPORTION_LIMITS = {
  /** Rectangle width ÷ height. */
  rectangleAspect: { min: 0.4, max: 3 },
  /** Tapered front width ÷ depth. */
  taperedAspect: { min: 0.5, max: 3 },
  /** Tapered back width ÷ front width. */
  taperedBackRatio: { min: 0.45, max: 0.95 },
  /** Box depth ÷ width. */
  boxDepthRatio: { min: 0.15, max: 1 },
  /** Box thickness ÷ width. */
  boxThicknessRatio: { min: 0.035, max: 0.35 },
  /** Round thickness ÷ diameter at which the side band appears, and its cap. */
  roundBandRatio: { min: 0.18, max: 0.6 },
  /** Pillow puff as a fraction of each edge's length. */
  puff: { min: 0.035, max: 0.085 },
} as const;

// Reference sizes (cm) used when a measurement is missing or not yet valid.
const DEFAULTS: Record<
  CushionShape,
  { width: number; height: number; backWidth: number; thickness: number }
> = {
  square: { width: 45, height: 45, backWidth: 0, thickness: 10 },
  rectangle: { width: 68, height: 40, backWidth: 0, thickness: 10 },
  box: { width: 120, height: 50, backWidth: 0, thickness: 10 },
  round: { width: 45, height: 45, backWidth: 0, thickness: 8 },
  tapered: { width: 50, height: 45, backWidth: 40, thickness: 8 },
};

export interface CushionGeometryInput {
  readonly shape?: CushionShape | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly backWidth?: number | null;
  readonly thickness?: number | null;
}

export interface CushionBand {
  readonly d: string;
  readonly tone: "front" | "side";
}

export interface CushionShadow {
  readonly angle: number;
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

export interface CushionBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Face measurements in canvas units, before puff, for tests and captions. */
export interface CushionFaceMetrics {
  readonly width: number;
  readonly height: number;
  /** Tapered only: the front (bottom) and back (top) edge lengths. */
  readonly frontWidth: number | null;
  readonly backWidth: number | null;
  /** Visible side-band depth; 0 when the shape shows no band. */
  readonly band: number;
}

export interface CushionGeometry {
  readonly shape: CushionShape;
  /** Whole silhouette: base fill, fabric clip and outer edge. */
  readonly outline: string;
  /** The top or front face that catches the highlight. */
  readonly face: string;
  readonly seams: readonly string[];
  readonly bands: readonly CushionBand[];
  readonly creases: readonly string[];
  readonly folds: readonly string[];
  readonly lowerFold: string | null;
  readonly shadow: CushionShadow;
  readonly fabricBox: CushionBox;
  readonly bounds: CushionBox;
  readonly metrics: CushionFaceMetrics;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

type Segment =
  | { readonly kind: "L"; readonly to: Point }
  | { readonly kind: "Q"; readonly control: Point; readonly to: Point }
  | {
      readonly kind: "C";
      readonly c1: Point;
      readonly c2: Point;
      readonly to: Point;
    };

interface PathSpec {
  readonly start: Point;
  readonly segments: readonly Segment[];
  readonly closed: boolean;
}

const point = (x: number, y: number): Point => ({ x, y });
const add = (a: Point, b: Point): Point => point(a.x + b.x, a.y + b.y);
const subtract = (a: Point, b: Point): Point => point(a.x - b.x, a.y - b.y);
const scale = (a: Point, factor: number): Point =>
  point(a.x * factor, a.y * factor);
const length = (a: Point): number => Math.hypot(a.x, a.y);
const unit = (a: Point): Point => {
  const size = length(a);
  return size === 0 ? point(0, 0) : scale(a, 1 / size);
};
const lerp = (a: Point, b: Point, t: number): Point =>
  point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
const polar = (centre: Point, radius: number, degrees: number): Point => {
  const radians = (degrees * Math.PI) / 180;
  return point(
    centre.x + radius * Math.cos(radians),
    centre.y + radius * Math.sin(radians),
  );
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function positive(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function centroid(points: readonly Point[]): Point {
  return scale(
    points.reduce((sum, current) => add(sum, current), point(0, 0)),
    1 / points.length,
  );
}

/** Unit normal of edge A→B that points towards the polygon's centre. */
function inwardNormal(a: Point, b: Point, centre: Point): Point {
  const direction = unit(subtract(b, a));
  const normal = point(-direction.y, direction.x);
  const middle = lerp(a, b, 0.5);
  return normal.x * (centre.x - middle.x) + normal.y * (centre.y - middle.y) >=
    0
    ? normal
    : scale(normal, -1);
}

/** Moves every edge of a convex polygon inwards by `distance`. */
function insetPolygon(points: readonly Point[], distance: number): Point[] {
  const centre = centroid(points);
  const lines = points.map((current, index) => {
    const next = points[(index + 1) % points.length];
    return {
      origin: add(current, scale(inwardNormal(current, next, centre), distance)),
      direction: unit(subtract(next, current)),
    };
  });
  return lines.map((line, index) => {
    const previous = lines[(index - 1 + lines.length) % lines.length];
    const denominator = cross(previous.direction, line.direction);
    if (Math.abs(denominator) < 1e-9) return line.origin;
    const t =
      cross(subtract(line.origin, previous.origin), line.direction) /
      denominator;
    return add(previous.origin, scale(previous.direction, t));
  });
}

/**
 * A soft pillow over four corners (clockwise from top-left). Each edge bulges
 * outwards by `puff` of its length, and its tangents lean away from the
 * corner, which gives the pinched pillow corners of the original model.
 */
function pillowSpec(corners: readonly Point[], puff: number): PathSpec {
  const centre = centroid(corners);
  // Trace top-left → bottom-left → bottom-right → top-right like the original.
  const order = [corners[0], corners[3], corners[2], corners[1]];
  const segments: Segment[] = order.map((from, index) => {
    const to = order[(index + 1) % order.length];
    const edge = subtract(to, from);
    const along = unit(edge);
    const outward = scale(inwardNormal(from, to, centre), -1);
    const bulge = length(edge) * puff * 1.33;
    const reach = length(edge) * 0.1;
    return {
      kind: "C",
      c1: add(add(from, scale(along, reach)), scale(outward, bulge)),
      c2: add(subtract(to, scale(along, reach)), scale(outward, bulge)),
      to,
    };
  });
  return { start: order[0], segments, closed: true };
}

/** A polygon with softened corners, for firm boxed shapes. */
function roundedPolygonSpec(points: readonly Point[], radius: number): PathSpec {
  const corners = points.map((current, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const reach = Math.min(
      radius,
      length(subtract(previous, current)) * 0.45,
      length(subtract(next, current)) * 0.45,
    );
    return {
      before: add(current, scale(unit(subtract(previous, current)), reach)),
      corner: current,
      after: add(current, scale(unit(subtract(next, current)), reach)),
    };
  });
  const segments: Segment[] = [];
  corners.forEach((corner, index) => {
    if (index > 0) segments.push({ kind: "L", to: corner.before });
    segments.push({ kind: "Q", control: corner.corner, to: corner.after });
  });
  segments.push({ kind: "L", to: corners[0].before });
  return { start: corners[0].before, segments, closed: true };
}

// A slightly fuller kappa than a true circle gives the round cushion its puff.
const ROUND_KAPPA = 0.575;

function arc(centre: Point, radius: number, from: number, to: number): Segment {
  const direction = Math.sign(to - from);
  const tangent = (degrees: number) => {
    const radians = (degrees * Math.PI) / 180;
    return point(-Math.sin(radians) * direction, Math.cos(radians) * direction);
  };
  const start = polar(centre, radius, from);
  const end = polar(centre, radius, to);
  const handle = radius * ROUND_KAPPA * (Math.abs(to - from) / 90);
  return {
    kind: "C",
    c1: add(start, scale(tangent(from), handle)),
    c2: subtract(end, scale(tangent(to), handle)),
    to: end,
  };
}

function arcsSpec(
  centre: Point,
  radius: number,
  angles: readonly number[],
  closed: boolean,
): PathSpec {
  const segments = angles
    .slice(1)
    .map((angle, index) => arc(centre, radius, angles[index], angle));
  return { start: polar(centre, radius, angles[0]), segments, closed };
}

function polylineSpec(points: readonly Point[], closed = false): PathSpec {
  return {
    start: points[0],
    segments: points.slice(1).map((to) => ({ kind: "L", to })),
    closed,
  };
}

function format(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function formatPoint({ x, y }: Point): string {
  return `${format(x)} ${format(y)}`;
}

function toPath(...specs: readonly PathSpec[]): string {
  return specs
    .map((spec) => {
      const commands = spec.segments.map((segment) => {
        if (segment.kind === "L") return `L${formatPoint(segment.to)}`;
        if (segment.kind === "Q") {
          return `Q${formatPoint(segment.control)} ${formatPoint(segment.to)}`;
        }
        return `C${formatPoint(segment.c1)} ${formatPoint(segment.c2)} ${formatPoint(segment.to)}`;
      });
      return [`M${formatPoint(spec.start)}`, ...commands, spec.closed ? "Z" : ""]
        .filter(Boolean)
        .join(" ");
    })
    .join(" ");
}

function bezierPoint(
  from: Point,
  segment: Segment,
  t: number,
): Point {
  if (segment.kind === "L") return lerp(from, segment.to, t);
  if (segment.kind === "Q") {
    return lerp(
      lerp(from, segment.control, t),
      lerp(segment.control, segment.to, t),
      t,
    );
  }
  const a = lerp(from, segment.c1, t);
  const b = lerp(segment.c1, segment.c2, t);
  const c = lerp(segment.c2, segment.to, t);
  return lerp(lerp(a, b, t), lerp(b, c, t), t);
}

function bounds(spec: PathSpec): CushionBox {
  const samples: Point[] = [spec.start];
  let from = spec.start;
  for (const segment of spec.segments) {
    for (let step = 1; step <= 16; step += 1) {
      samples.push(bezierPoint(from, segment, step / 16));
    }
    from = segment.to;
  }
  const xs = samples.map(({ x }) => x);
  const ys = samples.map(({ y }) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

/** Scales and centres shape-space points into the shared frame. */
function fitToFrame(outline: PathSpec) {
  const box = bounds(outline);
  const factor = Math.min(
    FRAME_MAX_WIDTH / box.width,
    FRAME_MAX_HEIGHT / box.height,
  );
  const centre = point(box.x + box.width / 2, box.y + box.height / 2);
  return {
    factor,
    place: (value: Point) =>
      add(
        scale(subtract(value, centre), factor),
        point(FRAME_CENTRE_X, FRAME_CENTRE_Y),
      ),
  };
}

function detailScale(faceWidth: number, faceHeight: number): number {
  return clamp(Math.min(faceWidth, faceHeight) / 250, 0.55, 1.15);
}

function contactShadow(box: CushionBox): CushionShadow {
  return {
    angle: 0,
    cx: box.x + box.width / 2,
    cy: box.y + box.height - box.height * 0.05,
    rx: (box.width / 2) * 0.99,
    ry: clamp(box.height * 0.11, 16, 38),
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundBox(box: CushionBox): CushionBox {
  return {
    x: round(box.x),
    y: round(box.y),
    width: round(box.width),
    height: round(box.height),
  };
}

function fabricBox(box: CushionBox): CushionBox {
  const margin = 4;
  const x = Math.floor(box.x - margin);
  const y = Math.floor(box.y - margin);
  return {
    x,
    y,
    width: Math.ceil(box.x + box.width + margin) - x,
    height: Math.ceil(box.y + box.height + margin) - y,
  };
}

function puffFor(thickness: number, smallerSide: number): number {
  const { min, max } = CUSHION_PROPORTION_LIMITS.puff;
  return clamp(0.028 + 0.13 * (thickness / smallerSide), min, max);
}

/** Square, rectangle and tapered cushions: a puffed quad with pillow folds. */
function pillowGeometry(
  shape: CushionShape,
  shapeCorners: readonly Point[],
  puff: number,
  tapered: boolean,
): CushionGeometry {
  const { place } = fitToFrame(pillowSpec(shapeCorners, puff));
  const corners = shapeCorners.map(place);
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const faceWidth = length(subtract(bottomRight, bottomLeft));
  const faceHeight = Math.abs(
    (bottomLeft.y + bottomRight.y) / 2 - (topLeft.y + topRight.y) / 2,
  );
  const detail = detailScale(
    Math.min(faceWidth, length(subtract(topRight, topLeft))),
    faceHeight,
  );
  const outlineSpec = pillowSpec(corners, puff);
  const seamSpec = pillowSpec(insetPolygon(corners, 14 * detail), puff * 0.85);

  // Diagonal folds pulled in from each corner, as on the original model.
  const neighbours: readonly [Point, Point, Point][] = [
    [topLeft, topRight, bottomLeft],
    [topRight, topLeft, bottomRight],
    [bottomRight, bottomLeft, topRight],
    [bottomLeft, bottomRight, topLeft],
  ];
  const folds = neighbours.map(([corner, across, down]) => {
    const along = unit(subtract(across, corner));
    const side = unit(subtract(down, corner));
    const sideReach = Math.min(1, (length(subtract(down, corner)) * 0.32) / 74);
    const at = (u: number, v: number) =>
      add(
        corner,
        add(scale(along, u * detail), scale(side, v * detail * sideReach)),
      );
    return toPath({
      start: at(2, 2),
      segments: [{ kind: "C", c1: at(28, 14), c2: at(42, 40), to: at(50, 74) }],
      closed: false,
    });
  });

  const bottomAlong = unit(subtract(bottomRight, bottomLeft));
  const inward = inwardNormal(bottomLeft, bottomRight, centroid(corners));
  const start = add(
    add(bottomLeft, scale(bottomAlong, faceWidth * 0.075)),
    scale(inward, 11 * detail),
  );
  const end = add(
    subtract(bottomRight, scale(bottomAlong, faceWidth * 0.045)),
    scale(inward, 13 * detail),
  );
  const lowerFold = toPath({
    start,
    segments: [
      {
        kind: "C",
        c1: subtract(lerp(start, end, 0.24), scale(inward, 20 * detail)),
        c2: subtract(lerp(start, end, 0.74), scale(inward, 21 * detail)),
        to: end,
      },
    ],
    closed: false,
  });

  const outlineBounds = bounds(outlineSpec);
  const outline = toPath(outlineSpec);
  return {
    shape,
    outline,
    face: outline,
    seams: [toPath(seamSpec)],
    bands: [],
    creases: [],
    folds,
    lowerFold,
    shadow: contactShadow(outlineBounds),
    fabricBox: fabricBox(outlineBounds),
    bounds: roundBox(outlineBounds),
    metrics: {
      width: round(faceWidth),
      height: round(faceHeight),
      frontWidth: tapered ? round(faceWidth) : null,
      backWidth: tapered ? round(length(subtract(topRight, topLeft))) : null,
      band: 0,
    },
  };
}

function quadCorners(topWidth: number, bottomWidth: number, height: number) {
  return [
    point(-topWidth / 2, 0),
    point(topWidth / 2, 0),
    point(bottomWidth / 2, height),
    point(-bottomWidth / 2, height),
  ];
}

// Oblique projection taken from the Box / bench shape-card icon: the length
// rises gently to the right and the depth runs down-right towards the viewer.
const BOX_LENGTH_DIRECTION = point(Math.cos(-0.21), Math.sin(-0.21));
const BOX_DEPTH_DIRECTION = point(Math.cos(0.65), Math.sin(0.65));
const BOX_DEPTH_FORESHORTENING = 0.6;

function boxGeometry(width: number, depth: number, thickness: number) {
  const limits = CUSHION_PROPORTION_LIMITS;
  const depthRatio = clamp(
    depth / width,
    limits.boxDepthRatio.min,
    limits.boxDepthRatio.max,
  );
  const thicknessRatio = clamp(
    thickness / width,
    limits.boxThicknessRatio.min,
    limits.boxThicknessRatio.max,
  );
  const lengthVector = BOX_LENGTH_DIRECTION;
  const depthVector = scale(
    BOX_DEPTH_DIRECTION,
    depthRatio * BOX_DEPTH_FORESHORTENING,
  );
  const drop = point(0, thicknessRatio * 0.95);
  const backLeft = point(0, 0);
  const shapePoints = [
    backLeft,
    add(backLeft, lengthVector),
    add(add(backLeft, lengthVector), depthVector),
    add(add(add(backLeft, lengthVector), depthVector), drop),
    add(add(backLeft, depthVector), drop),
    add(backLeft, drop),
  ];
  const { factor, place } = fitToFrame(polylineSpec(shapePoints, true));
  const [bl, br, fr, frLow, flLow, blLow] = shapePoints.map(place);
  const fl = place(add(backLeft, depthVector));
  const bandDepth = drop.y * factor;
  const detail = detailScale(length(subtract(br, bl)), length(subtract(fl, bl)));

  const top = [bl, br, fr, fl];
  const outlineSpec = roundedPolygonSpec(
    [bl, br, fr, frLow, flLow, blLow],
    9 * detail,
  );
  const faceSpec = roundedPolygonSpec(top, 7 * detail);
  const seamSpec = roundedPolygonSpec(insetPolygon(top, 11 * detail), 5 * detail);
  // A welt seam runs just above the lower edge of the boxing strip.
  const lift = point(0, -clamp(bandDepth * 0.28, 4, 10));
  const trim = 10 * detail;
  const lowerSeam = polylineSpec([
    add(add(blLow, lift), scale(unit(subtract(flLow, blLow)), trim)),
    add(flLow, lift),
    add(add(frLow, lift), scale(unit(subtract(flLow, frLow)), trim)),
  ]);

  const outlineBounds = bounds(outlineSpec);
  const shadowFrom = blLow;
  const shadowTo = frLow;
  const shadowMiddle = lerp(shadowFrom, shadowTo, 0.5);
  const spread = length(subtract(shadowTo, shadowFrom));
  const angle =
    (Math.atan2(shadowTo.y - shadowFrom.y, shadowTo.x - shadowFrom.x) * 180) /
    Math.PI;
  const towardFront = subtract(flLow, shadowMiddle);

  return {
    shape: "box" as const,
    outline: toPath(outlineSpec),
    face: toPath(faceSpec),
    seams: [toPath(seamSpec), toPath(lowerSeam)],
    bands: [
      { tone: "front" as const, d: toPath(polylineSpec([fl, fr, frLow, flLow], true)) },
      { tone: "side" as const, d: toPath(polylineSpec([bl, fl, flLow, blLow], true)) },
    ],
    creases: [toPath(polylineSpec([bl, fl, fr]), polylineSpec([fl, flLow]))],
    folds: [],
    lowerFold: null,
    shadow: {
      angle: round(angle),
      cx: round(shadowMiddle.x + towardFront.x * 0.35),
      cy: round(shadowMiddle.y + towardFront.y * 0.35),
      rx: round(spread / 2 + 12 * detail),
      ry: round(clamp(length(towardFront) * 0.55 + 10, 16, 38)),
    },
    fabricBox: fabricBox(outlineBounds),
    bounds: roundBox(outlineBounds),
    metrics: {
      width: round(length(subtract(br, bl))),
      height: round(length(subtract(fl, bl))),
      frontWidth: null,
      backWidth: null,
      band: round(bandDepth),
    },
  };
}

function roundGeometry(diameter: number, thickness: number): CushionGeometry {
  const { min, max } = CUSHION_PROPORTION_LIMITS.roundBandRatio;
  const ratio = thickness / diameter;
  const hasBand = ratio >= min;
  // Shape space: radius 1, with the band as a share of the diameter.
  const bandShare = hasBand ? clamp(ratio, min, max) * 2 * 0.42 : 0;
  const shapeOutline = silhouetteSpec(point(0, 0), 1, bandShare);
  const { factor, place } = fitToFrame(shapeOutline);
  const centre = place(point(0, 0));
  const radius = factor;
  const band = bandShare * factor;
  const lowered = add(centre, point(0, band));
  const detail = detailScale(radius * 2, radius * 2);

  const outlineSpec = silhouetteSpec(centre, radius, band);
  const faceSpec = arcsSpec(centre, radius, [180, 90, 0, -90, -180], true);
  const seams = [
    toPath(arcsSpec(centre, radius - 13 * detail, [180, 90, 0, -90, -180], true)),
  ];
  const bands: CushionBand[] = [];
  const creases: string[] = [];
  if (hasBand) {
    const lowerEdge = arcsSpec(lowered, radius, [180, 90, 0], false);
    bands.push({
      tone: "front",
      d: toPath({
        start: polar(centre, radius, 180),
        segments: [
          { kind: "L", to: polar(lowered, radius, 180) },
          ...lowerEdge.segments,
          { kind: "L", to: polar(centre, radius, 0) },
          ...arcsSpec(centre, radius, [0, 90, 180], false).segments,
        ],
        closed: true,
      }),
    });
    creases.push(toPath(arcsSpec(centre, radius, [180, 90, 0], false)));
    const lift = clamp(band * 0.28, 4, 10);
    seams.push(
      toPath(
        arcsSpec(add(lowered, point(0, -lift)), radius - 1.5, [175, 90, 5], false),
      ),
    );
  }

  const folds = [225, 315, 45, 135].map((angle) =>
    toPath({
      start: polar(centre, radius - 3, angle),
      segments: [
        {
          kind: "C",
          c1: polar(centre, radius * 0.9, angle + 4),
          c2: polar(centre, radius * 0.77, angle + 9),
          to: polar(centre, radius * 0.64, angle + 11),
        },
      ],
      closed: false,
    }),
  );
  const lowerFold = toPath({
    start: polar(centre, radius * 0.8, 150),
    segments: [
      {
        kind: "C",
        c1: polar(centre, radius * 0.93, 118),
        c2: polar(centre, radius * 0.93, 62),
        to: polar(centre, radius * 0.8, 30),
      },
    ],
    closed: false,
  });

  const outlineBounds = bounds(outlineSpec);
  return {
    shape: "round",
    outline: toPath(outlineSpec),
    face: toPath(faceSpec),
    seams,
    bands,
    creases,
    folds,
    lowerFold,
    shadow: contactShadow(outlineBounds),
    fabricBox: fabricBox(outlineBounds),
    bounds: roundBox(outlineBounds),
    metrics: {
      width: round(radius * 2),
      height: round(radius * 2),
      frontWidth: null,
      backWidth: null,
      band: round(band),
    },
  };
}

/** A puffed circle, extended downwards by `band` when the side band shows. */
function silhouetteSpec(centre: Point, radius: number, band: number): PathSpec {
  if (band <= 0) return arcsSpec(centre, radius, [180, 90, 0, -90, -180], true);
  const lowered = add(centre, point(0, band));
  return {
    start: polar(centre, radius, 180),
    segments: [
      { kind: "L", to: polar(lowered, radius, 180) },
      ...arcsSpec(lowered, radius, [180, 90, 0], false).segments,
      { kind: "L", to: polar(centre, radius, 0) },
      ...arcsSpec(centre, radius, [0, -90, -180], false).segments,
    ],
    closed: true,
  };
}

export function buildCushionGeometry(
  input: CushionGeometryInput = {},
): CushionGeometry {
  const shape = input.shape ?? "rectangle";
  const fallback = DEFAULTS[shape];
  const width = positive(input.width, fallback.width);
  const height = positive(input.height, fallback.height);
  const thickness = positive(input.thickness, fallback.thickness);
  const limits = CUSHION_PROPORTION_LIMITS;

  if (shape === "box") return boxGeometry(width, height, thickness);
  if (shape === "round") return roundGeometry(width, thickness);

  if (shape === "tapered") {
    const backWidth = positive(input.backWidth, fallback.backWidth);
    const aspect = clamp(
      width / height,
      limits.taperedAspect.min,
      limits.taperedAspect.max,
    );
    const backRatio = clamp(
      backWidth / width,
      limits.taperedBackRatio.min,
      limits.taperedBackRatio.max,
    );
    // The narrower back edge sits at the top; the wider front faces the viewer.
    return pillowGeometry(
      shape,
      quadCorners(aspect * backRatio, aspect, 1),
      puffFor(thickness, Math.min(width, height)),
      true,
    );
  }

  if (shape === "square") {
    return pillowGeometry(
      shape,
      quadCorners(1, 1, 1),
      puffFor(thickness, width),
      false,
    );
  }

  const aspect = clamp(
    width / height,
    limits.rectangleAspect.min,
    limits.rectangleAspect.max,
  );
  return pillowGeometry(
    shape,
    quadCorners(aspect, aspect, 1),
    puffFor(thickness, Math.min(width, height)),
    false,
  );
}
