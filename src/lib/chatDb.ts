import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ChatMessage } from "../services/chat.service";

const DB_NAME = "gymapp-chat";
const DB_VERSION = 1;
// Cuantas conversaciones distintas se mantienen cacheadas -- entra en juego
// para alguien que va abriendo muchos chats distintos en una misma sesion;
// las mas viejas (por ultimo uso) se van descartando para no crecer sin limite.
const MAX_CACHED_CONVERSATIONS = 80;

interface ChatDbSchema extends DBSchema {
  messages: {
    key: string;
    value: ChatMessage;
    indexes: { by_conversation: string };
  };
  conversation_meta: {
    key: string;
    value: { conversation_id: string; cached_at: number };
  };
}

let dbPromise: Promise<IDBPDatabase<ChatDbSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<ChatDbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<ChatDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const messages = db.createObjectStore("messages", { keyPath: "id" });
        messages.createIndex("by_conversation", "conversation_id");
        db.createObjectStore("conversation_meta", { keyPath: "conversation_id" });
      },
    });
  }
  return dbPromise;
}

/** Mensajes cacheados de una conversación, mas viejo primero (mismo orden que usa chat.ts). */
export async function getCachedMessages(conversationId: string): Promise<ChatMessage[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllFromIndex("messages", "by_conversation", conversationId);
    return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  } catch {
    return []; // IndexedDB no disponible (ej. modo privado en algunos navegadores viejos): sin cache, sigue andando igual con la red
  }
}

/** Guarda/actualiza mensajes de una conversación y marca su uso para el desalojo por LRU. */
export async function cacheMessages(conversationId: string, msgs: ChatMessage[]): Promise<void> {
  if (msgs.length === 0) return;
  try {
    const db = await getDb();
    const tx = db.transaction(["messages", "conversation_meta"], "readwrite");
    await Promise.all([
      ...msgs.map((m) => tx.objectStore("messages").put(m)),
      tx.objectStore("conversation_meta").put({ conversation_id: conversationId, cached_at: Date.now() }),
    ]);
    await tx.done;
    void evictOldConversations(db);
  } catch {
    // sin cache no pasa nada grave, el chat sigue funcionando contra la red
  }
}

async function evictOldConversations(db: IDBPDatabase<ChatDbSchema>): Promise<void> {
  const metas = await db.getAll("conversation_meta");
  if (metas.length <= MAX_CACHED_CONVERSATIONS) return;

  const toEvict = metas.sort((a, b) => a.cached_at - b.cached_at).slice(0, metas.length - MAX_CACHED_CONVERSATIONS);

  for (const meta of toEvict) {
    const tx = db.transaction(["messages", "conversation_meta"], "readwrite");
    const messageIds = await tx.objectStore("messages").index("by_conversation").getAllKeys(meta.conversation_id);
    await Promise.all([
      ...messageIds.map((id) => tx.objectStore("messages").delete(id)),
      tx.objectStore("conversation_meta").delete(meta.conversation_id),
    ]);
    await tx.done;
  }
}

/** Borra todo el cache local de chats -- se llama al cerrar sesión, para no dejar mensajes de otra cuenta en el dispositivo. */
export async function clearChatCache(): Promise<void> {
  try {
    const db = await getDb();
    await Promise.all([db.clear("messages"), db.clear("conversation_meta")]);
  } catch {
    // nada que limpiar si ni siquiera se pudo abrir la base
  }
}
