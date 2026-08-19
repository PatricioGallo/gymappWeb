import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

// Nombrado AppNotification (no Notification) para no pisar la Notification API del navegador.
export type AppNotification = Tables<"notifications">;
export type NotificationType =
  | "routine_assigned"
  | "issue_status"
  | "admin_message"
  | "follow"
  | "follow_request"
  | "follow_accepted"
  | "follow_rejected"
  | "like"
  | "comment"
  | "repost"
  | "quote"
  | "mention"
  | "message_reaction";

const RECENT_LIMIT = 8;
const FULL_LIST_LIMIT = 200;

export async function getUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);
  if (error) throw error;
  return count ?? 0;
}

export async function listRecentNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);
  if (error) throw error;
  return data ?? [];
}

export async function listAllNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(FULL_LIST_LIMIT);
  if (error) throw error;
  return data ?? [];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
  if (error) throw error;
}

/** p_user_id null = broadcast a todos los usuarios. Devuelve la cantidad de destinatarios. */
export async function adminSendNotification(
  userId: string | null,
  title: string,
  body: string,
  link: string
): Promise<{ error?: string; count?: number }> {
  const { data, error } = await supabase.rpc("admin_send_notification", {
    // El RPC acepta uuid nulo (broadcast), pero los tipos generados no marcan
    // p_user_id como nullable: se castea a proposito.
    p_user_id: userId as string,
    p_title: title.trim(),
    p_body: body.trim(),
    p_link: link.trim() || undefined,
  });
  if (error) return { error: "No se pudo enviar la notificación. Probá de nuevo." };
  return { count: data ?? 0 };
}
