import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { ConsentPreferences } from "../components/assurance/consent-preferences";
import { ProductionOperationsScreen } from "../components/assurance/production-operations-screen";
import { AdvancedPreview } from "../components/configurator/advanced-preview";
import { AuthProvider } from "../context/auth";
import type { ConfigurationState } from "../context/configuration";
import LegalPage from "../app/legal/page";
import TrustPage from "../app/trust/page";

const configuration: ConfigurationState = {
  shape: "rectangle",
  width: 80,
  height: 42,
  backWidth: null,
  thickness: 11,
  unit: "cm",
  pattern: { kind: "built-in", patternId: "terrace-wave" },
  patternScale: 1.4,
  materialId: "linen-blend",
  fitPreference: "standard",
  closureType: "zipper",
  seamStyle: "piped",
};

const originalFetch = globalThis.fetch;
const originalGetContext = window.HTMLCanvasElement.prototype.getContext;

function webGlStub() {
  return {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    TEXTURE_2D: 5,
    RGBA: 6,
    UNSIGNED_BYTE: 7,
    TEXTURE_WRAP_S: 8,
    TEXTURE_WRAP_T: 9,
    REPEAT: 10,
    TEXTURE_MIN_FILTER: 11,
    LINEAR: 12,
    ARRAY_BUFFER: 13,
    DYNAMIC_DRAW: 14,
    FLOAT: 15,
    DEPTH_TEST: 16,
    COLOR_BUFFER_BIT: 17,
    DEPTH_BUFFER_BIT: 18,
    TEXTURE0: 19,
    TRIANGLES: 20,
    UNPACK_FLIP_Y_WEBGL: 21,
    createShader: () => ({}),
    shaderSource: () => undefined,
    compileShader: () => undefined,
    getShaderParameter: () => true,
    deleteShader: () => undefined,
    createProgram: () => ({}),
    attachShader: () => undefined,
    linkProgram: () => undefined,
    getProgramParameter: () => true,
    deleteProgram: () => undefined,
    createBuffer: () => ({}),
    createTexture: () => ({}),
    bindTexture: () => undefined,
    texImage2D: () => undefined,
    texParameteri: () => undefined,
    deleteBuffer: () => undefined,
    deleteTexture: () => undefined,
    getExtension: () => ({ loseContext: () => undefined }),
    viewport: () => undefined,
    clearColor: () => undefined,
    enable: () => undefined,
    clear: () => undefined,
    useProgram: () => undefined,
    bindBuffer: () => undefined,
    bufferData: () => undefined,
    getAttribLocation: () => 0,
    enableVertexAttribArray: () => undefined,
    vertexAttribPointer: () => undefined,
    getUniformLocation: () => ({}),
    uniform3fv: () => undefined,
    uniform1f: () => undefined,
    activeTexture: () => undefined,
    uniform1i: () => undefined,
    drawArrays: () => undefined,
    pixelStorei: () => undefined,
  };
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.HTMLCanvasElement.prototype.getContext = originalGetContext;
  window.localStorage.clear();
  window.sessionStorage.clear();
  Object.defineProperty(navigator, "globalPrivacyControl", {
    configurable: true,
    value: undefined,
  });
});

test("renders every supported approximate 3D shape with keyboard controls and summaries", async () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  window.HTMLCanvasElement.prototype.getContext =
    (() => webGlStub()) as unknown as typeof originalGetContext;

  for (const shape of ["square", "rectangle", "box"] as const) {
    render(
      <AdvancedPreview
        configuration={{
          ...configuration,
          shape,
          height: shape === "square" ? 80 : 42,
        }}
        patternName="Terrace Wave"
      />,
    );
    const canvas = await screen.findByLabelText(
      /Interactive approximate cushion model/,
    );
    await waitFor(() => assert.equal(canvas.getAttribute("tabindex"), "0"));
    fireEvent.keyDown(canvas, { key: "ArrowRight" });
    fireEvent.keyDown(canvas, { key: "+" });
    assert.match(screen.getByText(/Yaw/).textContent ?? "", /zoom 1\.10/);
    assert.ok(screen.getByRole("button", { name: "Front" }));
    assert.ok(screen.getByRole("button", { name: "Top" }));
    assert.ok(screen.getByRole("button", { name: "Side" }));
    assert.match(
      screen.getByText(/Original measurements/).parentElement?.textContent ??
        "",
      new RegExp(String(configuration.width)),
    );
    assert.match(
      screen.getByText(/Recorded only in 3D/).parentElement?.textContent ?? "",
      /These settings do not change this 3D model/,
    );
    cleanup();
  }
});

