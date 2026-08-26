import { escapeHtml } from "./dom";
import { linkifyHtml } from "./linkify";
import { renderVerifiedBadge } from "./verifiedBadge";
import { formatTiempoRelativo } from "./dias";
import { openMediaLightbox } from "./postModals";
import { youtubeEmbedHtml } from "./youtube";
import type { FeedPost, Post, PostAuthor } from "../services/post.service";

const DEFAULT_AVATAR = "/images/avatars/default.svg";

export interface PostCardHandlers {
  /** Quién está mirando (o null si no hay sesión resuelta todavía): decide, entre otras
   * cosas, el botón de borrar y el "isOwner" de cada Rep dentro del visor de media. */
  viewerId: string | null;
  onLikeToggle(post: FeedPost): void;
  onRepostToggle(post: FeedPost): void;
  onCommentClick(post: FeedPost): void;
  onQuoteClick(post: FeedPost): void;
  onShareClick(post: FeedPost): void;
  onDeleteClick?(post: FeedPost): void;
  onAuthorClick?(author: PostAuthor): void;
  onMetricsClick?(post: FeedPost): void;
  /** Se dispara una sola vez, cuando la tarjeta entra en viewport (ver wirePostCard). */
  onView?(post: FeedPost): void;
  /** Tocar la tarjeta (fuera de los botones/links de acción) abre el detalle del Rep, como en Twitter. */
  onOpenPost?(post: FeedPost): void;
  /** Tocar el Rep citado embebido adentro de otro Rep -- abre el detalle de ESE Rep (no el contenedor). */
  onQuotedClick?(quotedPostId: string): void;
  /** El visor de media (ver openMediaLightbox mas abajo) SI pisa el mismo #loaderBody sin
   * avisar -- si esta tarjeta esta adentro del modal de detalle de Rep (postDetailModal.ts),
   * hay que soltar su scroll lock y su canal realtime ANTES, si no el body se queda con
   * position:fixed para siempre. undefined en feed/perfil (ahi no hay nada que cerrar). */
  onMediaOpening?(): void;
  /**
   * Cola de Reps con video para el swipe-hacia-arriba dentro del visor (ver
   * openMediaLightbox): a partir del Rep que se tocó, en qué otros videos se puede seguir
   * pasando. Cada página define el alcance correcto -- el feed mezcla autores, un perfil
   * solo debe traer los del mismo autor que currentPost (ni siquiera en la pestaña "Me
   * gusta", que puede traer Reps de otras personas).
   */
  getVideoQueue(currentPost: FeedPost): FeedPost[];
}

export const ICON_COMMENT = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
const ICON_REPOST = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
export const ICON_HEART = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>`;
export const ICON_HEART_FILLED = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>`;
const ICON_QUOTE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none"><path d="M7 8c-1.7 0-3 1.4-3 3.5S5.3 15 7 15v3c-3.3 0-6-2.7-6-6.5S3.7 5 7 5v3zm10 0c-1.7 0-3 1.4-3 3.5S15.3 15 17 15v3c-3.3 0-6-2.7-6-6.5S13.7 5 17 5v3z"/></svg>`;
export const ICON_SHARE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg>`;
export const ICON_TRASH = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const ICON_METRICS = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>`;

export function authorLineHtml(author: PostAuthor, badgeSize = 14): string {
  return `${escapeHtml(author.username)}${renderVerifiedBadge(author.userType, author.isVerified, badgeSize)}`;
}

// linkify=false para texto que ya vive adentro de un <a> (la cita: quotedPostHtml
// envuelve todo en el link al Rep citado, y anidar un <a> adentro rompe el click).
export function contentHtml(content: string | null, className: string, linkify = false): string {
  if (!content) return "";
  const body = linkify ? linkifyHtml(content) : escapeHtml(content).replace(/\n/g, "<br>");
  return `<div class="${className}">${body}</div>`;
}

