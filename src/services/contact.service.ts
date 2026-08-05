import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

export type ContactMessage = Tables<"contact_messages">;

export interface ContactMessageWithReader extends ContactMessage {
  readByName: string | null;
}

export type ContactMessageError = "name_short" | "name_long" | "email_invalid" | "message_short" | "message_long";

export function validateContactMessage(name: string, email: string, message: string): ContactMessageError | null {
  if (name.trim().length < 2) return "name_short";
  if (name.trim().length > 100) return "name_long";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return "email_invalid";
  if (message.trim().length < 10) return "message_short";
  if (message.trim().length > 2000) return "message_long";
  return null;
}

export async function submitContactMessage(name: string, email: string, message: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("contact_messages").insert({ name: name.trim(), email: email.trim(), message: message.trim() });
  if (error) return { error: "No se pudo enviar el mensaje. Probá de nuevo." };
  return {};
}

export async function getUnreadContactMessageCount(): Promise<number> {
  const { count, error } = await supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("is_read", false);
  if (error) throw error;
  return count ?? 0;
}

// Consulta separada a profiles_public en vez de un embed de PostgREST: mismo motivo
// que en issue.service (la vista bypassea RLS a proposito y el embed automatico falla).
export async function listContactMessages(): Promise<ContactMessageWithReader[]> {
  const { data: rows, error } = await supabase
    .from("contact_messages")
    .select("*")
    .order("is_read", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const readerIds = [...new Set(rows.map((r) => r.read_by).filter((id): id is string => id !== null))];
  if (readerIds.length === 0) return rows.map((r) => ({ ...r, readByName: null }));

  const { data: profiles, error: profilesError } = await supabase.from("profiles_public").select("id, username").in("id", readerIds);
  if (profilesError) throw profilesError;

  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  return rows.map((r) => ({ ...r, readByName: r.read_by ? (usernameById.get(r.read_by) ?? null) : null }));
}

export async function markContactMessageRead(id: string, isRead: boolean, markedBy: string | null): Promise<{ error?: string }> {
  const { error } = await supabase.from("contact_messages").update({ is_read: isRead, read_by: isRead ? markedBy : null }).eq("id", id);
  if (error) return { error: "No se pudo actualizar el mensaje. Probá de nuevo." };
  return {};
}

export async function deleteContactMessage(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("contact_messages").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar el mensaje. Probá de nuevo." };
  return {};
}
