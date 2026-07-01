import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Star,
  X,
} from "lucide-react";
import {
  useFetchTwitch30dCCV,
  useToggleStarred,
  useUpdateKick30dCCV,
  useUpdateTwitch30dCCV,
} from "@/hooks/useCreators";
import { CreatorDetailDialog } from "./CreatorDetail";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useSessionState } from "@/hooks/useSessionState";

export interface CreatorRow {
  id: string;
  name: string;
  twitch_handle: string | null;
  kick_handle: string | null;
  country: string | null;
  tier: string | null;
  status: string;
  signed: boolean;
  contract_terms: string | null;
  signed_at: string | null;
  category: string | null;
  socials: Record<string, string>;
  twitch_30d_ccv: number | null;
  kick_30d_ccv: number | null;
  ccv_fetched_at: string | null;
  starred?: boolean;
  outreach_status?: string | null;
  /** R5 follow-up: surfaced for "new this week" KPI tiles + the
   *  "days since signup" derived display on Leads. */
  created_at?: string | null;
  updated_at?: string | null;
}

export type SortField = "name" | "country" | "tier" | "category" | "status" | "ccv";
type SortDir = "asc" | "desc";

const ALL = "__all__";

const PLATFORM_ORDER = [
  "twitch",
  "kick",
  "instagram",
  "tiktok",
  "youtube",
  "twitter",
  "facebook",
  "snapchat",
  "threads",
  "discord",
  "whop",
];

const PLATFORM_LABELS: Record<string, string> = {
  twitch: "Twitch",
  kick: "Kick",
  instagram: "IG",
  tiktok: "TT",
  youtube: "YT",
  twitter: "X",
  facebook: "FB",
  snapchat: "SC",
  threads: "TH",
  discord: "DC",
  whop: "WP",
};

const PLATFORM_CLASS: Record<string, string> = {
  twitch: "bg-purple-100 text-purple-800 hover:bg-purple-200 dark:bg-purple-900/40 dark:text-purple-200",
  kick: "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-200",
  instagram: "bg-pink-100 text-pink-800 hover:bg-pink-200 dark:bg-pink-900/40 dark:text-pink-200",
  tiktok: "bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200",
  youtube: "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-200",
  twitter: "bg-sky-100 text-sky-800 hover:bg-sky-200 dark:bg-sky-900/40 dark:text-sky-200",
  facebook: "bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-200",
  snapchat: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-200",
  threads: "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200",
  discord: "bg-indigo-100 text-indigo-800 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200",
  whop: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200",
};

function resolveSocials(row: CreatorRow): Record<string, string> {
  const merged: Record<string, string> = { ...(row.socials ?? {}) };
  if (!merged.twitch && row.twitch_handle) {
    merged.twitch = `https://twitch.tv/${row.twitch_handle}`;
  }
  if (!merged.kick && row.kick_handle) {
    merged.kick = `https://kick.com/${row.kick_handle}`;
  }
  return merged;
}

function SocialsCell({ row }: { row: CreatorRow }) {
  const socials = resolveSocials(row);
  const known = PLATFORM_ORDER.filter((p) => socials[p]);
  const extra = Object.keys(socials).filter((k) => !PLATFORM_ORDER.includes(k));
  const all = [...known, ...extra];

  if (all.length === 0) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {all.map((p) => {
        const url = socials[p];
        const label = PLATFORM_LABELS[p] ?? p;
        const cls = PLATFORM_CLASS[p] ?? "bg-muted text-muted-foreground hover:bg-muted-foreground/20";
        return (
          <a
            key={p}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={`${p[0].toUpperCase()}${p.slice(1)} · ${url}`}
            className={cn(
              "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
              cls,
            )}
          >
            {label}
            <ExternalLink className="h-2.5 w-2.5 opacity-60" />
          </a>
        );
      })}
    </div>
  );
}

export type HideableColumn = "country" | "tier" | "status" | "category";

