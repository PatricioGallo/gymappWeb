import type { ProfileSearchResult } from "../services/search.service";

const STORAGE_KEY = "gymsocial_recent_searches";
const MAX_RECENT = 6;

export type RecentSearchEntry = Pick<ProfileSearchResult, "id" | "username" | "nombre" | "apellido" | "avatar_url" | "user_type" | "is_verified">;

/** Recientes por dispositivo/navegador (localStorage), no por cuenta: no hay backend para esto. */
export function getRecentSearches(): RecentSearchEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(list: RecentSearchEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // localStorage puede estar deshabilitado (modo privado); no es critico.
  }
}

export function addRecentSearch(entry: RecentSearchEntry): void {
  const list = getRecentSearches().filter((r) => r.id !== entry.id);
  list.unshift(entry);
  saveRecentSearches(list.slice(0, MAX_RECENT));
}

export function removeRecentSearch(id: string): void {
  saveRecentSearches(getRecentSearches().filter((r) => r.id !== id));
}

export function clearRecentSearches(): void {
  saveRecentSearches([]);
}
