import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

export type Follow = Tables<"follows">;
export type FollowStatus = "none" | "pending" | "accepted" | "self";

export interface FollowCounts {
  followers: number;
  following: number;
}

export interface FollowRequestRow {
  id: string;
  followerId: string;
  username: string;
  nombre: string;
  apellido: string;
  avatarUrl: string | null;
  createdAt: string;
}

export async function getFollowStatus(targetId: string): Promise<FollowStatus> {
  const { data, error } = await supabase.rpc("get_follow_status", { p_target_id: targetId });
  if (error) throw error;
  return (data as FollowStatus | null) ?? "none";
}

export async function getFollowCounts(userId: string): Promise<FollowCounts> {
  const { data, error } = await supabase.rpc("get_follow_counts", { p_user_id: userId });
  if (error) throw error;
  const row = data?.[0];
  return { followers: row?.followers ?? 0, following: row?.following ?? 0 };
}

/** Inserta la fila de seguimiento; un trigger decide si queda 'accepted' o 'pending' segun la privacidad del destino. */
export async function followUser(followerId: string, targetId: string): Promise<{ status?: FollowStatus; error?: string }> {
  const { data, error } = await supabase
    .from("follows")
    .insert({ follower_id: followerId, followed_id: targetId })
    .select("status")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "Ya le enviaste una solicitud a este usuario." };
    return { error: "No se pudo completar la acción. Probá de nuevo." };
  }
  return { status: data.status as FollowStatus };
}

/** Sirve tanto para dejar de seguir (accepted) como para cancelar una solicitud propia (pending). */
export async function unfollowOrCancel(followerId: string, targetId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("follows").delete().eq("follower_id", followerId).eq("followed_id", targetId);
  if (error) return { error: "No se pudo completar la acción. Probá de nuevo." };
  return {};
}

export async function listFollowRequests(userId: string): Promise<FollowRequestRow[]> {
  const { data: rows, error } = await supabase
    .from("follows")
    .select("id, created_at, follower_id")
    .eq("followed_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  // Consulta separada a profiles_public en vez de un embed de PostgREST: la vista
  // no es "simple" (bypassea RLS a proposito) y el embed automatico contra ella
  // devuelve null en el join real aunque la relacion se detecte sin error.
  const followerIds = [...new Set(rows.map((r) => r.follower_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles_public")
    .select("id, username, nombre, apellido, avatar_url")
    .in("id", followerIds);
  if (profilesError) throw profilesError;

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return rows
    .map((r) => {
      const p = profileById.get(r.follower_id);
      if (!p) return null;
      return {
        id: r.id,
        followerId: r.follower_id,
        username: p.username ?? "",
        nombre: p.nombre ?? "",
        apellido: p.apellido ?? "",
        avatarUrl: p.avatar_url,
        createdAt: r.created_at,
      };
    })
    .filter((r): r is FollowRequestRow => r !== null);
}

export async function acceptFollowRequest(followId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("follows").update({ status: "accepted" }).eq("id", followId);
  if (error) return { error: "No se pudo aceptar la solicitud. Probá de nuevo." };
  return {};
}

export async function rejectFollowRequest(followId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("follows").delete().eq("id", followId);
  if (error) return { error: "No se pudo rechazar la solicitud. Probá de nuevo." };
  return {};
}
