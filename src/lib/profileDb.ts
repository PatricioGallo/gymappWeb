import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ProfileBasic } from "../services/profile.service";

const DB_NAME = "gymapp-profile";
const DB_VERSION = 1;

interface ProfileDbSchema extends DBSchema {
  profiles: {
    key: string;
    value: ProfileBasic;
    indexes: { by_username: string };
  };
}

let dbPromise: Promise<IDBPDatabase<ProfileDbSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<ProfileDbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<ProfileDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore("profiles", { keyPath: "id" });
        store.createIndex("by_username", "username");
      },
    });
  }
  return dbPromise;
}

/** Lo basico de un perfil (foto, nombre, bio, links) tal como se vio la ultima vez -- para
 * pintarlo al toque mientras se espera la respuesta real de la red (ver profile.ts), mismo
 * patron "cache primero, reconciliar con la red despues" que ya usa chatDb.ts para los mensajes. */
export async function getCachedProfileById(id: string): Promise<ProfileBasic | null> {
  try {
    const db = await getDb();
    return (await db.get("profiles", id)) ?? null;
  } catch {
    return null; // IndexedDB no disponible (ej. modo privado): sin cache, sigue andando igual con la red
  }
}

export async function getCachedProfileByUsername(username: string): Promise<ProfileBasic | null> {
  try {
    const db = await getDb();
    return (await db.getFromIndex("profiles", "by_username", username)) ?? null;
  } catch {
    return null;
  }
}

/** Solo guarda los campos "publicos" (ProfileBasic/profiles_public): nunca el mail ni otros datos
 * privados que puede traer la fila completa que ve el dueño -- eso no debe terminar en el disco. */
export async function cacheProfile(profile: ProfileBasic): Promise<void> {
  if (!profile.id) return;
  try {
    const db = await getDb();
    await db.put("profiles", profile);
  } catch {
    // sin cache no pasa nada grave, la proxima visita carga normal contra la red
  }
}

/** Borra el cache local de perfiles -- se llama al cerrar sesión, para no dejar datos de otra cuenta en el dispositivo. */
export async function clearProfileCache(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear("profiles");
  } catch {
    // nada que limpiar si ni siquiera se pudo abrir la base
  }
}
