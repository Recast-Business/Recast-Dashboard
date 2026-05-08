import { Home } from "lucide-react";

interface Props {
  year: number;
}

export function HousePlaceholder({ year }: Props) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center rounded-lg border bg-card">
      <div className="max-w-md space-y-2 p-6 text-center">
        <Home className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Frazier's House — coming in Phase E</h2>
        <p className="text-sm text-muted-foreground">
          Bedroom rent + utilities ledger with equal-per-head splits, viewed for {year}.
          Schema is already in place; UI is next on the build queue.
        </p>
      </div>
    </div>
  );
}
