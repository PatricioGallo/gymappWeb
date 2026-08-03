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
  const { data, error } = await supabase
    .from("user_blocks")
    .select("id, blocked_id, created_at, profiles:blocked_id ( username, nombre, apellido, avatar_url )")
    .eq("blocker_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .filter((row: any) => row.profiles)
    .map((row: any) => ({
      id: row.id,
      blockedId: row.blocked_id,
      username: row.profiles.username,
      nombre: row.profiles.nombre,
      apellido: row.profiles.apellido,
      avatarUrl: row.profiles.avatar_url,
      createdAt: row.created_at,
    }));
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
