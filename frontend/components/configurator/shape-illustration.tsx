import type { CushionShape } from "@/context/configuration";

export function ShapeIllustration({
  shape,
}: Readonly<{ shape: CushionShape }>) {
  return (
    <svg
      aria-hidden="true"
      className="shape-illustration block h-28 w-full max-w-48"
      viewBox="0 0 192 112"
      preserveAspectRatio="xMidYMid meet"
      focusable="false"
    >
      {shape === "square" ? (
        <>
          <rect
            className="shape-illustration-face"
            x="56"
            y="16"
            width="80"
            height="80"
            rx="10"
          />
          <line
            className="shape-illustration-detail"
            x1="66"
            y1="82"
            x2="126"
            y2="82"
          />
        </>
      ) : null}

      {shape === "rectangle" ? (
        <>
          <rect
            className="shape-illustration-face"
            x="28"
            y="28"
            width="136"
            height="68"
            rx="10"
          />
          <line
            className="shape-illustration-detail"
            x1="42"
            y1="82"
            x2="150"
            y2="82"
          />
        </>
      ) : null}

      {shape === "box" ? (
        <>
          <polygon
            className="shape-illustration-face"
            points="28,40 132,18 164,42 60,64"
          />
          <polygon
            className="shape-illustration-side"
            points="60,64 164,42 164,74 60,96"
          />
          <polygon
            className="shape-illustration-side"
            points="28,40 60,64 60,96 28,72"
          />
          <line
            className="shape-illustration-detail"
            x1="42"
            y1="46"
            x2="132"
            y2="27"
          />
        </>
      ) : null}
    </svg>
  );
}
