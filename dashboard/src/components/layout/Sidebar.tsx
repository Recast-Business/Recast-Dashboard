import { NavLink } from "react-router-dom";
import {
  Calculator,
  ChevronDown,
  DollarSign,
  FileText,
  Home,
  LayoutDashboard,
  LogOut,
  Search,
  Star,
  Store,
  UserSearch,
  Users,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { canAccess } from "@/auth/useRole";
import type { UserRole } from "@/types/database";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Avatar, EyebrowLabel } from "@/components/recast";
import { useNavCounts } from "@/hooks/useNavCounts";

/**
 * Phase L (C1.2a): sidebar matched to the Claude Design mockup.
 *
 * Three sections:
 *   1. WORKSPACE — Overview / Finance / Calculator / Roster
 *   2. PIPELINE  — Brief Builder / Leads / Potential / Scout
 *   3. LEDGERS   — Vendors / Frazier's House
 *
 * Vendors and Frazier's House currently route to /finance (the existing
 * tabbed Finance page). When C4/C5 ship they'll get their own routes.
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
  badge?: "roster" | "leads" | "potential";
}

interface NavSection {
  header: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    header: "Workspace",
    items: [
      { to: "/overview", label: "Overview", icon: LayoutDashboard, allow: ["admin", "finance"] },
      { to: "/finance", label: "Finance", icon: DollarSign, allow: ["admin", "partner", "finance"] },
      { to: "/calculator", label: "Calculator", icon: Calculator, allow: ["admin", "partner", "finance", "operator"] },
      { to: "/roster", label: "Roster", icon: Users, allow: ["admin", "partner", "finance", "operator"], badge: "roster" },
    ],
  },
  {
    header: "Pipeline",
    items: [
      { to: "/briefs", label: "Brief Builder", icon: FileText, allow: ["admin", "partner", "operator"] },
      { to: "/leads", label: "Leads", icon: UserSearch, allow: ["admin", "partner", "operator"], badge: "leads" },
      { to: "/potential", label: "Potential", icon: Star, allow: ["admin", "partner", "operator"], badge: "potential" },
      { to: "/scout", label: "Scout", icon: Search, allow: ["admin", "partner", "operator"] },
    ],
  },
  {
    header: "Ledgers",
    items: [
      // Vendors and Frazier's House live as Finance tabs today —
      // these placeholders give the IA the right shape now and can be
      // retargeted to /vendors and /house when C4/C5 lands.
      { to: "/finance", label: "Vendors", icon: Store, allow: ["admin", "partner", "finance"] },
      { to: "/finance", label: "Frazier's House", icon: Home, allow: ["admin", "partner", "finance"] },
    ],
  },
];

export function Sidebar() {
  const { role, user, signOut } = useAuth();
  const { data: counts } = useNavCounts();

  return (
    <aside className="flex h-screen w-52 flex-col border-r bg-background">
      {/* Brand header — tighter than the old w-60 layout. The R-mark
          stays at 28px (h-7); the wordmark uses a slightly smaller
          base size so the logo lockup feels balanced in a 208px rail. */}
      <div className="px-4 py-4">
        <div className="flex items-center gap-2">
          <img
            src="/recast-mark.svg"
            alt="Recast"
            className="h-7 w-7 shrink-0 rounded"
          />
          <span
            className="font-display text-sm font-extrabold uppercase"
            style={{ letterSpacing: "0.08em" }}
          >
            Recast
          </span>
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {SECTIONS.map((section, i) => {
          const visible = section.items.filter((item) => canAccess(role, item.allow));
          if (visible.length === 0) return null;
          return (
            <div key={i} className={cn(i > 0 && "mt-4")}>
              <EyebrowLabel className="mb-1.5 px-2.5 text-steel">
                {section.header}
              </EyebrowLabel>
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
                          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-small font-medium transition-colors duration-base ease-out",
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                        )
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {count !== undefined && count > 0 ? (
                        <span className="tabular ml-auto rounded-full bg-muted px-1.5 py-0.5 text-eyebrow text-steel">
                          {count}
                        </span>
                      ) : null}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer: user chip + theme + sign out — tightened padding. */}
      <div className="space-y-1.5 border-t p-2">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md p-1.5 text-left transition-colors duration-base ease-out hover:bg-accent/50"
          onClick={() => signOut()}
          title="Sign out"
        >
          <Avatar name={user?.email ?? "??"} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-small font-medium text-foreground">
              {user?.email ?? "—"}
            </div>
            <div className="text-eyebrow text-steel">
              {role ? `${role[0].toUpperCase()}${role.slice(1)} · Ops` : "Workspace"}
            </div>
          </div>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-steel" />
        </button>
        <ThemeToggle className="w-full justify-around" />
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
