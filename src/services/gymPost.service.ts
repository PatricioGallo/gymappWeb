import { supabase } from "../lib/supabaseClient";
import type { Json } from "../types/database";
import { createPost, fetchAuthorsByIds, withUploadTimeout, validateVideoDurationSeconds, type PostAuthor } from "./post.service";

export type GymPostVisibility = "public" | "socios" | "entrenadores";
export type GymPostMediaKind = "image" | "video";

export interface GymPostMedia {
  url: string;
  type: GymPostMediaKind;
}

export interface GymPostFull {
  id: string;
  content: string | null;
  location: string | null;
  visibility: GymPostVisibility;
  pinned: boolean;
  pinnedAt: string | null;
  crossPostedRepId: string | null;
  createdAt: string;
  media: GymPostMedia[];
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
}

export interface GymPostFormInput {
  content: string;
  location?: string;
  visibility: GymPostVisibility;
  media: GymPostMedia[];
  crossPostAsRep?: boolean;
}

export interface GymPostCommentRow {
  id: string;
  postId: string;
  content: string;
  createdAt: string;
  author: PostAuthor;
}

const GYM_POST_CONTENT_MAX = 1000;
const GYM_POST_COMMENT_MAX = 500;
export const GYM_POST_MEDIA_MAX = 10;

function toFull(r: {
  id: string;
  content: string | null;
  location: string | null;
  visibility: string;
  pinned: boolean;
  pinned_at: string | null;
  cross_posted_rep_id: string | null;
  created_at: string;
  media: unknown;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
}): GymPostFull {
  const media = Array.isArray(r.media) ? (r.media as { url: string; type: string }[]) : [];
  return {
    id: r.id,
    content: r.content,
    location: r.location,
    visibility: r.visibility as GymPostVisibility,
    pinned: r.pinned,
    pinnedAt: r.pinned_at,
    crossPostedRepId: r.cross_posted_rep_id,
    createdAt: r.created_at,
    media: media.map((m) => ({ url: m.url, type: m.type as GymPostMediaKind })),
    likesCount: r.likes_count,
    commentsCount: r.comments_count,
    likedByMe: r.liked_by_me,
  };
}

export function validateGymPostForm(content: string, mediaCount: number): string | null {
  if (mediaCount === 0) return "Subí al menos una foto o video.";
  if (mediaCount > GYM_POST_MEDIA_MAX) return `Máximo ${GYM_POST_MEDIA_MAX} archivos por publicación.`;
  if (content.trim().length > GYM_POST_CONTENT_MAX) return `Máximo ${GYM_POST_CONTENT_MAX} caracteres.`;
  return null;
}

const GYM_MEDIA_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const GYM_MEDIA_VIDEO_MAX_BYTES = 300 * 1024 * 1024;
const GYM_MEDIA_VIDEO_MAX_SECONDS = 120;

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg", "heic", "heif", "tiff", "tif", "avif"];
const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "avi", "mkv", "mpeg", "mpg", "ogg", "ogv", "3gp", "3gpp", "m4v", "wmv", "flv"];

/**
 * A diferencia de Reps (post.service.ts, lista fija de mime-types), acepta cualquier
 * foto/video: primero mira el mime-type del File, y si viene vacío (pasa con algunos
 * archivos de cámara según navegador/SO) cae a la extensión del nombre. null = ni imagen
 * ni video reconocible.
 */
export function classifyGymMediaFile(file: File): GymPostMediaKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  return null;
}

export async function validateGymMediaVideoDuration(file: File): Promise<string | null> {
  if (classifyGymMediaFile(file) !== "video") return null;
  return validateVideoDurationSeconds(file, GYM_MEDIA_VIDEO_MAX_SECONDS);
}

