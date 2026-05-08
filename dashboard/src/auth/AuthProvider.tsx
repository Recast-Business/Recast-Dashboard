import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/types/database";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  /** Per-profile flag — controls whether an operator sees campaign $ figures.
   *  Always true for admin / finance / partner; only meaningful for operator. */
  viewCampaignFinancials: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [role, setRole] = React.useState<UserRole | null>(null);
  const [viewCampaignFinancials, setViewCampaignFinancials] = React.useState(true);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setRole(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("profiles")
      .select("role, view_campaign_financials")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load profile role:", error);
          setRole(null);
          setViewCampaignFinancials(true);
        } else {
          const r = (data?.role as UserRole) ?? null;
          setRole(r);
          // Operators get whatever the flag says; everyone else always sees financials.
          if (r === "operator") {
            setViewCampaignFinancials(!!data?.view_campaign_financials);
          } else {
            setViewCampaignFinancials(true);
          }
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      role,
      viewCampaignFinancials,
      loading,
      signOut,
    }),
    [session, role, viewCampaignFinancials, loading, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