interface Props {
  rows: CreatorRow[] | undefined;
  isLoading: boolean;
  error: Error | null;
  emptyTitle: string;
  emptyHint?: string;
  noMatchesText?: string;
  /**
   * Extra columns rendered between the canonical columns and the
   * rowAction slot. R5 follow-up: switched from a single column to
   * an array so the Roster page can render contract terms + YTD
   * earnings side-by-side. Accepts a single object too for
   * backwards-compat with old callers.
   */
  extraColumn?:
    | {
        header: string;
        render: (row: CreatorRow) => React.ReactNode;
      }
    | Array<{
        header: string;
        render: (row: CreatorRow) => React.ReactNode;
      }>;
  rowAction?: (row: CreatorRow) => React.ReactNode;
  toolbarExtras?: React.ReactNode;
  hideColumns?: HideableColumn[];
  showCCV?: boolean;
  canEdit?: boolean;
  showPlatformFilter?: boolean;
  showAdvancedFilters?: boolean;
  showStar?: boolean;
  defaultSort?: { field: SortField; dir: SortDir };
  selection?: {
    selected: Set<string>;
    onChange: (next: Set<string>) => void;
  };
  /** Round-1 efficiency (friction audit #23): when set, search +
   *  filter picks persist in sessionStorage under this key, so
   *  navigating to a profile and back doesn't wipe them. Each page
   *  passes its own key ("leads" / "roster" / "potential") so the
   *  three lists don't bleed filters into each other. */
  stateKey?: string;
}

type PlatformFilter =
  | "any"
  | "twitch"
  | "kick"
  | "both"
  | "twitter"
  | "instagram"
  | "tiktok"
  | "youtube";

type RegionTier = "any" | "t1" | "t2" | "t3";

const TIER_COUNTRIES: Record<Exclude<RegionTier, "any">, string[]> = {
  t1: ["USA", "UK", "Canada", "Australia", "New Zealand", "Ireland", "South Africa"],
  t2: [
    "Germany",
    "France",
    "Netherlands",
    "Sweden",
    "Denmark",
    "Norway",
    "Finland",
    "Belgium",
    "Switzerland",
    "Austria",
    "Italy",
    "Spain",
    "Portugal",
    "Greece",
    "Japan",
    "South Korea",
    "Singapore",
    "Hong Kong",
    "Taiwan",
    "Israel",
    "UAE",
    "Qatar",
  ],
  t3: [
    "Brazil",
    "Mexico",
    "Argentina",
    "Colombia",
    "Peru",
    "Poland",
    "Czech Republic",
    "Romania",
    "Hungary",
    "Turkey",
    "Russia",
    "Ukraine",
    "Egypt",
    "Saudi Arabia",
    "Morocco",
    "India",
    "Indonesia",
    "Malaysia",
    "Thailand",
    "Philippines",
    "Vietnam",
    "Nigeria",
  ],
};

