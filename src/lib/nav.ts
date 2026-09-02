import { supabase, hasPersistedSession } from "./supabaseClient";
import { logVisitOncePerSession } from "../services/visits.service";
import { setupNotificationBell } from "./notifications";
import { setupChatBadge } from "./chat";
import { setupHeaderSearch } from "./search";
import { renderVerifiedBadge } from "./verifiedBadge";
import { escapeHtml } from "./dom";
import { getPendingFollowRequestCount } from "../services/follow.service";
import { getPendingSubscriptionRequestCount } from "../services/subscription.service";
import { getPendingGymMembershipRequestCount } from "../services/gymMember.service";
import { getPendingGymTrainerRequestCount } from "../services/gymTrainer.service";
import { getUnreadContactMessageCount } from "../services/contact.service";
import { getUnreadErrorReportCount } from "../services/errorReport.service";
import { getUnreadUserReportCount } from "../services/userReport.service";
import { getPendingVerificationRequestCount } from "../services/verification.service";
import { touchLastSeen } from "../services/profile.service";
import { trackPwaInstallStatus, setupInstallBanner, setupPushReminderBanner } from "./pwaBanners";
import { trackPresence } from "./presence";
import { setupInAppNotificationToast } from "./inAppNotificationToast";
import { setupPasswordToggles } from "./passwordToggle";
import type { ViewContext } from "../shell/viewContext";

// Se llama desde setupNavToggle porque esa funcion ya corre al inicio de
// absolutamente todas las paginas; asi el conteo de visitas para el panel de
// administracion no depende de tocar cada pagina una por una.
void logVisitOncePerSession();
// Mismo motivo: asi el ojito de "ver contraseña" (login/registro) no depende de que cada
// pagina se acuerde de llamarlo.
setupPasswordToggles();

export function setupNavToggle(): void {
  const navToggle = document.getElementById("navToggle");
  const siteNav = document.getElementById("siteNav");
  if (!navToggle || !siteNav) return;

  navToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("open");
    navToggle.classList.toggle("open", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  siteNav.addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest("a")) return;
    siteNav.classList.remove("open");
    navToggle.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  });

  // En desktop el menu es un dropdown chico (no pantalla completa como en
  // mobile): cerralo si tocan afuera.
  document.addEventListener("click", (e) => {
    if (!siteNav.classList.contains("open")) return;
    const target = e.target as Node;
    if (siteNav.contains(target) || navToggle.contains(target)) return;
    siteNav.classList.remove("open");
    navToggle.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  });

  setupHeaderSearch();
  void populateUserMenuTrigger();
}

// Completa el trigger del menu de cuenta (foto + username) y oculta
// "Administrar" si la sesion actual no es admin. Es un no-op en paginas que
// no tienen ese trigger (ej. las de marketing, que siguen con el hamburger).
async function populateUserMenuTrigger(): Promise<void> {
  const avatarEl = document.getElementById("navMenuAvatar") as HTMLImageElement | null;
  const usernameEl = document.getElementById("navMenuUsername");
  if (!avatarEl && !usernameEl) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return;

  void trackPwaInstallStatus(userId);
  setupInstallBanner();
  void setupPushReminderBanner(userId);

  const { data } = await supabase.from("profiles_public").select("username, avatar_url, user_type, is_verified").eq("id", userId).maybeSingle();
  if (!data) return;

  if (avatarEl && data.avatar_url) avatarEl.src = data.avatar_url;
  if (usernameEl) usernameEl.innerHTML = `${escapeHtml(data.username ?? "")}${data.user_type ? renderVerifiedBadge(data.user_type, data.is_verified ?? false) : ""}`;
  if (data.user_type !== "admin" && data.user_type !== "colaborador") {
    document.getElementById("adminLink")?.remove();
  } else {
    void refreshAdminMessagesDot();
  }

  // Las solicitudes de suscripcion solo le importan a un entrenador (los que
  // pueden tener suscriptores).
  if (data.user_type !== "entrenador") {
    document.getElementById("navSubscriptionRequests")?.remove();
  } else {
    void refreshSubscriptionRequestsBadge(userId);
  }

  // Idem para las solicitudes de socio, pero del lado del gimnasio.
  if (data.user_type !== "gimnasio") {
    document.getElementById("navSocioRequests")?.remove();
    document.getElementById("navHandleRequests")?.remove();
  } else {
    void refreshSocioRequestsBadge(userId);
    void refreshHandleRequestsBadge(userId);
  }

  setupNotificationBell(userId);
  setupChatBadge(userId);
  setupInAppNotificationToast();
  void applyZoomPreference(userId);
  void refreshFollowRequestsBadge(userId);
}

