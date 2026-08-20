import { supabase } from "../lib/supabaseClient";
import type { Database, Tables } from "../types/database";

export type ChatMessage = Tables<"messages">;
export type ConversationSummary = Database["public"]["Functions"]["list_conversations"]["Returns"][number];

export interface GroupParticipant {
  user_id: string;
  username: string;
  avatar_url: string | null;
  role: "admin" | "member";
  left_at: string | null;
}

/** `participants` viaja como jsonb (solo poblado para kind==='group') -- este helper lo tipa. */
export function groupParticipantsOf(c: ConversationSummary): GroupParticipant[] {
  return (c.participants as unknown as GroupParticipant[] | null) ?? [];
}

const BUCKET = "chat-attachments";
const AVATARS_BUCKET = "avatars";
const GROUP_AVATAR_MAX_BYTES = 20 * 1024 * 1024;
const GROUP_AVATAR_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
// Mismo criterio amplio de formatos que los Reps (post.service.ts): mp4/webm son lo mas comun,
// el resto cubre lo que suelen mandar los celulares (mov de iPhone, 3gp viejo de Android, etc).
const VIDEO_MAX_BYTES = 500 * 1024 * 1024; // igual al file_size_limit del bucket "chat-attachments"
const VIDEO_ALLOWED_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/3gpp", "video/x-msvideo", "video/x-matroska", "video/mpeg", "video/ogg"];
const AUDIO_MAX_BYTES = 15 * 1024 * 1024;
export const AUDIO_MAX_SECONDS = 120;
export const MESSAGES_PAGE_SIZE = 50;
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

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
  attachmentType?: "image" | "video" | "audio" | "sticker";
  attachmentDurationSeconds?: number;
  sharedPostId?: string;
  sharedGymPostId?: string;
  replyToMessageId?: string;
  isForwarded?: boolean;
}

export async function sendMessage(conversationId: string, input: SendMessageInput): Promise<{ message?: ChatMessage; error?: string }> {
  const { data, error } = await supabase.rpc("send_message", {
    p_conversation_id: conversationId,
    p_content: input.content,
    p_attachment_path: input.attachmentPath,
    p_attachment_type: input.attachmentType,
    p_attachment_duration_seconds: input.attachmentDurationSeconds,
    p_shared_post_id: input.sharedPostId,
    p_shared_gym_post_id: input.sharedGymPostId,
    p_reply_to_message_id: input.replyToMessageId,
    p_is_forwarded: input.isForwarded,
  });
  if (error) return { error: friendlyError(error, "No se pudo enviar el mensaje. Probá de nuevo.") };
  return { message: data as ChatMessage };
}

/** Ancla (o reemplaza el anclado) o desancla el mensaje destacado de la conversación, visible para ambos participantes. */
export async function pinMessage(conversationId: string, messageId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("pin_message", { p_conversation_id: conversationId, p_message_id: messageId });
  if (error) return { error: friendlyError(error, "No se pudo anclar el mensaje.") };
  return {};
}

export async function unpinMessage(conversationId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("unpin_message", { p_conversation_id: conversationId });
  if (error) return { error: friendlyError(error, "No se pudo desanclar el mensaje.") };
  return {};
}

export async function getConversationPinnedMessageId(conversationId: string): Promise<string | null> {
  const { data, error } = await supabase.from("conversations").select("pinned_message_id").eq("id", conversationId).single();
  if (error || !data) return null;
  return data.pinned_message_id;
}

/** Un emoji por usuario por mensaje: tocar el mismo emoji lo saca, tocar otro lo reemplaza (como WhatsApp). */
export async function reactToMessage(messageId: string, emoji: string): Promise<{ message?: ChatMessage; error?: string }> {
  const { data, error } = await supabase.rpc("react_to_message", { p_message_id: messageId, p_emoji: emoji });
  if (error) return { error: friendlyError(error, "No se pudo reaccionar al mensaje.") };
  return { message: data as ChatMessage };
}

/** Solo texto propio, sin adjunto/Rep compartido/sticker -- los adjuntos no tienen caption editable. */
export async function editMessage(messageId: string, content: string): Promise<{ message?: ChatMessage; error?: string }> {
  const { data, error } = await supabase.rpc("edit_message", { p_message_id: messageId, p_content: content });
  if (error) return { error: friendlyError(error, "No se pudo editar el mensaje.") };
  return { message: data as ChatMessage };
}

/** No borra la fila: la deja como placeholder ("Mensaje eliminado") visible para ambos, como WhatsApp. */
export async function deleteMessage(messageId: string): Promise<{ message?: ChatMessage; error?: string }> {
  const { data, error } = await supabase.rpc("delete_message", { p_message_id: messageId });
  if (error) return { error: friendlyError(error, "No se pudo eliminar el mensaje.") };
  return { message: data as ChatMessage };
}

