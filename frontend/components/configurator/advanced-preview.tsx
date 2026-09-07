"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { Button } from "@/components/ui";
import type { ConfigurationState } from "@/context/configuration";

interface AdvancedPreviewProps {
  readonly configuration: Readonly<ConfigurationState>;
  readonly patternName: string;
  readonly textureUrl?: string;
}

type PreviewState =
  | "loading"
  | "ready"
  | "unavailable"
  | "authorization-expired"
  | "failed";

interface ViewState {
  readonly pitch: number;
  readonly yaw: number;
  readonly zoom: number;
}

const DEFAULT_VIEW: ViewState = { pitch: -0.35, yaw: 0.65, zoom: 1 };
const VISUALIZATION_RULES_VERSION = "approximate-cover-v1";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function colorForMaterial(material: ConfigurationState["materialId"]) {
  if (material === "linen-blend") return [0.68, 0.58, 0.42] as const;
  if (material === "polyester-weave") return [0.25, 0.48, 0.5] as const;
  return [0.43, 0.3, 0.2] as const;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("shader unavailable");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    throw new Error("shader initialization failed");
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertex = compileShader(
    gl,
    gl.VERTEX_SHADER,
    "attribute vec3 p;attribute vec2 uv;attribute float shade;varying vec2 vuv;varying float vs;void main(){gl_Position=vec4(p,1.0);vuv=uv;vs=shade;}",
  );
  const fragment = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    "precision mediump float;varying vec2 vuv;varying float vs;uniform vec3 base;uniform float scale;uniform float useTexture;uniform sampler2D texture0;void main(){vec3 procedural=base*(0.78+0.22*step(0.5,fract((vuv.x+vuv.y)*8.0/scale)));vec3 tex=texture2D(texture0,vuv/scale).rgb;vec3 colour=mix(procedural,tex,useTexture);gl_FragColor=vec4(colour*vs,1.0);}",
  );
  const program = gl.createProgram();
  if (!program) throw new Error("program unavailable");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    throw new Error("program initialization failed");
  }
  return program;
}

function dimensions(configuration: Readonly<ConfigurationState>) {
  const width = configuration.width ?? 1;
  const depth = configuration.height ?? width;
  const thickness = configuration.thickness ?? 1;
  const maximum = Math.max(width, depth, thickness);
  return [width / maximum, thickness / maximum, depth / maximum] as const;
}

function buildVertices(
  configuration: Readonly<ConfigurationState>,
  view: ViewState,
) {
  const [width, height, depth] = dimensions(configuration);
  const corners = [
    [-width, -height, -depth], [width, -height, -depth],
    [width, height, -depth], [-width, height, -depth],
    [-width, -height, depth], [width, -height, depth],
    [width, height, depth], [-width, height, depth],
  ] as const;
  const transformed = corners.map(([x, y, z]) => {
    const x1 = x * Math.cos(view.yaw) + z * Math.sin(view.yaw);
    const z1 = -x * Math.sin(view.yaw) + z * Math.cos(view.yaw);
    const y1 = y * Math.cos(view.pitch) - z1 * Math.sin(view.pitch);
    const z2 = y * Math.sin(view.pitch) + z1 * Math.cos(view.pitch);
    const distance = 4.5 - z2;
    const factor = view.zoom / distance;
    return [x1 * factor, y1 * factor, z2 / 8] as const;
  });
  const faces = [
    { indexes: [4, 5, 6, 4, 6, 7], shade: 1 },
    { indexes: [1, 0, 3, 1, 3, 2], shade: 0.68 },
    { indexes: [0, 4, 7, 0, 7, 3], shade: 0.78 },
    { indexes: [5, 1, 2, 5, 2, 6], shade: 0.84 },
    { indexes: [3, 7, 6, 3, 6, 2], shade: 1.08 },
    { indexes: [0, 1, 5, 0, 5, 4], shade: 0.58 },
  ];
  const uv = [[0, 1], [1, 1], [1, 0], [0, 1], [1, 0], [0, 0]] as const;
  return new Float32Array(
    faces.flatMap((face) =>
      face.indexes.flatMap((corner, index) => [
        ...transformed[corner], ...uv[index], face.shade,
      ]),
    ),
  );
}

