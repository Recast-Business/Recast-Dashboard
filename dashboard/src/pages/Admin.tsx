import * as React from "react";
import {
  KeyRound,
  Mail,
  MoreHorizontal,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  UserX,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EyebrowLabel, MetricStrip } from "@/components/recast";
import { useAuth } from "@/auth/AuthProvider";
import { useConfirm } from "@/hooks/useConfirm";
import {
  generateTempPassword,
  isDisabled,
  useAdminUsers,
  useCreateUser,
  useDeleteUser,
  useSetUserActive,
  useSetUserEmail,
  useSetUserFlag,
  useSetUserPassword,
  useSetUserRole,
  type AdminUser,
} from "@/hooks/useAdminUsers";
import { formatDate } from "@/lib/utils";
import type { UserRole } from "@/types/database";

/**
 * /admin — self-serve user management (admin role only).
 *
 * Everything here calls the admin_* Postgres RPCs from migration 0051.
 * The DB re-checks the caller's admin role inside every function, so
 * this page is convenience, not the security boundary. Guard rails
 * (last-admin lockout, no self-delete/deactivate, delete-refuses-when-
 * audit-history-exists) live in the DB too — their error messages
 * surface directly in the toasts.
 */

const ROLE_OPTIONS: UserRole[] = ["admin", "accounting", "operator", "partner"];

const ROLE_BADGE: Record<UserRole, string> = {
  admin: "border-electric/40 bg-electric/10 text-electric",
  accounting: "border-paid/40 bg-paid/10 text-paid",
  operator: "border-white/20 bg-white/[0.06] text-white",
  partner: "border-rule bg-card text-steel",
};