/** Punto naranja junto a "Administrar" si hay mensajes/reportes sin leer (contacto, errores o usuarios) o solicitudes de validación pendientes. Solo se llama para staff. */
async function refreshAdminMessagesDot(): Promise<void> {
  const dot = document.getElementById("adminLinkDot");
  if (!dot) return;
  try {
    const [contactUnread, errorUnread, userUnread, pendingVerifications] = await Promise.all([
      getUnreadContactMessageCount(),
      getUnreadErrorReportCount(),
      getUnreadUserReportCount(),
      getPendingVerificationRequestCount(),
    ]);
    dot.hidden = contactUnread + errorUnread + userUnread + pendingVerifications <= 0;
  } catch {
    // silencioso: el punto simplemente no se actualiza en este ciclo
  }
}

/** Numero de solicitudes de seguimiento pendientes junto al link del nav. No-op si el link no esta en esta pagina. */
async function refreshFollowRequestsBadge(userId: string): Promise<void> {
  const badge = document.getElementById("followReqBadge");
  if (!badge) return;
  try {
    const count = await getPendingFollowRequestCount(userId);
    badge.hidden = count <= 0;
    badge.textContent = count > 9 ? "9+" : String(count);
  } catch {
    // silencioso: el badge simplemente no se actualiza en este ciclo
  }
}

/** Numero de solicitudes de suscripcion pendientes junto al link del nav. No-op si el link no esta en esta pagina. */
async function refreshSubscriptionRequestsBadge(userId: string): Promise<void> {
  const badge = document.getElementById("subReqBadge");
  if (!badge) return;
  try {
    const count = await getPendingSubscriptionRequestCount(userId);
    badge.hidden = count <= 0;
    badge.textContent = count > 9 ? "9+" : String(count);
  } catch {
    // silencioso: el badge simplemente no se actualiza en este ciclo
  }
}

/** Numero de solicitudes de socio pendientes junto al link del nav. No-op si el link no esta en esta pagina. */
async function refreshSocioRequestsBadge(userId: string): Promise<void> {
  const badge = document.getElementById("socioReqBadge");
  if (!badge) return;
  try {
    const count = await getPendingGymMembershipRequestCount(userId);
    badge.hidden = count <= 0;
    badge.textContent = count > 9 ? "9+" : String(count);
  } catch {
    // silencioso: el badge simplemente no se actualiza en este ciclo
  }
}

/** Numero de solicitudes de handle (iniciadas por un entrenador) pendientes junto al link del
 * nav. Las invitaciones que mando el propio gimnasio no cuentan aca (getPendingGymTrainerRequestCount
 * ya filtra por initiated_by='trainer'). No-op si el link no esta en esta pagina. */
async function refreshHandleRequestsBadge(userId: string): Promise<void> {
  const badge = document.getElementById("handleReqBadge");
  if (!badge) return;
  try {
    const count = await getPendingGymTrainerRequestCount(userId);
    badge.hidden = count <= 0;
    badge.textContent = count > 9 ? "9+" : String(count);
  } catch {
    // silencioso: el badge simplemente no se actualiza en este ciclo
  }
}

// El viewport de todas las paginas viene con el zoom deshabilitado por defecto
// (molesta al cargar pesos desde el celular); si el usuario lo habilito en
// Configuracion > Personalizacion, se lo re-habilitamos aca.
async function applyZoomPreference(userId: string): Promise<void> {
  const { data } = await supabase.from("profiles").select("zoom_enabled").eq("id", userId).maybeSingle();
  if (!data?.zoom_enabled) return;

  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) viewport.setAttribute("content", "width=device-width, initial-scale=1");
}

/** Marca de una todo `.reveal` adentro de `container` como ya revelado, sin esperar a que el
 * IntersectionObserver de setupRevealObserver dispare el fade-in. Pensado para re-renders "de
 * fondo" (ej. refreshCurrentRoutinesTab en profile.ts, que recarga rutinas/estadisticas cada vez
 * que se vuelve a un perfil ya visitado en esta sesion): esas tarjetas ya se vieron una vez, asi
 * que si el HTML se reemplaza de cero con las mismas clases `.reveal`, sin esto reproducen el
 * fade-in desde invisible cada vez -- se siente como si la pagina "se recargara" en cada visita,
 * aunque el contenido sea identico. */
