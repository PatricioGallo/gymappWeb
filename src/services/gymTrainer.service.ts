import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

export type GymTrainer = Tables<"gym_trainers">;
export type GymTrainerHandleStatus = "none" | "pending" | "active" | "ended" | "self";
export type HandleInitiatedBy = "gym" | "trainer" | null;
export type MembershipType = "lifetime" | "fixed";
export type MemberTier = "ok" | "expiring" | "expired" | null;

export interface GymTrainerRow {
  id: string;
  trainerId: string;
  username: string;
  nombre: string;
  apellido: string;
  avatarUrl: string | null;
  userType: Tables<"profiles">["user_type"];
  isVerified: boolean;
  status: string;
  initiatedBy: HandleInitiatedBy;
  membershipType: MembershipType | null;
  durationMonths: number | null;
  expiresAt: string | null;
  requestedAt: string;
  respondedAt: string | null;
  endedAt: string | null;
  tier: MemberTier;
}

export type TrainerStatusFilter = "all" | "ok" | "expiring" | "expired" | "pending" | "ended";
export type TrainerSort = "recent" | "oldest";

export async function getGymTrainerHandleStatus(gymId: string): Promise<{ status: GymTrainerHandleStatus; initiatedBy: HandleInitiatedBy }> {
  const { data, error } = await supabase.rpc("get_gym_trainer_handle_status", { p_gym_id: gymId });
  if (error) throw error;
  const row = data?.[0];
  return { status: (row?.status as GymTrainerHandleStatus | undefined) ?? "none", initiatedBy: (row?.initiated_by as HandleInitiatedBy) ?? null };
}

/** El entrenador pide sumarse a un gimnasio (la duracion la decide el gimnasio recien al
 * aceptar). Si ya habia sido handle antes y el gimnasio no lo elimino del historico, reactiva
 * esa misma fila 'ended' en vez de duplicarla. */
export async function requestGymTrainerHandle(gymId: string): Promise<{ status?: GymTrainerHandleStatus; error?: string }> {
  const { data, error } = await supabase.rpc("request_gym_trainer_handle", { p_gym_id: gymId });
  if (error) {
    if (error.message?.includes("already linked")) return { error: "Ya sos handle (o tenés una solicitud pendiente) de este gimnasio." };
    if (error.message?.includes("blocked")) return { error: "No podés pedir ser handle de este gimnasio." };
    if (error.message?.includes("not a gym")) return { error: "Este perfil no es un gimnasio." };
    return { error: "No se pudo completar la acción. Probá de nuevo." };
  }
  return { status: data?.status as GymTrainerHandleStatus };
}

/** El gimnasio invita a un entrenador, definiendo la duracion ya mismo -- el entrenador solo
 * acepta o rechaza. Mismo insert-o-reactiva que requestGymTrainerHandle, del otro lado. */
export async function inviteGymTrainer(
  trainerId: string,
  membershipType: MembershipType,
  durationMonths?: number
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("invite_gym_trainer", {
    p_trainer_id: trainerId,
    p_membership_type: membershipType,
    p_duration_months: membershipType === "fixed" ? durationMonths : undefined,
  });
  if (error) {
    if (error.message?.includes("already linked")) return { error: "Ya es handle (o tiene una invitación pendiente) de tu gimnasio." };
    if (error.message?.includes("blocked")) return { error: "No podés invitar a este entrenador." };
    if (error.message?.includes("not a trainer")) return { error: "Este usuario no es un entrenador." };
    return { error: "No se pudo completar la acción. Probá de nuevo." };
  }
  return {};
}

/** Sirve para: el entrenador se desvincula (active -> historico 'ended'), cancela su propia
 * solicitud o rechaza una invitación (pending -> se borra), o el gimnasio desvincula/rechaza
 * a cualquiera de sus entrenadores en cualquier momento. */
async function endHandle(gymId: string, trainerId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("end_gym_trainer_handle", { p_gym_id: gymId, p_trainer_id: trainerId });
  if (error) return { error: "No se pudo completar la acción. Probá de nuevo." };
  return {};
}

export async function leaveGymAsTrainer(gymId: string, trainerId: string): Promise<{ error?: string }> {
  return endHandle(gymId, trainerId);
}

