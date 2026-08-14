import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { FeedPost } from "../services/post.service";

const DB_NAME = "gymapp-feed";
const DB_VERSION = 1;

interface FeedDbSchema extends DBSchema {
  // Un solo registro por usuario (no uno por post, como en chatDb.ts): esto no es un historial
  // paginado, es solo "la primera pagina que viste la ultima vez" para pintarla al toque -- el
  // orden del feed no es puramente cronologico (algoritmo + jitter, ver get_personalized_feed en
  // post.service.ts), asi que no hay forma de "seguir de donde quedo" con la red igual.
  feed_pages: { key: string; value: { user_id: string; posts: FeedPost[]; cached_at: number } };
}

let dbPromise: Promise<IDBPDatabase<FeedDbSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<FeedDbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<FeedDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("feed_pages", { keyPath: "user_id" });
      },
    });
  }
  return dbPromise;
}

/** Ultima "pagina 0" del feed personalizado de este usuario, para pintarla al toque mientras se
 * espera la respuesta real de la red (ver feed.ts) -- mismo patron "cache primero, reconciliar
 * con la red despues" que ya usan chatDb.ts (mensajes) y profileDb.ts (perfiles). */
export async function getCachedFeed(userId: string): Promise<FeedPost[]> {
  try {
    const db = await getDb();
    const row = await db.get("feed_pages", userId);
    return row?.posts ?? [];
  } catch {
    return []; // IndexedDB no disponible (ej. modo privado): sin cache, sigue andando igual con la red
  }
}

export async function cacheFeed(userId: string, posts: FeedPost[]): Promise<void> {
  if (posts.length === 0) return;
  try {
    const db = await getDb();
    await db.put("feed_pages", { user_id: userId, posts, cached_at: Date.now() });
  } catch {
    // sin cache no pasa nada grave, la proxima visita carga normal contra la red
  }
}

/** Borra el cache local del feed -- se llama al cerrar sesión, para no dejar Reps de otra cuenta en el dispositivo. */
export async function clearFeedCache(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear("feed_pages");
  } catch {
    // nada que limpiar si ni siquiera se pudo abrir la base
  }
}
