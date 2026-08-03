import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { formatFechaCorta } from "../lib/dias";
import {
  listAllNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from "../services/notification.service";

setupNavToggle();
setupRevealObserver();
await requireAuth();

const TYPE_ICON: Record<string, string> = {
  routine_assigned: "🏋️",
  issue_status: "🛠️",
  admin_message: "📣",
  follow: "👥",
  follow_request: "🔔",
  follow_accepted: "✅",
  follow_rejected: "🚫",
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

let notifications: AppNotification[] = [];

const summaryEl = document.getElementById("notifPageSummary")!;
const listEl = document.getElementById("notifPageList")!;
const markAllBtn = document.getElementById("notifPageMarkAllBtn") as HTMLButtonElement;

function renderSummary() {
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  summaryEl.textContent =
    notifications.length === 0
      ? "No tenés notificaciones todavía."
      : `${unreadCount} sin leer de ${notifications.length} en total.`;
  markAllBtn.disabled = unreadCount === 0;
}

function renderList() {
  listEl.innerHTML =
    notifications
      .map(
        (n) => `
      <button type="button" class="notif-page-item ${n.is_read ? "" : "unread"}" data-id="${n.id}">
        <span class="notif-page-dot"></span>
        <span class="notif-page-body">
          <span class="notif-page-title">${TYPE_ICON[n.type] ?? "🔔"} ${escapeHtml(n.title)}</span>
          ${n.body ? `<p class="notif-page-text">${escapeHtml(n.body)}</p>` : ""}
          <span class="notif-page-time">${relativeTime(n.created_at)}</span>
        </span>
      </button>
    `
      )
      .join("") || `<p class="exc-pick-empty">No tenés notificaciones todavía.</p>`;

  listEl.querySelectorAll<HTMLButtonElement>(".notif-page-item").forEach((item) => {
    item.addEventListener("click", () => void handleItemClick(item.dataset.id!));
  });
}

async function handleItemClick(id: string) {
  const notif = notifications.find((n) => n.id === id);
  if (!notif) return;
  if (!notif.is_read) {
    notif.is_read = true;
    renderSummary();
    renderList();
    void markNotificationRead(id);
  }
  if (notif.link) window.location.href = notif.link;
}

markAllBtn.addEventListener("click", async () => {
  notifications = notifications.map((n) => ({ ...n, is_read: true }));
  renderSummary();
  renderList();
  await markAllNotificationsRead();
});

notifications = await listAllNotifications();
renderSummary();
renderList();
