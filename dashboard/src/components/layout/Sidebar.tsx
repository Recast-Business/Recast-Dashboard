import { NavLink } from "react-router-dom";
import {
  Calculator,
  ChevronDown,
  DollarSign,
  FileText,
  Home,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Megaphone,
  Search,
  ShieldCheck,
  Star,
  Store,
  UserCheck,
  UserSearch,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { canAccess } from "@/auth/useRole";
import type { UserRole } from "@/types/database";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/recast";
import { useNavCounts } from "@/hooks/useNavCounts";

/**
 * Phase L → Round 3 → R5 Sweep 8 sidebar IA.
 *
 * Two sections — Workspace bundles the "money + entities" surface
 * area; Pipeline bundles the "acquisition + deployment" funnel.
 * Roster + Talent Ledger are two lenses on the same signed-creator
 * data:
 *
 *   • /roster  (PIPELINE)   — operational lens: handles, CCV,
 *                             sign/unsign, country, tier. All roles
 *                             (admin / partner / finance / operator).
 *                             Scout's tool, also surfaced to partners
 *                             like Harry for general directory use.
 *   • /talents (WORKSPACE)  — CRM/financial lens labelled "Talent
 *                             Ledger" in the sidebar (Sweep 8 rename
 *                             — disambiguates from the operational
 *                             Roster lens): legal name, address,
 *                             commission tiers, agreement URLs,
 *                             completeness audit. Admin + finance
 *                             ONLY (Gustavo's invoice-prep workflow);
 *                             partner + operator are blocked at both
 *                             the route and the sidebar entry.
 *
 * Sections:
 *   1. WORKSPACE  — Overview / Finance / Calculator / Vendors /
 *                   Talent Ledger / Frazier's House / Payments / Tax
 *   2. PIPELINE   — Brief Builder / Leads / Potential / Scout /
 *                   Roster / Campaigns
 *
 * R5 Sweep 8 — per-role IA refinements:
 *   • Section ORDER becomes per-role. Pipeline-heavy roles (partner,
 *     operator) see Pipeline above Workspace; money-heavy roles
 *     (admin, finance) keep Workspace on top.
 *   • Calculator hidden from partner — they don't price deals; the
 *     tool was noise in their nav. Admin / finance / operator still
 *     see it.
 *   • User-chip role line drops the meaningless "· Ops" suffix —
 *     just shows the capitalised role name.
 *
 * Footer:
 *   • User chip — avatar + email + role pill, chevron-down (TODO: menu)
 *   • Theme toggle row (full-width 3-icon: light / system / dark)
 *   • Sign out button
 */

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  allow: UserRole[];
  badge?: "roster" | "leads" | "potential" | "tasks";
  /** When true, operators only see this item if their profile flag
   *  view_campaign_financials = true. Bruno=true, Harry=false. Admin
   *  + accounting are unaffected. */
  requireViewCampaignFinancials?: boolean;
}

interface NavSection {
  /** Eyebrow label above the section. Omit for an ungrouped block of items. */
  header?: string;
  items: NavItem[];
}

const WORKSPACE_SECTION: NavSection = {
  header: "Workspace",
  items: [
    // Round 3: shared team task board — every role (it's coordination,
    // not finance; badge = YOUR open task count).
    { to: "/tasks", label: "Tasks", icon: ListTodo, allow: ["admin", "partner", "accounting", "operator"], badge: "tasks" },
    { to: "/overview", label: "Overview", icon: LayoutDashboard, allow: ["admin", "accounting"] },
    // Workspace is admin + accounting only. R5 partner-read-only on
    // /finance + /vendors + /house was rolled back — partners are
    // strictly pipeline-side now (briefs / leads / scout / roster /
    // campaigns). Keeps the sidebar shorter for them and removes
    // any expectation that they can drill into financial detail.
    { to: "/finance", label: "Invoices", icon: DollarSign, allow: ["admin", "accounting"] },
    { to: "/calculator", label: "Calculator", icon: Calculator, allow: ["admin", "accounting", "operator"], requireViewCampaignFinancials: true },
    { to: "/vendors", label: "Vendors", icon: Store, allow: ["admin", "accounting"] },
    { to: "/talents", label: "Talent Ledger", icon: Users, allow: ["admin", "accounting"] },
    { to: "/house", label: "Frazier's House", icon: Home, allow: ["admin", "accounting"] },
    { to: "/payments", label: "Payments", icon: Wallet, allow: ["admin", "accounting"] },
    // Self-serve user management — admin only.
    { to: "/admin", label: "Admin", icon: ShieldCheck, allow: ["admin"] },
  ],
};

const PIPELINE_SECTION: NavSection = {
  header: "Pipeline",
  items: [
    { to: "/briefs", label: "Brief Builder", icon: FileText, allow: ["admin", "partner", "operator"] },
    { to: "/leads", label: "Leads", icon: UserSearch, allow: ["admin", "partner", "operator"], badge: "leads" },
    { to: "/potential", label: "Potential", icon: Star, allow: ["admin", "partner", "operator"], badge: "potential" },
    { to: "/scout", label: "Scout", icon: Search, allow: ["admin", "partner", "operator"] },
    // Round 3 follow-up (Gustavo + Harry split): Roster is the
    // OPERATIONAL lens on signed creators — handles, CCV,
    // sign/unsign, tier. All roles see it. Talent Ledger (Workspace)
    // is the CRM/financial lens — legal name, address,
    // commission tiers, agreements — restricted to admin +
    // finance.
    { to: "/roster", label: "Roster", icon: UserCheck, allow: ["admin", "partner", "accounting", "operator"], badge: "roster" },
    // Round 3 follow-up: Campaigns sits at the END of Pipeline as
    // the natural endpoint of the funnel (brief → leads →
    // potential → scout → roster → live brand deal). All four
    // roles see it; brand-deal accounting is everyone's business.
    { to: "/campaigns", label: "Campaigns", icon: Megaphone, allow: ["admin", "partner", "accounting", "operator"] },
  ],
};

