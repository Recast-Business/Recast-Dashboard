import * as React from "react";
import { Link2 } from "lucide-react";
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
import { useAuth } from "@/auth/AuthProvider";
import {
  memberName,
  useCreateTask,
  useTeamMembers,
  useUpdateTask,
  type Task,
  type TaskEntityType,
} from "@/hooks/useTasks";

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

export function TaskDialog({ open, onOpenChange, task = null, entity = null }: Props) {
  const { user } = useAuth();
  const { data: members } = useTeamMembers();
  const create = useCreateTask();
  const update = useUpdateTask();

  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [assigneeId, setAssigneeId] = React.useState<string>(UNASSIGNED);
  const [dueDate, setDueDate] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setNotes(task.notes ?? "");
      setAssigneeId(task.assignee_id ?? UNASSIGNED);
      setDueDate(task.due_date);
    } else {
      setTitle("");
      setNotes("");
      // New tasks default to "assign to me" — the most common case
      // is jotting your own follow-up; reassigning is one click.
      setAssigneeId(user?.id ?? UNASSIGNED);
      setDueDate(null);
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
          },
        });
        toast.success("Task updated");
      } else {
        await create.mutateAsync({
          title: title.trim(),
          notes: notes.trim() || null,
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

  const busy = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription className="text-[12px]">
            Visible to the whole team. The assignee, you, and admins can
            edit or complete it.
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={busy}>
            {busy ? "Saving…" : task ? "Save" : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
