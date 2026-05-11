import * as React from "react";
import { Lock, Unlock } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useLockState } from "@/hooks/useLockState";
import { useConfirm } from "@/hooks/useConfirm";
import { isMonthRecent } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Round 4 A.2 — month-level lock indicator + admin toggle.
 *
 * Shown in the month header of every period grid (talent invoices,
 * vendor payments, etc). Renders only for auto-locked months (older
 * than the trailing 6 months); recent months don't surface anything
 * because they're editable by default.
 *
 * States:
 *   • Auto-locked + no override → steel Lock icon, tooltip "Locked
 *     (read-only)". Click (admin/finance) opens confirm to unlock.
 *   • Auto-locked + override active → electric Unlock icon, tooltip
 *     "Unlocked for editing by <user>". Click (admin/finance) opens
 *     confirm to re-lock.
 *   • Recent (within 6 months) → nothing rendered.
 *
 * Non-admin/non-finance roles see the icon (so they understand why
 * something is read-only) but the click is a no-op.
 */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  year: number;
  month: number; // 1-based
}

export function MonthLockBadge({ year, month }: Props) {
  const { role } = useAuth();
  const lock = useLockState();
  const confirm = useConfirm();

  // Recent months never show the badge — they're editable by default
  // and surfacing a lock UI would confuse the model.
  if (isMonthRecent(year, month)) return null;

  const unlocked = lock.isUnlocked(year, month);
  const canToggle = role === "admin" || role === "finance";

  async function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!canToggle) return;
    if (unlocked) {
      const ok = await confirm({
        title: `Re-lock ${MONTH_NAMES[month - 1]} ${year}?`,
        description:
          "All grids will become read-only for this month again. Existing rows stay; you can re-unlock later if needed.",
        confirmLabel: "Re-lock",
      });
      if (!ok) return;
      lock.relock(year, month);
    } else {
      const ok = await confirm({
        title: `Unlock ${MONTH_NAMES[month - 1]} ${year}?`,
        description:
          "All grids will allow edits + new entries for this month until you re-lock it. The change is audited in /activity.",
        confirmLabel: "Unlock",
      });
      if (!ok) return;
      lock.unlock(year, month);
    }
  }

  const Icon = unlocked ? Unlock : Lock;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canToggle}
      title={
        unlocked
          ? `${MONTH_NAMES[month - 1]} ${year} is unlocked for editing${canToggle ? " — click to re-lock" : ""}`
          : `${MONTH_NAMES[month - 1]} ${year} is locked (read-only)${canToggle ? " — click to unlock" : ""}`
      }
      aria-label={
        unlocked
          ? `Re-lock ${MONTH_NAMES[month - 1]} ${year}`
          : `Unlock ${MONTH_NAMES[month - 1]} ${year}`
      }
      className={cn(
        "ml-1 inline-flex h-4 w-4 items-center justify-center rounded-sm transition-colors duration-base ease-out align-middle",
        unlocked
          ? "text-electric hover:bg-electric/10"
          : "text-steel/60 hover:text-steel hover:bg-white/[0.06]",
        !canToggle && "cursor-default hover:bg-transparent",
      )}
    >
      <Icon className="h-2.5 w-2.5" strokeWidth={2} />
    </button>
  );
}
