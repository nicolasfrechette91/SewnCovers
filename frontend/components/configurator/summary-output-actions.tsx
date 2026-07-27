"use client";

import { Button } from "@/components/ui";

import {
  serializeReviewSummary,
  SUMMARY_DOWNLOAD_FILENAME,
  type ReviewSummary,
} from "./review-summary";

export interface SummaryOutputActionsProps {
  summary: ReviewSummary;
}

export function SummaryOutputActions({
  summary,
}: SummaryOutputActionsProps) {
  const printSummary = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const downloadSummary = () => {
    if (
      typeof document === "undefined" ||
      typeof Blob === "undefined" ||
      typeof URL === "undefined"
    ) {
      return;
    }

    const blob = new Blob([serializeReviewSummary(summary)], {
      type: "text/plain;charset=utf-8",
    });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    try {
      link.href = objectUrl;
      link.download = SUMMARY_DOWNLOAD_FILENAME;
      link.hidden = true;
      document.body.append(link);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    } finally {
      link.remove();
    }
  };

  return (
    <div className="review-output-actions print-hidden flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
      <Button
        variant="secondary"
        aria-label="Print configuration summary"
        onClick={printSummary}
      >
        Print summary
      </Button>
      <Button
        aria-label="Download configuration summary as a plain-text file"
        onClick={downloadSummary}
      >
        Download summary (.txt)
      </Button>
    </div>
  );
}
