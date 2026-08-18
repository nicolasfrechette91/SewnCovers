import type { CreateDesignRequest } from "@/services/api-client";

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

export function ConfigurationReadonly({ configuration }: Readonly<{ configuration: CreateDesignRequest }>) {
  const measurement = (value: number) => `${value} ${configuration.unit}`;
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
    ["Pattern", configuration.patternId],
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
          <div className={`pattern-${configuration.patternId} h-2/3 w-3/4 rounded-panel border-2 border-border-strong shadow-raised`} style={{ backgroundSize: `${Math.round(48 / configuration.patternScale)}px` }} aria-hidden="true" />
        </div>
        <figcaption className="mt-2 text-supporting text-text-muted">Read-only preview for the saved {configuration.shape} snapshot. The complete text specification is authoritative.</figcaption>
      </figure>
    </div>
  );
}
