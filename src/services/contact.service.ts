import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

export type ContactMessage = Tables<"contact_messages">;

export interface ContactReply {
  id: string;
  contact_message_id: string;
  to_email: string;
  subject: string;
  body: string;
  sent_by: string | null;
  sentByName: string | null;
  created_at: string;
}

export interface ContactMessageWithReader extends ContactMessage {
  readByName: string | null;
  replies: ContactReply[];
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

  const { data: replyRows, error: replyError } = await supabase
    .from("contact_message_replies")
    .select("id, contact_message_id, to_email, subject, body, sent_by, created_at")
    .in("contact_message_id", rows.map((r) => r.id))
    .order("created_at", { ascending: true });
  if (replyError) throw replyError;

  const profileIds = [
    ...new Set([
      ...rows.map((r) => r.read_by).filter((id): id is string => id !== null),
      ...(replyRows ?? []).map((r) => r.sent_by).filter((id): id is string => id !== null),
    ]),
  ];

  const usernameById = new Map<string, string | null>();
  if (profileIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase.from("profiles_public").select("id, username").in("id", profileIds);
    if (profilesError) throw profilesError;
    for (const p of profiles ?? []) {
      if (p.id) usernameById.set(p.id, p.username);
    }
  }

  const repliesByMessage = new Map<string, ContactReply[]>();
  for (const r of replyRows ?? []) {
    const list = repliesByMessage.get(r.contact_message_id) ?? [];
    list.push({ ...r, sentByName: r.sent_by ? (usernameById.get(r.sent_by) ?? null) : null });
    repliesByMessage.set(r.contact_message_id, list);
  }

  return rows.map((r) => ({
    ...r,
    readByName: r.read_by ? (usernameById.get(r.read_by) ?? null) : null,
    replies: repliesByMessage.get(r.id) ?? [],
  }));
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

/**
 * Manda un mail de respuesta al autor de un mensaje de contacto. El envio real lo hace
 * la Edge Function `send-contact-reply` con el mismo SMTP que Supabase Auth; aca solo
 * la invocamos y traducimos el error que devuelve a algo mostrable.
 */
export async function sendContactReply(
  contactMessageId: string,
  body: string,
  subject: string
): Promise<{ error?: string; reply?: ContactReply }> {
  // functions.invoke a veces manda la anon key en vez del access token del usuario
  // (segun cuando se disparo el ultimo evento de auth). Adjuntamos el header a mano
  // con la sesion actual para que la Edge Function pueda identificar al que llama.
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return { error: "Tenés que volver a iniciar sesión." };

  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; reply?: ContactReply; error?: string }>("send-contact-reply", {
    body: { contact_message_id: contactMessageId, body, subject },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    let message = "No se pudo enviar el mail. Probá de nuevo.";
    // FunctionsHttpError trae el body real de la respuesta en error.context
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const parsed = await ctx.json();
        if (parsed?.error) message = parsed.error as string;
      } catch {
        // nos quedamos con el mensaje generico
      }
    }
    return { error: message };
  }

  if (data?.error) return { error: data.error };
  if (!data?.reply) return { error: "No se pudo enviar el mail. Probá de nuevo." };
  return { reply: { ...data.reply, sentByName: data.reply.sentByName ?? null } };
}
