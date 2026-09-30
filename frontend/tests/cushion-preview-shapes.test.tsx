import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import React from "react";
import { cleanup, render } from "@testing-library/react";

import {
  buildCushionGeometry,
  CUSHION_PROPORTION_LIMITS,
  CUSHION_VIEWBOX_HEIGHT,
  CUSHION_VIEWBOX_WIDTH,
  type CushionGeometryInput,
} from "../components/configurator/cushion-geometry";
import { CushionModel } from "../components/configurator/cushion-model";
import { MeasurementDiagram } from "../components/configurator/measurement-diagram";
import { ShapeIllustration } from "../components/configurator/shape-illustration";
import type { CushionShape } from "../context/configuration";

afterEach(cleanup);

const SHAPES = ["square", "rectangle", "box", "round", "tapered"] as const;

const TYPICAL: Readonly<Record<CushionShape, CushionGeometryInput>> = {
  square: { width: 45, height: 45, thickness: 12 },
  rectangle: { width: 60, height: 40, thickness: 12 },
  box: { width: 120, height: 50, thickness: 10 },
  round: { width: 45, height: 45, thickness: 20 },
  tapered: { width: 50, backWidth: 40, height: 45, thickness: 8 },
};

function renderModel(
  props: Partial<React.ComponentProps<typeof CushionModel>>,
) {
  const { container } = render(
    <CushionModel
      patternScale={1.4}
      patternName="Fern trail"
      patternClassName="pattern-fern-trail"
      {...props}
    />,
  );
  const svg = container.querySelector<SVGSVGElement>(
    'svg[data-preview-model="cushion"]',
  );
  assert.ok(svg);
  return svg;
}

/** End points of each pillow edge, in drawing order from the top-left. */
function pillowCorners(outline: string) {
  const numbers = (text: string) => text.trim().split(/\s+/).map(Number);
  const [move, ...curves] = outline.replace(/Z$/, "").split("C");
  const start = numbers(move.replace("M", ""));
  const ends = curves.map((curve) => numbers(curve).slice(-2));
  const [topLeft, bottomLeft, bottomRight, topRight] = [start, ...ends];
  return { topLeft, topRight, bottomRight, bottomLeft };
}

test("draws each supported shape with its own silhouette", () => {
  const outlines = new Set<string>();
  for (const shape of SHAPES) {
    const svg = renderModel({ shape, ...TYPICAL[shape] });
    assert.equal(svg.getAttribute("data-preview-shape"), shape);
    assert.equal(svg.getAttribute("viewBox"), "0 0 640 430");
    const edge = svg.querySelector(".cushion-preview-edge")?.getAttribute("d");
    assert.ok(edge);
    assert.doesNotMatch(edge, /NaN|Infinity/);
    outlines.add(edge);
    // The shared soft style stays on every shape.
    for (const layer of [
      ".cushion-preview-shadow",
      ".cushion-preview-base",
      ".cushion-preview-shading",
      ".cushion-preview-highlight",
      ".cushion-preview-seam",
    ]) {
      assert.ok(svg.querySelector(layer), `${shape} ${layer}`);
    }
    cleanup();
  }
  assert.equal(outlines.size, SHAPES.length);

  const square = buildCushionGeometry({ shape: "square", ...TYPICAL.square });
  assert.ok(Math.abs(square.metrics.width - square.metrics.height) < 0.5);

  const box = renderModel({ shape: "box", ...TYPICAL.box });
  assert.equal(box.getAttribute("data-preview-band"), "true");
  assert.ok(box.querySelector(".cushion-preview-band-front"));
  assert.ok(box.querySelector(".cushion-preview-band-side"));
  assert.ok(box.querySelector(".cushion-preview-crease"));
  cleanup();

  // The tapered front is the wider edge, drawn at the bottom nearest the viewer.
  const tapered = buildCushionGeometry({ shape: "tapered", ...TYPICAL.tapered });
  const corners = pillowCorners(tapered.outline);
  const top = corners.topRight[0] - corners.topLeft[0];
  const bottom = corners.bottomRight[0] - corners.bottomLeft[0];
  assert.ok(corners.bottomLeft[1] > corners.topLeft[1]);
  assert.ok(bottom > top);
});

