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
  likedByMe: boolean;
}

const FEED_PAGE_SIZE = 20;
const POST_CONTENT_MAX = 240;
const COMMENT_CONTENT_MAX = 240;
const POST_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
// 2 min de video en buena calidad (incluso 4K) entra comodo en 300MB, asi el
// peso no termina siendo la traba para un clip que ya cumple el limite de duracion.
const POST_VIDEO_MAX_BYTES = 300 * 1024 * 1024;
const POST_VIDEO_MAX_DURATION_SEC = 120;
const POST_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
// quicktime = .mov (formato nativo de iPhone), 3gpp = Android viejo, x-msvideo = .avi,
// x-matroska = .mkv, mpeg/ogg = formatos legacy de descargas. Cubre la gran mayoria de clips.
const POST_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/3gpp", "video/x-msvideo", "video/x-matroska", "video/mpeg", "video/ogg"];

const URL_RE = /https?:\/\/[^\s]+/i;
const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
// Mismo charset que valida el username al registrarse (ver USERNAME_RE en auth.service.ts).
const MENTION_RE = /@([a-z0-9_]{3,30})/gi;

/** Primera URL http(s) encontrada en el texto del Rep, o null si no hay ninguna. */
export function extractFirstUrl(content: string): string | null {
  const match = content.match(URL_RE);
  if (!match) return null;
  // Sacamos puntuacion de cierre pegada al final ("mirá esto: https://x.com." o "(https://x.com)").
  return match[0].replace(/[.,;:!?)\]}'"]+$/, "");
}

/** @usuarios unicos (en minuscula, sin el "@") mencionados en el texto de un Rep. No valida que existan. */
function extractMentionedUsernames(content: string): string[] {
  const usernames = [...content.matchAll(MENTION_RE)].map((m) => m[1].toLowerCase());
  return [...new Set(usernames)];
}

/**
 * Resuelve los @usuario del texto contra perfiles reales y crea una fila en post_mentions por
 * cada uno (dispara la notificacion "te etiquetaron" via trigger SQL, ver notify_post_mention).
 * Se llama sin esperar el resultado desde createPost/createQuote: si falla, el Rep ya se publico
 * igual, etiquetar es un plus y no puede tumbar la publicacion.
 */
async function tagMentionedUsers(postId: string, authorId: string, content: string): Promise<void> {
  const usernames = extractMentionedUsernames(content);
  if (usernames.length === 0) return;

  const { data: profiles } = await supabase.from("profiles_public").select("id, username").in("username", usernames);
  const mentionedIds = (profiles ?? []).map((p) => p.id).filter((id): id is string => !!id && id !== authorId);
  if (mentionedIds.length === 0) return;

  await supabase
    .from("post_mentions")
    .insert(mentionedIds.map((mentionedUserId) => ({ post_id: postId, mentioned_user_id: mentionedUserId })));
}

/** Id del video si la URL es de YouTube (watch/youtu.be/embed/shorts), o null. No pega a la red: es solo un parseo. */
export function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(YOUTUBE_RE);
  return match ? match[1] : null;
}

interface LinkPreviewFields {
  link_url: string;
  link_title: string | null;
  link_description: string | null;
  link_image_url: string | null;
  link_site_name: string | null;
}

/**
 * Le pide a la edge function link-preview que scrapee los meta og:x / twitter:x de la
 * URL (estilo Facebook/Twitter). Best-effort: si falla (timeout, sitio bloqueado, sin
 * tags, etc.) devuelve null y el Rep se publica igual, sin preview -- nunca debe
 * trabar la publicacion.
 */
async function fetchLinkPreview(url: string): Promise<LinkPreviewFields | null> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      title?: string | null;
      description?: string | null;
      image?: string | null;
      siteName?: string | null;
    }>("link-preview", { body: { url } });
    if (error || !data || (!data.title && !data.description && !data.image)) return null;
    return {
      link_url: url,
      link_title: data.title ?? null,
      link_description: data.description ?? null,
      link_image_url: data.image ?? null,
      link_site_name: data.siteName ?? null,
    };
  } catch {
    return null;
  }
}

