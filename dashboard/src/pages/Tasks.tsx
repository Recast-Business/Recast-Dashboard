import * as React from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  ListTodo,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader, MetricStrip, type MetricTile } from "@/components/recast";
import { TaskDialog } from "@/components/tasks/TaskDialog";
import { useAuth } from "@/auth/AuthProvider";
import { useConfirm } from "@/hooks/useConfirm";
import { useSessionState } from "@/hooks/useSessionState";
import {
  isOverdue,
  memberName,
  taskEntityLink,
  useDeleteTask,
  useTasks,
  useTeamMembers,
  useUpdateTask,
  type Task,
} from "@/hooks/useTasks";
import { cn, formatDate } from "@/lib/utils";

/**
 * /tasks — shared team task board (Round 3).
 *
 * One list for the whole team: everyone sees everything (5-person
 * team — coordination beats secrecy), writes are RLS-enforced
 * (assignee/creator/admin can edit+complete, creator/admin can
 * delete). Filters default to "mine + open" so the page opens on
 * *your* plate; flip to Everyone for the team view.
 */

type WhoFilter = "mine" | "everyone";
type StatusFilter = "open" | "done" | "all";

export function TasksPage() {
  const { user } = useAuth();
  const { data: tasks, isLoading, error } = useTasks();
  const { data: members } = useTeamMembers();
  const update = useUpdateTask();
  const del = useDeleteTask();
  const confirm = useConfirm();

  const [who, setWho] = useSessionState<WhoFilter>("recast.tasks.who", "mine");
  const [status, setStatus] = useSessionState<StatusFilter>("recast.tasks.status", "open");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Task | null>(null);

  const all = React.useMemo(() => tasks ?? [], [tasks]);

  const filtered = React.useMemo(() => {
    return all.filter((t) => {
      if (who === "mine" && t.assignee_id !== user?.id) return false;
      if (status !== "all" && t.status !== status) return false;
      return true;
    });
  }, [all, who, status, user?.id]);

  const kpis = React.useMemo<MetricTile[]>(() => {
    const myOpen = all.filter((t) => t.status === "open" && t.assignee_id === user?.id);
    const teamOpen = all.filter((t) => t.status === "open");
    const overdue = teamOpen.filter(isOverdue);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const doneThisWeek = all.filter(
      (t) => t.status === "done" && t.completed_at && new Date(t.completed_at).getTime() >= weekAgo,
    );
    return [
      {
        label: "My open",
        value: String(myOpen.length),
        sub: myOpen.filter(isOverdue).length > 0
          ? `${myOpen.filter(isOverdue).length} overdue`
          : "all on schedule",
        icon: ListTodo,
        tone: myOpen.filter(isOverdue).length > 0 ? "partial" : "default",
        onClick: () => {
          setWho("mine");
          setStatus("open");
        },
      },
      {
        label: "Team open",
        value: String(teamOpen.length),
        sub: `${new Set(teamOpen.map((t) => t.assignee_id).values()).size} people`,
        icon: Users,
        onClick: () => {
          setWho("everyone");
          setStatus("open");
        },
      },
      {
        label: "Overdue",
        value: String(overdue.length),
        sub: overdue.length === 0 ? "Clean" : "Needs attention",
        icon: AlertTriangle,
        tone: overdue.length > 0 ? "overdue" : "default",
        onClick: () => {
          setWho("everyone");
          setStatus("open");
        },
      },
      {
        label: "Done · 7 days",
        value: String(doneThisWeek.length),
        sub: "completed this week",
        icon: CheckCircle2,
        tone: doneThisWeek.length > 0 ? "paid" : "default",
        onClick: () => {
          setWho("everyone");
          setStatus("done");
        },
      },
    ];
  }, [all, user?.id, setWho, setStatus]);

  async function onToggle(t: Task) {
    try {
      await update.mutateAsync({
        id: t.id,
        patch: { status: t.status === "open" ? "done" : "open" },
      });
    } catch (e) {
      toast.error(`Update failed: ${(e as Error).message}`);
    }
  }

  async function onDelete(t: Task) {
    const ok = await confirm({
      title: "Delete this task?",
      description: `"${t.title}" — cannot be undone. (Completing it keeps the history instead.)`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync({ id: t.id });
      toast.success("Task deleted");
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Workspace · Tasks"
        eyebrow="Team task board"
        title="Tasks"
        description={
          <>
            Shared follow-ups for the whole team — assign, set a due date,
            and link tasks to campaigns, vendors, or creators. Everyone
            sees the same board.
          </>
        }
        actions={
          <Button size="sm" className="h-8 text-[12px]" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
            New task
          </Button>
        }
      />

      <MetricStrip tiles={kpis} />

      {/* Filter chips — mirror the Campaigns-page idiom. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {(
            [
              { value: "mine", label: "Mine" },
              { value: "everyone", label: "Everyone" },
            ] as { value: WhoFilter; label: string }[]
          ).map((f) => (
            <FilterChip key={f.value} active={who === f.value} onClick={() => setWho(f.value)}>
              {f.label}
            </FilterChip>
          ))}
        </div>
        <div className="h-4 w-px bg-rule" />
        <div className="flex items-center gap-1">
          {(
            [
              { value: "open", label: "Open" },
              { value: "done", label: "Done" },
              { value: "all", label: "All" },
            ] as { value: StatusFilter; label: string }[]
          ).map((f) => (
            <FilterChip key={f.value} active={status === f.value} onClick={() => setStatus(f.value)}>
              {f.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-overdue/40 bg-overdue/10 p-4 text-[13px] text-overdue">
          Failed to load tasks: {(error as Error).message}. If the table
          doesn't exist yet, migration 0054 hasn't been applied.
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed bg-card/40 px-4 py-10 text-center text-[13px] text-steel">
          {who === "mine" && status === "open"
            ? "Nothing on your plate — add a task or check the team view."
            : "No tasks match the current filters."}
        </div>
      ) : (
        <ul className="divide-y divide-rule rounded-lg border bg-card">
          {filtered.map((t) => {
            const overdue = isOverdue(t);
            const link = taskEntityLink(t);
            return (
              <li key={t.id} className={cn("flex items-start gap-3 px-3 py-2.5", t.status === "done" && "opacity-55")}>
                <input
                  type="checkbox"
                  checked={t.status === "done"}
                  onChange={() => onToggle(t)}
                  aria-label={t.status === "done" ? "Reopen task" : "Complete task"}
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[var(--electric)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "text-[13.5px] font-medium text-white",
                        t.status === "done" && "line-through",
                      )}
                    >
                      {t.title}
                    </span>
                    {t.entity_label ? (
                      link ? (
                        <Link
                          to={link}
                          className="inline-flex items-center gap-1 rounded-full border border-rule bg-background/40 px-2 py-0.5 text-[11px] text-steel hover:border-electric/40 hover:text-electric"
                          title={`Open ${t.entity_label}`}
                        >
                          <Link2 className="h-3 w-3" strokeWidth={1.5} />
                          {t.entity_label}
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rule bg-background/40 px-2 py-0.5 text-[11px] text-steel">
                          <Link2 className="h-3 w-3" strokeWidth={1.5} />
                          {t.entity_label}
                        </span>
                      )
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-steel">
                    <span>{memberName(members, t.assignee_id)}</span>
                    {t.due_date ? (
                      <span className={cn(overdue && "font-semibold text-overdue")}>
                        Due {formatDate(t.due_date)}
                        {overdue ? " · overdue" : ""}
                      </span>
                    ) : null}
                    {t.notes ? (
                      <span className="truncate text-steel/80" title={t.notes}>
                        {t.notes}
                      </span>
                    ) : null}
                  </div>
                </div>
                {/* Menu shows for everyone; RLS is the enforcement —
                    an operator editing someone else's task gets the
                    server's rejection surfaced as a toast. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditing(t)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-overdue focus:text-overdue"
                      onClick={() => onDelete(t)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}

      {dialogOpen && <TaskDialog open onOpenChange={setDialogOpen} />}
      {editing && (
        <TaskDialog open onOpenChange={(o) => !o && setEditing(null)} task={editing} />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-md border px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors duration-base ease-out",
        active
          ? "border-electric/40 bg-electric/10 text-electric"
          : "border-rule bg-card text-steel hover:bg-white/[0.04] hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
