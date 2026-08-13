import { supabase } from "./supabaseClient";
import { isPushSupported, isIosNonStandalone, isPushEnabledForUser, enablePushNotifications } from "./pushNotifications";

const INSTALL_SNOOZE_KEY = "gs_install_banner_snooze_until";
const INSTALL_SNOOZE_DAYS = 7;
const PWA_TRACK_KEY = "gs_pwa_track_date";

export function isStandalone(): boolean {
  return (navigator as { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

/** Celular (Android/iPhone/iPad), no notebook/PC -- el banner de "instalá la app" no tiene sentido en desktop. */
function isMobileDevice(): boolean {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

// Chrome/Android (y desktop Chrome) avisan que se puede instalar via este evento, que hay
// que capturar apenas se dispara (antes de que el usuario haga nada) para poder mostrar nuestro
// propio boton mas tarde con event.prompt(). En iOS este evento no existe -- ahi solo mostramos
// instrucciones manuales (Compartir > Anadir a inicio).
let deferredInstallPrompt: Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> } | null = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e as typeof deferredInstallPrompt;
});

/** Guarda en el perfil si este dispositivo corre la web instalada como app (una vez por dia, para no pegarle a la base en cada pagina que visita). */
export async function trackPwaInstallStatus(userId: string): Promise<void> {
  if (!isStandalone()) return;
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(PWA_TRACK_KEY) === today) return;
  localStorage.setItem(PWA_TRACK_KEY, today);
  await supabase.from("profiles").update({ pwa_installed: true, pwa_last_seen_at: new Date().toISOString() }).eq("id", userId);
}

const BELL_ICON_PATH = `<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>`;
const DOWNLOAD_ICON_PATH = `<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>`;
const CLOSE_ICON_PATH = `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`;

function buildBanner(iconPath: string, title: string, body: string): HTMLDivElement {
  const banner = document.createElement("div");
  banner.className = "app-banner reveal in-view";
  banner.innerHTML = `
    <div class="app-banner-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg></div>
    <div class="app-banner-body"><strong>${title}</strong><span>${body}</span></div>
    <div class="app-banner-actions"></div>
  `;
  return banner;
}

function removeBanner(banner: HTMLDivElement): void {
  banner.remove();
  document.body.classList.remove("has-app-banner");
}

function addCloseButton(banner: HTMLDivElement, onClose?: () => void): void {
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "app-banner-close";
  closeBtn.setAttribute("aria-label", "Cerrar");
  closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CLOSE_ICON_PATH}</svg>`;
  closeBtn.addEventListener("click", () => {
    onClose?.();
    removeBanner(banner);
  });
  banner.querySelector(".app-banner-actions")!.appendChild(closeBtn);
}

function mountBanner(banner: HTMLDivElement): void {
  const header = document.querySelector(".site-header");
  if (!header) return;
  header.insertAdjacentElement("afterend", banner);
  // En feed.html/profile.html el contenido de mas abajo suma su propio padding
  // para el header fijo (ver modern.css); esta clase le avisa que ya no hace
  // falta porque el banner ocupa ese hueco, si no queda un espacio doble.
  document.body.classList.add("has-app-banner");
}

/** Banner "instalá la app" para quien todavía la usa desde el navegador. Postergable 7 días. */
export function setupInstallBanner(): void {
  if (isStandalone() || !isMobileDevice()) return;
  const snoozeUntil = Number(localStorage.getItem(INSTALL_SNOOZE_KEY) || 0);
  if (Date.now() < snoozeUntil) return;

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const body = isIos
    ? "Tocá el botón Compartir y después \"Añadir a inicio\" para tenerla como una app, con notificaciones incluidas."
    : "Instalala en un toque para tenerla como una app, con notificaciones incluidas.";

  const banner = buildBanner(DOWNLOAD_ICON_PATH, "Instalá Gym Social", body);
  const actions = banner.querySelector(".app-banner-actions")!;

  if (!isIos && deferredInstallPrompt) {
    const installBtn = document.createElement("button");
    installBtn.type = "button";
    installBtn.className = "app-banner-cta";
    installBtn.textContent = "Instalar";
    installBtn.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      await deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      if (outcome === "accepted") removeBanner(banner);
    });
    actions.appendChild(installBtn);
  }

  addCloseButton(banner, () => {
    localStorage.setItem(INSTALL_SNOOZE_KEY, String(Date.now() + INSTALL_SNOOZE_DAYS * 86400000));
  });

  mountBanner(banner);
}

/**
 * Banner "activá las notificaciones push", solo para quien ya la tiene instalada y todavía
 * no las activó. A propósito el cierre NO se guarda en localStorage: reaparece en cada página
 * hasta que las active (insistente por pedido explícito, no es un bug).
 */
export async function setupPushReminderBanner(userId: string): Promise<void> {
  if (!isStandalone() || !isPushSupported() || isIosNonStandalone()) return;
  if (Notification.permission === "denied") return;
  const enabled = await isPushEnabledForUser(userId);
  if (enabled) return;

  const banner = buildBanner(BELL_ICON_PATH, "Activá las notificaciones", "Enterate al instante de mensajes, me gusta y seguidores nuevos.");
  const actions = banner.querySelector(".app-banner-actions")!;
  const body = banner.querySelector(".app-banner-body")!;

  const cta = document.createElement("button");
  cta.type = "button";
  cta.className = "app-banner-cta";
  cta.textContent = "Activar";
  cta.addEventListener("click", async () => {
    cta.disabled = true;
    cta.textContent = "Activando...";
    const { error } = await enablePushNotifications(userId);
    if (error) {
      cta.disabled = false;
      cta.textContent = "Activar";
      let errorEl = body.querySelector<HTMLParagraphElement>(".app-banner-error");
      if (!errorEl) {
        errorEl = document.createElement("p");
        errorEl.className = "app-banner-error";
        body.appendChild(errorEl);
      }
      errorEl.textContent = error;
      return;
    }
    removeBanner(banner);
  });
  actions.appendChild(cta);

  addCloseButton(banner);
  mountBanner(banner);
}
