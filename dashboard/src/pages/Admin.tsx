import * as React from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  Lock,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  UserX,
  Wand2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatDistanceToNow } from "@/components/activity/formatDistanceToNow";
import { useAuth } from "@/auth/AuthProvider";
import { useConfirm } from "@/hooks/useConfirm";
import {
  generateTempPassword,
  isDisabled,
  useAdminActivity,
  useAdminCronStatus,
  useAdminUsers,
  useAdminVaultAccess,
  useCreateUser,
  useDeleteUser,
  useEmailLoginDetails,
  useSetUserActive,
  useSetUserEmail,
  useSetUserFlag,
  useSetUserFullName,
  useSetUserPassword,
  useSetUserRole,
  type AdminUser,
} from "@/hooks/useAdminUsers";
import { formatDate } from "@/lib/utils";
import type { UserRole } from "@/types/database";

/** Copy-to-clipboard button used next to generated passwords. */
function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      title={`Copy ${label}`}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        toast.success(`${label} copied`);
      }}
    >
      <Copy className="h-4 w-4" />
    </Button>
  );
}

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
  const [nameTarget, setNameTarget] = React.useState<AdminUser | null>(null);

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
                          <DropdownMenuItem onClick={() => setNameTarget(u)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Edit name
                          </DropdownMenuItem>
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

      {/* ── Visibility: what's been quietly logging all along ────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AdminActivityCard />
        <VaultAccessCard />
        <CronStatusCard />
      </div>

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} />
      {emailTarget && (
        <ChangeEmailDialog user={emailTarget} onClose={() => setEmailTarget(null)} />
      )}
      {passwordTarget && (
        <ResetPasswordDialog user={passwordTarget} onClose={() => setPasswordTarget(null)} />
      )}
      {nameTarget && (
        <EditNameDialog user={nameTarget} onClose={() => setNameTarget(null)} />
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
  const emailDetails = useEmailLoginDetails();
  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<UserRole>("operator");
  const [viewFin, setViewFin] = React.useState(false);
  // Set once creation succeeds — flips the dialog into a success view
  // showing the credentials with copy/email actions instead of just
  // closing immediately.
  const [created, setCreated] = React.useState<{ id: string; email: string; password: string } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setEmail("");
    setFullName("");
    setPassword(generateTempPassword());
    setRole("operator");
    setViewFin(false);
    setCreated(null);
  }, [open]);

  async function onCreate() {
    if (!email.trim().includes("@")) return toast.error("Valid email required.");
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    try {
      const id = await create.mutateAsync({
        email: email.trim().toLowerCase(),
        password,
        role,
        viewCampaignFinancials: role === "operator" ? viewFin : false,
        fullName: fullName.trim() || null,
      });
      setCreated({ id, email: email.trim().toLowerCase(), password });
    } catch (e) {
      toast.error(`Create failed: ${(e as Error).message}`);
    }
  }

  async function onEmailDetails() {
    if (!created) return;
    try {
      await emailDetails.mutateAsync({ userId: created.id, password: created.password });
      toast.success(`Login details emailed to ${created.email}`);
    } catch (e) {
      toast.error(
        `Email send failed: ${(e as Error).message} — copy the password and share it another way instead.`,
      );
    }
  }

  if (created) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{created.email} created</DialogTitle>
            <DialogDescription className="text-[12px]">
              Copy the password now — it can't be retrieved later, only
              reset. Emailing it requires Resend to be configured; if that
              hasn't been set up yet, copy and share it directly instead.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5 py-2">
            <Label htmlFor="au-created-pass">Temp password</Label>
            <div className="flex gap-2">
              <Input id="au-created-pass" value={created.password} readOnly className="tabular" />
              <CopyButton value={created.password} label="Password" />
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              onClick={onEmailDetails}
              disabled={emailDetails.isPending}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
              {emailDetails.isPending ? "Sending…" : "Email login details"}
            </Button>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
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
              <CopyButton value={password} label="Password" />
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
  const emailDetails = useEmailLoginDetails();
  const [password, setPassword] = React.useState(generateTempPassword());
  const [done, setDone] = React.useState(false);

  async function onSave() {
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    try {
      await setPass.mutateAsync({ userId: user.id, password });
      setDone(true);
    } catch (e) {
      toast.error(`Reset failed: ${(e as Error).message}`);
    }
  }

  async function onEmailDetails() {
    try {
      await emailDetails.mutateAsync({ userId: user.id, password });
      toast.success(`Login details emailed to ${user.email}`);
    } catch (e) {
      toast.error(
        `Email send failed: ${(e as Error).message} — copy the password and share it another way instead.`,
      );
    }
  }

  if (done) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Password reset for {user.email}</DialogTitle>
            <DialogDescription className="text-[12px]">
              Copy it now — it can't be retrieved later, only reset again.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5 py-2">
            <Label htmlFor="rp-done-pass">New password</Label>
            <div className="flex gap-2">
              <Input id="rp-done-pass" value={password} readOnly className="tabular" />
              <CopyButton value={password} label="Password" />
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button variant="outline" onClick={onEmailDetails} disabled={emailDetails.isPending}>
              <Send className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
              {emailDetails.isPending ? "Sending…" : "Email login details"}
            </Button>
            <Button onClick={onClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
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
            <CopyButton value={password} label="Password" />
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

// ─────────────────────────────────────────────────────────────────────
// Edit name
// ─────────────────────────────────────────────────────────────────────

function EditNameDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const setName = useSetUserFullName();
  const [name, setNameValue] = React.useState(user.full_name ?? "");

  async function onSave() {
    try {
      await setName.mutateAsync({ userId: user.id, fullName: name.trim() });
      toast.success(`Name updated for ${user.email}`);
      onClose();
    } catch (e) {
      toast.error(`Update failed: ${(e as Error).message}`);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit name</DialogTitle>
          <DialogDescription className="text-[12px]">
            Display name for <strong>{user.email}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5 py-2">
          <Label htmlFor="en-name">Full name</Label>
          <Input
            id="en-name"
            value={name}
            onChange={(e) => setNameValue(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={setName.isPending}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={setName.isPending}>
            {setName.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Recent admin activity
// ─────────────────────────────────────────────────────────────────────

function AdminActivityCard() {
  const { data, isLoading, error } = useAdminActivity(50);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-steel" strokeWidth={1.5} />
          <CardTitle className="text-[13px]">Recent admin activity</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-[12px] text-overdue">
            Failed to load: {(error as Error).message}. Migration 0053 may not be applied yet.
          </p>
        ) : isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !data || data.length === 0 ? (
          <p className="text-[12px] text-steel">No admin actions logged yet.</p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {data.map((row) => (
              <li
                key={row.id}
                className="flex items-start justify-between gap-3 border-b border-rule pb-1.5 text-[12px] last:border-b-0"
              >
                <div className="min-w-0">
                  <span className="font-medium text-white">{row.kind}</span>
                  <span className="text-steel"> by {row.actor_email ?? "unknown"}</span>
                </div>
                <span className="shrink-0 text-steel" title={formatDate(row.created_at)}>
                  {formatDistanceToNow(row.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Vault access log
// ─────────────────────────────────────────────────────────────────────

const VAULT_ACTION_ICON: Record<string, LucideIcon> = {
  view: Lock,
  create: CheckCircle2,
  update: Pencil,
  delete: XCircle,
};

function VaultAccessCard() {
  const { data, isLoading, error } = useAdminVaultAccess(50);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-steel" strokeWidth={1.5} />
          <CardTitle className="text-[13px]">Banking vault access</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-[12px] text-overdue">
            Failed to load: {(error as Error).message}. Migration 0053 may not be applied yet.
          </p>
        ) : isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !data || data.length === 0 ? (
          <p className="text-[12px] text-steel">No banking records accessed yet.</p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {data.map((row) => {
              const Icon = VAULT_ACTION_ICON[row.action] ?? Lock;
              return (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-3 border-b border-rule pb-1.5 text-[12px] last:border-b-0"
                >
                  <div className="flex min-w-0 items-start gap-1.5">
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-steel" strokeWidth={1.5} />
                    <div className="min-w-0">
                      <span className="font-medium text-white">{row.action}</span>
                      <span className="text-steel">
                        {" "}
                        by {row.user_email ?? "unknown"}
                        {row.user_role ? ` (${row.user_role})` : ""}
                      </span>
                      {row.fields && row.fields.length > 0 && (
                        <div className="text-[11px] text-steel">
                          {row.fields.join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-steel" title={formatDate(row.accessed_at)}>
                    {formatDistanceToNow(row.accessed_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Scheduled jobs health
// ─────────────────────────────────────────────────────────────────────

function CronStatusCard() {
  const { data, isLoading, error } = useAdminCronStatus();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-steel" strokeWidth={1.5} />
          <CardTitle className="text-[13px]">Scheduled jobs</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-[12px] text-overdue">
            Failed to load: {(error as Error).message}. Migration 0053 may not be applied yet.
          </p>
        ) : isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data || data.length === 0 ? (
          <p className="text-[12px] text-steel">No scheduled jobs found.</p>
        ) : (
          <ul className="space-y-2">
            {data.map((job) => {
              const failed = job.last_status != null && job.last_status !== "succeeded";
              return (
                <li
                  key={job.jobname}
                  className="flex items-center justify-between gap-3 rounded-md border bg-background/40 px-3 py-2 text-[12px]"
                >
                  <div className="flex items-center gap-2">
                    {!job.active ? (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-steel" strokeWidth={1.5} />
                    ) : failed ? (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-overdue" strokeWidth={1.5} />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-paid" strokeWidth={1.5} />
                    )}
                    <div>
                      <div className="font-medium text-white">{job.jobname}</div>
                      <div className="font-mono text-[11px] text-steel">{job.schedule}</div>
                    </div>
                  </div>
                  <div className="text-right text-steel">
                    <div>
                      {job.last_run_at ? formatDistanceToNow(job.last_run_at) : "never run"}
                    </div>
                    {job.last_status && (
                      <div className={failed ? "text-overdue" : "text-paid"}>{job.last_status}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
