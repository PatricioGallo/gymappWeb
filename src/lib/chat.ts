import { supabase } from "./supabaseClient";
import { getUnreadConversationCount } from "../services/chat.service";

const POLL_INTERVAL_MS = 60000;

/**
 * Refresca el badge de mensajes sin leer ya mismo, sin esperar al poll ni a un cambio
 * realtime en "conversations" (mark_conversation_read solo toca la tabla "messages", asi
 * que abrir/leer un chat no dispara esa suscripcion -- quien llama a markConversationRead
 * tiene que pedir este refresh a mano). Recibe el document del header donde vive el badge:
 * por defecto el actual, pero en el layout de escritorio chat.html corre embebido en un
 * iframe dentro de chats.html, asi que ese caller tambien pasa window.parent.document.
 */
export async function refreshChatBadge(doc: Document = document): Promise<void> {
  const badge = doc.getElementById("chatBadge");
  if (!badge) return;
  try {
    const count = await getUnreadConversationCount();
    badge.hidden = count <= 0;
    badge.textContent = count > 9 ? "9+" : String(count);
  } catch {
    // silencioso: el badge simplemente no se actualiza en este ciclo
  }
}

/** Badge de mensajes sin leer junto a la lupa del header. No-op en páginas sin el markup (ej. marketing). */
export function setupChatBadge(userId: string): void {
  const badge = document.getElementById("chatBadge");
  if (!badge) return;

  void refreshChatBadge();

  setInterval(() => {
    if (document.visibilityState === "visible") void refreshChatBadge();
  }, POLL_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshChatBadge();
  });

  // Realtime no soporta OR en un filtro: dos suscripciones (una por columna)
  // cubren "una conversación mía cambió" sin importar en qué slot quedé.
  supabase
    .channel(`chat-badge-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `user1_id=eq.${userId}` }, () => void refreshChatBadge())
    .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `user2_id=eq.${userId}` }, () => void refreshChatBadge())
    .subscribe();
}
