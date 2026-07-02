import * as React from "react";
import type { PieCardProps } from "./PieCardChart";

// Round-2 performance: thin lazy wrapper. The recharts-dependent
// implementation lives in PieCardChart.tsx and is only fetched the
// first time this actually renders — which, since every caller sits
// inside AnalyticsPanel's `{open && ...}` branch (collapsed by
// default), means most page visits never download recharts at all.
// Same public API as before, so none of the 12 call sites needed to
// change.
const PieCardChart = React.lazy(() => import("./PieCardChart"));

const FALLBACK_HEIGHT = 240;

export function PieCard(props: PieCardProps) {
  return (
    <React.Suspense
      fallback={
        <div
          className="flex items-center justify-center rounded-lg border bg-card p-3 text-xs text-muted-foreground"
          style={{ height: (props.height ?? FALLBACK_HEIGHT) + 40 }}
        >
          Loading chart…
        </div>
      }
    >
      <PieCardChart {...props} />
    </React.Suspense>
  );
}
