import * as React from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Flag,
  Link2,
  ListTodo,
  MessageSquare,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, MetricStrip, Avatar, type MetricTile } from "@/components/recast";
import { TaskDialog } from "@/components/tasks/TaskDialog";
import { useAuth } from "@/auth/AuthProvider";
import { useSessionState } from "@/hooks/useSessionState";
import {
  PRIORITY_ORDER,
  isOverdue,
  memberName,
  taskEntityLink,
  useTaskCommentCounts,
  useTasks,
  useTeamMembers,
  useUpdateTask,
  type Task,
  type TaskPriority,
} from "@/hooks/useTasks";
import { cn, formatDate } from "@/lib/utils";

/**
 * /tasks — the team task board, v2 (Pipeline section, every role).
 *
 * Layout follows the grouped-by-due pattern the big task managers
 * (Asana/Todoist/Linear) converge on: Overdue → Today → This week →
 * Later → No due date, with priority flags, assignee avatars, and a
 * per-task comment thread. Data is realtime — anyone's change
 * refreshes every open board, and a new task assigned to you pops a
 * toast (plus an email via the 0055 trigger once Resend is live).
 */

type StatusFilter = "open" | "done" | "all";

const PRIORITY_META: Record<TaskPriority, { label: string; cls: string }> = {
  urgent: { label: "Urgent", cls: "text-overdue" },
  high: { label: "High", cls: "text-partial" },
  medium: { label: "Medium", cls: "text-electric" },
  low: { label: "Low", cls: "text-steel" },
};

type Bucket = "overdue" | "today" | "week" | "later" | "none";

const BUCKET_ORDER: Bucket[] = ["overdue", "today", "week", "later", "none"];
const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Due today",
  week: "This week",
  later: "Later",
  none: "No due date",
};

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dueBucket(t: Task): Bucket {
  if (!t.due_date) return "none";
  const today = toYMD(new Date());
  if (t.due_date < today) return "overdue";
  if (t.due_date === today) return "today";
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  if (t.due_date <= toYMD(weekEnd)) return "week";
  return "later";
}

/** Priority first (urgent → low), then due date, then newest. */
function taskCompare(a: Task, b: Task): number {
  const p = PRIORITY_ORDER[a.priority ?? "medium"] - PRIORITY_ORDER[b.priority ?? "medium"];
  if (p !== 0) return p;
  const ad = a.due_date ?? "9999-12-31";
  const bd = b.due_date ?? "9999-12-31";
  if (ad !== bd) return ad.localeCompare(bd);
  return b.created_at.localeCompare(a.created_at);
}

const ASSIGNEE_ME = "__me__";
const ASSIGNEE_ALL = "__all__";
const ASSIGNEE_NONE = "__none__";

