// Google Sheet auto-sync helpers — fire-and-forget posts to /api/update_creator
// so edits in the dashboard mirror into the master Google Sheet. Errors are
// logged to console but do NOT fail the primary Supabase write.
import { apiFetch } from "./apiFetch";

export type SyncField =
  | "outreach_status"
  | "notes"
  | "twitch_handle"
  | "twitch_ccv"
  | "twitch_30d_ccv"
  | "kick_handle"
  | "kick_ccv"
  | "kick_30d_ccv"
  | "platforms"
  | "country"
  | "content_type"
  | "twitter"
  | "instagram"
  | "bin";

export async function syncCreatorField(
  name: string | null | undefined,
  field: SyncField,
  value: unknown,
): Promise<void> {
  if (!name) return;
  try {
    await apiFetch("/api/update_creator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, field, value }),
    });
  } catch (e) {
    console.warn(`[sheet-sync] ${field} for ${name} failed:`, e);
  }
}

export async function syncManyFields(
  name: string | null | undefined,
  patches: Partial<Record<SyncField, unknown>>,
): Promise<void> {
  if (!name) return;
  const entries = Object.entries(patches) as [SyncField, unknown][];
  await Promise.all(
    entries.map(([field, value]) => syncCreatorField(name, field, value)),
  );
}
