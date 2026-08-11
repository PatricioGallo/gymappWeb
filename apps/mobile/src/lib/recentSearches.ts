import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ProfileSearchResult } from "./searchService";

const STORAGE_KEY = "gymsocial_recent_searches";
const MAX_RECENT = 6;

export interface RecentSearchEntry {
  id: string;
  username: string;
  nombre: string;
  apellido: string;
  avatar_url: string | null;
  user_type: ProfileSearchResult["user_type"];
  is_verified: boolean;
}

/** Recientes por dispositivo (AsyncStorage), no por cuenta: no hay backend para esto. */
export async function getRecentSearches(): Promise<RecentSearchEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveRecentSearches(list: RecentSearchEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // no critico si falla el guardado
  }
}

export async function addRecentSearch(entry: RecentSearchEntry): Promise<void> {
  const list = (await getRecentSearches()).filter((r) => r.id !== entry.id);
  list.unshift(entry);
  await saveRecentSearches(list.slice(0, MAX_RECENT));
}

export async function removeRecentSearch(id: string): Promise<void> {
  await saveRecentSearches((await getRecentSearches()).filter((r) => r.id !== id));
}

export async function clearRecentSearches(): Promise<void> {
  await saveRecentSearches([]);
}
