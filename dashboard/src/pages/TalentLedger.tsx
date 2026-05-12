import * as React from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileSignature,
  IdCard,
  Pencil,
  Search,
  Users,
} from "lucide-react";
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
import { EyebrowLabel } from "@/components/recast";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import { useCreators } from "@/hooks/useCreators";
import { CreatorProfileDialog } from "@/components/roster/CreatorProfileDialog";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";

/**
 * Round 3 C.2 — TALENT LEDGER (CRM lens).
 *
 * `/roster` and `/talents` are two lenses on the same signed-creator
 * set:
 *
 *   • `/roster`   → operational. Twitch/Kick handles, CCV, sign/unsign,
 *                   tier, country. Scout's tool.
 *
 *   • `/talents`  → CRM / finance-readiness. Contact, legal name,
 *                   business name, address, payment method, commission
 *                   structure, signed agreements. Gustavo's tool.
 *
 * One creator row, one "Edit" button — opens the existing
 * CreatorProfileDialog (admin-only edits). Profile completeness is
 * surfaced both per-row (agreement count pill, commission badge) and
 * at the top via 4 count tiles.
 *
 * Filters tuned for the CRM use case:
 *   • Search (name)
 *   • Category
 *   • "Show incomplete profiles only" toggle — flips the table to the
 *     subset Gustavo needs to chase down before next invoice run.
 *
 * Canonical recipe: page header, EyebrowLabel + h2 section eyebrow,
 * sticky-left "Talent" column on bg #0d0d0d, hairline borders, no
 * shadows, action icons hidden until row hover.
 */

// ─────────────────────────────────────────────────────────────────────
// Local row shape. useCreators returns all R3 fields untyped on the
// row; this is the subset surfaced on /talents.
// ─────────────────────────────────────────────────────────────────────

interface CommissionTierStored {
  threshold: number | null;
  pct: number;
}

interface LedgerRow {
  id: string;
  name: string;
  category: string | null;
  country: string | null;
  signed: boolean;
  socials: Record<string, string>;
  contract_terms: string | null;
  legal_name: string | null;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  payment_method_pref: string | null;
  tax_id: string | null;
  commission_pct_by_platform: Record<
    string,
    number | null | CommissionTierStored[]
  > | null;
  agreement_links: Record<string, string> | null;
  commission_tiers: Record<string, unknown> | null;
  /** Round 3 Q1+Q7 (migration 0035): legacy cliff math toggle. */
  commission_uses_cliff?: boolean | null;
}

/** Slugs that surface as agreement slots in CreatorProfileDialog. */
const AGREEMENT_SLOTS = ["onlyfans", "telegram", "overlay", "deal", "other"];

