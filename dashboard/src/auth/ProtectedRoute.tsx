import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { canAccess } from "./useRole";
import type { UserRole } from "@/types/database";

interface Props {
  allow: UserRole[];
  children: React.ReactNode;
}

export function ProtectedRoute({ allow, children }: Props) {
  const { session, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!canAccess(role, allow)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}

export function defaultRouteForRole(role: UserRole | null): string {
  if (role === "finance") return "/finance";
  if (role) return "/campaigns";
  return "/login";
}