/**
 * Sube una foto o video de una publicación al mismo bucket que usan los Reps (post-media, ya
 * amplíado a allowed_mime_types image/* y video/* -- ver migración widen_post_media_allowed_types),
 * pero sin restringir a la lista fija de formatos que sí aplica uploadPostMedia (Reps). Tope de
 * peso igual al de Reps (20MB foto / 300MB video); duración de video validada aparte, ver arriba.
 */
export async function uploadGymPostMedia(gymId: string, file: File): Promise<{ url?: string; path?: string; mediaType?: GymPostMediaKind; error?: string }> {
  const kind = classifyGymMediaFile(file);
  if (!kind) return { error: "Subí una foto o un video." };
  if (kind === "image" && file.size > GYM_MEDIA_IMAGE_MAX_BYTES) return { error: "La imagen es muy pesada. Máximo 20MB." };
  if (kind === "video" && file.size > GYM_MEDIA_VIDEO_MAX_BYTES) return { error: "El video es muy pesado. Máximo 300MB." };

  const ext = file.name.split(".").pop() || (kind === "video" ? "mp4" : "jpg");
  const path = `${gymId}/${crypto.randomUUID()}.${ext}`;
  try {
    const { error: uploadError } = await withUploadTimeout(supabase.storage.from("post-media").upload(path, file), file.size);
    if (uploadError) return { error: `No se pudo subir el archivo: ${uploadError.message}` };
  } catch {
    return { error: "La subida tardó demasiado. Revisá tu conexión y probá de nuevo." };
  }

  const { data } = supabase.storage.from("post-media").getPublicUrl(path);
  return { url: data.publicUrl, path, mediaType: kind };
}

/** Publicaciones de un gimnasio con su media, contadores y si el viewer le dio me gusta -- una sola llamada (RPC list_gym_posts_full), RLS filtra visibilidad segun quien mira. Sirve tanto a la grilla del perfil como al visor. */
export async function listGymPostsFull(gymId: string): Promise<GymPostFull[]> {
  const { data, error } = await supabase.rpc("list_gym_posts_full", { p_gym_id: gymId });
  if (error) throw error;
  return (data ?? []).map(toFull);
}

export interface GymPostChatPreview {
  id: string;
  gymId: string;
  gymUsername: string;
  gymNombre: string;
  gymApellido: string;
  gymAvatarUrl: string | null;
  gymIsVerified: boolean;
  content: string | null;
  location: string | null;
  visibility: GymPostVisibility;
  pinned: boolean;
  createdAt: string;
  media: GymPostMedia[];
}

/** Batch de publicaciones por id, con datos del gimnasio autor incluidos -- para la vista previa de una publicación compartida en el chat (ver chatThread.ts). RLS/can_view_gym_post filtra: si el que mira no tiene acceso a esa visibilidad, esa publicación simplemente no viene en el resultado. */
export async function getGymPostsByIds(ids: string[]): Promise<Map<string, GymPostChatPreview>> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await supabase.rpc("get_gym_posts_by_ids", { p_ids: uniqueIds });
  if (error) throw error;
  const map = new Map<string, GymPostChatPreview>();
  for (const r of data ?? []) {
    const media = Array.isArray(r.media) ? (r.media as { url: string; type: string }[]) : [];
    map.set(r.id, {
      id: r.id,
      gymId: r.gym_id,
      gymUsername: r.gym_username ?? "",
      gymNombre: r.gym_nombre ?? "",
      gymApellido: r.gym_apellido ?? "",
      gymAvatarUrl: r.gym_avatar_url,
      gymIsVerified: r.gym_is_verified ?? false,
      content: r.content,
      location: r.location,
      visibility: r.visibility as GymPostVisibility,
      pinned: r.pinned,
      createdAt: r.created_at,
      media: media.map((m) => ({ url: m.url, type: m.type as GymPostMediaKind })),
    });
  }
  return map;
}

