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

// Android (Chrome/PWA instalada) muestra el "icon" de la notificación tal cual, sin
// redondearlo -- a diferencia de WhatsApp, que recorta la foto de perfil en un círculo.
// Como acá el icon suele ser una foto de perfil (ver actor_id / avatar_url en
// send-web-push), la recortamos nosotros mismos antes de mostrar la notificación. Si
// falla algo (CORS, sin OffscreenCanvas, etc.) devolvemos la url original tal cual.
async function roundIcon(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);

    const size = 192;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    const scale = Math.max(size / bitmap.width, size / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);

    const outBlob = await canvas.convertToBlob({ type: "image/png" });
    return URL.createObjectURL(outBlob);
  } catch {
    return url;
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Gym Social", body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Si ya está mirando la webapp (pestaña al frente y con foco), no hace falta la
      // notificación del sistema -- lo que llega por push ya se refleja en vivo adentro
      // (badge, mensajes nuevos, etc. via realtime). Si la tiene abierta pero de fondo
      // (otra pestaña/app encima), igual le mostramos la notificación.
      if (clients.some((c) => c.focused)) return;

      // El logo por defecto (avisos del sistema, sin actor) ya viene diseñado cuadrado,
      // así que solo redondeamos cuando el icon es una foto de perfil real.
      const icon = data.icon ? await roundIcon(data.icon) : "/images/icon-192.png";

      return self.registration.showNotification(data.title || "Gym Social", {
        body: data.body || "",
        icon,
        badge: "/images/icon-192.png",
        data: { url: data.url || "/pages/notifications.html" },
      });
    })()
  );
});

// Foco a una pestaña ya abierta en esa URL exacta si existe. Si hay una pestaña abierta en
// CUALQUIER otra pantalla de la app, le pedimos que navegue ella misma (via el router client-side
// de la SPA, ver el listener de "message" en shell/boot.ts) en vez de abrir/navegar una ventana
// nueva -- eso reinicializa el shell entero de cero (sesion, presencia, listas) y es la principal
// razon por la que entrar desde una notificación se sentía mucho más lento que navegar adentro de
// la app.
//
// Esa pestaña puede estar corriendo JS viejo (abierta desde antes del ultimo deploy, sin el
// listener que agregamos en shell/boot.ts) -- si el mensaje cae en saco roto, la pestaña se queda
// tal cual estaba (ej. mostrando el perfil) en vez de llevar al chat. Por eso se espera una
// confirmacion corta: si no llega, se cae a una navegacion de verdad en esa MISMA pestaña (mas
// lenta que el mensaje, pero nunca deja al usuario en la pantalla equivocada). Solo si no hay
// ninguna pestaña abierta se abre una ventana nueva.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/pages/notifications.html";
  const targetUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const exact = wins.find((w) => w.url === targetUrl && "focus" in w);
      if (exact) return exact.focus();

      const any = wins.find((w) => "focus" in w);
      if (!any) return self.clients.openWindow(targetUrl);

      const acked = await new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve(true);
        any.postMessage({ type: "navigate", url: targetUrl }, [channel.port2]);
        setTimeout(() => resolve(false), 400);
      });
      if (acked) return any.focus();

      if ("navigate" in any) {
        try {
          await any.navigate(targetUrl);
          return any.focus();
        } catch {
          // sigue al openWindow de abajo
        }
      }
      return self.clients.openWindow(targetUrl);
    })()
  );
});
