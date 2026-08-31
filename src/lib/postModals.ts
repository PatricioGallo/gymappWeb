import { escapeHtml } from "./dom";
import { renderVerifiedBadge } from "./verifiedBadge";
import { formatTiempoRelativo } from "./dias";
import {
  createQuote,
  deletePost,
  addComment,
  validateCommentContent,
  getPostViewers,
  type FeedPost,
  type FeedComment,
  type Post,
  type PostComment,
  type PostViewer,
} from "../services/post.service";
import { getOrCreateConversation, sendMessage } from "../services/chat.service";
import { listFollowers, type FollowListRow } from "../services/follow.service";
import { actionsHtml, authorLineHtml, contentHtml, type PostCardHandlers } from "./postCard";
import { attachMentionAutocomplete } from "./mentionAutocomplete";
import { makeMentionEditable } from "./mentionEditor";
import { openMediaLightbox as openMediaViewer } from "./mediaLightbox";

const QUOTE_MAX = 240;
const COMMENT_MODAL_MAX = 240;
const DEFAULT_AVATAR = "/images/avatars/default.svg";

function closeOverlay(): void {
  const loaderBody = document.getElementById("loaderBody");
  if (loaderBody) loaderBody.innerHTML = "";
}

function successCheckHtml(message: string): string {
  return `
    <div class="success-check-container">
      <div class="success-icon">
        <svg viewBox="0 0 52 52" class="success-svg">
          <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
          <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
        </svg>
      </div>
      <p>${message}</p>
    </div>
  `;
}

/**
 * Visor a pantalla completa de la foto/video de un Rep: click en el media lo abre (mismo
 * visor compartido que usa el chat para sus fotos, ver mediaLightbox.ts). Abajo del media
 * muestra el texto del Rep y la misma barra de acciones (me gusta, comentar, citar,
 * compartir...) que la tarjeta -- comentar/citar/compartir/borrar reemplazan este visor por
 * su propio modal (los dos comparten el mismo slot #loaderBody), por eso cierran el visor
 * antes de abrirse. Si hay más de un video en handlers.getVideoQueue(post), deslizar hacia
 * arriba pasa al siguiente sin cerrar el visor (estilo Reels/TikTok).
 */
export function openMediaLightbox(post: FeedPost, handlers: PostCardHandlers, onClose?: () => void): void {
  if (!post.media_url) return;

  // El video solo entra en la cola (para el swipe-arriba): las fotos se quedan solas, un
  // swipe-arriba sobre una foto simplemente no encuentra "siguiente" y rebota. El caller
  // (wirePostCard) ya filtra/ordena la cola segun el contexto -- feed mezcla autores,
  // perfil solo trae del mismo autor que currentPost (ver getVideoQueue en cada página).
  const queue = post.media_type === "video" ? handlers.getVideoQueue(post) : [post];
  const startIndex = Math.max(
    queue.findIndex((p) => p.id === post.id),
    0
  );

  openMediaViewer({
    queue,
    startIndex,
    onClose,
    getMedia: (p) => ({ url: p.media_url!, kind: p.media_type === "video" ? "video" : "image" }),
    // Me gusta/repostear se resuelven sin salir del visor (solo repintan la barra); el
    // resto de las acciones abre su propio modal en el mismo #loaderBody, asi que hay que
    // cerrar el visor antes -- si no, closeOverlay() del otro modal se lleva puesto todo.
    renderFooter: (currentPost, footer, { close, refresh }) => {
      footer.innerHTML = `
        <div class="post-card-main">
          <img class="post-card-avatar" src="${escapeHtml(currentPost.author.avatarUrl || DEFAULT_AVATAR)}" alt="">
          <div class="post-card-body">
            <div class="post-card-head">
              <span class="post-card-author">${authorLineHtml(currentPost.author)}</span>
              <span class="post-card-dot">·</span>
              <span class="post-card-time">${formatTiempoRelativo(currentPost.feedTimestamp)}</span>
            </div>
            ${contentHtml(currentPost.content, "post-card-text", true)}
            <div id="mediaLightboxActions"></div>
          </div>
        </div>
      `;
      const actionsSlot = document.getElementById("mediaLightboxActions")!;
      const isOwner = handlers.viewerId != null && handlers.viewerId === currentPost.author_id;
      actionsSlot.innerHTML = actionsHtml(currentPost, isOwner);
      actionsSlot.querySelector<HTMLButtonElement>('[data-action="like"]')?.addEventListener("click", () => {
        handlers.onLikeToggle(currentPost);
        refresh();
      });
      actionsSlot.querySelector<HTMLButtonElement>('[data-action="repost"]')?.addEventListener("click", () => {
        handlers.onRepostToggle(currentPost);
        refresh();
      });
      actionsSlot.querySelector<HTMLButtonElement>('[data-action="comment"]')?.addEventListener("click", () => {
        close();
        handlers.onCommentClick(currentPost);
      });
      actionsSlot.querySelector<HTMLButtonElement>('[data-action="quote"]')?.addEventListener("click", () => {
        close();
        handlers.onQuoteClick(currentPost);
      });
      actionsSlot.querySelector<HTMLButtonElement>('[data-action="share"]')?.addEventListener("click", () => {
        close();
        handlers.onShareClick(currentPost);
      });
      actionsSlot.querySelector<HTMLButtonElement>('[data-action="metrics"]')?.addEventListener("click", () => {
        close();
        handlers.onMetricsClick?.(currentPost);
      });
      actionsSlot.querySelector<HTMLButtonElement>('[data-action="delete"]')?.addEventListener("click", () => {
        close();
        handlers.onDeleteClick?.(currentPost);
      });
    },
  });
}

