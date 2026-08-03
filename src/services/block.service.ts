import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

export type UserBlock = Tables<"user_blocks">;

export interface BlockedUserRow {
  id: string;
  blockedId: string;
  username: string;
  nombre: string;
  apellido: string;
  avatarUrl: string | null;
  createdAt: string;
}

export async function listBlockedUsers(userId: string): Promise<BlockedUserRow[]> {
  const { data: rows, error } = await supabase
    .from("user_blocks")
    .select("id, blocked_id, created_at")
    .eq("blocker_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  // Consulta separada a profiles_public en vez de un embed de PostgREST: la vista
  // no es "simple" (bypassea RLS a proposito) y el embed automatico contra ella
  // devuelve null en el join real aunque la relacion se detecte sin error.
  const blockedIds = [...new Set(rows.map((r) => r.blocked_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles_public")
    .select("id, username, nombre, apellido, avatar_url")
    .in("id", blockedIds);
  if (profilesError) throw profilesError;

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return rows
    .map((r) => {
      const p = profileById.get(r.blocked_id);
      if (!p) return null;
      return {
        id: r.id,
        blockedId: r.blocked_id,
        username: p.username ?? "",
        nombre: p.nombre ?? "",
        apellido: p.apellido ?? "",
        avatarUrl: p.avatar_url,
        createdAt: r.created_at,
      };
    })
    .filter((r): r is BlockedUserRow => r !== null);
}

export async function blockUser(blockerId: string, blockedId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("user_blocks").insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error) {
    if (error.code === "23505") return { error: "Ya bloqueaste a este usuario." };
    return { error: "No se pudo bloquear al usuario. Probá de nuevo." };
  }
  return {};
}

export async function unblockUser(blockId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("user_blocks").delete().eq("id", blockId);
  if (error) return { error: "No se pudo desbloquear al usuario. Probá de nuevo." };
  return {};
}
