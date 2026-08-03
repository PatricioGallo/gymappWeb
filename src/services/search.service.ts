import { supabase } from "../lib/supabaseClient";
import type { Database } from "../types/database";

export type ProfileSearchResult = Database["public"]["Functions"]["search_profiles"]["Returns"][number];

export async function searchProfiles(query: string, limit = 20): Promise<ProfileSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const { data, error } = await supabase.rpc("search_profiles", { p_query: trimmed, p_limit: limit });
  if (error) throw error;
  return data ?? [];
}
