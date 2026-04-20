import * as React from "react";
import { Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { computeEarnings } from "@/lib/earnings/calculate";
import { formatUSD } from "@/lib/utils";
import {
  DEAL_COMPONENT_LABELS,
  type DealComponent,
  type DealComponentType,
} from "@/types/deal";
import {
  CPMEditor,
  DailyLogEditor,
  FlatFeeEditor,
  PerPostEditor,
  PerStreamEditor,
  RevShareEditor,
  TieredBonusEditor,
  WeeklyCapEditor,
} from "./ComponentEditors";

interface Props {
  value: DealComponent[];
  onChange: (next: DealComponent[]) => void;
  commissionRate: number;
}

function empty(type: DealComponentType): DealComponent {
  switch (type) {
    case "flat_fee":
      return { type, amount: 0 };
    case "per_post":
      return { type, rate: 0, posts: 0 };
    case "per_stream":
      return { type, rate: 0, streams: 0 };
    case "rev_share":
      return { type, percent: 0, revenue: 0 };
    case "tiered_bonus":
      return { type, tiers: [{ threshold: 0, bonus: 0 }], metric: 0 };
    case "daily_log":
      return { type, ratePerDay: 0, days: 0 };
    case "weekly_cap":
      return { type, ratePerHour: 0, hours: 0, weeklyCap: 0 };
    case "cpm":
      return { type, rate: 0, impressions: 0 };
  }
}

export function DealStructureBuilder({ value, onChange, commissionRate }: Props) {
  const result = React.useMemo(
    () => computeEarnings(value, commissionRate),
    [value, commissionRate],
  );

  function update(idx: number, next: DealComponent) {
    onChange(value.map((c, i) => (i === idx ? next : c)));
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function add(type: DealComponentType) {
    onChange([...value, empty(type)]);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Deal structure</div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="mr-2 h-4 w-4" /> Add component
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(DEAL_COMPONENT_LABELS) as DealComponentType[]).map((t) => (
              <DropdownMenuItem key={t} onSelect={() => add(t)}>
                {DEAL_COMPONENT_LABELS[t]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {value.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No components yet. Add a flat fee, per-post rate, rev share, or any
          combination to build the deal.
        </div>
      ) : (
        <div className="space-y-3">
          {value.map((c, idx) => (
            <ComponentEditor
              key={idx}
              component={c}
              onChange={(next) => update(idx, next)}
              onRemove={() => remove(idx)}
            />
          ))}
        </div>
      )}

      <div className="rounded-md border bg-muted/40 p-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <Metric label="Gross earnings" value={result.gross} emphasis />
          <Metric
            label={`Recast commission (${commissionRate}%)`}
            value={result.commission}
            emphasis
          />
          <Metric label="Creator net" value={result.net} emphasis />
        </div>
        {result.breakdown.length > 0 && (
          <div className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
            {result.breakdown.map((b, i) => (
              <div key={i} className="flex justify-between">
                <span>
                  {b.label}
                  {b.detail ? ` · ${b.detail}` : ""}
                </span>
                <span>{formatUSD(b.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={emphasis ? "text-lg font-semibold" : "text-sm"}>
        {formatUSD(value)}
      </div>
    </div>
  );
}

function ComponentEditor({
  component,
  onChange,
  onRemove,
}: {
  component: DealComponent;
  onChange: (next: DealComponent) => void;
  onRemove: () => void;
}) {
  switch (component.type) {
    case "flat_fee":
      return <FlatFeeEditor value={component} onChange={onChange} onRemove={onRemove} />;
    case "per_post":
      return <PerPostEditor value={component} onChange={onChange} onRemove={onRemove} />;
    case "per_stream":
      return <PerStreamEditor value={component} onChange={onChange} onRemove={onRemove} />;
    case "rev_share":
      return <RevShareEditor value={component} onChange={onChange} onRemove={onRemove} />;
    case "tiered_bonus":
      return <TieredBonusEditor value={component} onChange={onChange} onRemove={onRemove} />;
    case "daily_log":
      return <DailyLogEditor value={component} onChange={onChange} onRemove={onRemove} />;
    case "weekly_cap":
      return <WeeklyCapEditor value={component} onChange={onChange} onRemove={onRemove} />;
    case "cpm":
      return <CPMEditor value={component} onChange={onChange} onRemove={onRemove} />;
  }
}
