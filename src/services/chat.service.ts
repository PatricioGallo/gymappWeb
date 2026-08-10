import { supabase } from "../lib/supabaseClient";
import type { Database, Tables } from "../types/database";

export type ChatMessage = Tables<"messages">;
export type ConversationSummary = Database["public"]["Functions"]["list_conversations"]["Returns"][number];

const BUCKET = "chat-attachments";
const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AUDIO_MAX_BYTES = 15 * 1024 * 1024;
export const AUDIO_MAX_SECONDS = 120;
export const MESSAGES_PAGE_SIZE = 50;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function friendlyError(error: { message?: string } | null, fallback: string): string {
  return error?.message?.trim() || fallback;
}

/** Devuelve (creando si hace falta) el id de la conversación 1 a 1 con otherUserId. */
export async function getOrCreateConversation(otherUserId: string): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc("get_or_create_conversation", { p_other_user_id: otherUserId });
  if (error) return { error: friendlyError(error, "No se pudo abrir la conversación. Probá de nuevo.") };
  return { id: data as string };
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const { data, error } = await supabase.rpc("list_conversations");
  if (error) throw error;
  return data ?? [];
}

export async function getUnreadConversationCount(): Promise<number> {
  const { data, error } = await supabase.rpc("get_unread_conversation_count");
  if (error) throw error;
  return data ?? 0;
}

export async function acceptMessageRequest(conversationId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("accept_message_request", { p_conversation_id: conversationId });
  if (error) return { error: friendlyError(error, "No se pudo aceptar la solicitud.") };
  return {};
}

export async function declineMessageRequest(conversationId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("decline_message_request", { p_conversation_id: conversationId });
  if (error) return { error: friendlyError(error, "No se pudo rechazar la solicitud.") };
  return {};
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
}

export interface ConversationPeerMeta {
  lastSeenAt: string | null;
  readReceiptsEnabled: boolean;
}

/**
 * Última conexión y si corresponde mostrar "visto azul" para este chat, ya resuelto
 * server-side segun la privacidad reciproca de ambos participantes (ver
 * get_conversation_peer_meta: lastSeenAt viene null si no hay que mostrarla).
 */
export async function getConversationPeerMeta(otherUserId: string): Promise<ConversationPeerMeta> {
  const { data, error } = await supabase.rpc("get_conversation_peer_meta", { p_other_user_id: otherUserId });
  if (error || !data?.[0]) return { lastSeenAt: null, readReceiptsEnabled: true };
  return { lastSeenAt: data[0].last_seen_at, readReceiptsEnabled: data[0].read_receipts_enabled };
}

export interface SendMessageInput {
  content?: string;
  attachmentPath?: string;
  attachmentType?: "image" | "audio";
  attachmentDurationSeconds?: number;
}

export async function sendMessage(conversationId: string, input: SendMessageInput): Promise<{ message?: ChatMessage; error?: string }> {
  const { data, error } = await supabase.rpc("send_message", {
    p_conversation_id: conversationId,
    p_content: input.content,
    p_attachment_path: input.attachmentPath,
    p_attachment_type: input.attachmentType,
    p_attachment_duration_seconds: input.attachmentDurationSeconds,
  });
  if (error) return { error: friendlyError(error, "No se pudo enviar el mensaje. Probá de nuevo.") };
  return { message: data as ChatMessage };
}

/** Últimos mensajes de una conversación (mas recientes primero). Pasá beforeIso (created_at del más viejo cargado) para paginar hacia atrás. */
export async function listMessages(conversationId: string, beforeIso?: string): Promise<ChatMessage[]> {
  let query = supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(MESSAGES_PAGE_SIZE);
  if (beforeIso) query = query.lt("created_at", beforeIso);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function uploadChatImage(conversationId: string, file: File): Promise<{ path?: string; error?: string }> {
  if (file.size > IMAGE_MAX_BYTES) return { error: "La imagen es muy pesada. Elegí una de menos de 20MB." };
  if (!IMAGE_ALLOWED_TYPES.includes(file.type)) return { error: "Formato no soportado. Usá JPG, PNG o WEBP." };

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${conversationId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) return { error: "No se pudo subir la imagen. Probá de nuevo." };

  return { path };
}

export async function uploadChatAudio(conversationId: string, blob: Blob): Promise<{ path?: string; error?: string }> {
  if (blob.size > AUDIO_MAX_BYTES) return { error: "El audio es muy pesado." };

  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
  const path = `${conversationId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type });
  if (uploadError) return { error: "No se pudo subir el audio. Probá de nuevo." };

  return { path };
}

export async function getChatAttachmentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  return data.signedUrl;
}
