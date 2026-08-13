// Service worker minimo, solo para push notifications (no cachea nada / no offline).
// Registrado desde src/lib/pushNotifications.ts.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Gym Social", body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Gym Social", {
      body: data.body || "",
      icon: "/images/icon-192.png",
      badge: "/images/icon-192.png",
      data: { url: data.url || "/pages/notifications.html" },
    })
  );
});

// Foco a una pestaña ya abierta en esa URL exacta si existe, si no abre una nueva
// (no hay router client-side para "navegar" una pestaña ya abierta en otra pagina).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/pages/notifications.html";
  const targetUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const exact = wins.find((w) => w.url === targetUrl && "focus" in w);
      if (exact) return exact.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
