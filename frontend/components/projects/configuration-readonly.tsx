"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth";
import {
  accountApi,
  resolveAssetUrl,
  type ProjectConfigurationRequest,
} from "@/services/account-api";

const labels: Readonly<Record<string, string>> = {
  "cotton-canvas": "Cotton canvas",
  "linen-blend": "Linen blend",
  "polyester-weave": "Polyester weave",
  close: "Closer fit",
  standard: "Standard fit",
  relaxed: "More relaxed fit",
  zipper: "Zipper access",
  envelope: "Envelope opening",
  "slip-on": "Open-ended slip-on",
  plain: "Plain seam",
  piped: "Piped edge",
};

export function ConfigurationReadonly({ configuration }: Readonly<{ configuration: ProjectConfigurationRequest }>) {
  const { state: auth } = useAuth();
  const [custom, setCustom] = useState<{ label: string; url: string } | { deleted: true } | null>(null);
  useEffect(() => {
    let active = true;
    const pattern = configuration.pattern;
    if (pattern.kind !== "custom" || auth.status !== "authenticated") return;
    void (async () => {
      try {
        const upload = await accountApi.getUpload(auth.token, pattern.assetId);
        if (!active) return;
        if (upload.state === "deleted") { setCustom({ deleted: true }); return; }
        const access = await accountApi.assetAccess(auth.token, upload.id, "tile");
        if (active) setCustom({ label: upload.label, url: resolveAssetUrl(access.url) });
      } catch { if (active) setCustom({ deleted: true }); }
    })();
    return () => { active = false; };
  }, [auth, configuration.pattern]);
  const measurement = (value: number) => `${value} ${configuration.unit}`;
  const patternLabel = configuration.pattern.kind === "built-in"
    ? configuration.pattern.patternId
    : custom && "label" in custom ? custom.label : custom && "deleted" in custom ? "Custom asset deleted" : "Loading custom pattern…";
  const fields = [
    ["Shape", configuration.shape],
    [configuration.shape === "round" ? "Diameter" : configuration.shape === "tapered" ? "Front width" : "Width", measurement(configuration.width)],
    [configuration.shape === "box" ? "Depth" : "Height", measurement(configuration.height)],
    ...(configuration.backWidth === null ? [] : [["Back width", measurement(configuration.backWidth)]]),
    ["Thickness", measurement(configuration.thickness)],
    ["Material", labels[configuration.materialId]],
    ["Fit", labels[configuration.fitPreference]],
    ["Closure / access", labels[configuration.closureType]],
    ["Edge finish", labels[configuration.seamStyle]],
    ["Pattern", patternLabel],
    ["Pattern scale", `${configuration.patternScale}×`],
  ];
  return (
    <div className="grid min-w-0 gap-component md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.7fr)]">
      <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-card border border-border bg-surface-subtle p-3">
            <dt className="text-label font-control text-text-muted">{label}</dt>
            <dd className="mt-1 break-words text-body text-text-primary">{value}</dd>
          </div>
        ))}
      </dl>
      <figure className="rounded-card border border-border bg-surface-subtle p-card">
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-card border border-border bg-surface">
          {configuration.pattern.kind === "built-in" ? <div className={`pattern-${configuration.pattern.patternId} h-2/3 w-3/4 rounded-panel border-2 border-border-strong shadow-raised`} style={{ backgroundSize: `${Math.round(48 / configuration.patternScale)}px` }} aria-hidden="true" /> : custom && "url" in custom ? <div className="h-2/3 w-3/4 rounded-panel border-2 border-border-strong shadow-raised" style={{ backgroundImage: `url("${custom.url}")`, backgroundRepeat: "repeat", backgroundSize: `${Math.round(160 * configuration.patternScale)}px auto` }} aria-hidden="true" /> : <p className="p-4 text-center text-supporting text-text-muted">Custom asset deleted or unavailable.</p>}
        </div>
        <figcaption className="mt-2 text-supporting text-text-muted">Read-only preview for the saved {configuration.shape} snapshot. The complete text specification is authoritative.</figcaption>
      </figure>
    </div>
  );
}