/**
 * R5 Sweep 8: section order is now per-role. Money-heavy roles
 * (admin, finance) keep Workspace on top — they live in $ tools and
 * scan the funnel as a secondary lens. Pipeline-heavy roles (partner,
 * operator) flip it: their daily landing surface is briefs / leads /
 * scout / roster, with the money + business state below. Saves a
 * scroll on the most-used nav for each persona.
 */
function sectionsForRole(role: UserRole | null): NavSection[] {
  if (role === "partner" || role === "operator") {
    return [PIPELINE_SECTION, WORKSPACE_SECTION];
  }
  return [WORKSPACE_SECTION, PIPELINE_SECTION];
}

export function Sidebar() {
  const { role, user, signOut, viewCampaignFinancials } = useAuth();
  const { data: counts } = useNavCounts();
  // R5 Sweep 8: pipeline-heavy roles see Pipeline first; money-heavy
  // roles keep Workspace on top.
  const sections = sectionsForRole(role);

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-background">
      {/* Brand header — canonical spec §3: padding 22px 14px 14px,
          R-mark 28×28 / 4px radius, wordmark Unbounded 800 / 14px /
          0.08em (the only place positive tracking is used). */}
      <div className="px-3.5 pb-3.5 pt-[22px]">
        <div className="flex items-center gap-2.5">
          <img
            src="/recast-mark.svg"
            alt="Recast"
            className="h-7 w-7 shrink-0 rounded"
          />
          <span
            className="font-display text-[14px] font-extrabold uppercase"
            style={{ letterSpacing: "0.08em" }}
          >
            Recast
          </span>
        </div>
      </div>

      {/* Nav sections — canonical spec §3:
          - Section title: Inter 600 / 10px / 0.14em uppercase / steel,
            padded "0 10px 8px"
          - Item: Inter 500 / 13px / padding 7px 10px / radius 6px,
            inactive color rgba(255,255,255,0.62), hover bg --row-hover,
            active bg rgba(37,99,235,0.12) + white text + blue icon
          - Badge: 10px tabular / bg rgba(255,255,255,0.06) /
            color steel / padding 1px 6px / rounded-full */}
      <nav className="flex-1 overflow-y-auto px-3.5 pb-3.5">
        {sections.map((section, i) => {
          const visible = section.items.filter((item) => {
            if (!canAccess(role, item.allow)) return false;
            // Operator gate: items flagged with requireViewCampaignFinancials
            // hide for operators whose profile flag is off (e.g. Harry).
            // Admin + accounting unaffected.
            if (item.requireViewCampaignFinancials && role === "operator" && !viewCampaignFinancials) {
              return false;
            }
            return true;
          });
          if (visible.length === 0) return null;
          // Headed sections use the canonical 20px gap (mt-5) so the
          // uppercase eyebrow has breathing room above. Headerless
          // sections (Frazier's House) tuck closer to the previous
          // section — 8px (mt-2) reads as "adjacent but separate"
          // rather than orphaned-in-space.
          const topGap = i === 0 ? "" : section.header ? "mt-5" : "mt-2";
          return (
            <div key={i} className={cn(topGap)}>
              {/* Header is optional — headerless sections render as
                  ungrouped item blocks (used for Frazier's House so
                  it sits standalone below Ledgers without a redundant
                  one-item group label). */}
              {section.header ? (
                <div className="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
                  {section.header}
                </div>
              ) : null}
              <div className="space-y-0.5">
                {visible.map((item) => {
                  const Icon = item.icon;
                  const count = item.badge ? counts?.[item.badge] : undefined;
                  return (
                    <NavLink
                      key={`${section.header}-${item.label}`}
                      to={item.to}
                      end={item.to === "/finance"}
                      className={({ isActive }) =>
                        cn(
                          "group flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors duration-base ease-out",
                          isActive
                            ? "bg-[var(--rc-nav-active)] text-white"
                            : "text-white/[0.62] hover:bg-[var(--rc-row-hover)] hover:text-white",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-electric")} />
                          <span className="flex-1 truncate">{item.label}</span>
                          {count !== undefined && count > 0 ? (
                            <span className="tabular rounded-full bg-white/[0.06] px-1.5 py-px text-[10px] text-steel">
                              {count}
                            </span>
                          ) : null}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer per spec §3:
          - 28px circular blue avatar + initials
          - email Inter 600 / 12.5px
          - role Inter 400 / 10px / steel
          - chevron icon button
          - 3-segment theme toggle below */}
      <div className="space-y-2 border-t p-2.5">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md p-1.5 text-left transition-colors duration-base ease-out hover:bg-[var(--rc-row-hover)]"
          onClick={() => signOut()}
          title="Sign out"
        >
          <Avatar name={user?.email ?? "??"} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold leading-snug text-white">
              {user?.email ?? "—"}
            </div>
            <div className="text-[10px] leading-snug text-steel">
              {role ? `${role[0].toUpperCase()}${role.slice(1)}` : "Workspace"}
            </div>
          </div>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-steel" />
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-full justify-start text-steel"
          onClick={() => signOut()}
        >
          <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
