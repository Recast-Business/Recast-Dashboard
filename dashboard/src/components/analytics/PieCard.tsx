import * as React from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { PieBucket } from "@/lib/analytics/group";
import { formatUSD } from "@/lib/utils";

// Theme-aware-ish palette. Cycles through; works on light + dark backgrounds.
const PALETTE = [
  "#0ea5e9", "#22c55e", "#f59e0b", "#ec4899", "#8b5cf6",
  "#14b8a6", "#ef4444", "#a855f7", "#84cc16", "#f97316",
  "#06b6d4", "#eab308",
];

interface Props {
  title: string;
  description?: string;
  data: PieBucket[];
  /** When true, values render as $X,XXX in the tooltip + legend. Default true. */
  asCurrency?: boolean;
  height?: number;
}

export function PieCard({ title, description, data, asCurrency = true, height = 240 }: Props) {
  const total = React.useMemo(() => data.reduce((s, b) => s + b.value, 0), [data]);
  const fmt = (n: number) =>
    asCurrency ? formatUSD(n, { decimals: 0 }) : new Intl.NumberFormat("en-US").format(n);

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {data.length === 0 ? "—" : fmt(total)}
        </span>
      </div>
      {description && <p className="mb-2 text-[11px] text-muted-foreground">{description}</p>}

      {data.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
          No data for the selected period.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              stroke="hsl(var(--background))"
              strokeWidth={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: unknown) => fmt(typeof v === "number" ? v : Number(v) || 0)}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value, _entry, i) => {
                const v = data[i]?.value ?? 0;
                const pct = total > 0 ? Math.round((v / total) * 100) : 0;
                return `${value} · ${pct}%`;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
