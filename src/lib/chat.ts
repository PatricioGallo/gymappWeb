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

async function paintChatBadge(doc: Document): Promise<void> {
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

let badgeCoalesceTimer: ReturnType<typeof setTimeout> | undefined;
let badgeInFlight: Promise<void> | null = null;
let badgeDirtyDuringFlight = false;
const badgePendingDocs = new Set<Document>();

/**
 * Refresca el badge de mensajes sin leer, coalesciendo ráfagas. Abrir un chat dispara varias
 * llamadas casi simultáneas -- markConversationRead + su eco por realtime (la suscripción a
 * conversation_participants del badge) + el poll de 60s + el caller de chats.ts -- y cada una,
 * sin esto, era su propio POST /rpc/get_unread_conversation_count (se veían 2-3 seguidos al
 * abrir un grupo). Ahora un burst dentro de ~250ms resuelve en una sola request.
 *
 * `doc`: el document del header donde vive el badge -- por defecto el actual, pero el layout de
 * escritorio de chat.html corre en un iframe dentro de chats.html y ese caller pasa
 * window.parent.document (por eso se acumulan en un Set: un burst puede mezclar ambos).
 */
export function refreshChatBadge(doc: Document = document): Promise<void> {
  badgePendingDocs.add(doc);
  if (badgeInFlight) {
    badgeDirtyDuringFlight = true; // llegó un pedido mientras se pintaba -- reintentar una vez al terminar
    return badgeInFlight;
  }

  badgeInFlight = new Promise<void>((resolve) => {
    clearTimeout(badgeCoalesceTimer);
    badgeCoalesceTimer = setTimeout(async () => {
      const docs = badgePendingDocs.size ? [...badgePendingDocs] : [document];
      badgePendingDocs.clear();
      badgeDirtyDuringFlight = false;
      try {
        await Promise.all(docs.map((d) => paintChatBadge(d)));
      } finally {
        badgeInFlight = null;
        resolve();
        if (badgeDirtyDuringFlight) void refreshChatBadge();
      }
    }, 250);
  });
  return badgeInFlight;
}

/**
 * Badge de mensajes sin leer junto a la lupa del header. No-op en páginas sin el markup (ej.
 * marketing). `initialCount` (de get_nav_badges) evita el primer POST /rpc/get_unread_conversation_count
 * -- el header ya trae el número en el mismo request que la identidad del usuario.
 */
export function setupChatBadge(userId: string, initialCount?: number): void {
  const badge = document.getElementById("chatBadge");
  if (!badge) return;

  if (typeof initialCount === "number") {
    badge.hidden = initialCount <= 0;
    badge.textContent = initialCount > 9 ? "9+" : String(initialCount);
  } else {
    void refreshChatBadge();
  }

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
        // Solo un INSERT (me agregaron a un grupo/DM nuevo) puede cambiar el conteo por esta vía.
        // Un UPDATE acá es casi siempre mi propio last_read_at moviéndose al abrir un chat -- eso
        // ya lo refresca markReadAndRefreshBadge en chatThread.ts, y su eco por realtime volvía
        // a disparar un get_unread_conversation_count redundante (se veían 2 seguidos al abrir).
        if (payload.eventType === "INSERT") void refreshChatBadge();
      }
    )
    .subscribe();
}
