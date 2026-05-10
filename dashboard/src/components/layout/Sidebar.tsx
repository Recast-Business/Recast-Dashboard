import { NavLink } from "react-router-dom";
import {
  Calculator,
  DollarSign,
  FileText,
  LayoutDashboard,
  LogOut,
  Search,
  Star,
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
 * Phase L (C1.1a): sidebar IA brought forward from C7.
 *
 * Two visual sections (top, Pipeline) with count badges on Roster /
 * Leads / Potential, and a real user chip + role pill at the footer.
 *
 * The Ledgers group (Vendors / Frazier's House as standalone routes)
 * is deferred until C4/C5 land — those still live as Finance tabs
 * today, so promoting them here would be a dead link.
 */

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  allow: UserRole[];
  /** Which count to render in the badge, if any. */
  badge?: "roster" | "leads" | "potential";
}

interface NavSection {
  /** Caps eyebrow header. Omit for the unlabeled top section. */
  header?: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
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
];

export function Sidebar() {
  const { role, user, signOut } = useAuth();
  const { data: counts } = useNavCounts();

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-background">
      {/* Brand header */}
      <div className="border-b px-5 py-5">
        <div className="flex items-center gap-2.5">
          <img
            src="/recast-mark.svg"
            alt="Recast"
            className="h-7 w-7 shrink-0 rounded"
          />
          <span
            className="font-display text-base font-extrabold uppercase"
            style={{ letterSpacing: "0.08em" }}
          >
            Recast
          </span>
        </div>
        <div className="mt-1.5 text-xs text-muted-foreground">
          {role ? `${role[0].toUpperCase()}${role.slice(1)} workspace` : "Workspace"}
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto p-3">
        {SECTIONS.map((section, i) => {
          const visible = section.items.filter((item) => canAccess(role, item.allow));
          if (visible.length === 0) return null;
          return (
            <div key={i} className={cn(i > 0 && "mt-6")}>
              {section.header ? (
                <EyebrowLabel className="px-3 pb-2 text-steel">
                  {section.header}
                </EyebrowLabel>
              ) : null}
              <div className="space-y-1">
                {visible.map((item) => {
                  const Icon = item.icon;
                  const count = item.badge ? counts?.[item.badge] : undefined;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-base ease-out",
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        )
                      }
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1">{item.label}</span>
                      {count !== undefined && count > 0 ? (
                        <span className="tabular ml-auto rounded-full bg-muted px-2 py-0.5 text-eyebrow text-steel">
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

      {/* User chip + footer controls */}
      <div className="space-y-3 border-t p-3">
        <div className="flex items-center gap-3 px-1">
          <Avatar name={user?.email ?? "??"} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-small font-medium text-foreground">
              {user?.email ?? "—"}
            </div>
            <div className="text-eyebrow text-steel">
              {role ? `${role[0].toUpperCase()}${role.slice(1)} · Ops` : "Workspace"}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => signOut()}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
    </aside>
  );
}
