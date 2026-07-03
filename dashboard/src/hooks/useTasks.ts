import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

/**
 * Round 3 → Round 4: shared team task list (migrations 0054/0055/0056).
 *
 * Visibility is deliberately team-wide — every role reads all tasks
 * (it's a shared board, not private todos). RLS enforces the write
 * rules server-side: edit/complete = an assignee (or anyone, if the
 * task is assigned to everyone), creator, or admin; delete = creator
 * or admin.
 *
 * Round 4: a task can be assigned to MULTIPLE people (task_assignees
 * join table) or to the whole team at once (assign_everyone flag).
 * useTasks() merges assignee ids onto each Task client-side so every
 * consumer (Overview's strip, the board, the KPI tiles) can keep
 * reading `task.assignee_ids` / `task.assign_everyone` directly
 * instead of re-deriving it per screen.
 *
 * Assignee/creator names are resolved client-side from
 * useTeamMembers() (a SECURITY DEFINER RPC) instead of joining
 * profiles — profiles RLS is self-read-only for non-admins, so an
 * embedded join would silently return null for operators.
 */

export type TaskStatus = "open" | "done";
export type TaskEntityType = "campaign" | "creator" | "vendor";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

/** Sort weight — urgent first. */
export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** Individually-assigned teammates. Ignored (should be empty) when
   *  assign_everyone is true — team-wide tasks don't need per-row
   *  join entries that'd go stale as the roster changes. */
  assignee_ids: string[];
  assign_everyone: boolean;
  due_date: string | null;
  entity_type: TaskEntityType | null;
  entity_id: string | null;
  entity_label: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
}

/** Is this task on the given user's plate — individually or as part
 *  of a team-wide assignment? */
export function isTaskAssignedTo(t: Task, userId: string | null | undefined): boolean {
  if (!userId) return false;
  return t.assign_everyone || t.assignee_ids.includes(userId);
}

/** Where a linked entity's page lives, per type. */
export function taskEntityLink(t: Task): string | null {
  if (!t.entity_type || !t.entity_id) return null;
  switch (t.entity_type) {
    case "campaign":
      return `/campaigns?open=${t.entity_id}`;
    case "creator":
      return `/creators/${t.entity_id}`;
    case "vendor":
      return `/vendors/${t.entity_id}`;
  }
}

export function isOverdue(t: Task): boolean {
  if (t.status === "done" || !t.due_date) return false;
  const due = new Date(`${t.due_date}T23:59:59`);
  return due.getTime() < Date.now();
}

const KEY = ["tasks"] as const;

export function useTasks() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const [tasksRes, assigneesRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("*")
          .order("status", { ascending: true }) // open before done
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false }),
        supabase.from("task_assignees").select("task_id, user_id"),
      ]);
      if (tasksRes.error) throw tasksRes.error;

      const byTask = new Map<string, string[]>();
      if (!assigneesRes.error) {
        for (const r of (assigneesRes.data ?? []) as { task_id: string; user_id: string }[]) {
          const list = byTask.get(r.task_id) ?? [];
          list.push(r.user_id);
          byTask.set(r.task_id, list);
        }
      }

      return (tasksRes.data ?? []).map((t) => ({
        ...t,
        assignee_ids: byTask.get(t.id) ?? [],
      })) as Task[];
    },
  });
}

export function useTeamMembers() {
  return useQuery({
    queryKey: ["team-members"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_team_members");
      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
  });
}

/** Short display name for a member id — full name if set, else the
 *  part of the email before the @. */
export function memberName(members: TeamMember[] | undefined, id: string | null): string {
  if (!id) return "Unassigned";
  const m = members?.find((x) => x.id === id);
  if (!m) return "Unknown";
  return m.full_name?.trim() || m.email.split("@")[0];
}

function useTaskMutation<TVars>(fn: (vars: TVars) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["nav-counts"] });
    },
  });
}

export interface CreateTaskInput {
  title: string;
  notes: string | null;
  priority: TaskPriority;
  /** Ignored when assign_everyone is true. */
  assignee_ids: string[];
  assign_everyone: boolean;
  due_date: string | null;
  entity_type: TaskEntityType | null;
  entity_id: string | null;
  entity_label: string | null;
}

/** Returns the merged Task (row + assignee_ids) so callers can open
 *  the detail panel on it immediately without a refetch round trip
 *  — used for the "+ New task" quick-create flow. */
export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTaskInput): Promise<Task> => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) throw new Error("Not signed in");
      const { title, assignee_ids, ...rest } = input;
      const { data, error } = await supabase
        .from("tasks")
        .insert({ ...rest, title: title.trim(), created_by: uid })
        .select("*")
        .single();
      if (error) throw error;

      if (!input.assign_everyone && assignee_ids.length > 0) {
        const { error: assignErr } = await supabase.from("task_assignees").insert(
          assignee_ids.map((user_id) => ({ task_id: data.id, user_id, added_by: uid })),
        );
        if (assignErr) throw assignErr;
      }

      return { ...data, assignee_ids: input.assign_everyone ? [] : assignee_ids } as Task;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["nav-counts"] });
    },
  });
}

