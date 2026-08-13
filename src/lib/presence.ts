import { supabase } from "./supabaseClient";

const PRESENCE_CHANNEL_NAME = "presence:online-users";

// Un solo canal global por pestaña: se crea una vez (ver trackPresence, llamado desde
// requireAuth en cada página autenticada) y todo lo demás en este módulo lo reusa.
let channel: ReturnType<typeof supabase.channel> | null = null;

// watchPeerOnline (llamado recien mas tarde, solo en chat.html) no puede registrar sus
// propios listeners de presencia: realtime-js no deja agregar callbacks de presencia
// despues de subscribe(), y trackPresence ya suscribio el canal apenas arranca la pagina.
// Por eso los listeners de sync/join/leave quedan fijos de entrada (ver trackPresence) y
// solo avisan a quien se anoto aca.
const watchers = new Map<string, Set<(online: boolean) => void>>();

function isOnline(userId: string): boolean {
  return Boolean(channel?.presenceState()[userId]?.length);
}

function notifyWatchers(): void {
  watchers.forEach((callbacks, userId) => {
    const online = isOnline(userId);
    callbacks.forEach((cb) => cb(online));
  });
}

/**
 * Une a este usuario al canal global de presencia. Mientras la pestaña siga conectada,
 * Realtime lo cuenta como "en línea" para quien mire su estado con watchPeerOnline (ej. en
 * un chat). Se cae solo cuando se cierra la pestaña o se pierde la conexión, no hace falta
 * desregistrar a mano.
 */
export function trackPresence(userId: string): void {
  if (channel) return;
  // enabled:true desde el arranque -- si se prendiera recien mas tarde, el canal ya podria
  // haber terminado de suscribirse sin haber pedido nunca la foto inicial de quien esta
  // online, y presenceState() quedaria vacio.
  channel = supabase.channel(PRESENCE_CHANNEL_NAME, { config: { presence: { key: userId, enabled: true } } });
  channel.on("presence", { event: "sync" }, notifyWatchers);
  channel.on("presence", { event: "join" }, notifyWatchers);
  channel.on("presence", { event: "leave" }, notifyWatchers);
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") void channel!.track({ online_at: new Date().toISOString() });
  });
}

/**
 * Avisa si peerUserId está conectado ahora mismo, en cualquier pestaña de la app (no
 * necesariamente en este mismo chat). onChange se dispara con el estado inicial (puede ser
 * false por un instante si el canal todavía no terminó su sync inicial -- se corrige solo
 * apenas llega) y de nuevo cada vez que cambia.
 */
export function watchPeerOnline(peerUserId: string, onChange: (online: boolean) => void): void {
  if (!watchers.has(peerUserId)) watchers.set(peerUserId, new Set());
  watchers.get(peerUserId)!.add(onChange);
  onChange(isOnline(peerUserId));
}