/** Crea el post y su media en una sola transacción (create_gym_post exige al menos 1 item). Si crossPostAsRep, publica ademas un Rep normal con la primera foto/video. */
export async function createGymPost(gymId: string, input: GymPostFormInput): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc("create_gym_post", {
    p_gym_id: gymId,
    p_content: input.content,
    p_location: input.location || "",
    p_visibility: input.visibility,
    p_media: input.media as unknown as Json,
  });
  if (error || !data) return { error: "No se pudo crear la publicación. Probá de nuevo." };

  if (input.crossPostAsRep) {
    const first = input.media[0];
    const { post, error: repError } = await createPost(gymId, input.content, first?.url, first?.type);
    if (!repError && post) {
      await supabase.from("gym_posts").update({ cross_posted_rep_id: post.id }).eq("id", data);
    }
  }
  return { id: data };
}

export async function updateGymPost(
  postId: string,
  input: { content: string; location?: string; visibility: GymPostVisibility }
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("gym_posts")
    .update({ content: input.content.trim() || null, location: input.location?.trim() || null, visibility: input.visibility })
    .eq("id", postId);
  if (error) return { error: "No se pudo guardar la publicación. Probá de nuevo." };
  return {};
}

export async function deleteGymPost(postId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("gym_posts").delete().eq("id", postId);
  if (error) return { error: "No se pudo eliminar la publicación. Probá de nuevo." };
  return {};
}

export async function setGymPostPinned(postId: string, pinned: boolean): Promise<{ error?: string }> {
  const { error } = await supabase.from("gym_posts").update({ pinned }).eq("id", postId);
  if (error) return { error: "No se pudo actualizar la publicación. Probá de nuevo." };
  return {};
}

export async function toggleGymPostLike(postId: string, userId: string, currentlyLiked: boolean): Promise<{ error?: string }> {
  if (currentlyLiked) {
    const { error } = await supabase.from("gym_post_likes").delete().eq("post_id", postId).eq("user_id", userId);
    if (error) return { error: "No se pudo actualizar el me gusta." };
    return {};
  }
  const { error } = await supabase.from("gym_post_likes").insert({ post_id: postId, user_id: userId });
  if (error) {
    if (error.code === "23505") return {}; // ya tenia el like (doble click) -- no es un error real
    return { error: "No se pudo dar me gusta." };
  }
  return {};
}

export function validateGymPostComment(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return "Escribí un comentario.";
  if (trimmed.length > GYM_POST_COMMENT_MAX) return `Máximo ${GYM_POST_COMMENT_MAX} caracteres.`;
  return null;
}

export async function listGymPostComments(postId: string): Promise<GymPostCommentRow[]> {
  const { data, error } = await supabase.from("gym_post_comments").select("*").eq("post_id", postId).order("created_at", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const authorsById = await fetchAuthorsByIds(rows.map((r) => r.author_id));
  return rows
    .map((r) => {
      const author = authorsById.get(r.author_id);
      return author ? { id: r.id, postId: r.post_id, content: r.content, createdAt: r.created_at, author } : null;
    })
    .filter((c): c is GymPostCommentRow => c !== null);
}

export async function addGymPostComment(postId: string, authorId: string, content: string): Promise<{ comment?: GymPostCommentRow; error?: string }> {
  const { data, error } = await supabase
    .from("gym_post_comments")
    .insert({ post_id: postId, author_id: authorId, content: content.trim() })
    .select("*")
    .single();
  if (error || !data) return { error: "No se pudo comentar. Probá de nuevo." };
  const authorsById = await fetchAuthorsByIds([authorId]);
  const author = authorsById.get(authorId);
  if (!author) return { error: "No se pudo comentar. Probá de nuevo." };
  return { comment: { id: data.id, postId: data.post_id, content: data.content, createdAt: data.created_at, author } };
}

export async function deleteGymPostComment(commentId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("gym_post_comments").delete().eq("id", commentId);
  if (error) return { error: "No se pudo eliminar el comentario." };
  return {};
}
