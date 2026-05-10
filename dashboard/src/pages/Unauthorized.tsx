import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider";
import { defaultRouteForRole } from "@/auth/ProtectedRoute";

export function UnauthorizedPage() {
  const { role, signOut } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-h2 tracking-tight">Access restricted</h1>
        <p className="text-muted-foreground">
          Your role doesn't have access to this page.
        </p>
        <div className="flex justify-center gap-2">
          <Button asChild>
            <Link to={defaultRouteForRole(role)}>Go to your home</Link>
          </Button>
          <Button variant="outline" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
