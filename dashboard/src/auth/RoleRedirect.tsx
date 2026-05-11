import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { defaultRouteForRole } from "./ProtectedRoute";

export function RoleRedirect() {
  const { role, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={defaultRouteForRole(role)} replace />;
}
