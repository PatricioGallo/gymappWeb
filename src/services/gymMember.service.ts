import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

export type GymMember = Tables<"gym_members">;
export type GymMembershipStatus = "none" | "pending" | "active" | "ended" | "self";
export type MembershipType = "lifetime" | "fixed";
export type MemberTier = "ok" | "expiring" | "expired" | null;

export interface GymMemberRow {
  id: string;
  memberId: string;
  username: string;
  nombre: string;
  apellido: string;
  avatarUrl: string | null;
  userType: Tables<"profiles">["user_type"];
  isVerified: boolean;
  status: string;
  membershipType: MembershipType | null;
  durationMonths: number | null;
  expiresAt: string | null;
  requestedAt: string;
  respondedAt: string | null;
  endedAt: string | null;
  tier: MemberTier;
}

export type MemberStatusFilter = "all" | "ok" | "expiring" | "expired" | "pending" | "ended";
export type MemberSort = "recent" | "oldest";

export async function getGymMembershipStatus(gymId: string): Promise<GymMembershipStatus> {
  const { data, error } = await supabase.rpc("get_gym_membership_status", { p_gym_id: gymId });
  if (error) throw error;
  return (data as GymMembershipStatus | null) ?? "none";
}

export async function getSocioCount(gymId: string): Promise<number> {
  const { data, error } = await supabase.rpc("get_socio_count", { p_gym_id: gymId });
  if (error) throw error;
  return data ?? 0;
}

/** Gimnasios de los que el usuario es socio activo (perspectiva del socio, no del gimnasio). */
export async function listMyActiveGyms(memberId: string): Promise<{ id: string; username: string }[]> {
  const { data, error } = await supabase
    .from("gym_members")
    .select("profiles!gym_members_gym_id_fkey ( id, username )")
    .eq("member_id", memberId)
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ id: row.profiles.id, username: row.profiles.username }));
}

/** Crea la solicitud de socio (siempre 'pending' hasta que el gimnasio la acepte). Si ya habia
 * sido socio antes y el gimnasio no lo elimino del historico, reactiva esa misma fila 'ended'
 * en vez de duplicarla, para que "socio desde" mantenga la fecha original de alta. */
export async function requestGymMembership(gymId: string): Promise<{ status?: GymMembershipStatus; error?: string }> {
  const { data, error } = await supabase.rpc("request_gym_membership", { p_gym_id: gymId });
  if (error) {
    if (error.message?.includes("already member")) return { error: "Ya le enviaste una solicitud a este gimnasio." };
    if (error.message?.includes("blocked")) return { error: "No podés hacerte socio de este gimnasio." };
    if (error.message?.includes("not a gym")) return { error: "Este perfil no es un gimnasio." };
    return { error: "No se pudo completar la acción. Probá de nuevo." };
  }
  return { status: data?.status as GymMembershipStatus };
}

/** Sirve para: el socio se da de baja (active -> historico 'ended'), el socio cancela su propia
 * solicitud (pending -> se borra, nunca llego a ser socio), o el gimnasio da de baja/rechaza a
 * cualquiera de sus socios en cualquier momento. */
async function endMembership(gymId: string, memberId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("end_gym_membership", { p_gym_id: gymId, p_member_id: memberId });
  if (error) return { error: "No se pudo completar la acción. Probá de nuevo." };
  return {};
}

export async function leaveGym(gymId: string, memberId: string): Promise<{ error?: string }> {
  return endMembership(gymId, memberId);
}

export async function removeSocio(gymId: string, memberId: string): Promise<{ error?: string }> {
  return endMembership(gymId, memberId);
}

export async function rejectSocioRequest(gymId: string, memberId: string): Promise<{ error?: string }> {
  return endMembership(gymId, memberId);
}

/** Acepta una solicitud pendiente: el gimnasio elige "para siempre" o una duracion fija en meses
 * (el trigger antes de update valida la combinacion y recalcula expires_at server-side). */
export async function acceptGymMembershipRequest(
  membershipId: string,
  membershipType: MembershipType,
  durationMonths?: number
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("gym_members")
    .update({ status: "active", membership_type: membershipType, duration_months: membershipType === "fixed" ? durationMonths ?? null : null })
    .eq("id", membershipId);
  if (error) return { error: "No se pudo aceptar la solicitud. Probá de nuevo." };
  return {};
}

/** Borra definitivamente un registro historico (status='ended'). No afecta socios activos. */
export async function deleteHistoricGymMembership(gymId: string, memberId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("gym_members").delete().eq("gym_id", gymId).eq("member_id", memberId).eq("status", "ended");
  if (error) return { error: "No se pudo eliminar el registro. Probá de nuevo." };
  return {};
}

// La RPC (SECURITY DEFINER) exige auth.uid() = p_gym_id (o admin) -- devuelve 0 filas en
// silencio para cualquier otro llamador, en vez de fallar.
export async function listGymMembers(gymId: string, opts: { search?: string; statusFilter?: MemberStatusFilter; sort?: MemberSort } = {}): Promise<GymMemberRow[]> {
  const { data, error } = await supabase.rpc("list_gym_members", {
    p_gym_id: gymId,
    p_search: opts.search?.trim() || undefined,
    p_status_filter: opts.statusFilter ?? "all",
    p_sort: opts.sort ?? "recent",
    p_limit: 100,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    memberId: r.member_id,
    username: r.username ?? "",
    nombre: r.nombre ?? "",
    apellido: r.apellido ?? "",
    avatarUrl: r.avatar_url,
    userType: r.user_type,
    isVerified: r.is_verified,
    status: r.status,
    membershipType: r.membership_type as MembershipType | null,
    durationMonths: r.duration_months,
    expiresAt: r.expires_at,
    requestedAt: r.requested_at,
    respondedAt: r.responded_at,
    endedAt: r.ended_at,
    tier: r.tier as MemberTier,
  }));
}

export async function getPendingGymMembershipRequestCount(gymId: string): Promise<number> {
  const { count, error } = await supabase
    .from("gym_members")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId)
    .eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}