export function TasksPage() {
  const { user } = useAuth();
  const { data: tasks, isLoading, error } = useTasks();
  const { data: members } = useTeamMembers();
  const { data: commentCounts } = useTaskCommentCounts();
  const update = useUpdateTask();

  const [assignee, setAssignee] = useSessionState<string>("recast.tasks.assignee", ASSIGNEE_ME);
  const [status, setStatus] = useSessionState<StatusFilter>("recast.tasks.status", "open");
  const [search, setSearch] = useSessionState<string>("recast.tasks.search", "");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Task | null>(null);

  const all = React.useMemo(() => tasks ?? [], [tasks]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((t) => {
      if (assignee === ASSIGNEE_ME && t.assignee_id !== user?.id) return false;
      if (assignee === ASSIGNEE_NONE && t.assignee_id !== null) return false;
      if (
        assignee !== ASSIGNEE_ME &&
        assignee !== ASSIGNEE_ALL &&
        assignee !== ASSIGNEE_NONE &&
        t.assignee_id !== assignee
      )
        return false;
      if (status !== "all" && t.status !== status) return false;
      if (q) {
        const hay = [t.title, t.notes ?? "", t.entity_label ?? ""].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [all, assignee, status, search, user?.id]);

  // Open tasks group into due buckets; done/all render flat.
  const buckets = React.useMemo(() => {
    if (status !== "open") return null;
    const map = new Map<Bucket, Task[]>();
    for (const t of filtered) {
      const b = dueBucket(t);
      map.set(b, [...(map.get(b) ?? []), t]);
    }
    for (const list of map.values()) list.sort(taskCompare);
    return map;
  }, [filtered, status]);

  const flat = React.useMemo(() => {
    if (status === "open") return null;
    return [...filtered].sort((a, b) => {
      const ac = a.completed_at ?? a.created_at;
      const bc = b.completed_at ?? b.created_at;
      return bc.localeCompare(ac);
    });
  }, [filtered, status]);

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
        sub:
          myOpen.filter(isOverdue).length > 0
            ? `${myOpen.filter(isOverdue).length} overdue`
            : "all on schedule",
        icon: ListTodo,
        tone: myOpen.filter(isOverdue).length > 0 ? "partial" : "default",
        onClick: () => {
          setAssignee(ASSIGNEE_ME);
          setStatus("open");
        },
      },
      {
        label: "Team open",
        value: String(teamOpen.length),
        sub: `${new Set(teamOpen.map((t) => t.assignee_id)).size} people`,
        icon: Users,
        onClick: () => {
          setAssignee(ASSIGNEE_ALL);
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
          setAssignee(ASSIGNEE_ALL);
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
          setAssignee(ASSIGNEE_ALL);
          setStatus("done");
        },
      },
    ];
  }, [all, user?.id, setAssignee, setStatus]);

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

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Pipeline · Tasks"
        eyebrow="Team task board"
        title="Tasks"
        description={
          <>
            One board for the whole team — priorities, due dates, comment
            threads, and links back to the campaign, vendor, or creator a
            task belongs to. Assignees are emailed when work lands on
            their plate.
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

      {/* ── Toolbar: search + assignee + status ──────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel" strokeWidth={1.5} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="h-8 w-56 pl-8 text-[12.5px]"
          />
        </div>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="h-8 w-[170px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ASSIGNEE_ME}>My tasks</SelectItem>
            <SelectItem value={ASSIGNEE_ALL}>Everyone</SelectItem>
            <SelectItem value={ASSIGNEE_NONE}>Unassigned</SelectItem>
            {(members ?? []).map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.full_name?.trim() || m.email.split("@")[0]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <span className="ml-auto text-[11px] text-steel tabular-nums">
          {filtered.length} task{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* ── Board ────────────────────────────────────────────────────── */}
      {error ? (
        <div className="rounded-md border border-overdue/40 bg-overdue/10 p-4 text-[13px] text-overdue">
          Failed to load tasks: {(error as Error).message}. If the table
          doesn't exist yet, migrations 0054/0055 haven't been applied.
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed bg-card/40 px-4 py-12 text-center">
          <ListTodo className="mx-auto h-6 w-6 text-steel" strokeWidth={1.5} />
          <p className="mt-2 text-[13px] text-steel">
            {assignee === ASSIGNEE_ME && status === "open" && !search
              ? "Nothing on your plate — add a task or check the team view."
              : "No tasks match the current filters."}
          </p>
        </div>
      ) : buckets ? (
        <div className="space-y-5">
          {BUCKET_ORDER.map((b) => {
            const list = buckets.get(b);
            if (!list || list.length === 0) return null;
            return (
              <section key={b}>
                <div className="mb-1.5 flex items-center gap-2 px-0.5">
                  <span
                    className={cn(
                      "text-[10.5px] font-semibold uppercase tracking-[0.1em]",
                      b === "overdue" ? "text-overdue" : "text-steel",
                    )}
                  >
                    {BUCKET_LABEL[b]}
                  </span>
                  <span className="text-[10.5px] text-steel tabular-nums">{list.length}</span>
                  <div className="h-px flex-1 bg-rule" />
                </div>
                <TaskList
                  tasks={list}
                  members={members}
                  commentCounts={commentCounts}
                  onToggle={onToggle}
                  onEdit={setEditing}
                />
              </section>
            );
          })}
        </div>
      ) : flat ? (
        <TaskList
          tasks={flat}
          members={members}
          commentCounts={commentCounts}
          onToggle={onToggle}
          onEdit={setEditing}
        />
      ) : null}

      {dialogOpen && <TaskDialog open onOpenChange={setDialogOpen} />}
      {editing && (
        <TaskDialog open onOpenChange={(o) => !o && setEditing(null)} task={editing} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Row list
// ─────────────────────────────────────────────────────────────────────

function TaskList({
  tasks,
  members,
  commentCounts,
  onToggle,
  onEdit,
}: {
  tasks: Task[];
  members: ReturnType<typeof useTeamMembers>["data"];
  commentCounts: Record<string, number> | undefined;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
}) {
  return (
    <ul className="divide-y divide-rule rounded-lg border bg-card">
      {tasks.map((t) => {
        const overdue = isOverdue(t);
        const link = taskEntityLink(t);
        const pri = PRIORITY_META[t.priority ?? "medium"];
        const comments = commentCounts?.[t.id] ?? 0;
        const assigneeName = memberName(members, t.assignee_id);
        return (
          <li
            key={t.id}
            onClick={() => onEdit(t)}
            className={cn(
              "group flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors duration-base ease-out hover:bg-white/[0.03]",
              t.status === "done" && "opacity-55",
            )}
            title="Open task"
          >
            <input
              type="checkbox"
              checked={t.status === "done"}
              onChange={() => onToggle(t)}
              onClick={(e) => e.stopPropagation()}
              aria-label={t.status === "done" ? "Reopen task" : "Complete task"}
              className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--electric)]"
            />
            <Flag
              className={cn("h-3.5 w-3.5 shrink-0", pri.cls)}
              strokeWidth={2}
              aria-label={`${pri.label} priority`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
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
                      onClick={(e) => e.stopPropagation()}
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
                {comments > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-steel">
                    <MessageSquare className="h-3 w-3" strokeWidth={1.5} />
                    {comments}
                  </span>
                ) : null}
              </div>
              {t.notes ? (
                <p className="mt-0.5 truncate text-[11.5px] text-steel" title={t.notes}>
                  {t.notes}
                </p>
              ) : null}
            </div>
            {t.due_date ? (
              <span
                className={cn(
                  "shrink-0 text-[11.5px] tabular-nums",
                  overdue ? "font-semibold text-overdue" : "text-steel",
                )}
              >
                {formatDate(t.due_date)}
              </span>
            ) : null}
            <div
              className="flex shrink-0 items-center gap-1.5"
              title={t.assignee_id ? `Assigned to ${assigneeName}` : "Unassigned"}
            >
              {t.assignee_id ? (
                <>
                  <Avatar name={assigneeName} size="xs" />
                  <span className="hidden text-[11.5px] text-steel sm:inline">{assigneeName}</span>
                </>
              ) : (
                <span className="text-[11.5px] italic text-steel/70">Unassigned</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
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
