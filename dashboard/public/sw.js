// Recast Dashboard service worker — Round 4 (Max): browser push
// notifications. Registered once from usePushNotifications.ts.
// Deliberately minimal — no offline caching/asset strategy, this
// exists only to receive push events while the tab isn't focused
// (or isn't open at all, as long as the browser is running).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Recast Dashboard", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Recast Dashboard";
  const options = {
    body: data.body || "",
    icon: "/recast-mark.svg",
    badge: "/recast-mark.svg",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => "focus" in c);
      if (existing) {
        existing.navigate(url);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