export function settleReveal(container: ParentNode): void {
  container.querySelectorAll(".reveal").forEach((el) => el.classList.add("in-view"));
}

export function setupRevealObserver(): void {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in-view"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  const observe = (el: Element) => observer.observe(el);
  document.querySelectorAll(".reveal").forEach(observe);

  const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        const el = node as Element;
        if (el.classList?.contains("reveal")) observe(el);
        el.querySelectorAll?.(".reveal").forEach(observe);
      });
    });
  });

  mutationObserver.observe(document.body, { childList: true, subtree: true });
}

/**
 * Header sticky que se esconde al scrollear para abajo y reaparece al scrollear para arriba,
 * solo en mobile (ver .header-hidden en modern.css). Pensado para paginas de scroll largo como
 * feed.html.
 *
 * ctx es opcional (llamadores no migrados al shell todavia no lo tienen), pero si se pasa, el
 * listener de scroll se ata a ctx.signal -- sin esto, cada mount() de una vista que la llama
 * agrega un listener de window mas que nunca se saca, ni siquiera cuando esa instancia se
 * descarta del todo (ver profile.ts: visitar un tercer perfil distinto evict-ea la instancia
 * vieja pero el listener de scroll de esa instancia seguia vivo para siempre).
 */
export function setupAutoHideHeader(ctx?: ViewContext): void {
  const header = document.querySelector<HTMLElement>(".site-header");
  if (!header) return;

  const MOBILE_QUERY = "(max-width: 859px)";
  const SCROLL_THRESHOLD = 8; // ignora micro-scrolls (rebote de iOS, etc.)
  let lastY = window.scrollY;

  window.addEventListener(
    "scroll",
    () => {
      const y = window.scrollY;
      if (!window.matchMedia(MOBILE_QUERY).matches) {
        header.classList.remove("header-hidden");
        lastY = y;
        return;
      }

      const delta = y - lastY;
      if (Math.abs(delta) < SCROLL_THRESHOLD) return;
      header.classList.toggle("header-hidden", delta > 0 && y > header.offsetHeight);
      lastY = y;
    },
    ctx ? { passive: true, signal: ctx.signal } : { passive: true }
  );
}

// requireAuth() deja esta marca justo antes de rebotar a login. La lee redirectIfAuthenticated()
// para NO volver a mandar optimistamente a la app cuando la sesion guardada esta muerta (o no
// hay red ni siquiera tras el intento de recovery) -- sin esto, login <-> profile entra en loop.
const BOUNCED_TO_LOGIN_KEY = "auth:bounced-to-login";

function recentlyBouncedToLogin(): boolean {
  try {
    const t = Number(sessionStorage.getItem(BOUNCED_TO_LOGIN_KEY) ?? 0);
    return t > 0 && Date.now() - t < 15_000;
  } catch {
    return false;
  }
}

function clearAuthWakeMarkers(): void {
  try {
    sessionStorage.removeItem("auth:wake-recovery");
    sessionStorage.removeItem(BOUNCED_TO_LOGIN_KEY);
  } catch {
    // ignore
  }
}

export async function redirectIfAuthenticated(): Promise<void> {
  const enPages = location.pathname.includes("/pages/");
  const destino = enPages ? "profile.html" : "pages/profile.html";

  // Optimista: si hay una sesion guardada en el dispositivo, ir directo a la app sin
  // esperar la red. Al reabrir la PWA en iOS, getSession() tiene que canjear el refresh
  // token contra el server y eso puede tardar o fallar con la red aun no lista -- antes
  // eso dejaba al usuario tirado en la landing/login aunque siguiera logueado. Si el
  // token estuviera muerto de verdad, profile.html -> requireAuth() rebota a login igual
  // (y deja BOUNCED_TO_LOGIN_KEY para que no lo mandemos de vuelta en un loop).
  if (hasPersistedSession() && !recentlyBouncedToLogin()) {
    window.location.href = destino;
    return;
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  clearAuthWakeMarkers();
  window.location.href = destino;
}

/** Espera a que vuelva la conexion (evento `online`) o a que pase `timeoutMs`, lo que pase antes. */
function waitForOnline(timeoutMs: number): Promise<void> {
  if (navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      window.removeEventListener("online", finish);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    window.addEventListener("online", finish, { once: true });
  });
}

