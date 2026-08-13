// Service worker minimo, solo para push notifications (no cachea nada / no offline).
// Registrado desde src/lib/pushNotifications.ts.

// Sin esto, un service worker nuevo se queda "esperando" hasta que se cierren todas las
// pestañas/la PWA -- cualquier cambio aca (ej. como se arma el icono de la notificacion)
// tardaria en llegar a quien ya la tiene instalada. skipWaiting + clients.claim lo activa
// de inmediato en la siguiente carga.
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
    data = { title: "Gym Social", body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Si ya está mirando la webapp (pestaña al frente y con foco), no hace falta la
      // notificación del sistema -- lo que llega por push ya se refleja en vivo adentro
      // (badge, mensajes nuevos, etc. via realtime). Si la tiene abierta pero de fondo
      // (otra pestaña/app encima), igual le mostramos la notificación.
      if (clients.some((c) => c.focused)) return;

      return self.registration.showNotification(data.title || "Gym Social", {
        body: data.body || "",
        icon: data.icon || "/images/icon-192.png",
        badge: "/images/icon-192.png",
        data: { url: data.url || "/pages/notifications.html" },
      });
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