export function AdminPage() {
  const { user } = useAuth();
  const { data: users, isLoading, error, refetch, isRefetching } = useAdminUsers();
  const [addOpen, setAddOpen] = React.useState(false);
  const [emailTarget, setEmailTarget] = React.useState<AdminUser | null>(null);
  const [passwordTarget, setPasswordTarget] = React.useState<AdminUser | null>(null);

  const setRole = useSetUserRole();
  const setFlag = useSetUserFlag();
  const setActive = useSetUserActive();
  const del = useDeleteUser();
  const confirm = useConfirm();

  const admins = (users ?? []).filter((u) => u.role === "admin").length;
  const disabled = (users ?? []).filter(isDisabled).length;

  async function onChangeRole(u: AdminUser, role: UserRole) {
    try {
      await setRole.mutateAsync({ userId: u.id, role });
      toast.success(`${u.email} → ${role}`);
    } catch (e) {
      toast.error(`Role change failed: ${(e as Error).message}`);
    }
  }

  async function onToggleFinancials(u: AdminUser) {
    try {
      await setFlag.mutateAsync({
        userId: u.id,
        flag: "view_campaign_financials",
        value: !u.view_campaign_financials,
      });
      toast.success(
        `${u.email}: campaign financials ${u.view_campaign_financials ? "hidden" : "visible"}`,
      );
    } catch (e) {
      toast.error(`Flag change failed: ${(e as Error).message}`);
    }
  }

  async function onToggleActive(u: AdminUser) {
    const disabling = !isDisabled(u);
    const ok = await confirm({
      title: disabling ? `Deactivate ${u.email}?` : `Reactivate ${u.email}?`,
      description: disabling
        ? "They will be signed out and unable to log in until reactivated. All their records stay intact."
        : "They will be able to sign in again immediately.",
      confirmLabel: disabling ? "Deactivate" : "Reactivate",
      variant: disabling ? "destructive" : "default",
    });
    if (!ok) return;
    try {
      await setActive.mutateAsync({ userId: u.id, active: !disabling });
      toast.success(`${u.email} ${disabling ? "deactivated" : "reactivated"}`);
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    }
  }

  async function onDelete(u: AdminUser) {
    const ok = await confirm({
      title: `Delete ${u.email}?`,
      description:
        "Permanently removes the account. If they have activity history the delete will be refused — deactivate instead to keep the audit trail. Cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync({ userId: u.id });
      toast.success(`${u.email} deleted`);
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div>
        <EyebrowLabel withRule>Workspace · Admin</EyebrowLabel>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-h2 font-bold tracking-[-0.02em]">
              Admin
            </h1>
            <p className="mt-1 max-w-[80ch] text-[13px] text-steel">
              Manage who can sign in and what they can see. Every action
              here is audit-logged. Role changes apply on the user's next
              page load.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[12px]"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
              Refresh
            </Button>
            <Button size="sm" className="h-8 text-[12px]" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
              Add user
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────── */}
      <MetricStrip
        tiles={[
          {
            label: "Users",
            value: String(users?.length ?? "—"),
            sub: `${disabled} disabled`,
            icon: Users,
          },
          {
            label: "Admins",
            value: String(admins || "—"),
            sub: admins === 1 ? "you're the only one" : "full access",
            icon: ShieldCheck,
            tone: admins === 1 ? "partial" : "default",
          },
        ]}
      />

      {/* ── User table ─────────────────────────────────────────────── */}
      {error ? (
        <div className="rounded-md border border-overdue/40 bg-overdue/10 p-4 text-[13px] text-overdue">
          Failed to load users: {(error as Error).message}. If this says
          "forbidden", your session isn't admin — or migration 0051 hasn't
          been applied yet.
        </div>
      ) : isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Campaign $</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users ?? []).map((u) => {
                const self = u.id === user?.id;
                const off = isDisabled(u);
                return (
                  <TableRow key={u.id} className={off ? "opacity-60" : undefined}>
                    <TableCell>
                      <div className="text-[13px] font-medium text-white">
                        {u.email}
                        {self ? (
                          <span className="ml-1.5 text-[10px] uppercase tracking-wider text-steel">
                            you
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-steel">
                        {u.full_name || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {self ? (
                        // Guard: changing your own role can lock you out
                        // of this page mid-session. DB allows it (unless
                        // last admin) — the UI just refuses the footgun.
                        <Badge variant="outline" className={ROLE_BADGE[u.role]}>
                          {u.role}
                        </Badge>
                      ) : (
                        <Select
                          value={u.role}
                          onValueChange={(v) => onChangeRole(u, v as UserRole)}
                        >
                          <SelectTrigger className="h-8 w-[130px] text-[12px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.role === "operator" ? (
                        <label className="flex items-center gap-1.5 text-[12px] text-steel">
                          <input
                            type="checkbox"
                            checked={u.view_campaign_financials}
                            onChange={() => onToggleFinancials(u)}
                            className="h-3.5 w-3.5 accent-[var(--electric)]"
                          />
                          visible
                        </label>
                      ) : (
                        <span className="text-[12px] text-steel">always</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[12px] text-steel">
                      {u.last_sign_in_at ? formatDate(u.last_sign_in_at) : "never"}
                    </TableCell>
                    <TableCell>
                      {off ? (
                        <Badge variant="outline" className="border-overdue/40 bg-overdue/10 text-overdue">
                          Disabled
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-paid/40 bg-paid/10 text-paid">
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEmailTarget(u)}>
                            <Mail className="mr-2 h-3.5 w-3.5" /> Change email
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setPasswordTarget(u)}>
                            <KeyRound className="mr-2 h-3.5 w-3.5" /> Reset password
                          </DropdownMenuItem>
                          {!self && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => onToggleActive(u)}>
                                {off ? (
                                  <>
                                    <UserCheck className="mr-2 h-3.5 w-3.5" /> Reactivate
                                  </>
                                ) : (
                                  <>
                                    <UserX className="mr-2 h-3.5 w-3.5" /> Deactivate
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-overdue focus:text-overdue"
                                onClick={() => onDelete(u)}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} />
      {emailTarget && (
        <ChangeEmailDialog user={emailTarget} onClose={() => setEmailTarget(null)} />
      )}
      {passwordTarget && (
        <ResetPasswordDialog user={passwordTarget} onClose={() => setPasswordTarget(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Add user
// ─────────────────────────────────────────────────────────────────────

function AddUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const create = useCreateUser();
  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<UserRole>("operator");
  const [viewFin, setViewFin] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setEmail("");
    setFullName("");
    setPassword(generateTempPassword());
    setRole("operator");
    setViewFin(false);
  }, [open]);

  async function onCreate() {
    if (!email.trim().includes("@")) return toast.error("Valid email required.");
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    try {
      await create.mutateAsync({
        email: email.trim().toLowerCase(),
        password,
        role,
        viewCampaignFinancials: role === "operator" ? viewFin : false,
        fullName: fullName.trim() || null,
      });
      toast.success(
        `${email.trim()} created — share the temp password with them now; it isn't stored anywhere.`,
        { duration: 10000 },
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(`Create failed: ${(e as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription className="text-[12px]">
            The account works immediately — no confirmation email. Copy the
            temp password before you close this; it can't be retrieved later
            (only reset).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="au-email">Email *</Label>
            <Input
              id="au-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="au-name">Full name</Label>
            <Input
              id="au-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="au-pass">Temp password *</Label>
            <div className="flex gap-2">
              <Input
                id="au-pass"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="tabular"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Generate new password"
                onClick={() => setPassword(generateTempPassword())}
              >
                <Wand2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {role === "operator" && (
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={viewFin}
                onChange={(e) => setViewFin(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--electric)]"
              />
              Can see campaign $ figures
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={onCreate} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Change email
// ─────────────────────────────────────────────────────────────────────

function ChangeEmailDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const setEmailRpc = useSetUserEmail();
  const [email, setEmail] = React.useState(user.email);

  async function onSave() {
    if (!email.trim().includes("@")) return toast.error("Valid email required.");
    try {
      await setEmailRpc.mutateAsync({ userId: user.id, email: email.trim().toLowerCase() });
      toast.success(`Email updated — they now sign in as ${email.trim()}. Password unchanged.`);
      onClose();
    } catch (e) {
      toast.error(`Email change failed: ${(e as Error).message}`);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change email</DialogTitle>
          <DialogDescription className="text-[12px]">
            Renames the login for <strong>{user.email}</strong>. Their
            password and all history stay attached.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5 py-2">
          <Label htmlFor="ce-email">New email</Label>
          <Input
            id="ce-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={setEmailRpc.isPending}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={setEmailRpc.isPending}>
            {setEmailRpc.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Reset password
// ─────────────────────────────────────────────────────────────────────

function ResetPasswordDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const setPass = useSetUserPassword();
  const [password, setPassword] = React.useState(generateTempPassword());

  async function onSave() {
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    try {
      await setPass.mutateAsync({ userId: user.id, password });
      toast.success(
        `Password reset for ${user.email} — share it with them now; it isn't stored anywhere.`,
        { duration: 10000 },
      );
      onClose();
    } catch (e) {
      toast.error(`Reset failed: ${(e as Error).message}`);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription className="text-[12px]">
            Sets a new password for <strong>{user.email}</strong>. Copy it
            before closing — it can't be retrieved later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5 py-2">
          <Label htmlFor="rp-pass">New password</Label>
          <div className="flex gap-2">
            <Input
              id="rp-pass"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="tabular"
              autoFocus
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Generate new password"
              onClick={() => setPassword(generateTempPassword())}
            >
              <Wand2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={setPass.isPending}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={setPass.isPending}>
            {setPass.isPending ? "Saving…" : "Reset password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