/** Modal para citar un Rep: textarea corto + contador, llama a createQuote y avisa via onCreated. */
export function openQuoteModal(post: FeedPost, authorId: string, onCreated: (created: Post) => void): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;

  const preview = (post.content ?? "").slice(0, 80) + ((post.content?.length ?? 0) > 80 ? "…" : "");

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Citar Rep</h2>
        <p class="subtitle">@${escapeHtml(post.author.username)}: ${escapeHtml(preview)}</p>
        <div class="field">
          <textarea id="quoteComposerInput" class="quote-composer-input" rows="3" maxlength="${QUOTE_MAX}" placeholder="Agregá un comentario..."></textarea>
        </div>
        <p class="post-composer-counter" id="quoteComposerCounter">${QUOTE_MAX}</p>
        <div class="alert_message" id="quoteAlert"></div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="quoteSubmit" type="button">Citar</button>
          <button class="btn btn-outline" id="quoteCancel" type="button">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  const input = document.getElementById("quoteComposerInput") as HTMLTextAreaElement;
  const counter = document.getElementById("quoteComposerCounter")!;
  const submitBtn = document.getElementById("quoteSubmit") as HTMLButtonElement;

  function updateCounter() {
    const remaining = QUOTE_MAX - input.value.length;
    counter.textContent = String(remaining);
    counter.classList.toggle("post-composer-counter-over", remaining < 0);
  }
  input.addEventListener("input", updateCounter);
  updateCounter();
  attachMentionAutocomplete(makeMentionEditable(input));

  document.getElementById("quoteCancel")?.addEventListener("click", closeOverlay);

  submitBtn.addEventListener("click", async () => {
    const alertBox = document.getElementById("quoteAlert")!;
    alertBox.innerHTML = "";
    if (input.value.length > QUOTE_MAX) {
      alertBox.innerHTML = `<p>Máximo ${QUOTE_MAX} caracteres.</p>`;
      return;
    }
    submitBtn.disabled = true;
    const { post: created, error } = await createQuote(authorId, post.id, input.value);
    if (error || !created) {
      alertBox.innerHTML = `<p>${escapeHtml(error || "No se pudo citar el Rep.")}</p>`;
      submitBtn.disabled = false;
      return;
    }
    onCreated(created);
    loaderBody.innerHTML = successCheckHtml("¡Listo! Citaste el Rep.");
    setTimeout(closeOverlay, 1400);
  });
}

