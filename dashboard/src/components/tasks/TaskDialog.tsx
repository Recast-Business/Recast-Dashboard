import * as React from "react";
import { Check, Flag, Link2, Send, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Avatar } from "@/components/recast";
import { formatDistanceToNow } from "@/components/activity/formatDistanceToNow";
import { useAuth } from "@/auth/AuthProvider";
import { useConfirm } from "@/hooks/useConfirm";
import {
  memberName,
  useAddTaskComment,
  useCreateTask,
  useDeleteTask,
  useSetTaskAssignees,
  useTaskComments,
  useTasks,
  useTeamMembers,
  useUpdateTask,
  type Task,
  type TaskEntityType,
  type TaskPriority,
} from "@/hooks/useTasks";
import { cn } from "@/lib/utils";

/** Entity prefill for quick-add buttons ("+ Task" on a campaign
 *  card / vendor page / creator profile). */
export interface TaskEntityRef {
  type: TaskEntityType;
  id: string;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Editing an existing task. Null/undefined = creating. */
  task?: Task | null;
  /** Create-mode only: pre-link the new task to this entity. */
  entity?: TaskEntityRef | null;
}

const PRIORITIES: { value: TaskPriority; label: string; cls: string }[] = [
  { value: "low", label: "Low", cls: "text-steel" },
  { value: "medium", label: "Medium", cls: "text-electric" },
  { value: "high", label: "High", cls: "text-partial" },
  { value: "urgent", label: "Urgent", cls: "text-overdue" },
];

/**
 * Task Detail Panel — Round 4 redesign (per the "Creator Management
 * Task Board" design handoff). Right-side slide-over instead of a
 * centered modal, Attio-style: open a task without leaving the
 * board, every field writes through immediately (no Save button).
 *
 * Create-mode creates the row on open (defaults: "New task", medium
 * priority, assigned to you) and edits it live from there — matches
 * the handoff's "+ New Task inserts + opens the panel" behavior.
 */
