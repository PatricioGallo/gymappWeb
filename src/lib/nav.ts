import { supabase } from "./supabaseClient";
import { logVisitOncePerSession } from "../services/visits.service";
import { setupNotificationBell } from "./notifications";
import { setupHeaderSearch } from "./search";
import { renderVerifiedBadge } from "./verifiedBadge";
import { escapeHtml } from "./dom";
import { getPendingFollowRequestCount } from "../services/follow.service";
import { getUnreadContactMessageCount } from "../services/contact.service";

// Se llama desde setupNavToggle porque esa funcion ya corre al inicio de
// absolutamente todas las paginas; asi el conteo de visitas para el panel de
// administracion no depende de tocar cada pagina una por una.
void logVisitOncePerSession();

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

  const { data } = await supabase.from("profiles_public").select("username, avatar_url, user_type, is_verified").eq("id", userId).maybeSingle();
  if (!data) return;

  if (avatarEl && data.avatar_url) avatarEl.src = data.avatar_url;
  if (usernameEl) usernameEl.innerHTML = `${escapeHtml(data.username ?? "")}${data.user_type ? renderVerifiedBadge(data.user_type, data.is_verified ?? false) : ""}`;
  if (data.user_type !== "admin" && data.user_type !== "colaborador") {
    document.getElementById("adminLink")?.remove();
  } else {
    void refreshAdminMessagesDot();
  }

  setupNotificationBell();
  void applyZoomPreference(userId);
  void refreshFollowRequestsBadge(userId);
}

/** Punto naranja junto a "Administrar" si hay mensajes de contacto sin leer. Solo se llama para staff. */
async function refreshAdminMessagesDot(): Promise<void> {
  const dot = document.getElementById("adminLinkDot");
  if (!dot) return;
  try {
    const unread = await getUnreadContactMessageCount();
    dot.hidden = unread <= 0;
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

// El viewport de todas las paginas viene con el zoom deshabilitado por defecto
// (molesta al cargar pesos desde el celular); si el usuario lo habilito en
// Configuracion > Personalizacion, se lo re-habilitamos aca.
async function applyZoomPreference(userId: string): Promise<void> {
  const { data } = await supabase.from("profiles").select("zoom_enabled").eq("id", userId).maybeSingle();
  if (!data?.zoom_enabled) return;

  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) viewport.setAttribute("content", "width=device-width, initial-scale=1");
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

export async function redirectIfAuthenticated(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const enPages = location.pathname.includes("/pages/");
  window.location.href = enPages ? "profile.html" : "pages/profile.html";
}

/** Para paginas que requieren sesion iniciada: devuelve el user id o redirige a login.html. */
export async function requireAuth(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) {
    window.location.href = "login.html";
    throw new Error("not authenticated");
  }
  return userId;
}