const SHARE_ICON_WHATSAPP = `<path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5Z"/><path d="M8.3 8.1c.2-.4.4-.4.6-.4h.4c.2 0 .4 0 .5.4.2.4.6 1.4.6 1.5.1.1.1.3 0 .4-.1.2-.2.3-.3.4-.1.2-.3.3-.1.6.2.3.7 1.2 1.6 1.9 1.1.9 1.9 1.2 2.3 1.4.3.1.4.1.6-.1.2-.2.6-.7.8-1 .2-.2.4-.2.6-.1.2.1 1.4.6 1.6.7.3.1.4.2.5.3 0 .2 0 .8-.3 1.5-.3.7-1.5 1.3-2.1 1.4-.6.1-1.3.2-4-1S9 15.3 8 14c-.2-.2-1.6-2-1.6-4 0-.3 0-.8.2-1.2z" fill="currentColor" stroke="none"/>`;
const SHARE_ICON_X = `<path d="M5 5l14 14M19 5L5 19"/>`;
const SHARE_ICON_FACEBOOK = `<circle cx="12" cy="12" r="9"/><path d="M13.5 21v-6.5h2.1l.3-2.6h-2.4V10c0-.8.2-1.3 1.3-1.3H16V6.1c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.1H7.9v2.6H10V21" fill="none"/>`;
const SHARE_ICON_LINK = `<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/>`;

function shareIconSvg(path: string): string {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function buildPostUrl(postId: string): string {
  return `${window.location.origin}/pages/post.html?id=${encodeURIComponent(postId)}`;
}

/** Modal para compartir un Rep: a cualquiera de mis seguidores por chat, o a redes sociales externas. */
export async function openShareToChatModal(post: FeedPost, viewerId: string): Promise<void> {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;

  const postUrl = buildPostUrl(post.id);
  const shareText = `Mirá este Rep de ${post.author.username} en Gym Social`;

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Compartir Rep</h2>
        <p class="subtitle">Enviaselo a un seguidor o compartilo afuera.</p>

        <div class="post-share-external">
          <button type="button" class="post-share-external-btn" data-net="whatsapp" aria-label="Compartir por WhatsApp">${shareIconSvg(SHARE_ICON_WHATSAPP)}</button>
          <button type="button" class="post-share-external-btn" data-net="x" aria-label="Compartir en X">${shareIconSvg(SHARE_ICON_X)}</button>
          <button type="button" class="post-share-external-btn" data-net="facebook" aria-label="Compartir en Facebook">${shareIconSvg(SHARE_ICON_FACEBOOK)}</button>
          <button type="button" class="post-share-external-btn" data-net="copy" aria-label="Copiar link">${shareIconSvg(SHARE_ICON_LINK)}</button>
        </div>
        <p class="post-share-copied" id="postShareCopiedMsg" hidden>¡Link copiado!</p>

        <div class="field">
          <input type="text" id="postShareSearch" placeholder="Buscar entre tus seguidores...">
        </div>
        <div class="post-share-list" id="postShareList"><p class="exc-pick-empty">Cargando...</p></div>
        <div class="alert_message" id="postShareAlert"></div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="postShareCancel" type="button">Cerrar</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("postShareCancel")?.addEventListener("click", closeOverlay);

  loaderBody.querySelectorAll<HTMLButtonElement>(".post-share-external-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const net = btn.dataset.net;
      if (net === "copy") {
        try {
          await navigator.clipboard.writeText(postUrl);
          const msg = document.getElementById("postShareCopiedMsg");
          if (msg) {
            msg.hidden = false;
            setTimeout(() => (msg.hidden = true), 2000);
          }
        } catch {
          // el usuario nego el permiso de portapapeles, no es un error real
        }
        return;
      }
      const intentUrl =
        net === "whatsapp"
          ? `https://wa.me/?text=${encodeURIComponent(`${shareText} ${postUrl}`)}`
          : net === "x"
            ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(postUrl)}`
            : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`;
      window.open(intentUrl, "_blank", "noopener");
    });
  });

  const listEl = document.getElementById("postShareList")!;
  const searchInput = document.getElementById("postShareSearch") as HTMLInputElement;

  function renderFollowers(rows: FollowListRow[]): void {
    listEl.innerHTML = rows.length
      ? rows
          .map(
            (r) => `
    <button type="button" class="post-share-row" data-id="${r.id}">
      <img src="${escapeHtml(r.avatarUrl || "/images/avatars/default.svg")}" class="chat-avatar" alt="">
      <span class="post-share-name">${escapeHtml(r.username)}${renderVerifiedBadge(r.userType, r.isVerified)}</span>
    </button>
  `
          )
          .join("")
      : `<p class="exc-pick-empty">No se encontraron seguidores.</p>`;

    listEl.querySelectorAll<HTMLButtonElement>(".post-share-row").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const rowButtons = listEl.querySelectorAll<HTMLButtonElement>(".post-share-row");
        rowButtons.forEach((b) => (b.disabled = true));
        const alertBox = document.getElementById("postShareAlert")!;
        alertBox.innerHTML = "";

        const { id: conversationId, error: convError } = await getOrCreateConversation(btn.dataset.id!);
        if (convError || !conversationId) {
          alertBox.innerHTML = `<p>${escapeHtml(convError || "No se pudo iniciar la conversación.")}</p>`;
          rowButtons.forEach((b) => (b.disabled = false));
          return;
        }
        const { error } = await sendMessage(conversationId, { sharedPostId: post.id });
        if (error) {
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          rowButtons.forEach((b) => (b.disabled = false));
          return;
        }
        loaderBody!.innerHTML = successCheckHtml("¡Rep enviado!");
        setTimeout(closeOverlay, 1400);
      });
    });
  }

  async function runSearch(search: string): Promise<void> {
    try {
      const rows = await listFollowers(viewerId, search);
      renderFollowers(rows);
    } catch {
      listEl.innerHTML = `<p class="exc-pick-empty">No se pudo cargar tus seguidores.</p>`;
    }
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void runSearch(searchInput.value.trim()), 250);
  });

  await runSearch("");
}

