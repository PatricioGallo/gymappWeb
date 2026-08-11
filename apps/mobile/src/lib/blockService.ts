import { supabase } from "./supabaseClient";

export type BlockStatus = "none" | "blocked_by_me" | "blocked_me";

/** RPC (SECURITY DEFINER): resuelve el bloqueo en cualquier direccion sin depender
 * de poder leer filas ajenas de user_blocks via RLS (que solo expone las propias). */
export async function getBlockStatus(targetId: string): Promise<BlockStatus> {
  const { data, error } = await supabase.rpc("get_block_status", { p_target_id: targetId });
  if (error) throw error;
  return (data as BlockStatus | null) ?? "none";
}

export async function blockUser(blockerId: string, blockedId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("user_blocks").insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error) {
    if (error.code === "23505") return { error: "Ya bloqueaste a este usuario." };
    return { error: "No se pudo bloquear al usuario. Probá de nuevo." };
  }
  return {};
}

/** Borra por (blocker_id, blocked_id): el visitante de un perfil no tiene el id de fila a mano. */
export async function unblockUser(blockerId: string, blockedId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("user_blocks").delete().eq("blocker_id", blockerId).eq("blocked_id", blockedId);
  if (error) return { error: "No se pudo desbloquear al usuario. Probá de nuevo." };
  return {};
}
