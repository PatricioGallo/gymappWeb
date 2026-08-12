import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

export type Post = Tables<"posts">;
export type PostComment = Tables<"post_comments">;

export interface PostAuthor {
  id: string;
  username: string;
  nombre: string;
  apellido: string;
  avatarUrl: string | null;
  userType: Tables<"profiles">["user_type"];
  isVerified: boolean;
}

export interface FeedPost extends Post {
  author: PostAuthor;
  quotedPost: (Post & { author: PostAuthor }) | null;
  likedByMe: boolean;
  repostedByMe: boolean;
  /** Presente si esta entrada llegó al feed porque alguien reposteó el Rep (no es el autor original). */
  repostedBy?: PostAuthor;
  /** created_at del post, o del repost si repostedBy está seteado -- es la clave de orden del feed. */
  feedTimestamp: string;
}

export interface FeedComment extends PostComment {
  author: PostAuthor;
}

const FEED_PAGE_SIZE = 20;
const POST_CONTENT_MAX = 140;
const COMMENT_CONTENT_MAX = 140;
const POST_MEDIA_MAX_BYTES = 50 * 1024 * 1024;
const POST_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const POST_VIDEO_TYPES = ["video/mp4", "video/webm"];

function friendlyError(error: { message?: string; code?: string } | null, fallback: string): string {
  return error?.message?.trim() || fallback;
}

// Mensaje de negocio: si tu perfil es privado, no podes comentar/repostear/citar
// Reps de gente que no seguis (dar me gusta si esta permitido siempre). Lo
// deciden los triggers *_enforce_*_privacy_gate en la base -- todos levantan
// una excepcion con "perfil privado" en el texto para poder mapearla aca al
// mensaje que ve el usuario, sin acoplar la UI al texto interno del trigger.
const PRIVATE_INTERACTION_MESSAGE =
  "Si tu perfil es privado no podés comentar ni repostear (ni citar) a gente que no seguís. Sí podés poner me gusta. Esa es la diferencia entre perfil público y privado.";

function isPrivateInteractionError(error: { message?: string } | null): boolean {
  return !!error?.message?.includes("perfil privado");
}

async function getViewerId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

// Consulta separada a profiles_public en vez de un embed de PostgREST: la vista
// no es "simple" (bypassea RLS a proposito) y el embed automatico contra ella
// devuelve null en el join real aunque la relacion se detecte sin error.
async function fetchAuthorsByIds(ids: string[]): Promise<Map<string, PostAuthor>> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("profiles_public")
    .select("id, username, nombre, apellido, avatar_url, user_type, is_verified")
    .in("id", uniqueIds);
  if (error) throw error;
  return new Map(
    (data ?? [])
      .filter((p): p is typeof p & { id: string } => p.id != null)
      .map((p) => [
        p.id,
        {
          id: p.id,
          username: p.username ?? "",
          nombre: p.nombre ?? "",
          apellido: p.apellido ?? "",
          avatarUrl: p.avatar_url,
          userType: p.user_type!,
          isVerified: p.is_verified ?? false,
        },
      ])
  );
}

