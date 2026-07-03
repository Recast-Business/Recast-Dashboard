import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

/**
 * Round 4 (Max): real OS-level push notifications — "like a Telegram
 * desktop notification" — as an alternative to email for task
 * assignment/comment alerts. Uses the browser's native Web Push API
 * (public/sw.js + this hook) instead of a third-party push vendor;
 * the actual encrypted send happens server-side in the send-push
 * Edge Function (migration 0057 wires it into the task triggers).
 *
 * Per-browser, not per-account: a subscription is tied to one
 * browser's push endpoint, so "enable notifications" needs to happen
 * once on each device/browser someone wants alerts on. That's a Web
 * Push property, not a bug — same as how Telegram desktop
 * notifications are separate from Telegram mobile notifications.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/** Whether THIS browser currently has an active, server-saved
 *  subscription. A person can be subscribed on their work laptop and
 *  not their phone — that's expected, not a bug. */
export function usePushSubscriptionStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["push-subscription-status", user?.id],
    enabled: !!user && isPushSupported(),
    queryFn: async (): Promise<boolean> => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) return false;
      const { data } = await supabase
        .from("push_subscriptions")
        .select("id")
        .eq("endpoint", sub.endpoint)
        .maybeSingle();
      return !!data;
    },
  });
}

export function usePushNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState(false);

  async function subscribe() {
    if (!user) return;
    if (!isPushSupported()) {
      toast.error("This browser doesn't support push notifications.");
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      toast.error("Push isn't configured yet — missing VITE_VAPID_PUBLIC_KEY.");
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error(
          "Notifications are blocked — enable them for this site in your browser's settings, then try again.",
        );
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
      const json = sub.toJSON();
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          user_agent: navigator.userAgent,
        },
        { onConflict: "endpoint" },
      );
      if (error) throw error;
      toast.success("Push notifications are on for this browser.");
      qc.invalidateQueries({ queryKey: ["push-subscription-status"] });
    } catch (e) {
      toast.error(`Couldn't enable notifications: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      toast.success("Push notifications are off for this browser.");
      qc.invalidateQueries({ queryKey: ["push-subscription-status"] });
    } catch (e) {
      toast.error(`Couldn't disable notifications: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return { subscribe, unsubscribe, busy };
}
