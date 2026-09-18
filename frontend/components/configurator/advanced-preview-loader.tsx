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
  solidColor,
}: Readonly<{
  configuration: Readonly<ConfigurationState>;
  patternName: string;
  textureUrl?: string;
  solidColor?: string;
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
        solidColor={solidColor}
      />
    </Suspense>
  ) : (
    <div className="mt-component rounded-card border border-border bg-surface p-4">
      <p className="text-supporting text-text-muted">
        The main preview above shows your selected fabric and edge styling.
        The optional 3D view shows approximate proportions; built-in patterns use
        a generic texture there. Fit, closure, and edge finish are recorded only in 3D.
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