export function TalentLedgerPage() {
  const { role } = useAuth();
  const canEdit = role === "admin" || role === "finance";
  const { data, isLoading, error } = useCreators("signed");

  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("__all__");
  const [showIncompleteOnly, setShowIncompleteOnly] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<LedgerRow | null>(null);

  // Cast through `unknown` because useCreators returns an opaque row
  // shape — the runtime payload includes all the R3 fields we need.
  const rows = (data ?? []) as unknown as LedgerRow[];

  // Distinct category list for the filter dropdown.
  const categories = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.category) set.add(r.category);
    }
    return [...set].sort();
  }, [rows]);

  // Completeness audit per row. The "missing" reasons are surfaced as
  // pills in the row so Gustavo can see exactly what's outstanding
  // without opening the profile.
  //
  // R3 Q3 (Gustavo, yes/yes):
  //   • tax_id is required for "complete".
  //   • Commission must be set per platform the creator actually
  //     works on. We infer "works on" from agreement_links — every
  //     platform with a signed agreement URL must have a matching
  //     commission entry. Platforms without an agreement aren't
  //     held to that rule. (Agreement = "this creator earns on this
  //     platform" is the cleanest signal we have without adding a
  //     separate active-platforms field.)
  const audit = React.useMemo(() => {
    return rows.map((r) => {
      const missing: string[] = [];
      if (!r.email) missing.push("email");
      if (!r.address) missing.push("address");
      if (!r.tax_id) missing.push("tax_id");
      const agreementPlatforms = activeAgreementPlatforms(r);
      if (agreementPlatforms.length === 0) {
        // No agreements yet → still need at least one commission
        // somewhere to count as set-up. This is the old "any
        // commission anywhere" rule scoped to the pre-agreement
        // state.
        if (!hasCommission(r)) missing.push("commission");
      } else {
        // Every agreement-platform must have a commission. Surface
        // the gap with the platform slug so Gustavo knows what's
        // missing (e.g. "commission · onlyfans").
        for (const p of agreementPlatforms) {
          if (!hasCommissionForPlatform(r, p)) {
            missing.push(`commission · ${p}`);
          }
        }
      }
      if (!hasAnyAgreement(r)) missing.push("agreements");
      return { row: r, missing };
    });
  }, [rows]);

  // KPI tile counts. "Complete" = zero missing fields. "Missing
  // commission" counts rows where commission is missing entirely OR
  // missing on any agreement-platform (the R3 Q3 rule). "Missing
  // agreements" counts rows with no agreement URLs at all.
  const kpis = React.useMemo(() => {
    let complete = 0;
    let missingAgreements = 0;
    let missingCommission = 0;
    for (const a of audit) {
      if (a.missing.length === 0) complete++;
      if (a.missing.includes("agreements")) missingAgreements++;
      // Catch both the bare "commission" pill (no agreements yet)
      // and the scoped "commission · <platform>" pills.
      if (
        a.missing.includes("commission") ||
        a.missing.some((m) => m.startsWith("commission · "))
      ) {
        missingCommission++;
      }
    }
    return {
      total: audit.length,
      complete,
      missingAgreements,
      missingCommission,
    };
  }, [audit]);

  // Filter pipeline: search → category → incomplete toggle.
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return audit.filter(({ row, missing }) => {
      if (q && !row.name.toLowerCase().includes(q)) return false;
      if (categoryFilter !== "__all__" && row.category !== categoryFilter) {
        return false;
      }
      if (showIncompleteOnly && missing.length === 0) return false;
      return true;
    });
  }, [audit, search, categoryFilter, showIncompleteOnly]);

  // CSV: flat one-row-per-creator with the CRM essentials.
  const csvRows = React.useMemo(
    () =>
      filtered.map(({ row, missing }) => ({
        name: row.name,
        category: row.category ?? "",
        legal: row.legal_name ?? "",
        business: row.business_name ?? "",
        email: row.email ?? "",
        phone: row.phone ?? "",
        address: row.address ?? "",
        payment: row.payment_method_pref ?? "",
        tax_id: row.tax_id ?? "",
        commission: commissionSummary(row),
        agreements: agreementCount(row) + "/" + AGREEMENT_SLOTS.length,
        missing: missing.join(", "),
      })),
    [filtered],
  );

  return (
    <div className="space-y-6">
      {/* ── Page header ──────────────────────────────────────────────── */}
      <div>
        <EyebrowLabel withRule>Talent Ledger</EyebrowLabel>
        <h1 className="mt-2 font-display text-h2 font-bold tracking-[-0.02em]">
          Signed creators · CRM
        </h1>
        <p className="mt-1 max-w-[80ch] text-[13px] text-steel">
          Editable record per signed creator: contact, legal entity, payment
          method, commission structure, and signed agreements. The roster
          page is the operational lens (handles, CCV, sign/unsign); this
          one is the financial lens used to keep invoicing on the rails.
        </p>
      </div>

      {/* ── KPI strip (4 counts) ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <CountTile
          label="Total signed"
          count={kpis.total}
          icon={Users}
        />
        <CountTile
          label="Profiles complete"
          count={kpis.complete}
          subtle={
            kpis.total > 0
              ? `${Math.round((kpis.complete / kpis.total) * 100)}% of roster`
              : undefined
          }
          icon={CheckCircle2}
          tone="paid"
        />
        <CountTile
          label="Missing commission"
          count={kpis.missingCommission}
          icon={AlertTriangle}
          tone={kpis.missingCommission > 0 ? "partial" : "default"}
        />
        <CountTile
          label="Missing agreements"
          count={kpis.missingAgreements}
          icon={FileSignature}
          tone={kpis.missingAgreements > 0 ? "partial" : "default"}
        />
      </div>

      {/* ── Filter row ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel"
            strokeWidth={1.5}
          />
          <Input
            placeholder="Search talent…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-[240px] rounded-md bg-card pl-8 text-[13px] placeholder:text-steel"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 w-[180px] text-[13px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant={showIncompleteOnly ? "default" : "outline"}
          onClick={() => setShowIncompleteOnly((v) => !v)}
          className="h-8 text-[12px]"
        >
          <AlertTriangle className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
          Incomplete only
        </Button>
        <span className="ml-auto flex items-center gap-2 text-[12px] text-steel">
          {filtered.length} {filtered.length === 1 ? "talent" : "talents"}
          <ExportCSVButton
            filename="recast-talent-ledger.csv"
            rows={csvRows}
            label="Export CSV"
            disabled={csvRows.length === 0}
            columns={[
              { header: "Name",        value: (r) => r.name },
              { header: "Category",    value: (r) => r.category },
              { header: "Legal name",  value: (r) => r.legal },
              { header: "Business",    value: (r) => r.business },
              { header: "Email",       value: (r) => r.email },
              { header: "Phone",       value: (r) => r.phone },
              { header: "Address",     value: (r) => r.address },
              { header: "Payment",     value: (r) => r.payment },
              { header: "Tax ID",      value: (r) => r.tax_id },
              { header: "Commission",  value: (r) => r.commission },
              { header: "Agreements",  value: (r) => r.agreements },
              { header: "Missing",     value: (r) => r.missing },
            ]}
          />
        </span>
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      {error ? (
        <div className="rounded-lg border bg-card p-4 text-sm text-overdue">
          Could not load talents: {(error as Error).message}
        </div>
      ) : isLoading ? (
        <Skeleton className="h-[420px] w-full rounded-lg" />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-[13px] text-steel">
          {rows.length === 0
            ? "No signed creators yet. Sign someone from /leads first, then their profile lands here."
            : "No matches for the current filter."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-rule">
                  <Th sticky>Talent</Th>
                  <Th>Contact</Th>
                  <Th>Legal / business</Th>
                  <Th>Address</Th>
                  <Th>Commission</Th>
                  <Th>Agreements</Th>
                  <Th>Payment</Th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ row, missing }) => {
                  const agreements = agreementCount(row);
                  const commission = commissionSummary(row);
                  return (
                    <tr
                      key={row.id}
                      className="group border-b border-rule transition-colors duration-base ease-out hover:bg-white/[0.04]"
                    >
                      {/* Sticky-left talent column. R4.C: name links
                          to the per-creator P&L detail at /talents/:id. */}
                      <td className="sticky left-0 z-10 bg-[#0d0d0d] px-4 py-2.5">
                        <Link
                          to={`/talents/${row.id}`}
                          className="block text-[13px] font-medium text-white transition-colors duration-base ease-out hover:text-electric hover:underline"
                          title={`Open ${row.name}'s P&L`}
                        >
                          {row.name}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-steel">
                          <IdCard className="h-3 w-3" strokeWidth={1.5} />
                          {row.category ?? "—"}
                          {row.country ? ` · ${row.country}` : ""}
                        </div>
                        {missing.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {missing.map((m) => (
                              <MissingPill key={m} field={m} />
                            ))}
                          </div>
                        ) : (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-sm bg-paid-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-paid">
                            <CheckCircle2 className="h-2.5 w-2.5" strokeWidth={2} />
                            Complete
                          </div>
                        )}
                      </td>

                      {/* Contact */}
                      <td className="px-3 py-2.5 align-top">
                        <div className="text-[12px] text-white">
                          {row.email ? (
                            <a
                              href={`mailto:${row.email}`}
                              className="hover:text-electric hover:underline"
                            >
                              {row.email}
                            </a>
                          ) : (
                            <span className="text-steel">—</span>
                          )}
                        </div>
                        <div className="text-[11px] text-steel">
                          {row.phone || "—"}
                        </div>
                      </td>

                      {/* Legal / business */}
                      <td className="px-3 py-2.5 align-top">
                        <div className="text-[12px] text-white">
                          {row.legal_name || (
                            <span className="text-steel">—</span>
                          )}
                        </div>
                        <div className="text-[11px] text-steel">
                          {row.business_name || "—"}
                        </div>
                      </td>

                      {/* Address — truncate at a generous width to keep
                          rows from ballooning on long European
                          addresses. */}
                      <td className="px-3 py-2.5 align-top">
                        {row.address ? (
                          <div
                            className="max-w-[220px] truncate text-[12px] text-white"
                            title={row.address}
                          >
                            {row.address}
                          </div>
                        ) : (
                          <span className="text-[12px] text-steel">—</span>
                        )}
                      </td>

                      {/* Commission */}
                      <td className="px-3 py-2.5 align-top">
                        <div className="text-[12px] text-white">
                          {commission}
                        </div>
                      </td>

                      {/* Agreements — pill showing count + a hover list
                          of which slots have URLs filled in. */}
                      <td className="px-3 py-2.5 align-top">
                        <AgreementPill
                          count={agreements}
                          total={AGREEMENT_SLOTS.length}
                          links={row.agreement_links}
                        />
                      </td>

                      {/* Payment method preference */}
                      <td className="px-3 py-2.5 align-top">
                        <div className="text-[12px] text-white">
                          {row.payment_method_pref ? (
                            PAYMENT_METHOD_LABELS[row.payment_method_pref] ??
                            row.payment_method_pref
                          ) : (
                            <span className="text-steel">—</span>
                          )}
                        </div>
                        {row.tax_id ? (
                          <div className="text-[11px] text-steel">
                            Tax ID set
                          </div>
                        ) : null}
                      </td>

                      {/* Action — Edit profile dialog. Hidden for
                          non-editing roles (partner / operator). */}
                      <td className="px-3 py-2.5 text-right align-top">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => setEditTarget(row)}
                            title={`Edit ${row.name}`}
                            aria-label={`Edit ${row.name}`}
                            className="rounded-sm border border-rule p-1.5 text-steel opacity-0 transition-opacity duration-base ease-out hover:border-white/20 hover:bg-white/[0.06] hover:text-white group-hover:opacity-100"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Profile editor. CreatorProfileDialog's CreatorMinimal type
          treats commission_pct_by_platform tier rows as
          { threshold: number, pct: number } (non-null threshold),
          whereas LedgerRow tolerates a null threshold for "no cap".
          Both come from the same DB jsonb — the dialog normalises on
          load — so cast through unknown rather than duplicate the
          type tree. */}
      {editTarget ? (
        <CreatorProfileDialog
          open
          onOpenChange={(o) => !o && setEditTarget(null)}
          creator={editTarget as unknown as React.ComponentProps<typeof CreatorProfileDialog>["creator"]}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  auto_pay: "Auto pay",
  paypal: "PayPal",
  domestic_wire: "Wire",
  international_transfer: "Intl transfer",
  bank_ach: "ACH",
  zelle: "Zelle",
  invoice_link: "Invoice link",
  website_link: "Website",
  credit_card: "Card",
};

/** Has the row got at least one platform commission set (flat or tiered)? */
function hasCommission(r: LedgerRow): boolean {
  // Round 3: prefer the new commission_tiers blob if present.
  if (r.commission_tiers && typeof r.commission_tiers === "object") {
    if (Object.keys(r.commission_tiers).length > 0) return true;
  }
  // Legacy fallback: commission_pct_by_platform.
  const legacy = r.commission_pct_by_platform;
  if (!legacy || typeof legacy !== "object") return false;
  for (const v of Object.values(legacy)) {
    if (v == null) continue;
    if (Array.isArray(v) && v.length > 0) return true;
    if (typeof v === "number" && Number.isFinite(v)) return true;
  }
  return false;
}

/** R3 Q3: agreement slot → commission platform key. Most slots map
 *  1:1; the "overlay" agreement maps to the legacy "efuse" commission
 *  key, and generic slots ("deal", "other") don't tie to a specific
 *  commission platform so they're skipped in the per-platform audit. */
const AGREEMENT_TO_COMMISSION_PLATFORM: Record<string, string | null> = {
  onlyfans: "onlyfans",
  telegram: "telegram",
  overlay: "efuse",
  deal: null,
  other: null,
};

/** Which platforms does this creator earn on (per their signed
 *  agreements)? Returns commission-platform keys, not agreement
 *  slugs. */
function activeAgreementPlatforms(r: LedgerRow): string[] {
  const a = r.agreement_links;
  if (!a || typeof a !== "object") return [];
  const out: string[] = [];
  for (const slot of AGREEMENT_SLOTS) {
    const url = a[slot];
    if (typeof url !== "string" || url.trim() === "") continue;
    const platform = AGREEMENT_TO_COMMISSION_PLATFORM[slot];
    if (platform) out.push(platform);
  }
  return out;
}

/** Does the creator have a commission entry for this specific
 *  platform? Reads new commission_tiers first, falls back to legacy
 *  commission_pct_by_platform (flat number or tier array). */
function hasCommissionForPlatform(r: LedgerRow, platform: string): boolean {
  const tiers = r.commission_tiers;
  if (tiers && typeof tiers === "object") {
    const v = (tiers as Record<string, unknown>)[platform];
    if (Array.isArray(v) && v.length > 0) return true;
  }
  const legacy = r.commission_pct_by_platform;
  if (!legacy || typeof legacy !== "object") return false;
  const v = (legacy as Record<string, unknown>)[platform];
  if (v == null) return false;
  if (Array.isArray(v) && v.length > 0) return true;
  if (typeof v === "number" && Number.isFinite(v)) return true;
  return false;
}

/** One-liner describing commission setup. "20% (3 platforms)" /
 *  "tiered (2 platforms)" / "—". */
function commissionSummary(r: LedgerRow): string {
  const tiers = r.commission_tiers;
  if (tiers && typeof tiers === "object" && Object.keys(tiers).length > 0) {
    return `Tiered (${Object.keys(tiers).length} platform${
      Object.keys(tiers).length === 1 ? "" : "s"
    })`;
  }
  const legacy = r.commission_pct_by_platform;
  if (!legacy || typeof legacy !== "object") return "—";
  const flat: number[] = [];
  let tieredCount = 0;
  for (const v of Object.values(legacy)) {
    if (v == null) continue;
    if (Array.isArray(v) && v.length > 0) tieredCount++;
    else if (typeof v === "number" && Number.isFinite(v)) flat.push(v);
  }
  if (flat.length === 0 && tieredCount === 0) return "—";
  if (tieredCount > 0 && flat.length === 0) {
    return `Tiered (${tieredCount} platform${tieredCount === 1 ? "" : "s"})`;
  }
  if (flat.length > 0 && tieredCount === 0) {
    // All flat — show the percentages compactly.
    const distinct = [...new Set(flat)];
    if (distinct.length === 1) {
      return `${distinct[0]}% (${flat.length} platform${
        flat.length === 1 ? "" : "s"
      })`;
    }
    return `${distinct.map((n) => `${n}%`).join(" / ")} (mixed)`;
  }
  return `Mixed (${flat.length} flat · ${tieredCount} tiered)`;
}

function hasAnyAgreement(r: LedgerRow): boolean {
  return agreementCount(r) > 0;
}

function agreementCount(r: LedgerRow): number {
  const a = r.agreement_links;
  if (!a || typeof a !== "object") return 0;
  let n = 0;
  for (const slot of AGREEMENT_SLOTS) {
    const url = a[slot];
    if (typeof url === "string" && url.trim() !== "") n++;
  }
  return n;
}

// ─────────────────────────────────────────────────────────────────────
// Local primitives
// ─────────────────────────────────────────────────────────────────────

function Th({
  sticky,
  children,
}: {
  sticky?: boolean;
  children: React.ReactNode;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-steel",
        sticky && "sticky left-0 z-10 min-w-[200px] bg-[#0d0d0d] px-4",
      )}
    >
      {children}
    </th>
  );
}