test("shows WebGL and private-texture authorization fallback states", async () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  window.HTMLCanvasElement.prototype.getContext =
    (() => null) as typeof originalGetContext;
  render(
    <AdvancedPreview
      configuration={configuration}
      patternName="Terrace Wave"
    />,
  );
  assert.ok(
    await screen.findByText(/3D is unavailable.*complete 2D preview/),
  );
  cleanup();

  window.HTMLCanvasElement.prototype.getContext =
    (() => webGlStub()) as unknown as typeof originalGetContext;
  globalThis.fetch = async () => new Response("", { status: 403 });
  render(
    <AdvancedPreview
      configuration={{
        ...configuration,
        pattern: {
          kind: "custom",
          assetId: "AssetDemo000000000001",
          derivativeId: "DerivDemo000000000001",
          processingVersion: "tile-v1",
          label: "Private pattern",
          previewUrl: "https://api.example.test/assets/temporary",
        },
      }}
      patternName="Private pattern"
      textureUrl="https://api.example.test/assets/temporary"
    />,
  );
  assert.ok(
    await screen.findByText(/Access to this custom pattern expired/),
  );
  assert.match(
    screen.getByText(/Pattern/).parentElement?.textContent ?? "",
    /may have visible joins/,
  );
});

test("honors Global Privacy Control without blocking core access", async () => {
  Object.defineProperty(navigator, "globalPrivacyControl", {
    configurable: true,
    value: true,
  });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: "gpc_restricted",
        documentVersion: 1,
        privacySignal: true,
        decidedAt: new Date().toISOString(),
        behavior: "Optional collection is off.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  render(
    <AuthProvider>
      <ConsentPreferences />
    </AuthProvider>,
  );
  await waitFor(() => {
    assert.match(document.body.textContent ?? "", /Global Privacy Control/);
  });
  assert.ok(
    screen.getByRole("button", { name: "Change analytics preferences" }),
  );
});

test("renders legal, trust, unauthorized, and review-required surfaces", async () => {
  const legal = render(<LegalPage />);
  assert.ok(
    legal.getByRole("heading", { name: "Legal and consent information" }),
  );
  for (const heading of [
    "Terms of use",
    "Privacy notice",
    "Cookie and analytics notice",
    "Custom upload and moderation notice",
    "Demonstration commerce and fulfilment notice",
    "Accessibility statement",
    "Security and vulnerability reporting",
  ]) {
    assert.ok(legal.getByRole("heading", { name: heading }));
  }
  assert.match(document.body.textContent ?? "", /has not been approved by a lawyer/);
  cleanup();

  render(<TrustPage />);
  assert.ok(
    screen.getByRole("heading", {
      name: "Trust, boundaries, and readiness",
    }),
  );
  assert.match(document.body.textContent ?? "", /Not implemented/);
  assert.match(document.body.textContent ?? "", /not a certification/);
  assert.match(document.body.textContent ?? "", /stored as hashes/);
  assert.match(document.body.textContent ?? "", /Browser-supplied totals are not accepted/);
  assert.match(document.body.textContent ?? "", /Verified raw-body webhook processing/);
  assert.match(document.body.textContent ?? "", /Configured, not live-verified/);
  cleanup();

  render(
    <AuthProvider>
      <ProductionOperationsScreen />
    </AuthProvider>,
  );
  assert.ok(
    await screen.findByText(/Administrator authorization is required/),
  );
});