export function useUpdateTask() {
  return useTaskMutation(
    async (v: {
      id: string;
      patch: Partial<
        Pick<Task, "title" | "notes" | "due_date" | "status" | "priority" | "assign_everyone">
      >;
    }) => {
      const patch: Record<string, unknown> = {
        ...v.patch,
        updated_at: new Date().toISOString(),
      };
      // Completing stamps completed_at; reopening clears it.
      if (v.patch.status === "done") patch.completed_at = new Date().toISOString();
      if (v.patch.status === "open") patch.completed_at = null;
      const { error } = await supabase.from("tasks").update(patch).eq("id", v.id);
      if (error) throw error;
    },
  );
}

/** Replace a task's individual assignee set in one call (delete-then-
 *  insert — task_assignees rows are cheap and there's no ordering to
 *  preserve). Turning assign_everyone on separately (via
 *  useUpdateTask) makes these rows moot; leave them or clear them,
 *  either is fine since isTaskAssignedTo() checks assign_everyone
 *  first. */
export function useSetTaskAssignees() {
  return useTaskMutation(async (v: { taskId: string; userIds: string[] }) => {
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user.id;
    if (!uid) throw new Error("Not signed in");
    const { error: delErr } = await supabase
      .from("task_assignees")
      .delete()
      .eq("task_id", v.taskId);
    if (delErr) throw delErr;
    if (v.userIds.length > 0) {
      const { error: insErr } = await supabase
        .from("task_assignees")
        .insert(v.userIds.map((user_id) => ({ task_id: v.taskId, user_id, added_by: uid })));
      if (insErr) throw insErr;
    }
  });
}

export function useDeleteTask() {
  return useTaskMutation(async (v: { id: string }) => {
    const { error } = await supabase.from("tasks").delete().eq("id", v.id);
    if (error) throw error;
  });
}

// ─────────────────────────────────────────────────────────────────────
// Comments (Tasks v2 — migration 0055)
// ─────────────────────────────────────────────────────────────────────

export function useTaskComments(taskId: string | null) {
  return useQuery({
    queryKey: ["task-comments", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_comments")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TaskComment[];
    },
  });
}

export function useAddTaskComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { taskId: string; body: string }) => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) throw new Error("Not signed in");
      const { error } = await supabase.from("task_comments").insert({
        task_id: v.taskId,
        author_id: uid,
        body: v.body.trim(),
      });
      if (error) throw error;
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["task-comments", v.taskId] });
      qc.invalidateQueries({ queryKey: ["task-comment-counts"] });
    },
  });
}

/** task_id → comment count, for the board rows' 💬 n indicator.
 *  One column-only fetch, grouped client-side — fine at team scale.
 *  Errors (e.g. 0055 not applied yet) degrade to zero counts. */
export function useTaskCommentCounts() {
  return useQuery({
    queryKey: ["task-comment-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("task_comments").select("task_id");
      if (error) return {} as Record<string, number>;
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as { task_id: string }[]) {
        map[r.task_id] = (map[r.task_id] ?? 0) + 1;
      }
      return map;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Realtime (Tasks v2) — live board + "assigned to you" toast
// ─────────────────────────────────────────────────────────────────────

/**
 * Mounted once in AppShell. Any change to tasks or task_assignees
 * anywhere on the team refreshes the board + sidebar badge for
 * everyone with the app open; a brand-new individual assignment to
 * YOU by someone else also pops a toast (task_assignees INSERT
 * payloads carry the full new row, including who added it, unlike
 * UPDATE payloads which only carry the PK — that's why the toast
 * lives here and not on a tasks UPDATE OF assign_everyone, which
 * we can't attribute the same way; the email trigger covers that
 * team-wide-assignment path instead).
 */
export function useTasksRealtime() {
  const qc = useQueryClient();
  const { user } = useAuth();

  React.useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("tasks-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => {
          qc.invalidateQueries({ queryKey: ["tasks"] });
          qc.invalidateQueries({ queryKey: ["nav-counts"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_assignees" },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["tasks"] });
          qc.invalidateQueries({ queryKey: ["nav-counts"] });
          const row = payload.new as { user_id: string; added_by: string | null; task_id: string };
          if (row.user_id === user.id && row.added_by !== user.id) {
            toast.info("A task was assigned to you", { duration: 8000 });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "task_assignees" },
        () => {
          qc.invalidateQueries({ queryKey: ["tasks"] });
          qc.invalidateQueries({ queryKey: ["nav-counts"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, user]);
}