function postViewerRowHtml(v: PostViewer): string {
  return `
    <a class="post-share-row" href="profile.html?u=${encodeURIComponent(v.username)}">
      <img src="${escapeHtml(v.avatarUrl || DEFAULT_AVATAR)}" class="chat-avatar" alt="">
      <span class="post-share-name">${escapeHtml(v.username)}${renderVerifiedBadge(v.userType, v.isVerified)}</span>
      <span class="post-viewer-time">${formatTiempoRelativo(v.viewedAt)}</span>
    </a>
  `;
}

/** Metricas del Rep: cuanta gente lo vio y quienes, en una lista scrolleable con "cargar mas". */
export function openPostMetricsModal(post: FeedPost): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Métricas del Rep</h2>
        <p class="subtitle">${post.views_count} ${post.views_count === 1 ? "persona vio" : "personas vieron"} este Rep.</p>
        <div class="post-share-list" id="postMetricsList"><p class="exc-pick-empty">Cargando...</p></div>
        <button type="button" class="chat-load-more" id="postMetricsLoadMore" hidden>Cargar más</button>
        <div class="modal-actions">
          <button class="btn btn-outline" id="postMetricsClose" type="button">Cerrar</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("postMetricsClose")?.addEventListener("click", closeOverlay);

  const listEl = document.getElementById("postMetricsList")!;
  const loadMoreBtn = document.getElementById("postMetricsLoadMore") as HTMLButtonElement;
  let viewers: PostViewer[] = [];

  function renderViewers(): void {
    listEl.innerHTML = viewers.length ? viewers.map(postViewerRowHtml).join("") : `<p class="exc-pick-empty">Todavía nadie vio este Rep.</p>`;
  }

  getPostViewers(post.id)
    .then((rows) => {
      viewers = rows;
      renderViewers();
      loadMoreBtn.hidden = rows.length < 30;
    })
    .catch(() => {
      listEl.innerHTML = `<p class="exc-pick-empty">No se pudo cargar quién vio este Rep.</p>`;
    });

  loadMoreBtn.addEventListener("click", async () => {
    if (viewers.length === 0) return;
    loadMoreBtn.disabled = true;
    const older = await getPostViewers(post.id, viewers[viewers.length - 1].viewedAt).catch(() => []);
    loadMoreBtn.disabled = false;
    if (older.length === 0) {
      loadMoreBtn.hidden = true;
      return;
    }
    viewers = [...viewers, ...older];
    renderViewers();
    loadMoreBtn.hidden = older.length < 30;
  });
}

