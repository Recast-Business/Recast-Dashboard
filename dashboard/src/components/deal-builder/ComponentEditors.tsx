import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  CPMComponent,
  DailyLogComponent,
  DealComponent,
  FlatFeeComponent,
  PerPostComponent,
  PerStreamComponent,
  RevShareComponent,
  TieredBonusComponent,
  WeeklyCapComponent,
} from "@/types/deal";
import { DEAL_COMPONENT_LABELS } from "@/types/deal";

interface BaseProps<T extends DealComponent> {
  value: T;
  onChange: (next: T) => void;
  onRemove: () => void;
}

function Shell({
  label,
  onRemove,
  children,
}: {
  label: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">{label}</div>
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function num(e: React.ChangeEvent<HTMLInputElement>): number {
  return e.target.value === "" ? 0 : Number(e.target.value);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function FlatFeeEditor({ value, onChange, onRemove }: BaseProps<FlatFeeComponent>) {
  return (
    <Shell label={DEAL_COMPONENT_LABELS.flat_fee} onRemove={onRemove}>
      <Field label="Amount (USD)">
        <Input
          type="number"
          min={0}
          value={value.amount || ""}
          onChange={(e) => onChange({ ...value, amount: num(e) })}
        />
      </Field>
    </Shell>
  );
}

export function PerPostEditor({ value, onChange, onRemove }: BaseProps<PerPostComponent>) {
  return (
    <Shell label={DEAL_COMPONENT_LABELS.per_post} onRemove={onRemove}>
      <Field label="Rate per post">
        <Input
          type="number"
          min={0}
          value={value.rate || ""}
          onChange={(e) => onChange({ ...value, rate: num(e) })}
        />
      </Field>
      <Field label="Posts">
        <Input
          type="number"
          min={0}
          value={value.posts || ""}
          onChange={(e) => onChange({ ...value, posts: num(e) })}
        />
      </Field>
    </Shell>
  );
}

export function PerStreamEditor({ value, onChange, onRemove }: BaseProps<PerStreamComponent>) {
  return (
    <Shell label={DEAL_COMPONENT_LABELS.per_stream} onRemove={onRemove}>
      <Field label="Rate per stream">
        <Input
          type="number"
          min={0}
          value={value.rate || ""}
          onChange={(e) => onChange({ ...value, rate: num(e) })}
        />
      </Field>
      <Field label="Streams">
        <Input
          type="number"
          min={0}
          value={value.streams || ""}
          onChange={(e) => onChange({ ...value, streams: num(e) })}
        />
      </Field>
    </Shell>
  );
}

export function RevShareEditor({ value, onChange, onRemove }: BaseProps<RevShareComponent>) {
  return (
    <Shell label={DEAL_COMPONENT_LABELS.rev_share} onRemove={onRemove}>
      <Field label="Share (%)">
        <Input
          type="number"
          min={0}
          max={100}
          value={value.percent || ""}
          onChange={(e) => onChange({ ...value, percent: num(e) })}
        />
      </Field>
      <Field label="Revenue">
        <Input
          type="number"
          min={0}
          value={value.revenue || ""}
          onChange={(e) => onChange({ ...value, revenue: num(e) })}
        />
      </Field>
      <Field label="Min guarantee (optional)">
        <Input
          type="number"
          min={0}
          value={value.minGuarantee ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              minGuarantee: e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
        />
      </Field>
    </Shell>
  );
}

export function TieredBonusEditor({
  value,
  onChange,
  onRemove,
}: BaseProps<TieredBonusComponent>) {
  function update(idx: number, patch: Partial<{ threshold: number; bonus: number }>) {
    const tiers = value.tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    onChange({ ...value, tiers });
  }
  function addTier() {
    onChange({
      ...value,
      tiers: [...value.tiers, { threshold: 0, bonus: 0 }],
    });
  }
  function removeTier(idx: number) {
    onChange({ ...value, tiers: value.tiers.filter((_, i) => i !== idx) });
  }
  return (
    <Shell label={DEAL_COMPONENT_LABELS.tiered_bonus} onRemove={onRemove}>
      <Field label="Metric (current)">
        <Input
          type="number"
          min={0}
          value={value.metric || ""}
          onChange={(e) => onChange({ ...value, metric: num(e) })}
        />
      </Field>
      <Field label="Mode">
        <select
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={value.mode ?? "highest"}
          onChange={(e) =>
            onChange({
              ...value,
              mode: e.target.value as "highest" | "cumulative",
            })
          }
        >
          <option value="highest">Highest hit</option>
          <option value="cumulative">Cumulative</option>
        </select>
      </Field>
      <div className="col-span-2 space-y-2">
        <Label className="text-xs text-muted-foreground">Tiers</Label>
        {value.tiers.map((tier, idx) => (
          <div key={idx} className="flex items-end gap-2">
            <Field label="≥ Threshold">
              <Input
                type="number"
                min={0}
                value={tier.threshold || ""}
                onChange={(e) => update(idx, { threshold: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Bonus">
              <Input
                type="number"
                min={0}
                value={tier.bonus || ""}
                onChange={(e) => update(idx, { bonus: Number(e.target.value) || 0 })}
              />
            </Field>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeTier(idx)}
              aria-label="Remove tier"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addTier}>
          Add tier
        </Button>
      </div>
    </Shell>
  );
}

export function DailyLogEditor({ value, onChange, onRemove }: BaseProps<DailyLogComponent>) {
  return (
    <Shell label={DEAL_COMPONENT_LABELS.daily_log} onRemove={onRemove}>
      <Field label="Rate per day">
        <Input
          type="number"
          min={0}
          value={value.ratePerDay || ""}
          onChange={(e) => onChange({ ...value, ratePerDay: num(e) })}
        />
      </Field>
      <Field label="Days">
        <Input
          type="number"
          min={0}
          value={value.days || ""}
          onChange={(e) => onChange({ ...value, days: num(e) })}
        />
      </Field>
    </Shell>
  );
}

export function WeeklyCapEditor({ value, onChange, onRemove }: BaseProps<WeeklyCapComponent>) {
  return (
    <Shell label={DEAL_COMPONENT_LABELS.weekly_cap} onRemove={onRemove}>
      <Field label="Rate per hour">
        <Input
          type="number"
          min={0}
          value={value.ratePerHour || ""}
          onChange={(e) => onChange({ ...value, ratePerHour: num(e) })}
        />
      </Field>
      <Field label="Hours this week">
        <Input
          type="number"
          min={0}
          value={value.hours || ""}
          onChange={(e) => onChange({ ...value, hours: num(e) })}
        />
      </Field>
      <Field label="Weekly cap">
        <Input
          type="number"
          min={0}
          value={value.weeklyCap || ""}
          onChange={(e) => onChange({ ...value, weeklyCap: num(e) })}
        />
      </Field>
      <Field label="Prior rollover">
        <Input
          type="number"
          min={0}
          value={value.priorRollover ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              priorRollover: e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
        />
      </Field>
    </Shell>
  );
}

export function CPMEditor({ value, onChange, onRemove }: BaseProps<CPMComponent>) {
  return (
    <Shell label={DEAL_COMPONENT_LABELS.cpm} onRemove={onRemove}>
      <Field label="Rate per 1k impressions">
        <Input
          type="number"
          min={0}
          value={value.rate || ""}
          onChange={(e) => onChange({ ...value, rate: num(e) })}
        />
      </Field>
      <Field label="Impressions">
        <Input
          type="number"
          min={0}
          value={value.impressions || ""}
          onChange={(e) => onChange({ ...value, impressions: num(e) })}
        />
      </Field>
    </Shell>
  );
}
