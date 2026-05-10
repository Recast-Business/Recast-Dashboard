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

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  allow: UserRole[];
}

const ITEMS: NavItem[] = [
  { to: "/overview", label: "Overview", icon: LayoutDashboard, allow: ["admin", "finance"] },
  { to: "/finance", label: "Finance", icon: DollarSign, allow: ["admin", "partner", "finance"] },
  // M-5: Campaigns renamed → Calculator. Same allowlist; the page hosts
  // OnlyFans / Telegram / Deals / Ad Overlay sub-tabs and consolidates
  // all per-platform performance math.
  { to: "/calculator", label: "Calculator", icon: Calculator, allow: ["admin", "partner", "finance", "operator"] },
  { to: "/briefs", label: "Brief Builder", icon: FileText, allow: ["admin", "partner", "operator"] },
  { to: "/roster", label: "Roster", icon: Users, allow: ["admin", "partner", "finance", "operator"] },
  { to: "/leads", label: "Leads", icon: UserSearch, allow: ["admin", "partner", "operator"] },
  { to: "/potential", label: "Potential", icon: Star, allow: ["admin", "partner", "operator"] },
  { to: "/scout", label: "Scout", icon: Search, allow: ["admin", "partner", "operator"] },
];

export function Sidebar() {
  const { role, user, signOut } = useAuth();

  const visible = ITEMS.filter((item) => canAccess(role, item.allow));

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-background">
      {/* Phase L: branded header — Unbounded wordmark + Electric-Blue
          R-mark. Mirrors the Linear/Attio/Stripe pattern of letting the
          name carry the brand without a heavy logo dropping into the
          chrome. */}
      <div className="border-b px-5 py-5">
        <div className="flex items-center gap-2">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground"
            aria-hidden="true"
          >
            R
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">
            Recast
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {role ? `${role[0].toUpperCase()}${role.slice(1)} workspace` : "Workspace"}
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {visible.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="space-y-2 border-t p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 truncate px-3 text-xs text-muted-foreground">
            {user?.email}
          </div>
          <ThemeToggle />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => signOut()}
        >
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