export function AdvancedPreview({
  configuration,
  patternName,
  textureUrl,
}: AdvancedPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const resourcesRef = useRef<{
    gl: WebGLRenderingContext;
    program: WebGLProgram;
    buffer: WebGLBuffer;
    texture: WebGLTexture;
    objectUrl?: string;
    frame?: number;
  } | null>(null);
  const [state, setState] = useState<PreviewState>("loading");
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const [motionDisabled, setMotionDisabled] = useState(false);
  const summaryId = useId();

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotionDisabled(reduced.matches);
    update();
    reduced.addEventListener("change", update);
    return () => reduced.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!["square", "rectangle", "box"].includes(configuration.shape ?? "")) {
      const timer = globalThis.setTimeout(
        () => setState("unavailable"),
        0,
      );
      return () => globalThis.clearTimeout(timer);
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      setState("unavailable");
      return;
    }
    let cancelled = false;
    let objectUrl: string | undefined;
    let readyTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    try {
      const program = createProgram(gl);
      const buffer = gl.createBuffer();
      const texture = gl.createTexture();
      if (!buffer || !texture) throw new Error("GPU resources unavailable");
      resourcesRef.current = { gl, program, buffer, texture };
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA,
        gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]),
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      readyTimer = globalThis.setTimeout(() => setState("ready"), 0);
      if (textureUrl) {
        void fetch(textureUrl, { credentials: "omit", cache: "no-store" })
          .then((response) => {
            if ([401, 403, 404, 410].includes(response.status)) {
              throw new Error("authorization-expired");
            }
            if (!response.ok) throw new Error("texture-unavailable");
            return response.blob();
          })
          .then((blob) => {
            objectUrl = URL.createObjectURL(blob);
            const image = new Image();
            image.onload = () => {
              if (cancelled || !resourcesRef.current) return;
              gl.bindTexture(gl.TEXTURE_2D, texture);
              gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
              gl.texImage2D(
                gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
                gl.UNSIGNED_BYTE, image,
              );
              resourcesRef.current.objectUrl = objectUrl;
              setView((current) => ({ ...current }));
            };
            image.onerror = () => setState("failed");
            image.src = objectUrl;
          })
          .catch((error: unknown) => {
            setState(
              error instanceof Error &&
                error.message === "authorization-expired"
                ? "authorization-expired"
                : "failed",
            );
          });
      }
    } catch {
      setState("failed");
    }
    return () => {
      cancelled = true;
      if (readyTimer) globalThis.clearTimeout(readyTimer);
      const resources = resourcesRef.current;
      if (resources) {
        if (resources.frame) cancelAnimationFrame(resources.frame);
        resources.gl.deleteBuffer(resources.buffer);
        resources.gl.deleteTexture(resources.texture);
        resources.gl.deleteProgram(resources.program);
        resources.gl.getExtension("WEBGL_lose_context")?.loseContext();
        if (resources.objectUrl) URL.revokeObjectURL(resources.objectUrl);
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resourcesRef.current = null;
    };
  }, [configuration.shape, textureUrl]);

  useEffect(() => {
    const resources = resourcesRef.current;
    const canvas = canvasRef.current;
    if (!resources || !canvas || state !== "ready") return;
    resources.frame = requestAnimationFrame(() => {
      const { gl, program, buffer, texture } = resources;
      const pixelRatio = window.devicePixelRatio || 1;
      const width = Math.max(
        1,
        Math.floor(canvas.clientWidth * pixelRatio),
      );
      const height = Math.max(
        1,
        Math.floor(canvas.clientHeight * pixelRatio),
      );
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.clearColor(0.94, 0.91, 0.84, 1);
      gl.enable(gl.DEPTH_TEST);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        buildVertices(configuration, view),
        gl.DYNAMIC_DRAW,
      );
      const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
      const position = gl.getAttribLocation(program, "p");
      const uv = gl.getAttribLocation(program, "uv");
      const shade = gl.getAttribLocation(program, "shade");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(uv);
      gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(shade);
      gl.vertexAttribPointer(shade, 1, gl.FLOAT, false, stride, 20);
      gl.uniform3fv(
        gl.getUniformLocation(program, "base"),
        colorForMaterial(configuration.materialId),
      );
      gl.uniform1f(
        gl.getUniformLocation(program, "scale"),
        configuration.patternScale,
      );
      gl.uniform1f(
        gl.getUniformLocation(program, "useTexture"),
        textureUrl && resources.objectUrl ? 1 : 0,
      );
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(gl.getUniformLocation(program, "texture0"), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 36);
    });
    return () => {
      if (resources.frame) cancelAnimationFrame(resources.frame);
    };
  }, [configuration, state, textureUrl, view]);

  const adjust = useCallback((changes: Partial<ViewState>) => {
    setView((current) => ({
      pitch: changes.pitch ?? current.pitch,
      yaw: changes.yaw ?? current.yaw,
      zoom: clamp(changes.zoom ?? current.zoom, 0.65, 1.65),
    }));
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const step = event.shiftKey ? 0.25 : 0.1;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => adjust({ yaw: view.yaw - step }),
      ArrowRight: () => adjust({ yaw: view.yaw + step }),
      ArrowUp: () => adjust({ pitch: view.pitch - step }),
      ArrowDown: () => adjust({ pitch: view.pitch + step }),
      "+": () => adjust({ zoom: view.zoom + 0.1 }),
      "=": () => adjust({ zoom: view.zoom + 0.1 }),
      "-": () => adjust({ zoom: view.zoom - 0.1 }),
      Home: () => setView(DEFAULT_VIEW),
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  const startDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const drag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const previous = dragRef.current;
    dragRef.current = { x: event.clientX, y: event.clientY };
    adjust({
      yaw: view.yaw + (event.clientX - previous.x) / 100,
      pitch: view.pitch + (event.clientY - previous.y) / 100,
    });
  };

  const closeDialog = () => {
    dialogRef.current?.close();
    openerRef.current?.focus();
  };

  return (
    <section
      aria-labelledby={`${summaryId}-heading`}
      className="mt-component rounded-panel border border-border bg-surface p-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id={`${summaryId}-heading`}
            className="font-display text-section-title font-heading"
          >
            Approximate interactive 3D preview
          </h3>
          <p className="mt-2 max-w-3xl text-supporting text-text-muted">
            Visual approximation only. Rely on your entered measurements; this
            model does not create cutting dimensions, tolerances, seam
            allowances, or manufacturing guarantees.
          </p>
        </div>
        <Button
          ref={openerRef}
          variant="secondary"
          onClick={() => dialogRef.current?.showModal()}
        >
          Expanded controls
        </Button>
      </div>
      <div className="mt-component min-w-0 overflow-hidden rounded-card border border-border bg-surface-subtle">
        <canvas
          ref={canvasRef}
          className="block aspect-[4/3] min-h-56 w-full touch-none"
          tabIndex={state === "ready" ? 0 : -1}
          aria-describedby={summaryId}
          aria-label="Interactive approximate cushion model. Use arrow keys to rotate, plus and minus to zoom, and Home to reset."
          onKeyDown={onKeyDown}
          onPointerDown={startDrag}
          onPointerMove={drag}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
        />
        {state !== "ready" ? (
          <p className="p-4 text-supporting" role="status">
            {state === "loading" && "Loading the isolated 3D renderer…"}
            {state === "unavailable" &&
              "3D is unavailable for this shape or browser. The complete 2D preview remains above."}
            {state === "authorization-expired" &&
              "Access to this custom pattern expired. Refresh the page or use the complete 2D fallback."}
            {state === "failed" &&
              "The 3D renderer could not initialize. The complete 2D preview remains available."}
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="3D view presets">
        <Button variant="secondary" onClick={() => setView({ pitch: 0, yaw: 0, zoom: 1 })}>Front</Button>
        <Button variant="secondary" onClick={() => setView({ pitch: -1.45, yaw: 0, zoom: 1 })}>Top</Button>
        <Button variant="secondary" onClick={() => setView({ pitch: 0, yaw: 1.55, zoom: 1 })}>Side</Button>
        <Button variant="secondary" onClick={() => adjust({ zoom: view.zoom + 0.1 })} aria-label="Zoom in">Zoom in</Button>
        <Button variant="secondary" onClick={() => adjust({ zoom: view.zoom - 0.1 })} aria-label="Zoom out">Zoom out</Button>
        <Button variant="secondary" onClick={() => setView(DEFAULT_VIEW)}>Reset view</Button>
        <Button variant="secondary" onClick={() => setMotionDisabled((value) => !value)} aria-pressed={motionDisabled}>
          {motionDisabled ? "Motion disabled" : "Disable motion"}
        </Button>
      </div>
      <dl id={summaryId} className="mt-component grid gap-2 text-supporting sm:grid-cols-2">
        <div><dt className="font-control">Original measurements</dt><dd>{configuration.width} × {configuration.height} × {configuration.thickness} {configuration.unit}</dd></div>
        <div><dt className="font-control">Display scaling</dt><dd>Relative normalization only; originals remain unchanged</dd></div>
        <div><dt className="font-control">Pattern</dt><dd>{patternName} at {configuration.patternScale.toFixed(1)}×; arbitrary uploads are not assumed seamless</dd></div>
        <div><dt className="font-control">Construction</dt><dd>{configuration.fitPreference} fit · {configuration.closureType} access · {configuration.seamStyle} edge</dd></div>
        <div><dt className="font-control">Orientation</dt><dd>Yaw {view.yaw.toFixed(2)}, pitch {view.pitch.toFixed(2)}, zoom {view.zoom.toFixed(2)}</dd></div>
        <div><dt className="font-control">Rules</dt><dd>{VISUALIZATION_RULES_VERSION}</dd></div>
      </dl>
      <dialog
        ref={dialogRef}
        className="m-auto max-h-[90vh] w-[min(92vw,42rem)] overflow-auto rounded-panel border border-border bg-surface p-card text-text-primary shadow-overlay backdrop:bg-text-primary/40"
        onClose={() => openerRef.current?.focus()}
      >
        <h3 className="font-display text-section-title font-heading">Expanded preview controls</h3>
        <p className="mt-3">Drag with pointer or touch. On the canvas, use arrow keys to rotate, plus or minus to zoom, and Home to reset. Motion is never automatic when reduced motion is requested.</p>
        <Button className="mt-component" onClick={closeDialog}>Close expanded controls</Button>
      </dialog>
    </section>
  );
}
