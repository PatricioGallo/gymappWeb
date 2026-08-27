import type { ViewModule } from "../shell/router";
import { smartNavigate } from "../shell/router";
import { escapeHtml } from "../lib/dom";
import { formatFechaCorta } from "../lib/dias";
import {
  listAllNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from "../services/notification.service";

const TYPE_ICON: Record<string, string> = {
  routine_assigned: "🏋️",
  issue_status: "🛠️",
  admin_message: "📣",
  follow: "👥",
  follow_request: "🔔",
  follow_accepted: "✅",
  follow_rejected: "🚫",
  like: "❤️",
  comment: "💬",
  repost: "🔁",
  quote: "❝",
  message_reaction: "😀",
  class_reminder: "⏰",
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

const GROUP_ORDER = ["Recientes", "Últimos 7 días", "Últimos 30 días", "Más antiguas"] as const;
const MARK_ALL_BTN_GROUP: (typeof GROUP_ORDER)[number] = "Últimos 7 días";

function groupLabel(iso: string): (typeof GROUP_ORDER)[number] {
  const diffDay = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diffDay < 1) return "Recientes";
  if (diffDay < 7) return "Últimos 7 días";
  if (diffDay < 30) return "Últimos 30 días";
  return "Más antiguas";
}

function notifItemHtml(n: AppNotification): string {
  return `
    <button type="button" class="notif-page-item ${n.is_read ? "" : "unread"}" data-id="${n.id}">
      <span class="notif-page-dot"></span>
      <span class="notif-page-body">
        <span class="notif-page-title">${TYPE_ICON[n.type] ?? "🔔"} ${escapeHtml(n.title)}</span>
        ${n.body ? `<p class="notif-page-text">${escapeHtml(n.body)}</p>` : ""}
        <span class="notif-page-time">${relativeTime(n.created_at)}</span>
      </span>
    </button>
  `;
}

function groupHeaderHtml(label: string, showMarkAllBtn: boolean, unreadCount: number): string {
  const btn = showMarkAllBtn
    ? `<button type="button" class="notif-mark-all" id="notifPageMarkAllBtn" ${unreadCount === 0 ? "disabled" : ""}>Marcar todas como leídas</button>`
    : "";
  return `<div class="search-recent-header"><span>${label}</span>${btn}</div>`;
}

const VIEW_MARKUP = `
  <section class="features">
    <div class="container">
      <div class="pull-refresh-indicator" id="notifPullRefreshIndicator" aria-hidden="true"><div class="modern-spinner"></div></div>
      <span class="eyebrow eyebrow-standalone">Notificaciones</span>
      <div class="notif-page-list" id="notifPageList"></div>
    </div>
  </section>
`;

export const notificationsView: ViewModule = {
  async mount(container, _params, ctx) {
    container.innerHTML = VIEW_MARKUP;
    const listEl = container.querySelector<HTMLElement>("#notifPageList")!;
    const pullIndicator = container.querySelector("#notifPullRefreshIndicator") as HTMLDivElement;

    let notifications: AppNotification[] = [];

    function renderList(): void {
      if (notifications.length === 0) {
        listEl.innerHTML = `<p class="exc-pick-empty">No tenés notificaciones todavía.</p>`;
        return;
      }

      const groups = new Map<string, AppNotification[]>();
      for (const n of notifications) {
        const label = groupLabel(n.created_at);
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label)!.push(n);
      }

      const presentLabels = GROUP_ORDER.filter((label) => groups.has(label));
      const btnGroup = presentLabels.includes(MARK_ALL_BTN_GROUP) ? MARK_ALL_BTN_GROUP : presentLabels[0];
      const unreadCount = notifications.filter((n) => !n.is_read).length;

      listEl.innerHTML = presentLabels
        .map(
          (label) => `
        ${groupHeaderHtml(label, label === btnGroup, unreadCount)}
        ${groups
          .get(label)!
          .map((n) => notifItemHtml(n))
          .join("")}
      `
        )
        .join("");

      listEl.querySelectorAll<HTMLButtonElement>(".notif-page-item").forEach((item) => {
        item.addEventListener("click", () => void handleItemClick(item.dataset.id!));
      });
      listEl.querySelector("#notifPageMarkAllBtn")?.addEventListener("click", () => void handleMarkAllRead());
    }

    async function handleItemClick(id: string): Promise<void> {
      const notif = notifications.find((n) => n.id === id);
      if (!notif) return;
      if (!notif.is_read) {
        notif.is_read = true;
        renderList();
        void markNotificationRead(id);
      }
      if (notif.link) smartNavigate(notif.link);
    }

    async function handleMarkAllRead(): Promise<void> {
      notifications = notifications.map((n) => ({ ...n, is_read: true }));
      renderList();
      await markAllNotificationsRead();
    }

    // ---------------------------------------------------------------------------
    // Pull-to-refresh (solo mobile, gesto táctil): arrastrar hacia abajo estando ya arriba
    // del todo de la pagina pide las notificaciones de nuevo. Mismo patron que feed.ts:
    // esta pagina scrollea la ventana entera (no tiene un panel propio con su propio
    // scroll, a diferencia de chats.ts), asi que el gesto se engancha en document y mira
    // el scroll de la ventana.
    // ---------------------------------------------------------------------------

    const PULL_THRESHOLD = 70;
    const PULL_MAX = 110;
    const PULL_LOADING_HEIGHT = 56;

    let pullDragging = false;
    let pullActive = false; // true una vez que se movio hacia abajo lo suficiente como para contar como "pull" y no un scroll comun
    let pullStartY = 0;
    let isRefreshingList = false;

    function isMobileLayout(): boolean {
      return window.matchMedia("(max-width: 859px)").matches;
    }

    function isAtTop(): boolean {
      return (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
    }

    function setPullHeight(px: number, animated: boolean): void {
      pullIndicator.classList.toggle("pull-refresh-animate", animated);
      pullIndicator.style.height = `${px}px`;
    }

    async function refreshNotificationsList(): Promise<void> {
      isRefreshingList = true;
      setPullHeight(PULL_LOADING_HEIGHT, true);
      try {
        notifications = await listAllNotifications();
        renderList();
      } catch {
        // silencioso: un pull-to-refresh fallido no tiene mucho mas que mostrar que "no paso nada"
      } finally {
        setPullHeight(0, true);
        isRefreshingList = false;
      }
    }

    document.addEventListener(
      "touchstart",
      (e) => {
        // El router deja esta vista viva (solo hidden) al navegar a otra -- sin este chequeo,
        // arrastrar hacia abajo en OTRA pagina terminaria disparando este gesto tambien (mismo
        // motivo que feed.ts guarda container.hidden acá).
        if (isRefreshingList || container.hidden || !isMobileLayout() || !isAtTop()) return;
        pullDragging = true;
        pullActive = false;
        pullStartY = e.touches[0].clientY;
      },
      { passive: true, signal: ctx.signal }
    );

    document.addEventListener(
      "touchmove",
      (e) => {
        if (!pullDragging) return;
        const deltaY = e.touches[0].clientY - pullStartY;
        if (deltaY <= 0 || !isAtTop()) {
          pullDragging = false;
          if (pullActive) setPullHeight(0, true);
          pullActive = false;
          return;
        }
        pullActive = true;
        e.preventDefault(); // corta el rebote/pull-to-refresh nativo mientras dura el gesto propio
        setPullHeight(Math.min(deltaY * 0.5, PULL_MAX), false);
      },
      { passive: false, signal: ctx.signal }
    );

    function onPullEnd(): void {
      if (!pullDragging) return;
      pullDragging = false;
      if (!pullActive) return;
      pullActive = false;
      const reached = pullIndicator.getBoundingClientRect().height >= PULL_THRESHOLD;
      if (reached) void refreshNotificationsList();
      else setPullHeight(0, true);
    }
    document.addEventListener("touchend", onPullEnd, { signal: ctx.signal });
    document.addEventListener("touchcancel", onPullEnd, { signal: ctx.signal });

    notifications = await listAllNotifications();
    renderList();
  },
};