/** Ensambla FeedPost[] a partir de filas crudas de posts: autores, post citado (si aplica) y mi like/repost, todo en consultas separadas. */
async function hydratePosts(rows: Post[], viewerId: string | null): Promise<Map<string, FeedPost>> {
  const result = new Map<string, FeedPost>();
  if (rows.length === 0) return result;

  const authorIds = rows.map((r) => r.author_id);
  const quotedIds = rows.map((r) => r.quoted_post_id).filter((id): id is string => !!id);

  const [authorsById, quotedRowsResult] = await Promise.all([
    fetchAuthorsByIds(authorIds),
    quotedIds.length ? supabase.from("posts").select("*").in("id", quotedIds) : Promise.resolve({ data: [] as Post[], error: null }),
  ]);
  if (quotedRowsResult.error) throw quotedRowsResult.error;
  const quotedRows = quotedRowsResult.data ?? [];
  const quotedAuthorsById = await fetchAuthorsByIds(quotedRows.map((r) => r.author_id));
  const quotedById = new Map(
    quotedRows
      .map((r) => {
        const author = quotedAuthorsById.get(r.author_id);
        return author ? [r.id, { ...r, author }] as const : null;
      })
      .filter((entry): entry is [string, Post & { author: PostAuthor }] => entry !== null)
  );

  let likedSet = new Set<string>();
  let repostedSet = new Set<string>();
  if (viewerId) {
    const postIds = rows.map((r) => r.id);
    const [{ data: likes }, { data: reposts }] = await Promise.all([
      supabase.from("post_likes").select("post_id").eq("user_id", viewerId).in("post_id", postIds),
      supabase.from("post_reposts").select("post_id").eq("user_id", viewerId).in("post_id", postIds),
    ]);
    likedSet = new Set((likes ?? []).map((l) => l.post_id));
    repostedSet = new Set((reposts ?? []).map((r) => r.post_id));
  }

  for (const r of rows) {
    const author = authorsById.get(r.author_id);
    if (!author) continue; // sin acceso al autor (privacidad) -- defensivo, la RLS ya debería haber filtrado esto
    result.set(r.id, {
      ...r,
      author,
      quotedPost: r.quoted_post_id ? (quotedById.get(r.quoted_post_id) ?? null) : null,
      likedByMe: likedSet.has(r.id),
      repostedByMe: repostedSet.has(r.id),
      feedTimestamp: r.created_at,
    });
  }
  return result;
}

/**
 * Feed general cronológico (sin algoritmo, RLS filtra por privacidad). Mezcla
 * Reps originales con reposts (aparecen como el post original + "repostedBy"),
 * ordenados por feedTimestamp. Paginación simple: cada página trae hasta
 * `limit` de cada fuente y recorta al top `limit` mezclado -- suficiente para
 * la escala actual de la app, no soporta cursores compuestos exactos.
 */
