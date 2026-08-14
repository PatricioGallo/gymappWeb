import { supabase } from "./supabaseClient";
import { escapeHtml } from "./dom";
import { formatFechaCorta } from "./dias";
import {
  getUnreadNotificationCount,
  listRecentNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from "../services/notification.service";

/** Evento global disparado cuando llega (via realtime) una notificacion nueva, para que el toast in-app la muestre sin abrir una suscripcion propia. */
export const NEW_NOTIFICATION_EVENT = "gs:new-notification";

// Mismo breakpoint que .user-menu-toggle/.site-nav en modern.css (860px).
const MOBILE_QUERY = "(max-width: 859px)";
const POLL_INTERVAL_MS = 60000;

const TYPE_ICON: Record<string, string> = {
  routine_assigned: "🏋️",
  issue_status: "🛠️",
  admin_message: "📣",
  follow: "👥",
  follow_request: "🔔",
  follow_accepted: "✅",
  follow_rejected: "🚫",
  subscription_request: "🔔",
  subscription_accepted: "✅",
  subscription_rejected: "🚫",
};

function relativeTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "Ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `Hace ${diffHour} h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `Hace ${diffDay} d`;
  return formatFechaCorta(iso.slice(0, 10));
}

/** Campana de notificaciones del header. No-op en paginas sin el markup (ej. marketing). */
export function setupNotificationBell(userId: string): void {
  const bellBtn = document.getElementById("notifBellBtn");
  const badge = document.getElementById("notifBadge");
  const dropdown = document.getElementById("notifDropdown");
  const list = document.getElementById("notifList");
  const markAllBtn = document.getElementById("notifMarkAllBtn");
  if (!bellBtn || !badge || !dropdown || !list) return;

  let unread = 0;
  let recent: AppNotification[] = [];
  let loaded = false;

  function renderBadge() {
    badge!.hidden = unread <= 0;
    badge!.textContent = unread > 9 ? "9+" : String(unread);
  }

  function renderList() {
    list!.innerHTML =
      recent
        .map(
          (n) => `
        <button type="button" class="notif-item ${n.is_read ? "" : "unread"}" data-id="${n.id}">
          <span class="notif-item-title">${TYPE_ICON[n.type] ?? "🔔"} ${escapeHtml(n.title)}</span>
          ${n.body ? `<p class="notif-item-body">${escapeHtml(n.body)}</p>` : ""}
          <span class="notif-item-time">${relativeTime(n.created_at)}</span>
        </button>
      `
        )
        .join("") || `<p class="notif-empty">No tenés notificaciones.</p>`;

    list!.querySelectorAll<HTMLButtonElement>(".notif-item").forEach((item) => {
      item.addEventListener("click", () => void handleItemClick(item.dataset.id!));
    });
  }

  async function handleItemClick(id: string) {
    const notif = recent.find((n) => n.id === id);
    if (!notif) return;
    if (!notif.is_read) {
      notif.is_read = true;
      unread = Math.max(0, unread - 1);
      renderBadge();
      renderList();
      void markNotificationRead(id);
    }
    if (notif.link) window.location.href = notif.link;
  }

  async function refreshUnreadCount() {
    try {
      unread = await getUnreadNotificationCount();
      renderBadge();
    } catch {
      // silencioso: el badge simplemente no se actualiza en este ciclo
    }
  }

  async function loadRecent() {
    try {
      recent = await listRecentNotifications();
      loaded = true;
      renderList();
    } catch {
      list!.innerHTML = `<p class="notif-empty">No se pudieron cargar las notificaciones.</p>`;
    }
  }

  function closeDropdown() {
    dropdown!.hidden = true;
    bellBtn!.classList.remove("open");
    bellBtn!.setAttribute("aria-expanded", "false");
  }

  function openDropdown() {
    dropdown!.hidden = false;
    bellBtn!.classList.add("open");
    bellBtn!.setAttribute("aria-expanded", "true");
    if (!loaded) void loadRecent();
  }

  bellBtn.addEventListener("click", () => void handleBellClick());

  async function handleBellClick() {
    // Un click en la campana da por leidas todas las notificaciones, sea cual sea la vista.
    unread = 0;
    recent = recent.map((n) => ({ ...n, is_read: true }));
    renderBadge();
    renderList();
    await markAllNotificationsRead().catch(() => {
      // silencioso: si falla, el badge local ya quedo en 0; se resincroniza en el proximo poll
    });

    // En mobile el dropdown no entra comodo: mandamos directo a la pagina completa.
    if (window.matchMedia(MOBILE_QUERY).matches) {
      window.location.href = "notifications.html";
      return;
    }
    if (dropdown!.hidden) openDropdown();
    else closeDropdown();
  }

  document.addEventListener("click", (e) => {
    if (dropdown.hidden) return;
    const target = e.target as Node;
    if (dropdown.contains(target) || bellBtn.contains(target)) return;
    closeDropdown();
  });

  markAllBtn?.addEventListener("click", async () => {
    if (unread === 0) return;
    recent = recent.map((n) => ({ ...n, is_read: true }));
    unread = 0;
    renderBadge();
    renderList();
    await markAllNotificationsRead();
  });

  void refreshUnreadCount();

  setInterval(() => {
    if (document.visibilityState === "visible") void refreshUnreadCount();
  }, POLL_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshUnreadCount();
  });

  // El poll de arriba cubre el caso general, pero para que la campana (y el toast in-app)
  // reaccionen al instante ante una notificacion nueva, escuchamos tambien el insert por realtime.
  supabase
    .channel(`notif-bell-${userId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
      const notif = payload.new as AppNotification;
      recent = [notif, ...recent].slice(0, 8);
      unread += 1;
      renderBadge();
      if (loaded) renderList();
      window.dispatchEvent(new CustomEvent<AppNotification>(NEW_NOTIFICATION_EVENT, { detail: notif }));
    })
    .subscribe();
}
