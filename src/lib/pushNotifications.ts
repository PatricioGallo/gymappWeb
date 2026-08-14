import { upsertPushSubscription, deletePushSubscriptionByEndpoint, hasStoredPushSubscription } from "../services/pushNotification.service";

const SW_PATH = "/sw.js";

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// En iOS, Notification/Push directamente no existen salvo que la web este agregada a
// la pantalla de inicio (PWA instalada) -- Safari en una pestaña normal no los soporta.
export function isIosNonStandalone(): boolean {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = (navigator as { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  return isIos && !isStandalone;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  // "ready" espera a que el service worker realmente este activo y controlando la pagina --
  // getRegistration()/register() a secas pueden devolver un registro todavia "installing" recien
  // abierta la PWA (sobre todo en iOS al reabrirla despues de cerrarla del todo), y ahi
  // pushManager.getSubscription() puede devolver null aunque la suscripcion siga viva.
  await navigator.serviceWorker.register(SW_PATH);
  return navigator.serviceWorker.ready;
}

/**
 * Registra el service worker apenas carga la página, sin esperar a que el usuario
 * active las notificaciones push. Antes solo se registraba dentro de
 * enablePushNotifications, que a su vez solo se ofrece con la PWA ya instalada
 * (ver setupPushReminderBanner) -- así nadie en una pestaña normal de Chrome/Android
 * llegaba a tener un service worker registrado, y sin eso el navegador nunca considera
 * el sitio instalable: "beforeinstallprompt" no se dispara y el botón "Instalar" del
 * banner (ver pwaBanners.ts) se queda sin nada que hacer.
 */
export function ensureServiceWorkerRegistered(): void {
  if (isPushSupported()) void navigator.serviceWorker.register(SW_PATH);
}

/** Suscripción activa en este navegador (si el usuario ya activó las push antes acá). */
export async function getActivePushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await getRegistration();
  return registration.pushManager.getSubscription();
}

/** true si ese dispositivo/navegador ya tiene la suscripción guardada del lado del servidor. */
export async function isPushEnabledForUser(userId: string): Promise<boolean> {
  const subscription = await getActivePushSubscription();
  if (!subscription) return false;
  return hasStoredPushSubscription(userId, subscription.endpoint);
}

async function subscribeAndStore(userId: string): Promise<{ error?: string }> {
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return { error: "Falta configurar la clave pública de push." };

  try {
    const registration = await getRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
    }
    return await upsertPushSubscription(userId, subscription);
  } catch {
    return { error: "No se pudo activar las notificaciones. Probá de nuevo." };
  }
}

export async function enablePushNotifications(userId: string): Promise<{ error?: string }> {
  if (!isPushSupported()) return { error: "Este navegador no soporta notificaciones push." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { error: "No diste permiso para las notificaciones." };

  return subscribeAndStore(userId);
}

/**
 * En iOS, cerrar del todo la PWA (deslizar para sacarla del selector de apps) y volver a abrirla
 * a veces invalida la suscripcion push que ya estaba activa (bug conocido de WebKit) -- sin esto,
 * isPushEnabledForUser() la ve como "no activada" y el banner de "Activá las notificaciones"
 * reaparece aunque el usuario ya le haya dado que si. Como el permiso del sistema ya esta
 * otorgado, no hace falta volver a pedirlo: se re-suscribe solo, en silencio.
 */
export async function ensurePushSubscription(userId: string): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  const { error } = await subscribeAndStore(userId);
  return !error;
}

export async function disablePushNotifications(): Promise<void> {
  const subscription = await getActivePushSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await deletePushSubscriptionByEndpoint(endpoint);
}
