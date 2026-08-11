import { supabase } from "./supabaseClient";
import type { Tables } from "@/types/database";

export type SubscriptionStatus = "none" | "pending" | "accepted" | "ended" | "self";

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

export async function getSubscriberCount(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("get_subscriber_count", { p_user_id: userId });
  if (error) throw error;
  return data ?? 0;
}

export async function getSubscriptionStatus(targetId: string): Promise<SubscriptionStatus> {
  const { data, error } = await supabase.rpc("get_subscription_status", { p_target_id: targetId });
  if (error) throw error;
  return (data as SubscriptionStatus | null) ?? "none";
}

/** Crea la solicitud (siempre 'pending' hasta que el entrenador la acepte). */
export async function subscribeToTrainer(trainerId: string): Promise<{ status?: SubscriptionStatus; error?: string }> {
  const { data, error } = await supabase.rpc("request_subscription", { p_trainer_id: trainerId });
  if (error) {
    if (error.message?.includes("already subscribed")) return { error: "Ya le enviaste una solicitud de suscripción a este entrenador." };
    if (error.message?.includes("blocked")) return { error: "No podés suscribirte a este entrenador." };
    if (error.message?.includes("not a trainer")) return { error: "Este usuario no es un entrenador." };
    return { error: "No se pudo completar la acción. Probá de nuevo." };
  }
  return { status: (data as { status?: SubscriptionStatus } | null)?.status };
}

/** Sirve para desuscribirse (accepted -> historico 'ended') o cancelar una solicitud propia (pending). */
export async function unsubscribeOrCancel(subscriberId: string, trainerId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("cancel_subscription", { p_subscriber_id: subscriberId, p_trainer_id: trainerId });
  if (error) return { error: "No se pudo completar la acción. Probá de nuevo." };
  return {};
}

// La RPC (SECURITY DEFINER) hace el mismo chequeo de privacidad que list_followers.
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

/** Del lado del entrenador: cancela la suscripcion de cualquiera de sus alumnos en cualquier momento. */
export async function removeSubscriber(trainerId: string, subscriberId: string): Promise<{ error?: string }> {
  return unsubscribeOrCancel(subscriberId, trainerId);
}