test("follows the entered proportions within legible limits", () => {
  const ratio = (input: CushionGeometryInput) => {
    const { metrics } = buildCushionGeometry(input);
    return metrics.width / metrics.height;
  };
  assert.ok(Math.abs(ratio({ shape: "rectangle", width: 80, height: 40, thickness: 10 }) - 2) < 0.01);
  assert.ok(Math.abs(ratio({ shape: "rectangle", width: 40, height: 80, thickness: 10 }) - 0.5) < 0.01);
  assert.ok(
    Math.abs(
      ratio({ shape: "rectangle", width: 300, height: 10, thickness: 5 }) -
        CUSHION_PROPORTION_LIMITS.rectangleAspect.max,
    ) < 0.01,
  );
  // Square cushions stay square whatever height reaches the model.
  assert.ok(Math.abs(ratio({ shape: "square", width: 45, height: 90, thickness: 10 }) - 1) < 0.01);

  const taper = (input: CushionGeometryInput) => {
    const { metrics } = buildCushionGeometry({ shape: "tapered", ...input });
    assert.ok(metrics.frontWidth && metrics.backWidth);
    return metrics.backWidth / metrics.frontWidth;
  };
  assert.ok(Math.abs(taper({ width: 80, backWidth: 65, height: 55, thickness: 10 }) - 65 / 80) < 0.01);
  assert.ok(
    Math.abs(
      taper({ width: 300, backWidth: 10, height: 40, thickness: 8 }) -
        CUSHION_PROPORTION_LIMITS.taperedBackRatio.min,
    ) < 0.01,
  );

  const band = (input: CushionGeometryInput) => {
    const { metrics } = buildCushionGeometry(input);
    return metrics.band / metrics.width;
  };
  assert.ok(
    band({ shape: "box", width: 120, height: 50, thickness: 20 }) >
      band({ shape: "box", width: 120, height: 50, thickness: 10 }),
  );
  assert.equal(
    band({ shape: "box", width: 120, height: 50, thickness: 60 }),
    band({ shape: "box", width: 120, height: 50, thickness: 90 }),
  );
  assert.equal(band({ shape: "round", width: 45, thickness: 6 }), 0);
  assert.ok(band({ shape: "round", width: 45, thickness: 20 }) > 0);
  assert.equal(
    band({ shape: "round", width: 30, thickness: 30 }),
    band({ shape: "round", width: 30, thickness: 60 }),
  );

  // Ratios, not units, drive the drawing.
  assert.equal(
    buildCushionGeometry({ shape: "rectangle", width: 80, height: 40, thickness: 10 }).outline,
    buildCushionGeometry({ shape: "rectangle", width: 31.5, height: 15.75, thickness: 3.9375 }).outline,
  );

  // Extreme or missing values still render inside the canvas.
  const extremes: CushionGeometryInput[] = [
    { shape: "rectangle", width: 10, height: 300, thickness: 60 },
    { shape: "box", width: 300, height: 10, thickness: 1 },
    { shape: "box", width: 10, height: 300, thickness: 60 },
    { shape: "round", width: 10, thickness: 60 },
    { shape: "tapered", width: 300, backWidth: 299, height: 10, thickness: 60 },
    { shape: "square", width: null, height: null, thickness: null },
    { shape: "tapered", width: Number.NaN, backWidth: -4, height: 0, thickness: undefined },
  ];
  for (const input of extremes) {
    const geometry = buildCushionGeometry(input);
    assert.doesNotMatch(geometry.outline, /NaN|Infinity/, JSON.stringify(input));
    const { bounds, shadow } = geometry;
    assert.ok(bounds.x >= 0 && bounds.y >= 0, JSON.stringify(input));
    assert.ok(bounds.x + bounds.width <= CUSHION_VIEWBOX_WIDTH, JSON.stringify(input));
    assert.ok(bounds.y + bounds.height <= CUSHION_VIEWBOX_HEIGHT, JSON.stringify(input));
    assert.ok(shadow.cy + shadow.ry <= CUSHION_VIEWBOX_HEIGHT, JSON.stringify(input));
  }
});

