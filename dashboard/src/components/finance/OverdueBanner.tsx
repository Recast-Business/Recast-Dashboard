import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

interface Props {
  count: number;
  campaigns: Array<{ id: string; name: string; brand: string | null }>;
}

export function OverdueBanner({ count, campaigns }: Props) {
  if (count === 0) return null;
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
        <div className="flex-1">
          <div className="font-semibold text-destructive">
            {count} overdue campaign{count === 1 ? "" : "s"}
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/campaigns?open=${c.id}`}
                  className="text-destructive hover:underline"
                >
                  {c.brand ? `${c.brand} · ` : ""}
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
