import { escapeHtml } from "./dom";
import { renderVerifiedBadge } from "./verifiedBadge";
import { formatTiempoRelativo } from "./dias";
import { openMediaLightbox } from "./postModals";
import type { FeedPost, Post, PostAuthor } from "../services/post.service";

const DEFAULT_AVATAR = "/images/avatars/default.svg";

export interface PostCardHandlers {
  onLikeToggle(post: FeedPost): void;
  onRepostToggle(post: FeedPost): void;
  onCommentClick(post: FeedPost): void;
  onQuoteClick(post: FeedPost): void;
  onShareClick(post: FeedPost): void;
  onDeleteClick?(post: FeedPost): void;
  onAuthorClick?(author: PostAuthor): void;
  /** Tocar la tarjeta (fuera de los botones/links de acción) abre el detalle del Rep, como en Twitter. */
  onOpenPost?(post: FeedPost): void;
}

const ICON_COMMENT = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
const ICON_REPOST = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
const ICON_HEART = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>`;
const ICON_HEART_FILLED = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>`;
const ICON_QUOTE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none"><path d="M7 8c-1.7 0-3 1.4-3 3.5S5.3 15 7 15v3c-3.3 0-6-2.7-6-6.5S3.7 5 7 5v3zm10 0c-1.7 0-3 1.4-3 3.5S15.3 15 17 15v3c-3.3 0-6-2.7-6-6.5S13.7 5 17 5v3z"/></svg>`;
const ICON_SHARE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg>`;
const ICON_TRASH = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;

function authorLineHtml(author: PostAuthor, badgeSize = 14): string {
  return `${escapeHtml(author.username)}${renderVerifiedBadge(author.userType, author.isVerified, badgeSize)}`;
}

const URL_MATCH_RE = /https?:\/\/[^\s]+/gi;
const URL_TRAILING_PUNCT_RE = /[.,;:!?)\]}'"]+$/;

// El preview de abajo (linkPreviewHtml/youtubeEmbedHtml) es solo un adelanto: el
// texto del Rep puede traer la URL tal cual la pegó el usuario, y esa tiene que
// seguir siendo un link de verdad al que se le pueda hacer click y te lleve ahi.
function linkifyHtml(text: string): string {
  let html = "";
  let lastIndex = 0;
  for (const match of text.matchAll(URL_MATCH_RE)) {
    const start = match.index ?? 0;
    let url = match[0];
    const trailingMatch = url.match(URL_TRAILING_PUNCT_RE);
    const trailing = trailingMatch ? trailingMatch[0] : "";
    if (trailing) url = url.slice(0, -trailing.length);

    html += escapeHtml(text.slice(lastIndex, start)).replace(/\n/g, "<br>");
    html += `<a class="post-card-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
    html += escapeHtml(trailing);
    lastIndex = start + match[0].length;
  }
  html += escapeHtml(text.slice(lastIndex)).replace(/\n/g, "<br>");
  return html;
}

// linkify=false para texto que ya vive adentro de un <a> (la cita: quotedPostHtml
// envuelve todo en el link al Rep citado, y anidar un <a> adentro rompe el click).
function contentHtml(content: string | null, className: string, linkify = false): string {
  if (!content) return "";
  const body = linkify ? linkifyHtml(content) : escapeHtml(content).replace(/\n/g, "<br>");
  return `<div class="${className}">${body}</div>`;
}

function mediaHtml(mediaUrl: string | null, mediaType: string | null): string {
  if (!mediaUrl) return "";
  if (mediaType === "video") return `<video class="post-card-media" src="${escapeHtml(mediaUrl)}" controls playsinline></video>`;
  return `<img class="post-card-media" src="${escapeHtml(mediaUrl)}" alt="">`;
}

// nocookie: no larga cookies de tracking hasta que se le da play, buen default sin pedirle nada al usuario.
export function youtubeEmbedHtml(videoId: string): string {
  return `
    <div class="post-youtube-embed">
      <iframe
        src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}"
        title="Video de YouTube"
        loading="lazy"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    </div>
  `;
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
      ${post.link_image_url ? `<img class="post-link-preview-image" src="${escapeHtml(post.link_image_url)}" alt="">` : ""}
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
  return `<img class="post-quoted-media" src="${escapeHtml(mediaUrl)}" alt="">`;
}

