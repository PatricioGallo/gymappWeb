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
      <span class="eyebrow eyebrow-standalone">Notificaciones</span>
      <div class="notif-page-list" id="notifPageList"></div>
    </div>
  </section>
`;

export const notificationsView: ViewModule = {
  async mount(container) {
    container.innerHTML = VIEW_MARKUP;
    const listEl = container.querySelector<HTMLElement>("#notifPageList")!;

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

    notifications = await listAllNotifications();
    renderList();
  },
};