export async function getFeed(beforeIso?: string, limit = FEED_PAGE_SIZE): Promise<FeedPost[]> {
  const viewerId = await getViewerId();

  let postsQuery = supabase
    .from("posts")
    .select("*")
    .is("thread_parent_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (beforeIso) postsQuery = postsQuery.lt("created_at", beforeIso);

  let repostsQuery = supabase
    .from("post_reposts")
    .select("post_id, user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (beforeIso) repostsQuery = repostsQuery.lt("created_at", beforeIso);

  const [{ data: postRows, error: postsError }, { data: repostRows, error: repostsError }] = await Promise.all([postsQuery, repostsQuery]);
  if (postsError) throw postsError;
  if (repostsError) throw repostsError;

  const repostTargetIds = (repostRows ?? []).map((r) => r.post_id);
  const { data: repostTargets, error: repostTargetsError } = repostTargetIds.length
    ? await supabase.from("posts").select("*").in("id", repostTargetIds)
    : { data: [] as Post[], error: null };
  if (repostTargetsError) throw repostTargetsError;

  const allRows = [...(postRows ?? []), ...(repostTargets ?? [])];
  const hydratedById = await hydratePosts(allRows, viewerId);
  const reposterIds = (repostRows ?? []).map((r) => r.user_id);
  const reposterAuthorsById = await fetchAuthorsByIds(reposterIds);

  const entries: FeedPost[] = [];
  for (const p of postRows ?? []) {
    const hydrated = hydratedById.get(p.id);
    if (hydrated) entries.push(hydrated);
  }
  for (const r of repostRows ?? []) {
    const hydrated = hydratedById.get(r.post_id);
    const reposter = reposterAuthorsById.get(r.user_id);
    if (hydrated && reposter) {
      entries.push({ ...hydrated, repostedBy: reposter, feedTimestamp: r.created_at });
    }
  }

  entries.sort((a, b) => (a.feedTimestamp < b.feedTimestamp ? 1 : -1));
  return entries.slice(0, limit);
}

/**
 * Feed "Para vos": orden que da el algoritmo (get_personalized_feed, ver migración
 * add_get_personalized_feed) en vez de puro orden cronológico -- seguidos/seguidores
 * primero, después popularidad regional, género opuesto popular en tu región, y un
 * ajuste por afinidad personal (perfiles visitados, autores que likeaste antes).
 * No mezcla reposts-en-el-feed (a diferencia de getFeed): el orden no es cronológico,
 * así que no hay un timestamp único para intercalarlos de forma consistente.
 * Paginación por offset (no por cursor de fecha, porque el orden no es por fecha).
 */
export async function getPersonalizedFeed(offset = 0, limit = FEED_PAGE_SIZE): Promise<FeedPost[]> {
  const viewerId = await getViewerId();
  const { data, error } = await supabase.rpc("get_personalized_feed", { p_limit: limit, p_offset: offset });
  if (error) throw error;
  const rows = data ?? [];
  const hydratedById = await hydratePosts(rows, viewerId);
  return rows.map((r) => hydratedById.get(r.id)).filter((p): p is FeedPost => !!p);
}

/** Hilo completo (raíz + todas sus continuaciones) a partir del id de la raíz. */
export async function getThread(rootId: string): Promise<FeedPost[]> {
  const viewerId = await getViewerId();
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .or(`id.eq.${rootId},thread_root_id.eq.${rootId}`)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const hydratedById = await hydratePosts(rows, viewerId);
  return rows.map((r) => hydratedById.get(r.id)).filter((p): p is FeedPost => !!p);
}

export async function getPost(id: string): Promise<FeedPost | null> {
  const viewerId = await getViewerId();
  const { data, error } = await supabase.from("posts").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const hydratedById = await hydratePosts([data], viewerId);
  return hydratedById.get(data.id) ?? null;
}

/** Reps de un usuario para la sección de su perfil (incluye continuaciones de hilo propias, no incluye reposts). */
export async function getUserPosts(userId: string, beforeIso?: string, limit = FEED_PAGE_SIZE): Promise<FeedPost[]> {
  const viewerId = await getViewerId();
  let query = supabase.from("posts").select("*").eq("author_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (beforeIso) query = query.lt("created_at", beforeIso);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const hydratedById = await hydratePosts(rows, viewerId);
  return rows.map((r) => hydratedById.get(r.id)).filter((p): p is FeedPost => !!p);
}

export async function getUserPostCount(userId: string): Promise<number> {
  const { count, error } = await supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", userId);
  if (error) throw error;
  return count ?? 0;
}

/** Batch de posts por id ya hidratados (para la vista previa de un Rep compartido en el chat). */
export async function getPostsByIds(ids: string[]): Promise<Map<string, FeedPost>> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return new Map();
  const viewerId = await getViewerId();
  const { data, error } = await supabase.from("posts").select("*").in("id", uniqueIds);
  if (error) throw error;
  return hydratePosts(data ?? [], viewerId);
}

export function validatePostContent(content: string, hasMedia: boolean): string | null {
  const trimmed = content.trim();
  if (!trimmed && !hasMedia) return "Escribí algo o subí una imagen/video.";
  if (trimmed.length > POST_CONTENT_MAX) return `Máximo ${POST_CONTENT_MAX} caracteres.`;
  return null;
}

export async function createPost(
  authorId: string,
  content: string,
  mediaUrl?: string,
  mediaType?: "image" | "video"
): Promise<{ post?: Post; error?: string }> {
  const { data, error } = await supabase
    .from("posts")
    .insert({ author_id: authorId, content: content.trim() || null, media_url: mediaUrl ?? null, media_type: mediaType ?? null })
    .select("*")
    .single();
  if (error) return { error: friendlyError(error, "No se pudo publicar el Rep. Probá de nuevo.") };
  return { post: data };
}

export async function createQuote(authorId: string, quotedPostId: string, content: string): Promise<{ post?: Post; error?: string }> {
  const { data, error } = await supabase
    .from("posts")
    .insert({ author_id: authorId, quoted_post_id: quotedPostId, content: content.trim() || null })
    .select("*")
    .single();
  if (error) {
    if (isPrivateInteractionError(error)) return { error: PRIVATE_INTERACTION_MESSAGE };
    return { error: friendlyError(error, "No se pudo citar el Rep. Probá de nuevo.") };
  }
  return { post: data };
}

export async function deletePost(postId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) return { error: "No se pudo eliminar el Rep. Probá de nuevo." };
  return {};
}

export async function toggleLike(postId: string, userId: string, currentlyLiked: boolean): Promise<{ error?: string }> {
  if (currentlyLiked) {
    const { error } = await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
    if (error) return { error: "No se pudo actualizar el me gusta." };
    return {};
  }
  const { error } = await supabase.from("post_likes").insert({ post_id: postId, user_id: userId });
  if (error) {
    if (error.code === "23505") return {}; // ya tenia el like (doble click) -- no es un error real para el usuario
    return { error: "No se pudo dar me gusta." };
  }
  return {};
}

export async function toggleRepost(postId: string, userId: string, currentlyReposted: boolean): Promise<{ error?: string }> {
  if (currentlyReposted) {
    const { error } = await supabase.from("post_reposts").delete().eq("post_id", postId).eq("user_id", userId);
    if (error) return { error: "No se pudo deshacer el repost." };
    return {};
  }
  const { error } = await supabase.from("post_reposts").insert({ post_id: postId, user_id: userId });
  if (error) {
    if (error.code === "23505") return {};
    if (isPrivateInteractionError(error)) return { error: PRIVATE_INTERACTION_MESSAGE };
    return { error: "No se pudo repostear." };
  }
  return {};
}

export function validateCommentContent(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return "Escribí un comentario.";
  if (trimmed.length > COMMENT_CONTENT_MAX) return `Máximo ${COMMENT_CONTENT_MAX} caracteres.`;
  return null;
}

export async function listComments(postId: string): Promise<FeedComment[]> {
  const { data, error } = await supabase.from("post_comments").select("*").eq("post_id", postId).order("created_at", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const authorsById = await fetchAuthorsByIds(rows.map((r) => r.author_id));
  return rows
    .map((r) => {
      const author = authorsById.get(r.author_id);
      return author ? { ...r, author } : null;
    })
    .filter((c): c is FeedComment => c !== null);
}

export async function addComment(
  postId: string,
  authorId: string,
  content: string,
  parentCommentId?: string
): Promise<{ comment?: PostComment; error?: string }> {
  const { data, error } = await supabase
    .from("post_comments")
    .insert({ post_id: postId, author_id: authorId, content: content.trim(), parent_comment_id: parentCommentId ?? null })
    .select("*")
    .single();
  if (error) {
    if (error.message?.includes("otro Rep")) return { error: "No se pudo responder a ese comentario." };
    if (isPrivateInteractionError(error)) return { error: PRIVATE_INTERACTION_MESSAGE };
    return { error: friendlyError(error, "No se pudo comentar. Probá de nuevo.") };
  }
  return { comment: data };
}

export async function deleteComment(commentId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("post_comments").delete().eq("id", commentId);
  if (error) return { error: "No se pudo eliminar el comentario." };
  return {};
}

export async function uploadPostMedia(authorId: string, file: File): Promise<{ url?: string; mediaType?: "image" | "video"; error?: string }> {
  const isImage = POST_IMAGE_TYPES.includes(file.type);
  const isVideo = POST_VIDEO_TYPES.includes(file.type);
  if (!isImage && !isVideo) return { error: "Formato no soportado. Usá JPG, PNG, WEBP, MP4 o WEBM." };
  if (file.size > POST_MEDIA_MAX_BYTES) return { error: "El archivo es muy pesado. Máximo 50MB." };

  const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
  const path = `${authorId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("post-media").upload(path, file);
  if (uploadError) return { error: "No se pudo subir el archivo. Probá de nuevo." };

  const { data } = supabase.storage.from("post-media").getPublicUrl(path);
  return { url: data.publicUrl, mediaType: isVideo ? "video" : "image" };
}
