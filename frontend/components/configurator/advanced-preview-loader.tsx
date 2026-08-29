"use client";

import { lazy, Suspense, useState } from "react";

import { Button } from "@/components/ui";
import type { ConfigurationState } from "@/context/configuration";

const AdvancedPreview = lazy(async () => {
  const loaded = await import("./advanced-preview");
  return { default: loaded.AdvancedPreview };
});

export function AdvancedPreviewLoader({
  configuration,
  patternName,
  textureUrl,
}: Readonly<{
  configuration: Readonly<ConfigurationState>;
  patternName: string;
  textureUrl?: string;
}>) {
  const [enabled, setEnabled] = useState(false);
  return enabled ? (
    <Suspense
      fallback={
        <p className="mt-component" role="status">
          Loading the optional 3D preview…
        </p>
      }
    >
      <AdvancedPreview
        configuration={configuration}
        patternName={patternName}
        textureUrl={textureUrl}
      />
    </Suspense>
  ) : (
    <div className="mt-component rounded-card border border-border bg-surface p-4">
      <p className="text-supporting text-text-muted">
        The complete 2D SVG preview is active. Load the isolated WebGL preview
        only if this device supports it.
      </p>
      <Button
        className="mt-3"
        variant="secondary"
        onClick={() => setEnabled(true)}
      >
        Load approximate 3D preview
      </Button>
    </div>
  );
}