test("clips solid colour and pattern fabric to each silhouette", () => {
  for (const shape of SHAPES) {
    for (const fabric of [
      { patternName: "Fern trail", patternClassName: "pattern-fern-trail" },
      { patternName: "Solid color", solidColor: "#3E6C7E" },
    ]) {
      const svg = renderModel({ shape, ...TYPICAL[shape], ...fabric });
      const viewport = svg.querySelector("foreignObject.cushion-preview-pattern-viewport");
      assert.ok(viewport, shape);
      const clipReference = viewport.getAttribute("clip-path") ?? "";
      const clipId = /^url\(#(cushion-clip-[^)]+)\)$/.exec(clipReference)?.[1];
      assert.ok(clipId, clipReference);
      const clipOutline = svg
        .querySelector(`clipPath[id="${clipId}"] path`)
        ?.getAttribute("d");
      assert.equal(
        clipOutline,
        svg.querySelector(".cushion-preview-edge")?.getAttribute("d"),
      );
      // The fabric box covers the whole silhouette it is clipped to.
      const geometry = buildCushionGeometry({ shape, ...TYPICAL[shape] });
      assert.ok(Number(viewport.getAttribute("x")) <= geometry.bounds.x);
      assert.ok(
        Number(viewport.getAttribute("x")) + Number(viewport.getAttribute("width")) >=
          geometry.bounds.x + geometry.bounds.width,
      );
      const face = viewport.querySelector<HTMLElement>(".cushion-preview-face");
      assert.ok(face);
      assert.equal(face.style.getPropertyValue("--pattern-scale"), "1.4");
      if ("solidColor" in fabric) {
        assert.ok(face.classList.contains("cushion-preview-solid"));
        assert.equal(face.style.backgroundColor, "rgb(62, 108, 126)");
      } else {
        assert.ok(face.classList.contains("pattern-fern-trail"));
      }
      for (const band of svg.querySelectorAll(".cushion-preview-band")) {
        assert.equal(band.getAttribute("clip-path"), clipReference);
      }
      cleanup();
    }
  }
});

test("shows piping on every shape only when the piped edge is selected", () => {
  for (const shape of SHAPES) {
    for (const seamStyle of ["piped", "plain"] as const) {
      const svg = renderModel({ shape, ...TYPICAL[shape], seamStyle });
      const seams = [...svg.querySelectorAll(".cushion-preview-seam")];
      assert.ok(seams.length > 0, shape);
      for (const seam of seams) {
        assert.equal(
          seam.classList.contains("cushion-preview-seam-piped"),
          seamStyle === "piped",
          `${shape} ${seamStyle}`,
        );
      }
      cleanup();
    }
  }
});

test("draws the tapered icon and diagram with the wide front edge at the bottom", () => {
  const icon = render(<ShapeIllustration shape="tapered" />);
  const points = icon.container
    .querySelector(".shape-illustration-face")
    ?.getAttribute("points")
    ?.split(" ")
    .map((pair) => pair.split(",").map(Number));
  assert.ok(points);
  const edgeWidth = (y: number) => {
    const xs = points.filter(([, pointY]) => pointY === y).map(([x]) => x);
    return Math.max(...xs) - Math.min(...xs);
  };
  const ys = points.map(([, y]) => y);
  assert.ok(edgeWidth(Math.max(...ys)) > edgeWidth(Math.min(...ys)));
  cleanup();

  const diagram = render(<MeasurementDiagram shape="tapered" />);
  const labels = [...diagram.container.querySelectorAll("text")];
  const front = labels.find((label) => label.textContent === "Front width");
  const back = labels.find((label) => label.textContent === "Back width");
  assert.ok(front && back);
  assert.ok(Number(front.getAttribute("y")) > Number(back.getAttribute("y")));
  const face = diagram.container
    .querySelector(".measurement-diagram-face")
    ?.getAttribute("points")
    ?.split(" ")
    .map((pair) => pair.split(",").map(Number));
  assert.ok(face);
  const faceYs = face.map(([, y]) => y);
  const widthAt = (y: number) => {
    const xs = face.filter(([, pointY]) => pointY === y).map(([x]) => x);
    return Math.max(...xs) - Math.min(...xs);
  };
  assert.ok(widthAt(Math.max(...faceYs)) > widthAt(Math.min(...faceYs)));
});