/** Si el link es de YouTube, embed de video (sin pegarle a la red). Si no, va al link-preview generico. */
async function resolveLinkFields(url: string | null): Promise<{ youtube_video_id?: string } | LinkPreviewFields | null> {
  if (!url) return null;
  const youtubeId = extractYouTubeVideoId(url);
  if (youtubeId) return { youtube_video_id: youtubeId };
  return fetchLinkPreview(url);
}

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
// seed: fijo por sesion de scroll (lo genera feed.ts una vez y lo reusa en cada
// pagina) para que el jitter aleatorio del orden sea *estable* entre paginas y no
// repita Reps -- ver el comentario en get_personalized_feed (migracion
// personalized_feed_seeded_random_no_dupes) para el detalle de por que hacia falta.
export async function getPersonalizedFeed(offset = 0, limit = FEED_PAGE_SIZE, seed?: string): Promise<FeedPost[]> {
  const viewerId = await getViewerId();
  const { data, error } = await supabase.rpc("get_personalized_feed", { p_limit: limit, p_offset: offset, p_seed: seed });
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

/**
 * Reps propios de un usuario + lo que reposteo, mezclados y ordenados por
 * feedTimestamp (pestaña "Tus Reps" del perfil) -- mismo patrón de mezcla que
 * getFeed pero acotado a un solo usuario en vez del feed general.
 */
export async function getUserRepsAndReposts(userId: string, beforeIso?: string, limit = FEED_PAGE_SIZE): Promise<FeedPost[]> {
  const viewerId = await getViewerId();

  let postsQuery = supabase.from("posts").select("*").eq("author_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (beforeIso) postsQuery = postsQuery.lt("created_at", beforeIso);

  let repostsQuery = supabase.from("post_reposts").select("post_id, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
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
  const reposterAuthorsById = await fetchAuthorsByIds([userId]);
  const reposter = reposterAuthorsById.get(userId);

  const entries: FeedPost[] = [];
  for (const p of postRows ?? []) {
    const hydrated = hydratedById.get(p.id);
    if (hydrated) entries.push(hydrated);
  }
  for (const r of repostRows ?? []) {
    const hydrated = hydratedById.get(r.post_id);
    if (hydrated && reposter) entries.push({ ...hydrated, repostedBy: reposter, feedTimestamp: r.created_at });
  }

  entries.sort((a, b) => (a.feedTimestamp < b.feedTimestamp ? 1 : -1));
  return entries.slice(0, limit);
}

/** Reps propios de un usuario con foto o video adjunto (pestaña "Multimedia" del perfil). */
export async function getUserMedia(userId: string, beforeIso?: string, limit = FEED_PAGE_SIZE): Promise<FeedPost[]> {
  const viewerId = await getViewerId();
  let query = supabase.from("posts").select("*").eq("author_id", userId).not("media_url", "is", null).order("created_at", { ascending: false }).limit(limit);
  if (beforeIso) query = query.lt("created_at", beforeIso);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const hydratedById = await hydratePosts(rows, viewerId);
  return rows.map((r) => hydratedById.get(r.id)).filter((p): p is FeedPost => !!p);
}

/** Posts a los que un usuario le puso me gusta (pestaña "Me gusta" del perfil), mas recientes primero segun cuando likeo. */
export async function getUserLikedPosts(userId: string, beforeIso?: string, limit = FEED_PAGE_SIZE): Promise<FeedPost[]> {
  const viewerId = await getViewerId();
  let likesQuery = supabase.from("post_likes").select("post_id, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (beforeIso) likesQuery = likesQuery.lt("created_at", beforeIso);
  const { data: likeRows, error: likesError } = await likesQuery;
  if (likesError) throw likesError;
  const rows = likeRows ?? [];
  if (rows.length === 0) return [];

  const { data: postRows, error: postsError } = await supabase
    .from("posts")
    .select("*")
    .in(
      "id",
      rows.map((r) => r.post_id)
    );
  if (postsError) throw postsError;

  const hydratedById = await hydratePosts(postRows ?? [], viewerId);
  return rows
    .map((r) => {
      const hydrated = hydratedById.get(r.post_id);
      return hydrated ? { ...hydrated, feedTimestamp: r.created_at } : null;
    })
    .filter((p): p is FeedPost => !!p);
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
  const trimmed = content.trim();
  // Si ya hay imagen/video adjunto no buscamos preview del link: mostrar las dos cosas
  // a la vez satura la tarjeta, y el media adjunto es la intencion mas explicita.
  const url = !mediaUrl && trimmed ? extractFirstUrl(trimmed) : null;
  const linkFields = await resolveLinkFields(url);

  const { data, error } = await supabase
    .from("posts")
    .insert({ author_id: authorId, content: trimmed || null, media_url: mediaUrl ?? null, media_type: mediaType ?? null, ...linkFields })
    .select("*")
    .single();
  if (error) return { error: friendlyError(error, "No se pudo publicar el Rep. Probá de nuevo.") };
  if (trimmed) void tagMentionedUsers(data.id, authorId, trimmed);
  return { post: data };
}

export async function createQuote(authorId: string, quotedPostId: string, content: string): Promise<{ post?: Post; error?: string }> {
  const trimmed = content.trim();
  const url = trimmed ? extractFirstUrl(trimmed) : null;
  const linkFields = await resolveLinkFields(url);

  const { data, error } = await supabase
    .from("posts")
    .insert({ author_id: authorId, quoted_post_id: quotedPostId, content: trimmed || null, ...linkFields })
    .select("*")
    .single();
  if (error) {
    if (isPrivateInteractionError(error)) return { error: PRIVATE_INTERACTION_MESSAGE };
    return { error: friendlyError(error, "No se pudo citar el Rep. Probá de nuevo.") };
  }
  if (trimmed) void tagMentionedUsers(data.id, authorId, trimmed);
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
  const viewerId = await getViewerId();
  const { data, error } = await supabase.from("post_comments").select("*").eq("post_id", postId).order("created_at", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const authorsById = await fetchAuthorsByIds(rows.map((r) => r.author_id));

  let likedCommentIds = new Set<string>();
  if (viewerId && rows.length) {
    const { data: likeRows, error: likesError } = await supabase
      .from("comment_likes")
      .select("comment_id")
      .eq("user_id", viewerId)
      .in(
        "comment_id",
        rows.map((r) => r.id)
      );
    if (likesError) throw likesError;
    likedCommentIds = new Set((likeRows ?? []).map((r) => r.comment_id));
  }

  return rows
    .map((r) => {
      const author = authorsById.get(r.author_id);
      return author ? { ...r, author, likedByMe: likedCommentIds.has(r.id) } : null;
    })
    .filter((c): c is FeedComment => c !== null);
}

export async function toggleCommentLike(commentId: string, userId: string, currentlyLiked: boolean): Promise<{ error?: string }> {
  if (currentlyLiked) {
    const { error } = await supabase.from("comment_likes").delete().eq("comment_id", commentId).eq("user_id", userId);
    if (error) return { error: "No se pudo actualizar el me gusta." };
    return {};
  }
  const { error } = await supabase.from("comment_likes").insert({ comment_id: commentId, user_id: userId });
  if (error) {
    if (error.code === "23505") return {}; // ya tenia el like (doble click) -- no es un error real para el usuario
    return { error: "No se pudo dar me gusta." };
  }
  return {};
}

export interface PostViewer extends PostAuthor {
  viewedAt: string;
}

// Silencioso a proposito: una vista es un dato secundario, no algo por lo que
// interrumpir al usuario si falla (sin conexion, RLS, lo que sea).
export async function recordPostView(postId: string, viewerId: string): Promise<void> {
  const { error } = await supabase.from("post_views").insert({ post_id: postId, viewer_id: viewerId });
  if (error && error.code !== "23505") {
    // ya lo habia visto antes (23505) o fallo silencioso -- ninguno amerita romper la UI
  }
}

/** Quienes vieron un Rep (boton de metricas), mas recientes primero. */
export async function getPostViewers(postId: string, beforeIso?: string, limit = 30): Promise<PostViewer[]> {
  let query = supabase.from("post_views").select("viewer_id, created_at").eq("post_id", postId).order("created_at", { ascending: false }).limit(limit);
  if (beforeIso) query = query.lt("created_at", beforeIso);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const authorsById = await fetchAuthorsByIds(rows.map((r) => r.viewer_id));
  return rows
    .map((r) => {
      const author = authorsById.get(r.viewer_id);
      return author ? { ...author, viewedAt: r.created_at } : null;
    })
    .filter((v): v is PostViewer => v !== null);
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

// Los videos pueden pesar varias decenas de MB: en una conexion movil lenta o
// que se corta a mitad de subida, el fetch de supabase-js puede quedar colgado
// sin nunca resolver ni rechazar, dejando el spinner de "Subiendo..." girando
// para siempre. Este timeout (escalado por tamano de archivo) le pone un techo
// para que el usuario siempre termine viendo un error accionable.
const UPLOAD_TIMEOUT_MIN_MS = 30_000;
const UPLOAD_TIMEOUT_BYTES_PER_SEC = 150 * 1024; // ~150KB/s, conexion movil lenta

function withUploadTimeout<T>(promise: Promise<T>, fileSize: number): Promise<T> {
  const timeoutMs = Math.max(UPLOAD_TIMEOUT_MIN_MS, Math.ceil((fileSize / UPLOAD_TIMEOUT_BYTES_PER_SEC) * 1000));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("upload-timeout")), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

export async function uploadPostMedia(
  authorId: string,
  file: File
): Promise<{ url?: string; path?: string; mediaType?: "image" | "video"; error?: string }> {
  const isImage = POST_IMAGE_TYPES.includes(file.type);
  const isVideo = POST_VIDEO_TYPES.includes(file.type);
  if (!isImage && !isVideo) return { error: "Formato no soportado. Usá JPG, PNG, WEBP, MP4, MOV, WEBM, 3GP, AVI, MKV, MPEG u OGG." };
  if (isImage && file.size > POST_IMAGE_MAX_BYTES) return { error: "La imagen es muy pesada. Máximo 20MB." };
  if (isVideo && file.size > POST_VIDEO_MAX_BYTES) return { error: "El video es muy pesado. Máximo 300MB." };

  const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
  const path = `${authorId}/${crypto.randomUUID()}.${ext}`;
  try {
    const { error: uploadError } = await withUploadTimeout(supabase.storage.from("post-media").upload(path, file), file.size);
    if (uploadError) return { error: "No se pudo subir el archivo. Probá de nuevo." };
  } catch {
    return { error: "La subida tardó demasiado. Revisá tu conexión y probá de nuevo." };
  }

  const { data } = supabase.storage.from("post-media").getPublicUrl(path);
  return { url: data.publicUrl, path, mediaType: isVideo ? "video" : "image" };
}

// El composer sube el archivo apenas se elige (no espera a Publicar, ver feed.ts).
// Si el usuario saca el adjunto o publica sin el, este archivo ya subido queda
// huerfano en el bucket -- se llama a esto para borrarlo y no dejar basura.
export async function deletePostMedia(path: string): Promise<void> {
  await supabase.storage.from("post-media").remove([path]);
}

function readVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer el video."));
    };
    video.src = url;
  });
}

/** Rechaza videos de mas de 2 minutos antes de subirlos. Null = duracion valida (o no se pudo determinar, se deja pasar). */
export async function validatePostVideoDuration(file: File): Promise<string | null> {
  if (!POST_VIDEO_TYPES.includes(file.type)) return null;
  try {
    const duration = await readVideoDurationSeconds(file);
    if (duration > POST_VIDEO_MAX_DURATION_SEC) return "El video no puede durar más de 2 minutos.";
    return null;
  } catch {
    return null; // no se pudo leer metadata (formato raro/navegador viejo): no bloqueamos, el backend igual valida peso
  }
}
