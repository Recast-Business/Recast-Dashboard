// send-push — Round 4 (Max): real browser push notifications.
//
// Called from Postgres (via pg_net, see _send_push() in migration
// 0057) whenever a task is assigned or commented on. Not called
// directly by the frontend. Web Push requires per-message payload
// encryption (ECDH + AES-GCM) and a VAPID-signed JWT — that's not
// practical in plain SQL, so it happens here in Deno via the
// `web-push` npm package instead.
//
// Auth: this function's URL is publicly reachable (verify_jwt is
// off for it, since the caller is Postgres, not a logged-in user),
// so every request must carry the shared x-push-secret header
// matching PUSH_FUNCTION_SECRET — anyone without it gets a 401.
//
// Deploy:
//   supabase functions deploy send-push --project-ref <ref> --no-verify-jwt
// Secrets:
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@domain.com PUSH_FUNCTION_SECRET=... --project-ref <ref>

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@recast.gg";
const PUSH_FUNCTION_SECRET = Deno.env.get("PUSH_FUNCTION_SECRET") ?? "";
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected into
// every Edge Function — no need to set them as secrets ourselves.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

interface PushBody {
  user_ids: string[];
  title: string;
  body: string;
  url?: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  if (!PUSH_FUNCTION_SECRET || req.headers.get("x-push-secret") !== PUSH_FUNCTION_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let payload: PushBody;
  try {
    payload = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const { user_ids, title, body, url } = payload;
  if (!Array.isArray(user_ids) || user_ids.length === 0 || !title) {
    return new Response("ok", { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", user_ids);

  if (error) {
    return new Response(`lookup failed: ${error.message}`, { status: 500 });
  }

  const message = JSON.stringify({ title, body, url: url ?? "/tasks" });

  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message,
        );
      } catch (err) {
        // 404/410 = the browser revoked or expired this subscription
        // (uninstalled, permission revoked, storage cleared) — clean
        // it up so we stop trying. Any other error just gets
        // swallowed; this is a best-effort notification, not a
        // guaranteed delivery.
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }),
  );

  return new Response("ok", { status: 200 });
});