/** Confirmacion de borrado, mismo mecanismo que confirmBlockModal/confirmFinishRoutine en profile.ts. */
export function confirmDeletePost(post: FeedPost, onDeleted: () => void): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Eliminar Rep</h2>
        <p class="subtitle">Esta acción no se puede deshacer.</p>
        <div class="modal-actions">
          <button class="btn btn-danger" id="confirmDeletePost" type="button">Eliminar</button>
          <button class="btn btn-outline" id="cancelDeletePost" type="button">Cancelar</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("cancelDeletePost")?.addEventListener("click", closeOverlay);
  document.getElementById("confirmDeletePost")?.addEventListener("click", async () => {
    const btn = document.getElementById("confirmDeletePost") as HTMLButtonElement;
    btn.disabled = true;
    const { error } = await deletePost(post.id);
    if (error) {
      alert(error);
      closeOverlay();
      return;
    }
    closeOverlay();
    onDeleted();
  });
}

function myAvatarUrl(): string {
  const navAvatar = document.getElementById("navMenuAvatar") as HTMLImageElement | null;
  return (navAvatar && navAvatar.src) || DEFAULT_AVATAR;
}

/**
 * Chrome comun del modal de respuesta estilo Twitter: recibe el preview de "lo original" ya
 * armado y quien lo publica. Se monta en su propio <div> directo en <body> (mismo criterio que
 * confirmDialog.ts), NO en #loaderBody: asi puede abrirse arriba del modal de detalle de un Rep
 * (ver postDetail.ts) sin pisarlo -- si compartiera #loaderBody, comentar tendria que cerrar ese
 * modal primero y volver a abrirlo despues, sintiendose como una recarga de la pagina.
 */
