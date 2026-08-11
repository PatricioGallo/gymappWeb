import { supabase } from "./supabaseClient";
import type { Database } from "../types/database";

export type ProfileSearchResult = Database["public"]["Functions"]["search_profiles"]["Returns"][number];
export type SuggestedProfile = Database["public"]["Functions"]["suggested_profiles"]["Returns"][number];

export const USER_TYPE_BADGE: Record<string, string> = {
  admin: "Admin",
  colaborador: "Colaborador",
  gimnasio: "Gimnasio",
  entrenador: "Entrenador",
  usuario: "Gymbro",
};

export async function searchProfiles(query: string, limit = 20): Promise<ProfileSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const { data, error } = await supabase.rpc("search_profiles", { p_query: trimmed, p_limit: limit });
  if (error) throw error;
  return data ?? [];
}

export async function getSuggestedProfiles(limit = 6): Promise<SuggestedProfile[]> {
  const { data, error } = await supabase.rpc("suggested_profiles", { p_limit: limit });
  if (error) throw error;
  return data ?? [];
}