/**
 * Al reabrir la PWA (sobre todo iOS) getSession() puede devolver null aunque el refresh
 * token siga guardado y vivo: la red del "wake" todavia no respondio y auth-js queda ~60s
 * sin reintentar (cooldown interno), asi que un refreshSession() en el acto no sirve. En
 * vez de mandar a login (falso logout), recargamos la pagina cuando vuelva la conexion:
 * cliente nuevo, sin cooldown, y el canje del refresh token se reintenta desde cero.
 *
 * Devuelve true si arranco una recarga (el llamador no debe seguir ni redirigir).
 * Anti-loop: como mucho una recarga cada 90s -- si tras eso sigue sin sesion, se asume
 * logout real y se cae a login. El timestamp vive en sessionStorage, que en una PWA se
 * limpia al cerrarla del todo: cada arranque en frio tiene derecho a su reintento.
 */
function tryWakeRecovery(): boolean {
  const KEY = "auth:wake-recovery";
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 90_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false; // sin sessionStorage no hay como protegerse del loop -- no arriesgar
  }
  void waitForOnline(8000).then(() => {
    // Respiro extra: en iOS navigator.onLine puede decir true antes de que la radio
    // realmente curse requests -- 1.2s de margen sube bastante el exito de la recarga.
    setTimeout(() => location.reload(), 1200);
  });
  return true;
}

/**
 * Un gimnasio sin aprobar (user_type='gimnasio' + is_verified=false) solo puede estar en
 * gym-pending.html: ahí carga su documentación y ve sus notificaciones, nada más -- ni feed, ni
 * buscador, ni perfiles ajenos. Cualquier otra pantalla lo redirige a ese gate. Devuelve true si
 * redirigió (el llamador tiene que colgar y no seguir resolviendo). "No es un gimnasio gateado"
 * se cachea por sesión para no pegarle a la DB en cada carga del resto de los usuarios; un
 * gimnasio gateado nunca llega a cachear (siempre re-consulta), así que apenas lo aprueban
 * la primera navegación ya lo deja pasar.
 */
async function enforceGymApprovalGate(userId: string): Promise<boolean> {
  if (location.pathname.endsWith("/gym-pending.html")) return false;
  try {
    if (sessionStorage.getItem(`gymgate:${userId}`) === "ok") return false;
  } catch {
    // ignore
  }
  const { data } = await supabase
    .from("profiles_public")
    .select("user_type, is_verified")
    .eq("id", userId)
    .maybeSingle();
  if (data?.user_type === "gimnasio" && !data.is_verified) {
    window.location.href = "/pages/gym-pending.html";
    return true;
  }
  try {
    sessionStorage.setItem(`gymgate:${userId}`, "ok");
  } catch {
    // ignore
  }
  return false;
}

/** Para paginas que requieren sesion iniciada: devuelve el user id o redirige a login.html. */
export async function requireAuth(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;

  if (!userId) {
    // Sesion guardada en disco pero getSession() no pudo revalidarla: casi siempre es
    // la red del "wake" de la PWA, no un logout. Intentar recuperar recargando antes
    // de rendirse (ver tryWakeRecovery).
    if (hasPersistedSession() && tryWakeRecovery()) {
      // La recarga ya esta agendada -- colgar aca a proposito para no seguir resolviendo
      // ni redirigir a login mientras la pagina se recarga.
      return new Promise<string>(() => {});
    }
    // Dejar la marca para que redirectIfAuthenticated() en login.html no nos rebote de
    // vuelta a la app (loop) si el blob de sesion sigue en disco pero esta muerto.
    try {
      sessionStorage.setItem(BOUNCED_TO_LOGIN_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    window.location.href = "login.html";
    throw new Error("not authenticated");
  }

  // Sesion OK: limpiar las marcas de wake/bounce para que un wake posterior tenga su reintento.
  clearAuthWakeMarkers();

  if (await enforceGymApprovalGate(userId)) {
    return new Promise<string>(() => {}); // redirigiendo al gate de gimnasio; no seguir
  }

  // Heartbeat simple de "última conexión": una vez por carga de página autenticada.
  void touchLastSeen();
  trackPresence(userId);
  return userId;
}

/** Para paginas que aceptan visitantes anonimos (ej. perfil publico): devuelve el user id si
 * hay sesion, o null si no -- a diferencia de requireAuth(), nunca redirige (salvo el gate de
 * un gimnasio sin aprobar, que no puede ver nada de la app). */
export async function getOptionalAuth(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id ?? null;
  if (userId) {
    if (await enforceGymApprovalGate(userId)) {
      return new Promise<string | null>(() => {}); // redirigiendo al gate de gimnasio
    }
    void touchLastSeen();
    trackPresence(userId);
  }
  return userId;
}