function openReplyModal(
  originalHtml: string,
  replyToUsername: string,
  submit: (content: string) => Promise<{ comment?: PostComment; error?: string }>,
  onReplied: (comment: PostComment) => void
): void {
  const overlay = document.createElement("div");
  overlay.className = "success-check-container post-comment-modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card post-comment-modal">
      <div class="post-comment-modal-header">
        <button type="button" class="post-comment-modal-close" id="commentModalClose" aria-label="Cerrar">✕</button>
        <button type="button" class="btn btn-primary btn-sm" id="commentModalSubmit" disabled>Comentar</button>
      </div>

      ${originalHtml}

      <p class="post-comment-modal-replyto">Respondiendo a <span>@${escapeHtml(replyToUsername)}</span></p>

      <div class="post-comment-modal-composer">
        <img class="post-comment-modal-avatar" src="${escapeHtml(myAvatarUrl())}" alt="">
        <textarea id="commentModalInput" class="post-comment-modal-textarea" rows="2" maxlength="${COMMENT_MODAL_MAX}" placeholder="Postea tu respuesta"></textarea>
      </div>
      <div class="post-comment-modal-footer">
        <span class="post-composer-counter" id="commentModalCounter">${COMMENT_MODAL_MAX}</span>
      </div>
      <div class="alert_message" id="commentModalAlert"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  function close(): void {
    overlay.remove();
  }

  overlay.querySelector("#commentModalClose")?.addEventListener("click", close);

  const input = overlay.querySelector("#commentModalInput") as HTMLTextAreaElement;
  const counter = overlay.querySelector("#commentModalCounter")!;
  const submitBtn = overlay.querySelector("#commentModalSubmit") as HTMLButtonElement;

  input.focus();

  function updateState(): void {
    const len = input.value.length;
    counter.textContent = String(COMMENT_MODAL_MAX - len);
    counter.classList.toggle("post-composer-counter-over", len > COMMENT_MODAL_MAX);
    submitBtn.disabled = input.value.trim().length === 0 || len > COMMENT_MODAL_MAX;
  }
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
    updateState();
  });
  updateState();

  submitBtn.addEventListener("click", async () => {
    const alertBox = overlay.querySelector("#commentModalAlert")!;
    alertBox.innerHTML = "";
    const validationError = validateCommentContent(input.value);
    if (validationError) {
      alertBox.innerHTML = `<p>${escapeHtml(validationError)}</p>`;
      return;
    }
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="btn-spinner"></span> Comentando...`;
    const { comment, error } = await submit(input.value);
    if (error || !comment) {
      alertBox.innerHTML = `<p>${escapeHtml(error || "No se pudo comentar.")}</p>`;
      submitBtn.disabled = false;
      submitBtn.textContent = "Comentar";
      return;
    }
    close();
    onReplied(comment);
  });
}

/** Responder un Rep: el Rep original arriba (con linea de hilo) + composer abajo. Ocupa toda la pantalla en mobile. */
export function openCommentModal(post: FeedPost, viewerId: string, onCommented: (comment: PostComment) => void): void {
  const originalMedia = post.media_url
    ? post.media_type === "video"
      ? `<video class="post-comment-modal-media" src="${escapeHtml(post.media_url)}" muted playsinline></video>`
      : `<img class="post-comment-modal-media" src="${escapeHtml(post.media_url)}" alt="">`
    : "";

  const originalHtml = `
    <div class="post-comment-modal-original">
      <div class="post-comment-modal-col">
        <img class="post-comment-modal-avatar" src="${escapeHtml(post.author.avatarUrl || DEFAULT_AVATAR)}" alt="">
        <span class="post-comment-modal-line"></span>
      </div>
      <div class="post-comment-modal-original-body">
        <div class="post-comment-modal-head">
          <span class="post-comment-modal-name">${escapeHtml(post.author.username)}${renderVerifiedBadge(post.author.userType, post.author.isVerified, 13)}</span>
          <span class="post-comment-modal-dot">·</span>
          <span class="post-comment-modal-time">${formatTiempoRelativo(post.feedTimestamp)}</span>
        </div>
        ${post.content ? `<p class="post-comment-modal-text">${escapeHtml(post.content).replace(/\n/g, "<br>")}</p>` : ""}
        ${originalMedia}
      </div>
    </div>
  `;

  openReplyModal(originalHtml, post.author.username, (content) => addComment(post.id, viewerId, content), onCommented);
}

/** Responder un comentario puntual (crea un hilo de comentarios via parent_comment_id). */
export function openCommentReplyModal(comment: FeedComment, viewerId: string, onReplied: (comment: PostComment) => void): void {
  const originalHtml = `
    <div class="post-comment-modal-original">
      <div class="post-comment-modal-col">
        <img class="post-comment-modal-avatar" src="${escapeHtml(comment.author.avatarUrl || DEFAULT_AVATAR)}" alt="">
        <span class="post-comment-modal-line"></span>
      </div>
      <div class="post-comment-modal-original-body">
        <div class="post-comment-modal-head">
          <span class="post-comment-modal-name">${escapeHtml(comment.author.username)}${renderVerifiedBadge(comment.author.userType, comment.author.isVerified, 13)}</span>
          <span class="post-comment-modal-dot">·</span>
          <span class="post-comment-modal-time">${formatTiempoRelativo(comment.created_at)}</span>
        </div>
        <p class="post-comment-modal-text">${escapeHtml(comment.content).replace(/\n/g, "<br>")}</p>
      </div>
    </div>
  `;

  openReplyModal(originalHtml, comment.author.username, (content) => addComment(comment.post_id, viewerId, content, comment.id), onReplied);
}
