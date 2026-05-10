import * as React from "react";
import {
  CircleDot,
  ExternalLink,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/apiFetch";
import { useAuth } from "@/auth/AuthProvider";
import { useConfirm } from "@/hooks/useConfirm";

type Platform = "" | "twitch" | "kick";

const CATEGORIES = [
  "Battle Royale",
  "FPS / Shooter",
  "MOBA / Strategy",
  "RPG / Souls-Like",
  "MMO / RP",
  "Gacha / Anime",
  "Minecraft / Sandbox",
  "Sports / Esports",
  "Fighting Games",
  "Just Chatting",
  "IRL / Lifestyle",
  "Slots / Casino",
  "Talk / Podcast",
  "Creative / Art",
  "VTuber",
  "Variety / Gaming",
];

const LANGUAGES = [
  "English",
  "Spanish",
  "Portuguese",
  "French",
  "German",
  "Italian",
  "Dutch",
  "Polish",
  "Russian",
  "Turkish",
  "Arabic",
  "Korean",
  "Japanese",
  "Chinese",
  "Thai",
  "Vietnamese",
  "Filipino",
  "Indonesian",
  "Hindi",
];

const INTERVAL_OPTIONS = [
  { label: "Continuous (2s)", value: 2 },
  { label: "30 seconds", value: 30 },
  { label: "1 minute", value: 60 },
  { label: "5 minutes", value: 300 },
  { label: "10 minutes", value: 600 },
  { label: "30 minutes", value: 1800 },
];

interface ScoutResult {
  name: string;
  handle: string;
  platform: "twitch" | "Twitch" | "kick" | "Kick";
  ccv: number;
  country?: string | null;
  language?: string | null;
  content?: string | null;
  twitter?: string | null;
  instagram?: string | null;
  source?: string | null;
  inRoster?: boolean;
}

interface ScoutParams {
  platform: Platform;
  category: string;
  ccvMin: number;
  ccvMax: number;
  languages: string[];
  excluded: string[];
  limit: number;
  quick?: boolean;
}

async function runScout(params: ScoutParams): Promise<ScoutResult[]> {
  const res = await apiFetch(`/api/scout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Scout API ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.results ?? []) as ScoutResult[];
}

function normalizePlatform(p: ScoutResult["platform"]): "twitch" | "kick" {
  return String(p).toLowerCase() === "kick" ? "kick" : "twitch";
}

function resultKey(r: ScoutResult): string {
  return `${normalizePlatform(r.platform)}:${r.handle.toLowerCase()}`;
}

export function ScoutPage() {
  const { role } = useAuth();
  const confirm = useConfirm();
  const isAdmin = role === "admin";

  // Form state
  const [platform, setPlatform] = React.useState<Platform>("");
  const [category, setCategory] = React.useState<string>(CATEGORIES[0]);
  const [ccvMin, setCcvMin] = React.useState("100");
  const [ccvMax, setCcvMax] = React.useState("5000");
  const [languages, setLanguages] = React.useState<string[]>(["English"]);
  const [limit, setLimit] = React.useState("300");
  const [quick, setQuick] = React.useState(false);

  // Results
  const [results, setResults] = React.useState<ScoutResult[]>([]);
  const [running, setRunning] = React.useState(false);
  const [lastRunAt, setLastRunAt] = React.useState<Date | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Auto-scout
  const [autoOn, setAutoOn] = React.useState(false);
  const [autoInterval, setAutoInterval] = React.useState(60);
  const [autoRuns, setAutoRuns] = React.useState(0);
  const autoTimer = React.useRef<number | null>(null);

  // Selection + bulk actions
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [exporting, setExporting] = React.useState(false);
  const [dedupe, setDedupe] = React.useState(false);
  const [scraping, setScraping] = React.useState(false);

  const paramsRef = React.useRef<ScoutParams>({
    platform,
    category,
    ccvMin: 0,
    ccvMax: 0,
    languages,
    excluded: [],
    limit: 300,
  });

  React.useEffect(() => {
    paramsRef.current = {
      platform,
      category,
      ccvMin: Number(ccvMin) || 0,
      ccvMax: Number(ccvMax) || 0,
      languages,
      excluded: [],
      limit: Math.max(1, Math.min(Number(limit) || 300, 500)),
      quick,
    };
  }, [platform, category, ccvMin, ccvMax, languages, limit, quick]);

  const doScout = React.useCallback(
    async (merge = false) => {
      if (running) return;
      setRunning(true);
      setError(null);
      try {
        const next = await runScout(paramsRef.current);
        if (merge) {
          setResults((prev) => {
            const seen = new Map(prev.map((r) => [resultKey(r), r]));
            for (const r of next) {
              const key = resultKey(r);
              if (!seen.has(key)) seen.set(key, r);
            }
            return [...seen.values()].sort((a, b) => b.ccv - a.ccv);
          });
        } else {
          setResults([...next].sort((a, b) => b.ccv - a.ccv));
        }
        setLastRunAt(new Date());
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setRunning(false);
      }
    },
    [running],
  );

  // Auto-scout timer
  React.useEffect(() => {
    if (!autoOn) {
      if (autoTimer.current) {
        window.clearInterval(autoTimer.current);
        autoTimer.current = null;
      }
      return;
    }
    doScout(true).then(() => setAutoRuns((r) => r + 1));
    autoTimer.current = window.setInterval(() => {
      doScout(true).then(() => setAutoRuns((r) => r + 1));
    }, autoInterval * 1000);
    return () => {
      if (autoTimer.current) {
        window.clearInterval(autoTimer.current);
        autoTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOn, autoInterval]);

  function toggleLanguage(lang: string) {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  }

  function clearResults() {
    setResults([]);
    setAutoRuns(0);
    setSelected(new Set());
  }

  function toggleSelect(key: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function onExportSelected() {
    if (!selected.size) return;
    const picks = results.filter((r) => selected.has(resultKey(r)));
    if (!picks.length) return;
    const ok = await confirm({
      title: `Add ${picks.length} ${picks.length === 1 ? "creator" : "creators"} to Leads?`,
      description: "They'll land in the dashboard Leads table and append to the master Google Sheet.",
      confirmLabel: "Add to Leads",
    });
    if (!ok) return;

    setExporting(true);
    try {
      // Insert into Supabase — one at a time so unique-handle collisions don't stop the batch.
      let added = 0;
      let skipped = 0;
      for (const r of picks) {
        const plat = normalizePlatform(r.platform);
        const payload = {
          name: r.name,
          signed: false,
          twitch_handle: plat === "twitch" ? r.handle : null,
          kick_handle: plat === "kick" ? r.handle : null,
          twitter: r.twitter ?? null,
          instagram: r.instagram ?? null,
          country: r.country ?? null,
          socials: {
            [plat]:
              plat === "twitch"
                ? `https://twitch.tv/${r.handle}`
                : `https://kick.com/${r.handle}`,
            ...(r.twitter
              ? {
                  twitter: r.twitter.startsWith("http")
                    ? r.twitter
                    : `https://x.com/${r.twitter}`,
                }
              : {}),
            ...(r.instagram
              ? {
                  instagram: r.instagram.startsWith("http")
                    ? r.instagram
                    : `https://instagram.com/${r.instagram}`,
                }
              : {}),
          },
        };
        const { error } = await supabase.from("creators").insert(payload);
        if (error) {
          // Unique constraint violations = already in Leads/Roster; that's fine.
          skipped++;
        } else {
          added++;
        }
      }

      // Also push to the master Google Sheet via /api/export_to_roster.
      let sheetAdded = 0;
      try {
        const res = await apiFetch("/api/export_to_roster", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creators: picks.map((r) => ({
              name: r.name,
              platform: normalizePlatform(r.platform),
              handle: r.handle,
              ccv: r.ccv,
              country: r.country ?? "",
              content: r.content ?? "",
              twitter: r.twitter ?? "",
              instagram: r.instagram ?? "",
              language: r.language ?? "",
            })),
          }),
        });
        const data = await res.json();
        sheetAdded = data?.added ?? 0;
      } catch {
        /* sheet errors are non-fatal */
      }

      toast.success("Export complete", {
        description: `Added ${added} to Leads (skipped ${skipped} duplicates). ${sheetAdded} new in sheet.`,
      });
      setSelected(new Set());
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  async function onRemoveDuplicates() {
    const ok = await confirm({
      title: "Remove duplicate rows?",
      description: "Scans the master Google Sheet and removes rows with duplicate Twitch/Kick handles. Keeps the oldest of each.",
      confirmLabel: "Remove duplicates",
    });
    if (!ok) return;
    setDedupe(true);
    try {
      const res = await apiFetch("/api/remove_duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      toast.success(
        `Removed ${data?.removed ?? 0} duplicate row${data?.removed === 1 ? "" : "s"}`,
      );
    } catch (e) {
      toast.error(`Remove duplicates failed: ${(e as Error).message}`);
    } finally {
      setDedupe(false);
    }
  }

  async function onScrapeSocials() {
    const picks = selected.size
      ? results.filter((r) => selected.has(resultKey(r)))
      : results;
    const twitchOnly = picks.filter(
      (r) => normalizePlatform(r.platform) === "twitch",
    );
    if (!twitchOnly.length) {
      toast.info("Scrape Socials only works on Twitch handles. Select some first.");
      return;
    }
    const ok = await confirm({
      title: `Scrape socials for ${twitchOnly.length} ${twitchOnly.length === 1 ? "creator" : "creators"}?`,
      description: "Pulls Twitter/Instagram handles from Twitch panel descriptions. Takes 1-2 seconds per creator.",
      confirmLabel: "Scrape",
    });
    if (!ok) return;
    setScraping(true);
    try {
      const res = await apiFetch("/api/scrape_socials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creators: twitchOnly.map((r) => ({
            platform: "Twitch",
            handle: r.handle,
          })),
        }),
      });
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      const found = data?.results ?? {};
      const count = Object.values(found).filter(
        (v: any) => v?.twitter || v?.instagram,
      ).length;
      // Merge back into current results
      setResults((prev) =>
        prev.map((r) => {
          const s = found[r.handle];
          if (!s) return r;
          return {
            ...r,
            twitter: r.twitter || s.twitter || null,
            instagram: r.instagram || s.instagram || null,
          };
        }),
      );
      toast.success(`Socials scraped for ${count} creator${count === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(`Scrape failed: ${(e as Error).message}`);
    } finally {
      setScraping(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-h2 tracking-tight">Scout</h1>
          <p className="text-sm text-muted-foreground">
            Live Twitch and Kick scouting — scrapes current streams that match
            your filters.
          </p>
        </div>
        {autoOn && (
          <Badge variant="default" className="gap-1">
            <CircleDot className="h-3 w-3 animate-pulse" /> LIVE · {autoRuns} runs
          </Badge>
        )}
      </div>

      {/* Form */}
      <div className="grid gap-4 rounded-md border bg-card p-4 md:grid-cols-6">
        <div className="space-y-2 md:col-span-2">
          <Label>Platform</Label>
          <div className="flex gap-1">
            {[
              { v: "", label: "Both" },
              { v: "twitch", label: "Twitch" },
              { v: "kick", label: "Kick" },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setPlatform(o.v as Platform)}
                className={cn(
                  "flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors",
                  platform === o.v
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="s-category">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="s-category" className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="s-ccv-min">CCV min</Label>
          <Input
            id="s-ccv-min"
            type="number"
            min={0}
            value={ccvMin}
            onChange={(e) => setCcvMin(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="s-ccv-max">CCV max</Label>
          <Input
            id="s-ccv-max"
            type="number"
            min={0}
            value={ccvMax}
            onChange={(e) => setCcvMax(e.target.value)}
          />
        </div>

        <div className="space-y-2 md:col-span-5">
          <Label>
            Languages{" "}
            <span className="text-xs font-normal text-muted-foreground">
              · leave none selected for all
            </span>
          </Label>
          <div className="flex flex-wrap gap-1">
            {LANGUAGES.map((lang) => {
              const on = languages.includes(lang);
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => toggleLanguage(lang)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition-colors",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {lang}
                </button>
              );
            })}
            {languages.length > 0 && (
              <button
                type="button"
                onClick={() => setLanguages([])}
                className="rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="s-limit">Results</Label>
          <Input
            id="s-limit"
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </div>

        <div className="flex items-end gap-2 md:col-span-6">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={quick}
              onChange={(e) => setQuick(e.target.checked)}
            />
            Quick mode (fewer pages, faster)
          </label>
          <Button
            type="button"
            onClick={() => doScout(false)}
            disabled={running || autoOn}
            className="ml-auto flex-1 max-w-xs"
          >
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scouting…
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" /> Run Scout
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Auto-scout */}
      <div className="flex items-center justify-between rounded-md border bg-card p-3">
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold">Auto-Scout</div>
          <Select
            value={String(autoInterval)}
            onValueChange={(v) => setAutoInterval(Number(v))}
            disabled={autoOn}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVAL_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            Re-runs the same scout on this interval and merges new results.
          </span>
        </div>
        <Button
          type="button"
          variant={autoOn ? "destructive" : "default"}
          size="sm"
          onClick={() => setAutoOn((v) => !v)}
        >
          {autoOn ? (
            <>
              <Square className="mr-1 h-3.5 w-3.5" /> Stop
            </>
          ) : (
            <>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Start
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2 text-sm">
          <span className="text-xs font-semibold text-muted-foreground">
            Sheet admin:
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={dedupe}
            onClick={onRemoveDuplicates}
          >
            {dedupe ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Layers className="mr-1 h-3.5 w-3.5" />
            )}
            Remove Duplicates
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={scraping}
            onClick={onScrapeSocials}
          >
            {scraping ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Users className="mr-1 h-3.5 w-3.5" />
            )}
            Scrape Socials
            {selected.size > 0 && (
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({selected.size} selected)
              </span>
            )}
          </Button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-md border bg-primary/5 p-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <Button
            type="button"
            size="sm"
            variant="default"
            disabled={exporting}
            onClick={onExportSelected}
          >
            {exporting ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserPlus className="mr-1 h-3.5 w-3.5" />
            )}
            Export to Leads
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Results */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">
            Results{" "}
            <span className="text-xs font-normal text-muted-foreground">
              · {results.length} creator{results.length === 1 ? "" : "s"}
              {lastRunAt && ` · last run ${lastRunAt.toLocaleTimeString()}`}
            </span>
          </div>
          {results.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={clearResults}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>

        {results.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Run a scout to populate results.
          </div>
        ) : (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={
                        results.length > 0 &&
                        results.every((r) => selected.has(resultKey(r)))
                      }
                      onChange={(e) => {
                        if (e.target.checked)
                          setSelected(new Set(results.map(resultKey)));
                        else setSelected(new Set());
                      }}
                    />
                  </TableHead>
                  <TableHead>Creator</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>CCV</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Socials</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => {
                  const plat = normalizePlatform(r.platform);
                  const key = resultKey(r);
                  return (
                    <TableRow key={key}>
                      <TableCell className="w-8">
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.name}`}
                          checked={selected.has(key)}
                          onChange={(e) => toggleSelect(key, e.target.checked)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-2">
                          {r.name}
                          {r.inRoster && (
                            <span className="rounded bg-muted px-1 py-px text-[9px] uppercase tracking-wide text-muted-foreground">
                              In roster
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                            plat === "twitch"
                              ? "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200"
                              : "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
                          )}
                        >
                          {plat === "twitch" ? "Twitch" : "Kick"}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {r.ccv.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.country ?? r.language ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.content ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {r.twitter && (
                            <a
                              href={
                                r.twitter.startsWith("http")
                                  ? r.twitter
                                  : `https://x.com/${r.twitter}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 hover:bg-sky-200 dark:bg-sky-900/40 dark:text-sky-200"
                            >
                              X
                            </a>
                          )}
                          {r.instagram && (
                            <a
                              href={
                                r.instagram.startsWith("http")
                                  ? r.instagram
                                  : `https://instagram.com/${r.instagram}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded bg-pink-100 px-1.5 py-0.5 text-[10px] font-medium text-pink-800 hover:bg-pink-200 dark:bg-pink-900/40 dark:text-pink-200"
                            >
                              IG
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <a
                          href={
                            plat === "twitch"
                              ? `https://twitch.tv/${r.handle}`
                              : `https://kick.com/${r.handle}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