export function TaskDialog({ open, onOpenChange, task = null, entity = null }: Props) {
  const { user } = useAuth();
  const create = useCreateTask();
  const { data: tasks } = useTasks();
  const [createdTask, setCreatedTask] = React.useState<Task | null>(null);
  const creatingRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) {
      setCreatedTask(null);
      creatingRef.current = false;
      return;
    }
    if (task || createdTask || creatingRef.current || !user) return;
    creatingRef.current = true;
    create.mutate(
      {
        title: "New task",
        notes: null,
        priority: "medium",
        assignee_ids: [user.id],
        assign_everyone: false,
        due_date: null,
        entity_type: entity?.type ?? null,
        entity_id: entity?.id ?? null,
        entity_label: entity?.label ?? null,
      },
      {
        onSuccess: (t) => setCreatedTask(t),
        onError: (e) => {
          toast.error(`Couldn't create task: ${(e as Error).message}`);
          onOpenChange(false);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task, user?.id]);

  const snapshot = task ?? createdTask;
  // Every field write (priority, assignees, due date, status) goes
  // through a mutation that invalidates the ["tasks"] query — but
  // `task`/`createdTask` are one-time snapshots that never pick that
  // up. Prefer the live row from the shared cache so clicks actually
  // show a result; fall back to the snapshot only for the brief gap
  // before the first fetch lands (or if this task isn't in the
  // cached list for some reason).
  const activeTask = (snapshot && tasks?.find((t) => t.id === snapshot.id)) ?? snapshot;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col p-0">
        {activeTask ? (
          <TaskPanelBody task={activeTask} isNew={!task} onClose={() => onOpenChange(false)} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-[12.5px] text-steel">
            Creating task…
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TaskPanelBody({
  task,
  isNew,
  onClose,
}: {
  task: Task;
  isNew: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { data: members } = useTeamMembers();
  const update = useUpdateTask();
  const setAssignees = useSetTaskAssignees();
  const del = useDeleteTask();
  const confirm = useConfirm();

  const [title, setTitle] = React.useState(task.title);
  const [notes, setNotes] = React.useState(task.notes ?? "");

  React.useEffect(() => {
    setTitle(task.title);
    setNotes(task.notes ?? "");
  }, [task.id, task.title, task.notes]);

  function commitTitle() {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(task.title);
      return;
    }
    if (trimmed === task.title) return;
    update.mutate({ id: task.id, patch: { title: trimmed } });
  }

  function commitNotes() {
    const trimmed = notes.trim() || null;
    if (trimmed === (task.notes ?? null)) return;
    update.mutate({ id: task.id, patch: { notes: trimmed } });
  }

  function setPriority(priority: TaskPriority) {
    if (priority === task.priority) return;
    update.mutate({ id: task.id, patch: { priority } });
  }

  function setDueDate(due_date: string | null) {
    update.mutate({ id: task.id, patch: { due_date } });
  }

  function toggleDone() {
    update.mutate({ id: task.id, patch: { status: task.status === "done" ? "open" : "done" } });
  }

  function toggleEveryone() {
    update.mutate({ id: task.id, patch: { assign_everyone: !task.assign_everyone } });
  }

  function toggleAssignee(userId: string) {
    const next = task.assignee_ids.includes(userId)
      ? task.assignee_ids.filter((id) => id !== userId)
      : [...task.assignee_ids, userId];
    setAssignees.mutate({ taskId: task.id, userIds: next });
  }

  async function onDelete() {
    const ok = await confirm({
      title: "Delete this task?",
      description: `"${task.title}" — cannot be undone. (Completing it keeps the history instead.)`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync({ id: task.id });
      toast.success("Task deleted");
      onClose();
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  return (
    <>
      <SheetTitle className="sr-only">{isNew ? "New task" : task.title}</SheetTitle>
      <SheetDescription className="sr-only">
        Edit priority, assignees, due date, notes, and comments. Changes save automatically.
      </SheetDescription>

      {/* Header */}
      <SheetHeader className="border-b border-rule">
        {task.entity_label ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-rule bg-background/40 px-2 py-0.5 text-[11px] text-steel">
            <Link2 className="h-3 w-3" strokeWidth={1.5} />
            {task.entity_label}
          </span>
        ) : (
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel">
            Task
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggleDone}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-semibold transition-colors duration-base ease-out",
              task.status === "done"
                ? "border-electric/40 bg-electric/10 text-electric"
                : "border-rule bg-card text-steel hover:bg-white/[0.04] hover:text-white",
            )}
          >
            <Check className="h-3 w-3" strokeWidth={2.5} />
            {task.status === "done" ? "Reopen" : "Mark done"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-steel transition-colors duration-base ease-out hover:bg-white/[0.06] hover:text-white"
            title="Close"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </SheetHeader>

      {/* Body */}
      <div className="flex-1 space-y-[18px] overflow-y-auto px-5 py-5">
        <p className="-mb-2 text-[11px] text-steel">
          Every change here saves automatically — just close the panel when you're done.
        </p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="-mx-1.5 w-[calc(100%+12px)] rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[18px] font-semibold tracking-[-0.01em] text-white outline-none transition-colors duration-base ease-out placeholder:text-steel hover:border-rule focus:border-electric/40 focus:bg-white/[0.03]"
          placeholder="Task title"
        />

        <div className="grid gap-1.5">
          <Label className="text-[10px] uppercase tracking-[0.12em] text-steel">Priority</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPriority(p.value)}
                className={cn(
                  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border text-[11px] font-semibold transition-colors duration-base ease-out",
                  task.priority === p.value
                    ? "border-electric bg-electric/[0.12] text-white"
                    : "border-rule bg-card text-steel hover:bg-white/[0.04]",
                )}
              >
                <Flag className={cn("h-3 w-3", p.cls)} strokeWidth={2} />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-[10px] uppercase tracking-[0.12em] text-steel">Assignees</Label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={toggleEveryone}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-medium transition-colors duration-base ease-out",
                task.assign_everyone
                  ? "border-electric bg-electric/[0.12] text-white"
                  : "border-rule bg-card text-steel hover:bg-white/[0.04] hover:text-white",
              )}
            >
              <Users className="h-3 w-3" strokeWidth={2} />
              Everyone
            </button>
            {(members ?? []).map((m) => {
              const active = !task.assign_everyone && task.assignee_ids.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={task.assign_everyone}
                  onClick={() => toggleAssignee(m.id)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-medium transition-colors duration-base ease-out",
                    task.assign_everyone
                      ? "cursor-not-allowed border-rule bg-card text-steel/40"
                      : active
                        ? "border-electric bg-electric/[0.12] text-white"
                        : "border-rule bg-card text-steel hover:bg-white/[0.04] hover:text-white",
                  )}
                >
                  <Avatar name={memberName(members, m.id)} size="xs" />
                  {memberName(members, m.id)}
                  {m.id === user?.id ? " (you)" : ""}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="tk-due" className="text-[10px] uppercase tracking-[0.12em] text-steel">
            Due date
          </Label>
          <DatePicker id="tk-due" value={task.due_date} onChange={setDueDate} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="tk-notes" className="text-[10px] uppercase tracking-[0.12em] text-steel">
            Notes
          </Label>
          <textarea
            id="tk-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={commitNotes}
            rows={3}
            className="min-h-[88px] w-full resize-y rounded-md border bg-card px-3 py-2 text-[13px] leading-[1.5] text-white/90"
          />
        </div>

        <CommentThread taskId={task.id} />
      </div>

      {/* Footer — comment composer is the primary action; delete is
          tucked in small beside it so it's reachable but not loud. */}
      <SheetFooter className="flex-col items-stretch gap-2 border-t border-rule">
        <CommentComposer taskId={task.id} />
        <button
          type="button"
          onClick={onDelete}
          disabled={del.isPending}
          className="inline-flex w-fit items-center gap-1 text-[11px] text-steel transition-colors duration-base ease-out hover:text-overdue"
        >
          <Trash2 className="h-3 w-3" strokeWidth={1.5} />
          Delete task
        </button>
      </SheetFooter>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Comment thread — Assignees + creator get an email per comment
// (or the whole team, if assign_everyone), minus the author.
// ─────────────────────────────────────────────────────────────────────

function CommentThread({ taskId }: { taskId: string }) {
  const { data: comments, isLoading } = useTaskComments(taskId);
  const { data: members } = useTeamMembers();

  return (
    <div className="grid gap-2 border-t border-rule pt-4">
      <Label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-steel">
        Comments
        {comments && comments.length > 0 ? (
          <span className="text-[11px] font-normal normal-case tracking-normal text-steel">
            · {comments.length}
          </span>
        ) : null}
      </Label>

      {isLoading ? (
        <p className="text-[12px] text-steel">Loading…</p>
      ) : comments && comments.length > 0 ? (
        <ul className="space-y-3">
          {comments.map((c) => {
            const name = memberName(members, c.author_id);
            return (
              <li key={c.id} className="flex items-start gap-2">
                <Avatar name={name} size="sm" className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[12px] font-semibold text-white">{name}</span>
                    <span className="text-[11px] tabular-nums text-steel">
                      {formatDistanceToNow(c.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-[1.5] text-[#D1D5DB]">
                    {c.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[12px] text-[#4B5563]">No comments yet.</p>
      )}
    </div>
  );
}

/** Comment composer, pinned in the panel footer (outside the
 *  scrollable body) so it's always reachable regardless of thread
 *  length. */
function CommentComposer({ taskId }: { taskId: string }) {
  const add = useAddTaskComment();
  const [body, setBody] = React.useState("");

  async function onAdd() {
    if (!body.trim()) return;
    try {
      await add.mutateAsync({ taskId, body });
      setBody("");
    } catch (e) {
      toast.error(`Comment failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="flex items-center gap-2 pt-1">
      <Input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a comment…"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !add.isPending) onAdd();
        }}
        className="h-[34px]"
      />
      <Button
        type="button"
        size="icon"
        variant="outline"
        onClick={onAdd}
        disabled={add.isPending || !body.trim()}
        title="Send comment"
        className="h-[34px] w-[34px]"
      >
        <Send className="h-4 w-4" strokeWidth={1.5} />
      </Button>
    </div>
  );
}