// Sin controls: el video nativo se reproduce solo (mudo) al pasar por el feed (ver
// el IntersectionObserver en wirePostCard) y un click abre el visor grande con
// sonido y controles de verdad. Los de YouTube no entran aca (van por youtubeEmbedHtml).
function mediaHtml(mediaUrl: string | null, mediaType: string | null): string {
  if (!mediaUrl) return "";
  if (mediaType === "video")
    return `<video class="post-card-media" src="${escapeHtml(mediaUrl)}" playsinline muted loop preload="metadata"></video>`;
  return `<img class="post-card-media" src="${escapeHtml(mediaUrl)}" alt="" draggable="false" loading="lazy" decoding="async">`;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Preview estilo Facebook/Twitter cuando el texto trae un link (ver fetchLinkPreview
// en post.service.ts, que scrapea los meta og:*/twitter:* al publicar). Nunca convive
// con media adjunta: si subiste una imagen/video, esa es la intencion mas explicita.
function linkPreviewHtml(post: Post): string {
  if (!post.link_url || post.media_url || post.youtube_video_id) return "";
  return `
    <a class="post-link-preview" href="${escapeHtml(post.link_url)}" target="_blank" rel="noopener noreferrer">
      ${post.link_image_url ? `<img class="post-link-preview-image" src="${escapeHtml(post.link_image_url)}" alt="" draggable="false">` : ""}
      <div class="post-link-preview-body">
        <span class="post-link-preview-domain">${escapeHtml(post.link_site_name || domainOf(post.link_url))}</span>
        ${post.link_title ? `<p class="post-link-preview-title">${escapeHtml(post.link_title)}</p>` : ""}
        ${post.link_description ? `<p class="post-link-preview-desc">${escapeHtml(post.link_description)}</p>` : ""}
      </div>
    </a>
  `;
}

// Sin controls: esta miniatura vive adentro de un <a> (el link al Rep citado), y anidar
// controles de video interactivos dentro de un link da problemas de click. Es solo preview.
function quotedMediaHtml(mediaUrl: string | null, mediaType: string | null): string {
  if (!mediaUrl) return "";
  if (mediaType === "video") return `<video class="post-quoted-media" src="${escapeHtml(mediaUrl)}" muted playsinline></video>`;
  return `<img class="post-quoted-media" src="${escapeHtml(mediaUrl)}" alt="" draggable="false">`;
}

// Un solo nivel: si el Rep citado a su vez cita a otro, no se recursa (queda solo texto+media del citado directo).
// Boton en vez de <a href="post.html?...">: si esto se toca desde adentro del modal de detalle
// (ver postDetailModal.ts), un link real navegaria el shell por debajo dejando el modal abierto
// y desincronizado -- wirePostCard() engancha el click via data-quoted-id y lo manda por
// handlers.onQuotedClick, que cada pagina resuelve a su manera (modal si hay uno abierto, o el
// mismo abrir-modal en feed/perfil para mantener todo el sitio consistente).
function quotedPostHtml(quoted: (Post & { author: PostAuthor }) | null): string {
  if (!quoted) return "";
  return `
    <button type="button" class="post-quoted" data-quoted-id="${escapeHtml(quoted.id)}">
      <div class="post-quoted-head">
        <img class="post-quoted-avatar" src="${escapeHtml(quoted.author.avatarUrl || DEFAULT_AVATAR)}" alt="" draggable="false">
        <span class="post-quoted-name">${authorLineHtml(quoted.author, 12)}</span>
        <span class="post-quoted-dot">·</span>
        <span class="post-quoted-time">${formatTiempoRelativo(quoted.created_at)}</span>
      </div>
      ${contentHtml(quoted.content, "post-quoted-text")}
      ${quotedMediaHtml(quoted.media_url, quoted.media_type)}
    </button>
  `;
}

function repostedByHtml(repostedBy?: PostAuthor): string {
  if (!repostedBy) return "";
  return `
    <div class="post-card-reposted-by">
      ${ICON_REPOST}
      <span>${escapeHtml(repostedBy.username)} reposteó</span>
    </div>
  `;
}

export function actionsHtml(post: FeedPost, isOwner: boolean): string {
  return `
    <div class="post-card-actions">
      <button type="button" class="post-action" data-action="comment" aria-label="Comentar">${ICON_COMMENT}<span>${post.comments_count}</span></button>
      ${isOwner ? "" : `<button type="button" class="post-action post-action-repost${post.repostedByMe ? " is-active" : ""}" data-action="repost" aria-label="Repostear">${ICON_REPOST}<span>${post.reposts_count}</span></button>`}
      <button type="button" class="post-action post-action-like${post.likedByMe ? " is-active" : ""}" data-action="like" aria-label="Me gusta">${post.likedByMe ? ICON_HEART_FILLED : ICON_HEART}<span>${post.likes_count}</span></button>
      <button type="button" class="post-action" data-action="quote" aria-label="Citar">${ICON_QUOTE}${post.quotes_count > 0 ? `<span>${post.quotes_count}</span>` : ""}</button>
      <button type="button" class="post-action" data-action="share" aria-label="Compartir por chat">${ICON_SHARE}</button>
      ${isOwner ? `<button type="button" class="post-action" data-action="metrics" aria-label="Ver métricas">${ICON_METRICS}</button>` : ""}
      ${isOwner ? `<button type="button" class="post-action post-action-delete" data-action="delete" aria-label="Eliminar Rep">${ICON_TRASH}</button>` : ""}
    </div>
  `;
}

/**
 * Renderer central del feed/hilo/perfil: string puro de HTML, sin asumir nada de la pagina que lo use.
 * hideHeader: para el Rep enfocado del modal de detalle (ver postDetail.ts), que pinta su propio
 * encabezado de autor (avatar arriba, nombre en negrita, usuario abajo, boton de seguir) en vez
 * del avatar+nombre en una sola linea que usan las tarjetas normales del feed/hilo.
 */
export function renderPostCard(post: FeedPost, viewerId: string | null, opts?: { compact?: boolean; hideHeader?: boolean }): string {
  const compact = opts?.compact ?? false;
  const hideHeader = opts?.hideHeader ?? false;
  const isOwner = viewerId != null && viewerId === post.author_id;
  return `
    <article class="post-card${compact ? " post-card-compact" : ""}${hideHeader ? " post-card-bare" : ""}" data-post-id="${post.id}">
      ${repostedByHtml(post.repostedBy)}
      <div class="post-card-main">
        ${
          hideHeader
            ? ""
            : `
        <button type="button" class="post-card-avatar-btn" data-action="author" aria-label="Ver perfil de ${escapeHtml(post.author.username)}">
          <img class="post-card-avatar" src="${escapeHtml(post.author.avatarUrl || DEFAULT_AVATAR)}" alt="" draggable="false">
        </button>`
        }
        <div class="post-card-body">
          ${
            hideHeader
              ? ""
              : `
          <div class="post-card-head">
            <button type="button" class="post-card-author" data-action="author">${authorLineHtml(post.author)}</button>
            <span class="post-card-dot">·</span>
            <span class="post-card-time">${formatTiempoRelativo(post.feedTimestamp)}</span>
          </div>`
          }
          ${contentHtml(post.content, "post-card-text", true)}
          ${mediaHtml(post.media_url, post.media_type)}
          ${!post.media_url && post.youtube_video_id ? youtubeEmbedHtml(post.youtube_video_id) : ""}
          ${linkPreviewHtml(post)}
          ${quotedPostHtml(post.quotedPost)}
          ${actionsHtml(post, isOwner)}
        </div>
      </div>
    </article>
  `;
}

// Autoplay mudo de los videos nativos mientras estan a la vista (no los de YouTube,
// esos van dentro de un iframe ajeno). Se pausan apenas salen del viewport. Se crea
// un observer nuevo por llamada a wirePostCard, scopeado solo a esta tanda de cards.
function observeVideoAutoplay(root: HTMLElement): void {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const video = entry.target as HTMLVideoElement;
        if (entry.isIntersecting) {
          video.muted = true;
          video.play().catch(() => {}); // el navegador puede rechazar el play, no es un error real
        } else {
          video.pause();
        }
      }
    },
    { threshold: 0.6 }
  );
  root.querySelectorAll<HTMLVideoElement>("video.post-card-media").forEach((video) => observer.observe(video));
}