export async function removeTrainerFromGym(gymId: string, trainerId: string): Promise<{ error?: string }> {
  return endHandle(gymId, trainerId);
}

/** Acepta una invitación del gimnasio: la duracion ya la definió el gimnasio al invitar, no
 * lleva parámetros extra. */
export async function acceptGymTrainerInvite(gymId: string, trainerId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("gym_trainers").update({ status: "active" }).eq("gym_id", gymId).eq("trainer_id", trainerId);
  if (error) return { error: "No se pudo aceptar la invitación. Probá de nuevo." };
  return {};
}

/** Acepta una solicitud pendiente que mandó un entrenador: acá el gimnasio recién define la
 * duración (el trigger valida la combinación y recalcula expires_at server-side). */
export async function acceptGymTrainerRequest(
  handleId: string,
  membershipType: MembershipType,
  durationMonths?: number
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("gym_trainers")
    .update({ status: "active", membership_type: membershipType, duration_months: membershipType === "fixed" ? durationMonths ?? null : null })
    .eq("id", handleId);
  if (error) return { error: "No se pudo aceptar la solicitud. Probá de nuevo." };
  return {};
}

/** Borra definitivamente un registro historico (status='ended'). No afecta handles activos. */
export async function deleteHistoricGymTrainer(gymId: string, trainerId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("gym_trainers").delete().eq("gym_id", gymId).eq("trainer_id", trainerId).eq("status", "ended");
  if (error) return { error: "No se pudo eliminar el registro. Probá de nuevo." };
  return {};
}

// La RPC (SECURITY DEFINER) exige auth.uid() = p_gym_id (o admin) -- devuelve 0 filas en
// silencio para cualquier otro llamador, en vez de fallar.
export async function listGymTrainers(gymId: string, opts: { search?: string; statusFilter?: TrainerStatusFilter; sort?: TrainerSort } = {}): Promise<GymTrainerRow[]> {
  const { data, error } = await supabase.rpc("list_gym_trainers", {
    p_gym_id: gymId,
    p_search: opts.search?.trim() || undefined,
    p_status_filter: opts.statusFilter ?? "all",
    p_sort: opts.sort ?? "recent",
    p_limit: 100,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    trainerId: r.trainer_id,
    username: r.username ?? "",
    nombre: r.nombre ?? "",
    apellido: r.apellido ?? "",
    avatarUrl: r.avatar_url,
    userType: r.user_type,
    isVerified: r.is_verified,
    status: r.status,
    initiatedBy: r.initiated_by as HandleInitiatedBy,
    membershipType: r.membership_type as MembershipType | null,
    durationMonths: r.duration_months,
    expiresAt: r.expires_at,
    requestedAt: r.requested_at,
    respondedAt: r.responded_at,
    endedAt: r.ended_at,
    tier: r.tier as MemberTier,
  }));
}

export interface MyGymTrainerHandleRow {
  gymId: string;
  username: string;
  nombre: string;
  apellido: string;
  avatarUrl: string | null;
  isVerified: boolean;
}

/** Gimnasios donde este entrenador trabaja (handle activo) -- se usa para mostrar "Trabaja en"
 * en su propio perfil (ver profile.ts). La RPC ya filtra por privacidad (tanto del entrenador
 * como de cada gimnasio) del lado del servidor, asi que lo que vuelve aca es siempre mostrable. */
export async function listMyGymTrainerHandles(trainerId: string): Promise<MyGymTrainerHandleRow[]> {
  const { data, error } = await supabase.rpc("list_my_gym_trainer_handles", { p_trainer_id: trainerId });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    gymId: r.gym_id,
    username: r.username ?? "",
    nombre: r.nombre ?? "",
    apellido: r.apellido ?? "",
    avatarUrl: r.avatar_url,
    isVerified: r.is_verified,
  }));
}

export async function getPendingGymTrainerRequestCount(gymId: string): Promise<number> {
  const { count, error } = await supabase
    .from("gym_trainers")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId)
    .eq("status", "pending")
    .eq("initiated_by", "trainer");
  if (error) throw error;
  return count ?? 0;
}
