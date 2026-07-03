import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

/**
 * Round 3: shared team task list (migration 0054).
 *
 * Visibility is deliberately team-wide — every role reads all tasks
 * (it's a shared board, not private todos). RLS enforces the write
 * rules server-side: edit/complete = assignee, creator, or admin;
 * delete = creator or admin.
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
  assignee_id: string | null;
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
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("status", { ascending: true }) // open before done
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Task[];
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
  assignee_id: string | null;
  due_date: string | null;
  entity_type: TaskEntityType | null;
  entity_id: string | null;
  entity_label: string | null;
}

export function useCreateTask() {
  return useTaskMutation(async (input: CreateTaskInput) => {
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user.id;
    if (!uid) throw new Error("Not signed in");
    const { error } = await supabase.from("tasks").insert({
      ...input,
      title: input.title.trim(),
      created_by: uid,
    });
    if (error) throw error;
  });
}

export function useUpdateTask() {
  return useTaskMutation(
    async (v: {
      id: string;
      patch: Partial<
        Pick<Task, "title" | "notes" | "assignee_id" | "due_date" | "status" | "priority">
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
 * Mounted once in AppShell. Any change to the tasks table anywhere on
 * the team refreshes the board + sidebar badge for everyone with the
 * app open; a brand-new task assigned to YOU by someone else also
 * pops a toast. (Reassignment-to-you toasts are skipped — realtime
 * UPDATE payloads only carry the row's PK in `old`, so we can't tell
 * a reassignment from an unrelated edit. The assignment email from
 * migration 0055 covers that path.)
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
        (payload) => {
          qc.invalidateQueries({ queryKey: ["tasks"] });
          qc.invalidateQueries({ queryKey: ["nav-counts"] });
          if (payload.eventType === "INSERT") {
            const row = payload.new as Task;
            if (row.assignee_id === user.id && row.created_by !== user.id) {
              toast.info(`New task assigned to you: ${row.title}`, {
                duration: 8000,
              });
            }
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, user]);
}
