import { supabase } from "./supabaseClient";
import type { Tables } from "@/types/database";

export interface FollowCounts {
  followers: number;
  following: number;
}

export interface FollowListRow {
  id: string;
  username: string;
  nombre: string;
  apellido: string;
  avatarUrl: string | null;
  userType: Tables<"profiles">["user_type"];
  isVerified: boolean;
  followedAt: string;
}

export type FollowStatus = "none" | "pending" | "accepted" | "self";

export async function getFollowCounts(userId: string): Promise<FollowCounts> {
  const { data, error } = await supabase.rpc("get_follow_counts", { p_user_id: userId });
  if (error) throw error;
  const row = data?.[0];
  return { followers: row?.followers ?? 0, following: row?.following ?? 0 };
}

export async function getFollowStatus(targetId: string): Promise<FollowStatus> {
  const { data, error } = await supabase.rpc("get_follow_status", { p_target_id: targetId });
  if (error) throw error;
  return (data as FollowStatus | null) ?? "none";
}

// La RPC (SECURITY DEFINER) hace el chequeo de privacidad server-side via
// is_profile_public: si el perfil es privado y el visitante no lo sigue
// (o no es el dueno/admin), devuelve 0 filas aunque el llamado no falle.
export async function listFollowers(userId: string, search = "", limit = 100): Promise<FollowListRow[]> {
  const { data, error } = await supabase.rpc("list_followers", { p_user_id: userId, p_search: search.trim() || undefined, p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    username: r.username ?? "",
    nombre: r.nombre ?? "",
    apellido: r.apellido ?? "",
    avatarUrl: r.avatar_url,
    userType: r.user_type,
    isVerified: r.is_verified,
    followedAt: r.followed_at,
  }));
}

export async function listFollowing(userId: string, search = "", limit = 100): Promise<FollowListRow[]> {
  const { data, error } = await supabase.rpc("list_following", { p_user_id: userId, p_search: search.trim() || undefined, p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    username: r.username ?? "",
    nombre: r.nombre ?? "",
    apellido: r.apellido ?? "",
    avatarUrl: r.avatar_url,
    userType: r.user_type,
    isVerified: r.is_verified,
    followedAt: r.followed_at,
  }));
}

/** Inserta la fila de seguimiento; un trigger decide si queda 'accepted' o 'pending' segun la privacidad del destino. */
export async function followUser(followerId: string, targetId: string): Promise<{ status?: FollowStatus; error?: string }> {
  const { data, error } = await supabase.from("follows").insert({ follower_id: followerId, followed_id: targetId }).select("status").single();
  if (error) {
    if (error.code === "23505") return { error: "Ya le enviaste una solicitud a este usuario." };
    if (error.message?.includes("blocked")) return { error: "No podés seguir a este usuario." };
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