// Un solo nivel: si el Rep citado a su vez cita a otro, no se recursa (queda solo texto+media del citado directo).
function quotedPostHtml(quoted: (Post & { author: PostAuthor }) | null): string {
  if (!quoted) return "";
  return `
    <a class="post-quoted" href="post.html?id=${encodeURIComponent(quoted.id)}">
      <div class="post-quoted-head">
        <img class="post-quoted-avatar" src="${escapeHtml(quoted.author.avatarUrl || DEFAULT_AVATAR)}" alt="">
        <span class="post-quoted-name">${authorLineHtml(quoted.author, 12)}</span>
        <span class="post-quoted-dot">·</span>
        <span class="post-quoted-time">${formatTiempoRelativo(quoted.created_at)}</span>
      </div>
      ${contentHtml(quoted.content, "post-quoted-text")}
      ${quotedMediaHtml(quoted.media_url, quoted.media_type)}
    </a>
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

function actionsHtml(post: FeedPost, viewerId: string | null): string {
  const isOwner = viewerId != null && viewerId === post.author_id;
  return `
    <div class="post-card-actions">
      <button type="button" class="post-action" data-action="comment" aria-label="Comentar">${ICON_COMMENT}<span>${post.comments_count}</span></button>
      <button type="button" class="post-action post-action-repost${post.repostedByMe ? " is-active" : ""}" data-action="repost" aria-label="Repostear">${ICON_REPOST}<span>${post.reposts_count}</span></button>
      <button type="button" class="post-action post-action-like${post.likedByMe ? " is-active" : ""}" data-action="like" aria-label="Me gusta">${post.likedByMe ? ICON_HEART_FILLED : ICON_HEART}<span>${post.likes_count}</span></button>
      <button type="button" class="post-action" data-action="quote" aria-label="Citar">${ICON_QUOTE}${post.quotes_count > 0 ? `<span>${post.quotes_count}</span>` : ""}</button>
      <button type="button" class="post-action" data-action="share" aria-label="Compartir por chat">${ICON_SHARE}</button>
      ${isOwner ? `<button type="button" class="post-action post-action-delete" data-action="delete" aria-label="Eliminar Rep">${ICON_TRASH}</button>` : ""}
    </div>
  `;
}

/** Renderer central del feed/hilo/perfil: string puro de HTML, sin asumir nada de la pagina que lo use. */
export function renderPostCard(post: FeedPost, viewerId: string | null, opts?: { compact?: boolean }): string {
  const compact = opts?.compact ?? false;
  return `
    <article class="post-card${compact ? " post-card-compact" : ""}" data-post-id="${post.id}">
      ${repostedByHtml(post.repostedBy)}
      <div class="post-card-main">
        <button type="button" class="post-card-avatar-btn" data-action="author" aria-label="Ver perfil de ${escapeHtml(post.author.username)}">
          <img class="post-card-avatar" src="${escapeHtml(post.author.avatarUrl || DEFAULT_AVATAR)}" alt="">
        </button>
        <div class="post-card-body">
          <div class="post-card-head">
            <button type="button" class="post-card-author" data-action="author">${authorLineHtml(post.author)}</button>
            <span class="post-card-dot">·</span>
            <span class="post-card-time">${formatTiempoRelativo(post.feedTimestamp)}</span>
          </div>
          ${contentHtml(post.content, "post-card-text", true)}
          ${mediaHtml(post.media_url, post.media_type)}
          ${!post.media_url && post.youtube_video_id ? youtubeEmbedHtml(post.youtube_video_id) : ""}
          ${linkPreviewHtml(post)}
          ${quotedPostHtml(post.quotedPost)}
          ${actionsHtml(post, viewerId)}
        </div>
      </div>
    </article>
  `;
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
    card.querySelector<HTMLButtonElement>('[data-action="delete"]')?.addEventListener("click", () => handlers.onDeleteClick?.(post));

    // Click en la foto/video adjunto abre el visor grande (ver openMediaLightbox en
    // postModals.ts), en vez de navegar al detalle del Rep como el resto de la tarjeta.
    card.querySelector<HTMLElement>(".post-card-media")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!post.media_url) return;
      openMediaLightbox(post.media_url, post.media_type === "video" ? "video" : "image");
    });

    if (handlers.onOpenPost) {
      card.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, a")) return; // ya lo maneja un handler especifico (o es un link con su propio href, como la cita)
        handlers.onOpenPost?.(post);
      });
    }
  });
}
