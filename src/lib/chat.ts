import { supabase } from "./supabaseClient";
import { getUnreadConversationCount } from "../services/chat.service";

const POLL_INTERVAL_MS = 60000;

/** Badge de mensajes sin leer junto a la lupa del header. No-op en páginas sin el markup (ej. marketing). */
export function setupChatBadge(userId: string): void {
  const badge = document.getElementById("chatBadge");
  if (!badge) return;

  async function refresh() {
    try {
      const count = await getUnreadConversationCount();
      badge!.hidden = count <= 0;
      badge!.textContent = count > 9 ? "9+" : String(count);
    } catch {
      // silencioso: el badge simplemente no se actualiza en este ciclo
    }
  }

  void refresh();

  setInterval(() => {
    if (document.visibilityState === "visible") void refresh();
  }, POLL_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refresh();
  });

  // Realtime no soporta OR en un filtro: dos suscripciones (una por columna)
  // cubren "una conversación mía cambió" sin importar en qué slot quedé.
  supabase
    .channel(`chat-badge-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `user1_id=eq.${userId}` }, () => void refresh())
    .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `user2_id=eq.${userId}` }, () => void refresh())
    .subscribe();
}