// Registra una vista (ver onView en PostCardHandlers) la primera vez que cada card
// entra en viewport; una vez disparado se deja de observar esa card puntual.
function observePostViews(root: HTMLElement, postsById: Map<string, FeedPost>, handlers: PostCardHandlers): void {
  if (!handlers.onView) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const card = entry.target as HTMLElement;
        observer.unobserve(card);
        const post = postsById.get(card.dataset.postId!);
        if (post) handlers.onView?.(post);
      }
    },
    { threshold: 0.5 }
  );
  root.querySelectorAll<HTMLElement>(".post-card[data-post-id]").forEach((card) => observer.observe(card));
}

/** Busca las post-card ya renderizadas adentro de `root` y les engancha los listeners de acciones. Sin delegacion: se re-llama despues de cada re-render. */
export function wirePostCard(root: HTMLElement, posts: FeedPost[], handlers: PostCardHandlers): void {
  const postsById = new Map(posts.map((p) => [p.id, p]));
  root.querySelectorAll<HTMLElement>(".post-card[data-post-id]").forEach((card) => {
    const post = postsById.get(card.dataset.postId!);
    if (!post) return;

    card.querySelectorAll<HTMLButtonElement>('[data-action="author"]').forEach((btn) => {
      btn.addEventListener("click", () => handlers.onAuthorClick?.(post.author));
    });
    card.querySelector<HTMLButtonElement>('[data-action="like"]')?.addEventListener("click", () => handlers.onLikeToggle(post));
    card.querySelector<HTMLButtonElement>('[data-action="repost"]')?.addEventListener("click", () => handlers.onRepostToggle(post));
    card.querySelector<HTMLButtonElement>('[data-action="comment"]')?.addEventListener("click", () => handlers.onCommentClick(post));
    card.querySelector<HTMLButtonElement>('[data-action="quote"]')?.addEventListener("click", () => handlers.onQuoteClick(post));
    card.querySelector<HTMLButtonElement>('[data-action="share"]')?.addEventListener("click", () => handlers.onShareClick(post));
    card.querySelector<HTMLButtonElement>('[data-action="metrics"]')?.addEventListener("click", () => handlers.onMetricsClick?.(post));
    card.querySelector<HTMLButtonElement>('[data-action="delete"]')?.addEventListener("click", () => handlers.onDeleteClick?.(post));

    // Click en la foto/video adjunto abre el visor grande (ver openMediaLightbox en
    // postModals.ts), en vez de navegar al detalle del Rep como el resto de la tarjeta.
    card.querySelector<HTMLElement>(".post-card-media")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!post.media_url) return;
      handlers.onMediaOpening?.();
      openMediaLightbox(post, handlers);
    });

    // El Rep citado embebido es su propio Rep, no el contenedor: para el click.
    card.querySelector<HTMLButtonElement>(".post-quoted")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const quotedId = post.quotedPost?.id;
      if (quotedId) handlers.onQuotedClick?.(quotedId);
    });

    if (handlers.onOpenPost) {
      card.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, a")) return; // ya lo maneja un handler especifico (o es un link con su propio href, como la cita)
        handlers.onOpenPost?.(post);
      });
    }
  });

  observeVideoAutoplay(root);
  observePostViews(root, postsById, handlers);
}
