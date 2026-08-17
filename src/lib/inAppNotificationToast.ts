import { supabase } from "./supabaseClient";
import { escapeHtml } from "./dom";
import { markNotificationRead, type AppNotification } from "../services/notification.service";
import { NEW_MESSAGE_EVENT, type NewMessageEventDetail } from "./chat";
import { NEW_NOTIFICATION_EVENT } from "./notifications";
import { smartNavigate } from "../shell/router";

const AUTO_DISMISS_MS = 5000;

let activeToast: HTMLDivElement | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

/** Guarda vestigial de cuando chat.html corria embebido en un iframe dentro de chats.html
 * (reemplazado por la vista fusionada, ver chats.ts) -- se deja por si en el futuro algo
 * vuelve a embeber una pagina en un iframe, para no montar el toast ahi adentro. */
function isEmbeddedFrame(): boolean {
  return window.self !== window.top;
}

/** El usuario esta "viendo la webapp" ahora mismo (misma señal que usan chatThread.ts/notifications.ts). */
function isActivelyViewing(): boolean {
  return document.visibilityState === "visible";
}

/** Ya esta adentro de esta conversacion puntual (chats.html?c=<id>): no tiene sentido avisarle de un mensaje que ya esta viendo. */
function isViewingConversation(conversationId: string): boolean {
  if (!location.pathname.endsWith("chats.html")) return false;
  return new URLSearchParams(location.search).get("c") === conversationId;
}

function clearActiveToast(): void {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  activeToast?.remove();
  activeToast = null;
}

// Deslizar hacia arriba mas de esto (en px) cierra el toast, igual que la cruz.
const SWIPE_DISMISS_PX = 40;

function attachSwipeToDismiss(toast: HTMLDivElement, onTap: () => void): void {
  let startY = 0;
  let offsetY = 0;
  let dragging = false;

  function restartDismissTimer(): void {
    if (dismissTimer) clearTimeout(dismissTimer);
    dismissTimer = setTimeout(clearActiveToast, AUTO_DISMISS_MS);
  }

  toast.addEventListener("pointerdown", (e) => {
    dragging = true;
    startY = e.clientY;
    offsetY = 0;
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    toast.style.transition = "none";
    toast.setPointerCapture(e.pointerId);
  });

  toast.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    offsetY = Math.min(0, e.clientY - startY);
    toast.style.transform = `translateY(${offsetY}px)`;
  });

  function onRelease() {
    if (!dragging) return;
    dragging = false;
    toast.style.transition = "";
    if (offsetY <= -SWIPE_DISMISS_PX) {
      clearActiveToast();
      return;
    }
    toast.style.transform = "";
    restartDismissTimer();
  }
  toast.addEventListener("pointerup", onRelease);
  toast.addEventListener("pointercancel", onRelease);

  toast.addEventListener("click", () => {
    // Un swipe termina con un "click" fantasma en algunos navegadores: si hubo arrastre real,
    // no lo tratamos como un tap para no navegar sin querer mientras cierran el toast.
    if (Math.abs(offsetY) > 5) return;
    clearActiveToast();
    onTap();
  });
}

function mountToast(innerHtml: string, onTap: () => void): void {
  clearActiveToast();

  const toast = document.createElement("div");
  toast.className = "in-app-toast reveal in-view";
  toast.setAttribute("role", "button");
  toast.setAttribute("tabindex", "0");
  toast.innerHTML = `
    ${innerHtml}
    <button type="button" class="in-app-toast-close" aria-label="Cerrar">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  toast.querySelector(".in-app-toast-close")!.addEventListener("click", (e) => {
    e.stopPropagation();
    clearActiveToast();
  });
  attachSwipeToDismiss(toast, onTap);

  document.body.appendChild(toast);
  activeToast = toast;
  dismissTimer = setTimeout(clearActiveToast, AUTO_DISMISS_MS);
}

async function handleNewMessage(detail: NewMessageEventDetail): Promise<void> {
  if (!isActivelyViewing()) return;
  if (isViewingConversation(detail.conversationId)) return;

  const { data: sender } = await supabase
    .from("profiles_public")
    .select("username, nombre, apellido, avatar_url")
    .eq("id", detail.senderId)
    .maybeSingle();
  // La conversacion ya pudo cerrarse/cambiar de pantalla mientras esperabamos la respuesta.
  if (!isActivelyViewing() || isViewingConversation(detail.conversationId)) return;

  const name = `${sender?.nombre ?? ""} ${sender?.apellido ?? ""}`.trim() || sender?.username || "Alguien";
  const avatar = sender?.avatar_url || "/images/avatars/default.svg";

  mountToast(
    `
      <img class="in-app-toast-avatar" src="${escapeHtml(avatar)}" alt="">
      <div class="in-app-toast-body">
        <strong class="in-app-toast-title">${escapeHtml(name)}</strong>
        <span class="in-app-toast-text">${escapeHtml(detail.preview ?? "Te envió un mensaje")}</span>
      </div>
    `,
    () => {
      smartNavigate(`chats.html?c=${detail.conversationId}`);
    }
  );
}

function handleNewNotification(notif: AppNotification): void {
  if (!isActivelyViewing()) return;

  mountToast(
    `
      <span class="in-app-toast-icon">🔔</span>
      <div class="in-app-toast-body">
        <strong class="in-app-toast-title">${escapeHtml(notif.title)}</strong>
        ${notif.body ? `<span class="in-app-toast-text">${escapeHtml(notif.body)}</span>` : ""}
      </div>
    `,
    () => {
      void markNotificationRead(notif.id);
      if (notif.link) smartNavigate(notif.link);
    }
  );
}

/**
 * "Push" interno de la webapp: mientras el usuario esta viendo la app, un mensaje o notificacion
 * nueva se avisa con un toast (unos segundos, tocable) -- banner arriba de borde a borde en mobile,
 * tarjeta abajo a la derecha en desktop (ver media query en modern.css). Si lo ignora, la
 * notificacion/mensaje sigue sin leer y aparece igual en la campanita o en el chat.
 * No abre suscripciones de realtime propias: escucha los eventos que ya disparan
 * setupChatBadge/setupNotificationBell al procesar sus cambios.
 */
export function setupInAppNotificationToast(): void {
  if (isEmbeddedFrame()) return;
  window.addEventListener(NEW_MESSAGE_EVENT, (e) => void handleNewMessage((e as CustomEvent<NewMessageEventDetail>).detail));
  window.addEventListener(NEW_NOTIFICATION_EVENT, (e) => handleNewNotification((e as CustomEvent<AppNotification>).detail));
}
