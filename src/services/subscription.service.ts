import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

export type Subscription = Tables<"subscriptions">;
export type SubscriptionStatus = "none" | "pending" | "accepted" | "ended" | "self";

export interface SubscriptionRequestRow {
  id: string;
  subscriberId: string;
  username: string;
  nombre: string;
  apellido: string;
  avatarUrl: string | null;
  userType: Tables<"profiles">["user_type"];
  isVerified: boolean;
  createdAt: string;
}

export interface SubscriberListRow {
  id: string;
  username: string;
  nombre: string;
  apellido: string;
  avatarUrl: string | null;
  userType: Tables<"profiles">["user_type"];
  isVerified: boolean;
  subscribedAt: string;
}

export interface HistoricSubscriberRow {
  id: string;
  username: string;
  nombre: string;
  apellido: string;
  avatarUrl: string | null;
  userType: Tables<"profiles">["user_type"];
  isVerified: boolean;
  subscribedAt: string;
  endedAt: string;
}

export async function getSubscriptionStatus(targetId: string): Promise<SubscriptionStatus> {
  const { data, error } = await supabase.rpc("get_subscription_status", { p_target_id: targetId });
  if (error) throw error;
  return (data as SubscriptionStatus | null) ?? "none";
}

export async function getSubscriberCount(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("get_subscriber_count", { p_user_id: userId });
  if (error) throw error;
  return data ?? 0;
}

// La RPC (SECURITY DEFINER) hace el chequeo de privacidad server-side via
// is_profile_public: si el perfil es privado y el visitante no tiene acceso,
// devuelve 0 filas aunque el llamado no falle.
export async function listSubscribers(userId: string, search = ""): Promise<SubscriberListRow[]> {
  const { data, error } = await supabase.rpc("list_subscribers", { p_user_id: userId, p_search: search.trim() || undefined, p_limit: 100 });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    username: r.username ?? "",
    nombre: r.nombre ?? "",
    apellido: r.apellido ?? "",
    avatarUrl: r.avatar_url,
    userType: r.user_type,
    isVerified: r.is_verified,
    subscribedAt: r.subscribed_at,
  }));
}

/** Crea la solicitud (siempre 'pending' hasta que el entrenador la acepte). Si ya habia sido
 * alumno antes y el entrenador no lo elimino del historico, reactiva esa misma fila 'ended'
 * en vez de duplicarla, para que "alumno desde" seteo la fecha original de alta. */
export async function subscribeToTrainer(trainerId: string): Promise<{ status?: SubscriptionStatus; error?: string }> {
  const { data, error } = await supabase.rpc("request_subscription", { p_trainer_id: trainerId });
  if (error) {
    if (error.message?.includes("already subscribed")) return { error: "Ya le enviaste una solicitud de suscripción a este entrenador." };
    if (error.message?.includes("blocked")) return { error: "No podés suscribirte a este entrenador." };
    if (error.message?.includes("not a trainer")) return { error: "Este usuario no es un entrenador." };
    return { error: "No se pudo completar la acción. Probá de nuevo." };
  }
  return { status: data?.status as SubscriptionStatus };
}

/** Sirve para desuscribirse (accepted -> pasa a historico 'ended'), cancelar una solicitud
 * propia (pending -> se borra, nunca llego a ser alumno) o, del lado del entrenador, cancelar
 * la suscripcion de cualquiera de sus alumnos en cualquier momento. */
async function cancelSubscription(subscriberId: string, trainerId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("cancel_subscription", { p_subscriber_id: subscriberId, p_trainer_id: trainerId });
  if (error) return { error: "No se pudo completar la acción. Probá de nuevo." };
  return {};
}

export async function unsubscribeOrCancel(subscriberId: string, trainerId: string): Promise<{ error?: string }> {
  return cancelSubscription(subscriberId, trainerId);
}

export async function removeSubscriber(trainerId: string, subscriberId: string): Promise<{ error?: string }> {
  return cancelSubscription(subscriberId, trainerId);
}

// La RPC (SECURITY DEFINER) hace el mismo chequeo de privacidad que list_subscribers.
export async function listHistoricSubscribers(userId: string, search = ""): Promise<HistoricSubscriberRow[]> {
  const { data, error } = await supabase.rpc("list_historic_subscribers", { p_user_id: userId, p_search: search.trim() || undefined, p_limit: 100 });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    username: r.username ?? "",
    nombre: r.nombre ?? "",
    apellido: r.apellido ?? "",
    avatarUrl: r.avatar_url,
    userType: r.user_type,
    isVerified: r.is_verified,
    subscribedAt: r.subscribed_at,
    endedAt: r.ended_at,
  }));
}

/** Borra definitivamente un registro historico (status='ended'). No afecta suscripciones activas. */
export async function deleteHistoricSubscription(trainerId: string, subscriberId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("subscriptions").delete().eq("trainer_id", trainerId).eq("subscriber_id", subscriberId).eq("status", "ended");
  if (error) return { error: "No se pudo eliminar el registro. Probá de nuevo." };
  return {};
}

export async function getPendingSubscriptionRequestCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("trainer_id", userId)
    .eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}

export async function listSubscriptionRequests(userId: string): Promise<SubscriptionRequestRow[]> {
  const { data: rows, error } = await supabase
    .from("subscriptions")
    .select("id, created_at, subscriber_id")
    .eq("trainer_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  // Consulta separada a profiles_public en vez de un embed de PostgREST: la vista
  // no es "simple" (bypassea RLS a proposito) y el embed automatico contra ella
  // devuelve null en el join real aunque la relacion se detecte sin error.
  const subscriberIds = [...new Set(rows.map((r) => r.subscriber_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles_public")
    .select("id, username, nombre, apellido, avatar_url, user_type, is_verified")
    .in("id", subscriberIds);
  if (profilesError) throw profilesError;

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return rows
    .map((r) => {
      const p = profileById.get(r.subscriber_id);
      if (!p || !p.user_type) return null;
      return {
        id: r.id,
        subscriberId: r.subscriber_id,
        username: p.username ?? "",
        nombre: p.nombre ?? "",
        apellido: p.apellido ?? "",
        avatarUrl: p.avatar_url,
        userType: p.user_type,
        isVerified: p.is_verified ?? false,
        createdAt: r.created_at,
      };
    })
    .filter((r): r is SubscriptionRequestRow => r !== null);
}

export async function acceptSubscriptionRequest(subscriptionId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("subscriptions").update({ status: "accepted" }).eq("id", subscriptionId);
  if (error) return { error: "No se pudo aceptar la solicitud. Probá de nuevo." };
  return {};
}

export async function rejectSubscriptionRequest(subscriptionId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("subscriptions").delete().eq("id", subscriptionId);
  if (error) return { error: "No se pudo rechazar la solicitud. Probá de nuevo." };
  return {};
}
