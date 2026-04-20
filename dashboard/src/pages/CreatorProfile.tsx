import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { CreatorDetailBody } from "@/components/roster/CreatorDetail";
import { useAuth } from "@/auth/AuthProvider";

export function CreatorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          to="/roster"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Creator profile</h1>
      </div>
      {id && <CreatorDetailBody creatorId={id} role={role} showFullLink={false} />}
    </div>
  );
}
