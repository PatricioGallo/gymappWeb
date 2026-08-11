import { supabase } from "./supabaseClient";
import type { Tables } from "@/types/database";

export type ChatMessage = Tables<"messages">;

export interface ConversationSummary {
  conversationId: string;
  otherUserId: string;
  otherUsername: string;
  otherNombre: string;
  otherApellido: string;
  otherAvatarUrl: string | null;
  otherUserType: Tables<"profiles">["user_type"];
  otherIsVerified: boolean;
  status: "pending" | "accepted";
  isInitiator: boolean;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastMessageType: "text" | "image" | "audio" | null;
  lastMessageSenderIsMe: boolean;
  lastMessageRead: boolean;
  unreadCount: number;
}

const BUCKET = "chat-attachments";
const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const MESSAGES_PAGE_SIZE = 50;

export async function getOrCreateConversation(otherUserId: string): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc("get_or_create_conversation", { p_other_user_id: otherUserId });
  if (error) {
    if (error.message?.includes("blocked")) return { error: "No podés enviarle mensajes a este usuario." };
    return { error: "No se pudo abrir la conversación. Probá de nuevo." };
  }
  return { id: data as unknown as string };
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const { data, error } = await supabase.rpc("list_conversations");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    conversationId: r.conversation_id,
    otherUserId: r.other_user_id,
    otherUsername: r.other_username ?? "",
    otherNombre: r.other_nombre ?? "",
    otherApellido: r.other_apellido ?? "",
    otherAvatarUrl: r.other_avatar_url,
    otherUserType: r.other_user_type,
    otherIsVerified: r.other_is_verified,
    status: r.status as "pending" | "accepted",
    isInitiator: r.is_initiator,
    lastMessageAt: r.last_message_at,
    lastMessagePreview: r.last_message_preview,
    lastMessageType: r.last_message_type as "text" | "image" | "audio" | null,
    lastMessageSenderIsMe: r.last_message_sender_is_me,
    lastMessageRead: r.last_message_read,
    unreadCount: r.unread_count,
  }));
}

export async function getUnreadConversationCount(): Promise<number> {
  const { data, error } = await supabase.rpc("get_unread_conversation_count");
  if (error) throw error;
  return data ?? 0;
}

export async function acceptMessageRequest(conversationId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("accept_message_request", { p_conversation_id: conversationId });
  if (error) return { error: "No se pudo aceptar la solicitud. Probá de nuevo." };
  return {};
}

export async function declineMessageRequest(conversationId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("decline_message_request", { p_conversation_id: conversationId });
  if (error) return { error: "No se pudo rechazar la solicitud. Probá de nuevo." };
  return {};
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
}

export interface ConversationPeerMeta {
  lastSeenAt: string | null;
  readReceiptsEnabled: boolean;
}

export async function getConversationPeerMeta(otherUserId: string): Promise<ConversationPeerMeta> {
  const { data, error } = await supabase.rpc("get_conversation_peer_meta", { p_other_user_id: otherUserId });
  if (error || !data || data.length === 0) return { lastSeenAt: null, readReceiptsEnabled: true };
  const row = data[0];
  return { lastSeenAt: row.last_seen_at, readReceiptsEnabled: row.read_receipts_enabled };
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
  if (error) {
    if (error.message?.includes("blocked")) return { error: "No podés enviarle mensajes a este usuario." };
    return { error: "No se pudo enviar el mensaje. Probá de nuevo." };
  }
  return { message: data as unknown as ChatMessage };
}

export async function listMessages(conversationId: string, beforeIso?: string): Promise<ChatMessage[]> {
  let query = supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(MESSAGES_PAGE_SIZE);
  if (beforeIso) query = query.lt("created_at", beforeIso);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function uploadChatImageFromUri(conversationId: string, uri: string, mimeType: string | null | undefined): Promise<{ path?: string; error?: string }> {
  const response = await fetch(uri);
  const blob = await response.blob();
  if (blob.size > IMAGE_MAX_BYTES) return { error: "La imagen es muy pesada. Elegí una de menos de 20MB." };

  const type = mimeType ?? blob.type ?? "image/jpeg";
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${conversationId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type });
  if (uploadError) return { error: "No se pudo subir la imagen. Probá de nuevo." };
  return { path };
}

const attachmentUrlCache = new Map<string, string>();

export async function getChatAttachmentUrl(path: string): Promise<string | null> {
  const cached = attachmentUrlCache.get(path);
  if (cached) return cached;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) return null;
  attachmentUrlCache.set(path, data.signedUrl);
  return data.signedUrl;
}