export function CreatorTable({
  rows,
  isLoading,
  error,
  emptyTitle,
  emptyHint,
  noMatchesText = "No creators match the current filters.",
  extraColumn,
  rowAction,
  toolbarExtras,
  hideColumns = [],
  showCCV = false,
  canEdit = true,
  showPlatformFilter = false,
  showAdvancedFilters = false,
  showStar = false,
  selection,
  defaultSort,
  stateKey,
}: Props) {
  const selected = selection?.selected;
  const onSelectionChange = selection?.onChange;
  const showCheckboxes = !!selection;

  function toggleOne(id: string, checked: boolean) {
    if (!selected || !onSelectionChange) return;
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectionChange(next);
  }
  const hide = new Set(hideColumns);
  const showCountry = !hide.has("country");
  const showTier = !hide.has("tier");
  const showStatus = !hide.has("status");
  const showCategory = !hide.has("category");
  // Search + filters persist per-page via sessionStorage when the
  // caller passes stateKey (audit #23 — filters used to wipe on any
  // navigation away). Sort + detail selection stay ephemeral.
  const sk = (suffix: string) => (stateKey ? `recast.${stateKey}.${suffix}` : null);
  const [search, setSearch] = useSessionState(sk("search"), "");
  const [categoryFilter, setCategoryFilter] = useSessionState(sk("category"), ALL);
  const [tierFilter, setTierFilter] = useSessionState(sk("tier"), ALL);
  const [countryFilter, setCountryFilter] = useSessionState(sk("country"), ALL);
  const [statusFilter, setStatusFilter] = useSessionState(sk("status"), ALL);
  const [platformFilter, setPlatformFilter] = useSessionState<PlatformFilter>(sk("platform"), "any");
  const [regionTier, setRegionTier] = useSessionState<RegionTier>(sk("regionTier"), "any");
  const [ccvMin, setCcvMin] = useSessionState<string>(sk("ccvMin"), "");
  const [casinoFilter, setCasinoFilter] = useSessionState<"any" | "yes" | "no">(sk("casino"), "any");
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const { role } = useAuth();
  const [sortField, setSortField] = React.useState<SortField>(
    defaultSort?.field ?? "name",
  );
  const [sortDir, setSortDir] = React.useState<SortDir>(defaultSort?.dir ?? "asc");

  const categories = React.useMemo(
    () => uniq((rows ?? []).map((c) => c.category)),
    [rows],
  );
  const tiers = React.useMemo(() => uniq((rows ?? []).map((c) => c.tier)), [rows]);
  const countries = React.useMemo(() => uniq((rows ?? []).map((c) => c.country)), [rows]);
  const statuses = React.useMemo(() => uniq((rows ?? []).map((c) => c.status)), [rows]);

  const filtersActive =
    search.trim() !== "" ||
    categoryFilter !== ALL ||
    tierFilter !== ALL ||
    countryFilter !== ALL ||
    statusFilter !== ALL ||
    platformFilter !== "any" ||
    regionTier !== "any" ||
    ccvMin !== "" ||
    casinoFilter !== "any";

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = (rows ?? []).filter((c) => {
      if (categoryFilter !== ALL && c.category !== categoryFilter) return false;
      if (tierFilter !== ALL && c.tier !== tierFilter) return false;
      if (countryFilter !== ALL && c.country !== countryFilter) return false;
      if (statusFilter !== ALL && c.status !== statusFilter) return false;
      if (regionTier !== "any") {
        const countries = TIER_COUNTRIES[regionTier];
        if (!c.country || !countries.includes(c.country)) return false;
      }
      if (ccvMin !== "") {
        const n = Number(ccvMin);
        if (Number.isFinite(n) && n > 0) {
          const best = Math.max(c.twitch_30d_ccv ?? 0, c.kick_30d_ccv ?? 0);
          if (best < n) return false;
        }
      }
      if (casinoFilter !== "any") {
        const cat = (c.category ?? "").toLowerCase();
        const isCasino =
          cat.includes("slot") ||
          cat.includes("casino") ||
          cat.includes("gambl");
        if (casinoFilter === "yes" && !isCasino) return false;
        if (casinoFilter === "no" && isCasino) return false;
      }
      if (platformFilter !== "any") {
        const hasTwitch = !!c.twitch_handle;
        const hasKick = !!c.kick_handle;
        const socials = c.socials ?? {};
        switch (platformFilter) {
          case "twitch":
            if (!hasTwitch) return false;
            break;
          case "kick":
            if (!hasKick) return false;
            break;
          case "both":
            if (!(hasTwitch && hasKick)) return false;
            break;
          case "twitter":
            if (!socials.twitter) return false;
            break;
          case "instagram":
            if (!socials.instagram) return false;
            break;
          case "tiktok":
            if (!socials.tiktok) return false;
            break;
          case "youtube":
            if (!socials.youtube) return false;
            break;
        }
      }
      if (q) {
        const hay = [c.name, c.twitch_handle, c.kick_handle, ...Object.keys(c.socials ?? {})]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    out = [...out].sort((a, b) => {
      if (sortField === "ccv") {
        const av = Math.max(a.twitch_30d_ccv ?? 0, a.kick_30d_ccv ?? 0);
        const bv = Math.max(b.twitch_30d_ccv ?? 0, b.kick_30d_ccv ?? 0);
        const cmp = av - bv;
        return sortDir === "asc" ? cmp : -cmp;
      }
      const av = (a as unknown as Record<string, unknown>)[sortField] ?? "";
      const bv = (b as unknown as Record<string, unknown>)[sortField] ?? "";
      const cmp = String(av).localeCompare(String(bv), undefined, {
        sensitivity: "base",
        numeric: true,
      });
      return sortDir === "asc" ? cmp : -cmp;
    });

    return out;
  }, [
    rows,
    search,
    categoryFilter,
    tierFilter,
    countryFilter,
    statusFilter,
    platformFilter,
    regionTier,
    ccvMin,
    casinoFilter,
    sortField,
    sortDir,
  ]);

  function toggleSort(field: SortField) {
    if (sortField !== field) {
      setSortField(field);
      setSortDir("asc");
    } else {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  }

  function clearFilters() {
    setSearch("");
    setCategoryFilter(ALL);
    setTierFilter(ALL);
    setCountryFilter(ALL);
    setStatusFilter(ALL);
    setPlatformFilter("any");
    setRegionTier("any");
    setCcvMin("");
    setCasinoFilter("any");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, handle, platform…"
            className="h-9 pl-8"
          />
        </div>
        {showPlatformFilter && (
          <Select
            value={platformFilter}
            onValueChange={(v) => setPlatformFilter(v as PlatformFilter)}
          >
            <SelectTrigger className="h-9 w-[170px] text-sm">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any platform</SelectItem>
              <SelectItem value="twitch">Has Twitch</SelectItem>
              <SelectItem value="kick">Has Kick</SelectItem>
              <SelectItem value="both">Has Twitch + Kick</SelectItem>
              <SelectItem value="twitter">Has Twitter</SelectItem>
              <SelectItem value="instagram">Has Instagram</SelectItem>
              <SelectItem value="tiktok">Has TikTok</SelectItem>
              <SelectItem value="youtube">Has YouTube</SelectItem>
            </SelectContent>
          </Select>
        )}
        {showAdvancedFilters && (
          <>
            <Select
              value={regionTier}
              onValueChange={(v) => setRegionTier(v as RegionTier)}
            >
              <SelectTrigger className="h-9 w-[150px] text-sm">
                <SelectValue placeholder="Region tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All regions</SelectItem>
                <SelectItem value="t1">T1 — English core</SelectItem>
                <SelectItem value="t2">T2 — Western EU + Asia</SelectItem>
                <SelectItem value="t3">T3 — LATAM/EE/MENA/SEA</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              placeholder="Min CCV"
              value={ccvMin}
              onChange={(e) => setCcvMin(e.target.value)}
              className="h-9 w-[110px] text-sm"
            />
            <Select
              value={casinoFilter}
              onValueChange={(v) => setCasinoFilter(v as "any" | "yes" | "no")}
            >
              <SelectTrigger className="h-9 w-[140px] text-sm">
                <SelectValue placeholder="Casino" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any category</SelectItem>
                <SelectItem value="yes">Casino / Slots only</SelectItem>
                <SelectItem value="no">Exclude casino</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
        {showCategory && categories.length > 0 && (
          <FilterSelect
            label="Category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={categories}
          />
        )}
        {showTier && (
          <FilterSelect label="Tier" value={tierFilter} onChange={setTierFilter} options={tiers} />
        )}
        {showCountry && (
          <FilterSelect
            label="Country"
            value={countryFilter}
            onChange={setCountryFilter}
            options={countries}
          />
        )}
        {showStatus && (
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={statuses}
          />
        )}
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        )}
        <div className="text-xs text-muted-foreground tabular-nums">
          {rows ? (
            <>
              Showing <strong>{filtered.length}</strong> of {rows.length}
            </>
          ) : null}
        </div>
        {toolbarExtras && <div className="ml-auto">{toolbarExtras}</div>}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : error ? (
        <div className="text-sm text-destructive">{error.message}</div>
      ) : rows && rows.length > 0 ? (
        filtered.length > 0 ? (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  {showCheckboxes && (
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={
                          filtered.length > 0 &&
                          filtered.every((c) => selected?.has(c.id))
                        }
                        onChange={(e) => {
                          if (!onSelectionChange) return;
                          const next = new Set(selected);
                          if (e.target.checked) {
                            filtered.forEach((c) => next.add(c.id));
                          } else {
                            filtered.forEach((c) => next.delete(c.id));
                          }
                          onSelectionChange(next);
                        }}
                      />
                    </TableHead>
                  )}
                  {showStar && <TableHead className="w-8" />}
                  <SortableHead field="name" current={sortField} dir={sortDir} onClick={toggleSort}>
                    Name
                  </SortableHead>
                  {showCategory && (
                    <SortableHead
                      field="category"
                      current={sortField}
                      dir={sortDir}
                      onClick={toggleSort}
                    >
                      Category
                    </SortableHead>
                  )}
                  <TableHead>Socials</TableHead>
                  {showCCV && (
                    <SortableHead
                      field="ccv"
                      current={sortField}
                      dir={sortDir}
                      onClick={toggleSort}
                    >
                      30d CCV
                    </SortableHead>
                  )}
                  {showCountry && (
                    <SortableHead
                      field="country"
                      current={sortField}
                      dir={sortDir}
                      onClick={toggleSort}
                    >
                      Country
                    </SortableHead>
                  )}
                  {showTier && (
                    <SortableHead
                      field="tier"
                      current={sortField}
                      dir={sortDir}
                      onClick={toggleSort}
                    >
                      Tier
                    </SortableHead>
                  )}
                  {showStatus && (
                    <SortableHead
                      field="status"
                      current={sortField}
                      dir={sortDir}
                      onClick={toggleSort}
                    >
                      Status
                    </SortableHead>
                  )}
                  {extraColumn
                    ? (Array.isArray(extraColumn) ? extraColumn : [extraColumn]).map(
                        (col, i) => <TableHead key={i}>{col.header}</TableHead>,
                      )
                    : null}
                  {rowAction && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    {showCheckboxes && (
                      <TableCell className="w-8">
                        <input
                          type="checkbox"
                          aria-label={`Select ${c.name}`}
                          checked={!!selected?.has(c.id)}
                          onChange={(e) => toggleOne(c.id, e.target.checked)}
                        />
                      </TableCell>
                    )}
                    {showStar && (
                      <TableCell className="w-8">
                        <StarButton row={c} canEdit={canEdit} />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      <button
                        type="button"
                        onClick={() => setDetailId(c.id)}
                        className="text-left hover:text-primary hover:underline"
                      >
                        {c.name}
                      </button>
                    </TableCell>
                    {showCategory && (
                      <TableCell className="text-xs text-muted-foreground">
                        {c.category ?? "—"}
                      </TableCell>
                    )}
                    <TableCell>
                      <SocialsCell row={c} />
                    </TableCell>
                    {showCCV && (
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {c.twitch_handle && (
                            <TwitchCCVCell row={c} canEdit={canEdit} />
                          )}
                          {c.kick_handle && (
                            <KickCCVCell row={c} canEdit={canEdit} />
                          )}
                          {!c.twitch_handle && !c.kick_handle && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {showCountry && <TableCell>{c.country ?? "—"}</TableCell>}
                    {showTier && <TableCell>{c.tier ?? "—"}</TableCell>}
                    {showStatus && <TableCell>{c.status}</TableCell>}
                    {extraColumn
                      ? (Array.isArray(extraColumn) ? extraColumn : [extraColumn]).map(
                          (col, i) => (
                            <TableCell key={i}>{col.render(c)}</TableCell>
                          ),
                        )
                      : null}
                    {rowAction && (
                      <TableCell className="text-right">{rowAction(c)}</TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
            {noMatchesText}
          </div>
        )
      ) : (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
          <div className="font-medium text-foreground">{emptyTitle}</div>
          {emptyHint && <div className="mt-1">{emptyHint}</div>}
        </div>
      )}

      <CreatorDetailDialog
        creatorId={detailId}
        open={!!detailId}
        onOpenChange={(o) => !o && setDetailId(null)}
        role={role}
      />
    </div>
  );
}

function SortableHead({
  field,
  current,
  dir,
  onClick,
  children,
}: {
  field: SortField;
  current: SortField;
  dir: SortDir;
  onClick: (f: SortField) => void;
  children: React.ReactNode;
}) {
  const active = current === field;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onClick(field)}
        className={cn(
          "flex items-center gap-1 text-left hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {children}
        <Icon className="h-3 w-3" />
      </button>
    </TableHead>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[160px] text-sm">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {label.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function uniq(arr: (string | null)[]): string[] {
  const set = new Set<string>();
  for (const v of arr) {
    if (v != null && v.trim() !== "") set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export { PLATFORM_ORDER, PLATFORM_LABELS };

function StarButton({ row, canEdit }: { row: CreatorRow; canEdit: boolean }) {
  const toggle = useToggleStarred();
  const starred = !!row.starred;
  return (
    <button
      type="button"
      disabled={!canEdit || toggle.isPending}
      onClick={() => toggle.mutate({ id: row.id, starred: !starred })}
      title={starred ? "Remove from Potential" : "Add to Potential"}
      className={cn(
        "rounded p-1 transition-colors",
        starred
          ? "text-amber-500 hover:text-amber-600"
          : "text-muted-foreground hover:text-foreground",
        !canEdit && "cursor-default",
      )}
    >
      <Star className={cn("h-4 w-4", starred && "fill-current")} />
    </button>
  );
}

function CCVChip({
  value,
  platform,
}: {
  value: number | null;
  platform: "twitch" | "kick";
}) {
  const color =
    platform === "twitch"
      ? "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200"
      : "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
  if (value == null) {
    return (
      <span className="inline-flex items-center rounded-md border border-dashed border-muted-foreground/30 px-2 py-0.5 text-[11px] text-muted-foreground">
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        color,
      )}
    >
      {value.toLocaleString()}
    </span>
  );
}

function EditInput({
  initial,
  onSave,
  onCancel,
}: {
  initial: number | null;
  onSave: (v: number | null) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = React.useState(initial != null ? String(initial) : "");

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === "") return onSave(null);
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return onSave(null);
    onSave(Math.max(0, Math.round(n)));
  }

  return (
    <input
      autoFocus
      type="number"
      min={0}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") onCancel();
      }}
      className="h-6 w-20 rounded border bg-background px-1 text-xs tabular-nums"
    />
  );
}

function TwitchCCVCell({ row, canEdit }: { row: CreatorRow; canEdit: boolean }) {
  const fetcher = useFetchTwitch30dCCV();
  const updater = useUpdateTwitch30dCCV();
  const handle = row.twitch_handle;
  const [editing, setEditing] = React.useState(false);

  if (!handle) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      {editing && canEdit ? (
        <EditInput
          initial={row.twitch_30d_ccv}
          onSave={(v) => {
            updater.mutate({ id: row.id, ccv: v, name: row.name });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <CCVChip value={row.twitch_30d_ccv} platform="twitch" />
      )}
      {canEdit && !editing && (
        <>
          <button
            type="button"
            title="Fetch 30-day avg from TwitchTracker"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            disabled={fetcher.isPending}
            onClick={() => fetcher.mutate({ id: row.id, handle, name: row.name })}
          >
            {fetcher.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </button>
          <button
            type="button"
            title="Edit manually"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3 w-3" />
          </button>
        </>
      )}
      <a
        href={`https://streamscharts.com/channels/${encodeURIComponent(handle)}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Look up on StreamCharts"
        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function KickCCVCell({ row, canEdit }: { row: CreatorRow; canEdit: boolean }) {
  const update = useUpdateKick30dCCV();
  const handle = row.kick_handle;
  const [editing, setEditing] = React.useState(false);

  if (!handle) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      {editing && canEdit ? (
        <EditInput
          initial={row.kick_30d_ccv}
          onSave={(v) => {
            update.mutate({ id: row.id, ccv: v, name: row.name });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <CCVChip value={row.kick_30d_ccv} platform="kick" />
      )}
      {canEdit && !editing && (
        <button
          type="button"
          title="Edit manually"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
      <a
        href={`https://streamscharts.com/channels/${encodeURIComponent(handle)}?platform=kick`}
        target="_blank"
        rel="noopener noreferrer"
        title="Look up on StreamCharts"
        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

export { CCVChip };