export async function getMessageById(messageId: string): Promise<ChatMessage | null> {
  const { data, error } = await supabase.from("messages").select("*").eq("id", messageId).maybeSingle();
  if (error) return null;
  return data;
}

/** Copia un adjunto ya subido a la carpeta de otra conversación, para poder reenviar el mensaje que lo trae. */
export async function copyChatAttachment(sourcePath: string, targetConversationId: string): Promise<{ path?: string; error?: string }> {
  const ext = sourcePath.includes(".") ? sourcePath.slice(sourcePath.lastIndexOf(".")) : "";
  const targetPath = `${targetConversationId}/${crypto.randomUUID()}${ext}`;
  const { error } = await supabase.storage.from(BUCKET).copy(sourcePath, targetPath);
  if (error) return { error: "No se pudo reenviar el adjunto." };
  return { path: targetPath };
}

/** Últimos mensajes de una conversación (mas recientes primero). Pasá beforeIso (created_at del más viejo cargado) para paginar hacia atrás. */
export async function listMessages(conversationId: string, beforeIso?: string, limit = MESSAGES_PAGE_SIZE): Promise<ChatMessage[]> {
  let query = supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
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

export async function uploadChatVideo(conversationId: string, file: File): Promise<{ path?: string; error?: string }> {
  if (file.size > VIDEO_MAX_BYTES) return { error: "El video es muy pesado. Máximo 500MB." };
  if (!VIDEO_ALLOWED_TYPES.includes(file.type)) return { error: "Formato no soportado. Usá MP4, MOV, WEBM, 3GP, AVI, MKV, MPEG u OGG." };

  const ext = file.name.split(".").pop() || "mp4";
  const path = `${conversationId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) return { error: "No se pudo subir el video. Probá de nuevo." };

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

// ---------------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------------

/** Crea un grupo (el creador queda admin, el resto member) y devuelve su conversation_id. */
export async function createGroupConversation(
  name: string,
  memberIds: string[],
  avatarUrl?: string
): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc("create_group_conversation", {
    p_name: name,
    p_member_ids: memberIds,
    p_avatar_url: avatarUrl,
  });
  if (error) return { error: friendlyError(error, "No se pudo crear el grupo.") };
  return { id: data as string };
}

export async function addGroupParticipants(conversationId: string, userIds: string[]): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("add_group_participants", { p_conversation_id: conversationId, p_user_ids: userIds });
  if (error) return { error: friendlyError(error, "No se pudieron agregar los integrantes.") };
  return {};
}

export async function removeGroupParticipant(conversationId: string, userId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("remove_group_participant", { p_conversation_id: conversationId, p_user_id: userId });
  if (error) return { error: friendlyError(error, "No se pudo sacar a esa persona del grupo.") };
  return {};
}

export async function leaveGroup(conversationId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("leave_group_conversation", { p_conversation_id: conversationId });
  if (error) return { error: friendlyError(error, "No se pudo salir del grupo.") };
  return {};
}

export async function renameGroup(conversationId: string, name: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("rename_group", { p_conversation_id: conversationId, p_name: name });
  if (error) return { error: friendlyError(error, "No se pudo renombrar el grupo.") };
  return {};
}

export async function setGroupAvatar(conversationId: string, avatarUrl: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("set_group_avatar", { p_conversation_id: conversationId, p_avatar_url: avatarUrl });
  if (error) return { error: friendlyError(error, "No se pudo actualizar la foto del grupo.") };
  return {};
}

/**
 * Sube la foto de grupo al bucket público "avatars" (mismo bucket que profiles.avatar_url,
 * path distinto). Solo sube y devuelve la URL pública -- no llama a setGroupAvatar, porque
 * en el flujo de "Nuevo grupo" el conversation_id recién existe después de crear el grupo.
 */
export async function uploadGroupAvatar(conversationId: string, file: File): Promise<{ url?: string; error?: string }> {
  if (file.size > GROUP_AVATAR_MAX_BYTES) return { error: "La imagen es muy pesada. Elegí una de menos de 20MB." };
  if (!GROUP_AVATAR_ALLOWED_TYPES.includes(file.type)) return { error: "Formato no soportado. Usá JPG, PNG o WEBP." };

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `groups/${conversationId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage.from(AVATARS_BUCKET).upload(path, file, { upsert: true });
  if (uploadError) return { error: "No se pudo subir la foto. Probá de nuevo." };

  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?t=${Date.now()}` };
}
