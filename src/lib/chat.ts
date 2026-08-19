import { supabase } from "./supabaseClient";
import { getUnreadConversationCount } from "../services/chat.service";
import type { Tables } from "../types/database";

const POLL_INTERVAL_MS = 60000;

export interface NewMessageEventDetail {
  conversationId: string;
  senderId: string;
  preview: string | null;
  kind: string;
  groupName: string | null;
}

/** Evento global disparado cuando llega (via realtime) un mensaje nuevo de otra persona, para que el toast in-app lo muestre sin abrir una suscripcion propia. */
export const NEW_MESSAGE_EVENT = "gs:new-message";

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

  // last_message_at visto por conversacion en esta carga de pagina: permite distinguir un
  // mensaje nuevo genuino (cambia last_message_at) de un cambio de estado sin mensaje nuevo
  // (ej. aceptar/rechazar solicitud, que solo toca "status") para no disparar el toast en falso.
  const lastSeenAt = new Map<string, string>();

  // conversations ya no tiene columnas fijas (user1_id/user2_id) que sirvan para filtrar por
  // participante con N personas en un grupo, asi que la suscripcion de abajo escucha TODA la
  // tabla (mismo patron sin filtro que ya usa la lista de chats.ts) y este set -- poblado desde
  // conversation_participants y mantenido al dia con su propia suscripcion chica, filtrada por
  // user_id -- decide localmente si el cambio me importa antes de pedir el conteo real o avisar.
  const myConversationIds = new Set<string>();

  async function loadMyConversationIds(): Promise<void> {
    const { data } = await supabase.from("conversation_participants").select("conversation_id").eq("user_id", userId).is("left_at", null);
    myConversationIds.clear();
    for (const row of data ?? []) myConversationIds.add(row.conversation_id);
  }
  void loadMyConversationIds();

  function handleConversationChange(row: Tables<"conversations">) {
    if (!myConversationIds.has(row.id)) return;
    void refreshChatBadge();

    const wasSeen = lastSeenAt.get(row.id);
    lastSeenAt.set(row.id, row.last_message_at);
    if (!row.last_message_sender_id || row.last_message_sender_id === userId) return;
    if (wasSeen === row.last_message_at) return;
    // Sin "wasSeen" previo (primer evento de esta conversacion en esta carga de pagina) no hay
    // forma de saber si last_message_at cambio recien o viene de antes (ej. aceptar una solicitud
    // vieja no toca ese campo, pero si es la primera vez que vemos la fila igual no lo sabemos sin
    // baseline); nos apoyamos en que sea reciente para no avisar de un mensaje que ya es historia.
    if (Date.now() - new Date(row.last_message_at).getTime() > 15000) return;

    window.dispatchEvent(
      new CustomEvent<NewMessageEventDetail>(NEW_MESSAGE_EVENT, {
        detail: {
          conversationId: row.id,
          senderId: row.last_message_sender_id,
          preview: row.last_message_preview,
          kind: row.kind,
          groupName: row.group_name,
        },
      })
    );
  }

  supabase
    .channel(`chat-badge-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, (payload) =>
      handleConversationChange(payload.new as Tables<"conversations">)
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "conversation_participants", filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = payload.new as Tables<"conversation_participants"> | undefined;
        if (payload.eventType === "DELETE" || !row || row.left_at) {
          const oldRow = payload.old as Tables<"conversation_participants"> | undefined;
          if (oldRow) myConversationIds.delete(oldRow.conversation_id);
          return;
        }
        myConversationIds.add(row.conversation_id);
        void refreshChatBadge();
      }
    )
    .subscribe();
}
