import * as React from "react";
import { Flag, Link2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  useTaskComments,
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

const UNASSIGNED = "__unassigned__";

const PRIORITIES: { value: TaskPriority; label: string; chip: string }[] = [
  { value: "low", label: "Low", chip: "border-rule text-steel" },
  { value: "medium", label: "Medium", chip: "border-electric/40 text-electric" },
  { value: "high", label: "High", chip: "border-partial/50 text-partial" },
  { value: "urgent", label: "Urgent", chip: "border-overdue/50 text-overdue" },
];

export function TaskDialog({ open, onOpenChange, task = null, entity = null }: Props) {
  const { user } = useAuth();
  const { data: members } = useTeamMembers();
  const create = useCreateTask();
  const update = useUpdateTask();
  const del = useDeleteTask();
  const confirm = useConfirm();

  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [assigneeId, setAssigneeId] = React.useState<string>(UNASSIGNED);
  const [dueDate, setDueDate] = React.useState<string | null>(null);
  const [priority, setPriority] = React.useState<TaskPriority>("medium");

  React.useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setNotes(task.notes ?? "");
      setAssigneeId(task.assignee_id ?? UNASSIGNED);
      setDueDate(task.due_date);
      setPriority(task.priority ?? "medium");
    } else {
      setTitle("");
      setNotes("");
      // New tasks default to "assign to me" — the most common case
      // is jotting your own follow-up; reassigning is one click.
      setAssigneeId(user?.id ?? UNASSIGNED);
      setDueDate(null);
      setPriority("medium");
    }
  }, [open, task, user?.id]);

  const linkedLabel = task?.entity_label ?? entity?.label ?? null;

  async function onSave() {
    if (!title.trim()) return toast.error("Task needs a title.");
    const assignee = assigneeId === UNASSIGNED ? null : assigneeId;
    try {
      if (task) {
        await update.mutateAsync({
          id: task.id,
          patch: {
            title: title.trim(),
            notes: notes.trim() || null,
            assignee_id: assignee,
            due_date: dueDate,
            priority,
          },
        });
        toast.success("Task updated");
      } else {
        await create.mutateAsync({
          title: title.trim(),
          notes: notes.trim() || null,
          priority,
          assignee_id: assignee,
          due_date: dueDate,
          entity_type: entity?.type ?? null,
          entity_id: entity?.id ?? null,
          entity_label: entity?.label ?? null,
        });
        toast.success(
          assignee && assignee !== user?.id
            ? `Task assigned to ${memberName(members, assignee)}`
            : "Task added",
        );
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  async function onDelete() {
    if (!task) return;
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
      onOpenChange(false);
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  const busy = create.isPending || update.isPending || del.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription className="text-[12px]">
            Visible to the whole team. The assignee gets an email when a
            task lands on their plate.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {linkedLabel ? (
            <div className="flex items-center gap-1.5 rounded-md border bg-muted/20 px-2.5 py-1.5 text-[12px] text-steel">
              <Link2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              Linked to <span className="font-medium text-white">{linkedLabel}</span>
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="tk-title">Title *</Label>
            <Input
              id="tk-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) onSave();
              }}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Priority</Label>
            <div className="flex items-center gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors duration-base ease-out",
                    priority === p.value
                      ? cn("bg-white/[0.04]", p.chip)
                      : "border-rule bg-card text-steel hover:bg-white/[0.04]",
                  )}
                >
                  <Flag className="h-3 w-3" strokeWidth={2} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {(members ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name?.trim() || m.email}
                      {m.id === user?.id ? " (you)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tk-due">Due date</Label>
              <DatePicker id="tk-due" value={dueDate} onChange={setDueDate} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="tk-notes">Notes</Label>
            <textarea
              id="tk-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          {task ? <CommentThread taskId={task.id} /> : null}
        </div>

        <DialogFooter className={task ? "sm:justify-between" : undefined}>
          {task ? (
            <Button
              variant="outline"
              onClick={onDelete}
              disabled={busy}
              className="text-overdue hover:text-overdue"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
              Delete
            </Button>
          ) : null}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={busy}>
              {busy ? "Saving…" : task ? "Save" : "Add task"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Comment thread — Tasks v2. Assignee + creator get an email per
// comment (0055 trigger), minus the author.
// ─────────────────────────────────────────────────────────────────────

function CommentThread({ taskId }: { taskId: string }) {
  const { data: comments, isLoading } = useTaskComments(taskId);
  const { data: members } = useTeamMembers();
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
    <div className="grid gap-2 border-t border-rule pt-3">
      <Label>
        Comments
        {comments && comments.length > 0 ? (
          <span className="ml-1.5 text-[11px] font-normal text-steel">
            {comments.length}
          </span>
        ) : null}
      </Label>

      {isLoading ? (
        <p className="text-[12px] text-steel">Loading…</p>
      ) : comments && comments.length > 0 ? (
        <ul className="max-h-48 space-y-2.5 overflow-y-auto pr-1">
          {comments.map((c) => {
            const name = memberName(members, c.author_id);
            return (
              <li key={c.id} className="flex items-start gap-2">
                <Avatar name={name} size="xs" className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] text-steel">
                    <span className="font-semibold text-white">{name}</span>{" "}
                    · {formatDistanceToNow(c.created_at)}
                  </div>
                  <p className="whitespace-pre-wrap text-[13px] text-white/90">
                    {c.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[12px] text-steel">No comments yet.</p>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !add.isPending) onAdd();
          }}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={onAdd}
          disabled={add.isPending || !body.trim()}
          title="Send comment"
        >
          <Send className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}