const MISSING_LABELS: Record<string, string> = {
  email: "Email",
  address: "Address",
  tax_id: "Tax ID",
  commission: "Commission",
  agreements: "Agreements",
};

/** Per-platform commission gap pills come through as "commission · onlyfans"
 *  — render the platform half in mono-style so it reads at a glance. */
function MissingPill({ field }: { field: string }) {
  const isScoped = field.startsWith("commission · ");
  const label = isScoped
    ? field.replace("commission · ", "Commission · ")
    : (MISSING_LABELS[field] ?? field);
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-partial-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-partial">
      <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2} />
      {label}
    </span>
  );
}

function AgreementPill({
  count,
  total,
  links,
}: {
  count: number;
  total: number;
  links: Record<string, string> | null;
}) {
  const tone = count === 0 ? "overdue" : count < total ? "partial" : "paid";
  const toneCls =
    tone === "paid"
      ? "bg-paid-tint text-paid"
      : tone === "partial"
        ? "bg-partial-tint text-partial"
        : "bg-overdue-tint text-overdue";

  // Compose the hover title with which slots are filled. Helpful for
  // glance audits without opening the profile.
  const filledSlots = AGREEMENT_SLOTS.filter(
    (s) => links && typeof links[s] === "string" && links[s].trim() !== "",
  );
  const title =
    filledSlots.length > 0
      ? `Signed: ${filledSlots.join(", ")}`
      : "No agreements on file";

  // If exactly one URL is filled, surface a quick-open link beside the
  // pill so Gustavo can jump straight to it.
  const singleUrl =
    filledSlots.length === 1 && links ? links[filledSlots[0]] : null;

  return (
    <div className="flex items-center gap-1.5" title={title}>
      <span
        className={cn(
          "tabular inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-semibold leading-none",
          toneCls,
        )}
      >
        {count}/{total}
      </span>
      {singleUrl ? (
        <a
          href={singleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-steel hover:text-electric"
          title="Open agreement"
        >
          <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
        </a>
      ) : null}
    </div>
  );
}

function CountTile({
  label,
  count,
  subtle,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  count: number;
  subtle?: string;
  // lucide-react exposes its icons as ForwardRefExoticComponent<LucideProps>
  // — accept the wider lucide shape rather than narrowing it. Their
  // `strokeWidth` is `number | string`, hence the union.
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  tone?: "default" | "paid" | "partial" | "overdue";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-tile-md",
        tone === "paid" && "border-t border-t-paid",
        tone === "partial" && "border-t border-t-partial",
        tone === "overdue" && "border-t border-t-overdue",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-steel">
          <Icon className="h-3 w-3" strokeWidth={1.5} />
          {label}
        </span>
      </div>
      <div
        className={cn(
          "tabular mt-2 font-display text-kpi font-extrabold leading-none tracking-[-0.022em]",
          tone === "paid" && "text-paid",
          tone === "partial" && "text-partial",
          tone === "overdue" && "text-overdue",
          tone === "default" && "text-white",
        )}
      >
        {count}
      </div>
      {subtle ? (
        <div className="mt-1 text-small text-steel">{subtle}</div>
      ) : null}
    </div>
  );
}
