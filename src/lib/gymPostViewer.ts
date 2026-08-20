import { escapeHtml } from "./dom";
import { renderVerifiedBadge } from "./verifiedBadge";
import { formatTiempoRelativo } from "./dias";
import { ICON_COMMENT, ICON_HEART, ICON_HEART_FILLED, ICON_SHARE, ICON_TRASH } from "./postCard";
import type { PostAuthor } from "../services/post.service";
import { listFollowers, listFollowing, type FollowListRow } from "../services/follow.service";
import { getOrCreateConversation, sendMessage, listConversations, type ConversationSummary } from "../services/chat.service";
import {
  listGymPostComments,
  addGymPostComment,
  validateGymPostComment,
  toggleGymPostLike,
  setGymPostPinned,
  deleteGymPost,
  updateGymPost,
  type GymPostFull,
  type GymPostMedia,
  type GymPostVisibility,
  type GymPostCommentRow,
} from "../services/gymPost.service";

const DEFAULT_AVATAR = "/images/avatars/default.svg";
const DESKTOP_QUERY = "(min-width: 900px)";

function closeOverlay(): void {
  const loaderBody = document.getElementById("loaderBody");
  if (loaderBody) loaderBody.innerHTML = "";
}

// Mismo truco que postModals.ts: leer el avatar ya pintado en el header en vez de pedirlo de nuevo.
function myAvatarUrl(): string {
  const navAvatar = document.getElementById("navMenuAvatar") as HTMLImageElement | null;
  return (navAvatar && navAvatar.src) || DEFAULT_AVATAR;
}

export function buildGymPostUrl(gymUsername: string, postId: string): string {
  return `${window.location.origin}/pages/profile.html?u=${encodeURIComponent(gymUsername)}&post=${encodeURIComponent(postId)}`;
}

// ---------- Media: una sola foto/video, o un carrusel horizontal con scroll-snap nativo ----------

function singleMediaHtml(m: GymPostMedia): string {
  return m.type === "video"
    ? `<video class="gym-post-viewer-media" src="${escapeHtml(m.url)}" controls playsinline></video>`
    : `<img class="gym-post-viewer-media" src="${escapeHtml(m.url)}" alt="">`;
}

function mediaCarouselHtml(media: GymPostMedia[], idPrefix: string): string {
  if (media.length <= 1) {
    return `<div class="gym-post-viewer-media-wrap">${media[0] ? singleMediaHtml(media[0]) : ""}</div>`;
  }
  return `
    <div class="gym-post-viewer-media-wrap">
      <div class="gym-post-viewer-carousel-track" id="${idPrefix}Track">
        ${media.map((m) => `<div class="gym-post-viewer-carousel-item">${singleMediaHtml(m)}</div>`).join("")}
      </div>
      <div class="gym-post-viewer-dots" id="${idPrefix}Dots">
        ${media.map((_, i) => `<span class="gym-post-viewer-dot${i === 0 ? " active" : ""}" data-i="${i}"></span>`).join("")}
      </div>
    </div>
  `;
}

function wireCarousel(root: ParentNode, idPrefix: string): void {
  const track = root.querySelector<HTMLElement>(`#${idPrefix}Track`);
  const dots = root.querySelectorAll<HTMLElement>(`#${idPrefix}Dots .gym-post-viewer-dot`);
  if (!track || dots.length === 0) return;
  track.addEventListener(
    "scroll",
    () => {
      const i = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
      dots.forEach((d, di) => d.classList.toggle("active", di === i));
    },
    { passive: true }
  );
  dots.forEach((dot, i) => {
    dot.addEventListener("click", () => track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" }));
  });
}

// ---------- Comentarios (planos) ----------

function commentRowHtml(c: GymPostCommentRow): string {
  return `
    <div class="gym-post-comment-row">
      <img class="gym-post-comment-avatar" src="${escapeHtml(c.author.avatarUrl || DEFAULT_AVATAR)}" alt="">
      <div class="gym-post-comment-body">
        <p><span class="gym-post-comment-author">${escapeHtml(c.author.username)}${renderVerifiedBadge(c.author.userType, c.author.isVerified, 12)}</span> ${escapeHtml(c.content)}</p>
        <span class="gym-post-comment-time">${formatTiempoRelativo(c.createdAt)}</span>
      </div>
    </div>
  `;
}

function captionRowHtml(post: GymPostFull, author: PostAuthor): string {
  if (!post.content) return "";
  return `
    <div class="gym-post-comment-row">
      <img class="gym-post-comment-avatar" src="${escapeHtml(author.avatarUrl || DEFAULT_AVATAR)}" alt="">
      <div class="gym-post-comment-body">
        <p><span class="gym-post-comment-author">${escapeHtml(author.username)}${renderVerifiedBadge(author.userType, author.isVerified, 12)}</span> ${escapeHtml(post.content)}</p>
        <span class="gym-post-comment-time">${formatTiempoRelativo(post.createdAt)}</span>
      </div>
    </div>
  `;
}

// ---------- Editar / Eliminar (cierran el visor y abren su propio modal, mismo criterio que Reps) ----------

function openEditGymPostModal(post: GymPostFull, onSaved: () => void): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card modal-card-lg">
        <h2>Editar publicación</h2>
        <form id="gymPostEditForm">
          <div class="field"><label for="gymPostEditContent">Descripción</label><textarea id="gymPostEditContent" rows="3" maxlength="1000">${post.content ? escapeHtml(post.content) : ""}</textarea></div>
          <div class="field"><label for="gymPostEditLocation">Ubicación (opcional)</label><input type="text" id="gymPostEditLocation" maxlength="120" value="${post.location ? escapeHtml(post.location) : ""}"></div>
          <div class="field"><label for="gymPostEditVisibility">Quién puede verla</label>
            <select id="gymPostEditVisibility">
              <option value="public" ${post.visibility === "public" ? "selected" : ""}>Pública</option>
              <option value="socios" ${post.visibility === "socios" ? "selected" : ""}>Solo socios</option>
              <option value="entrenadores" ${post.visibility === "entrenadores" ? "selected" : ""}>Solo entrenadores</option>
            </select>
          </div>
          <div class="alert_message" id="gymPostEditAlert"></div>
          <div class="modal-actions">
            <button class="btn btn-primary" id="gymPostEditSubmit" type="submit">Guardar cambios</button>
            <button class="btn btn-outline" id="gymPostEditCancel" type="button">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.getElementById("gymPostEditCancel")?.addEventListener("click", closeOverlay);
  document.getElementById("gymPostEditForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("gymPostEditSubmit") as HTMLButtonElement;
    submitBtn.disabled = true;
    const { error } = await updateGymPost(post.id, {
      content: (document.getElementById("gymPostEditContent") as HTMLTextAreaElement).value,
      location: (document.getElementById("gymPostEditLocation") as HTMLInputElement).value,
      visibility: (document.getElementById("gymPostEditVisibility") as HTMLSelectElement).value as GymPostVisibility,
    });
    if (error) {
      document.getElementById("gymPostEditAlert")!.innerHTML = `<p>${escapeHtml(error)}</p>`;
      submitBtn.disabled = false;
      return;
    }
    closeOverlay();
    onSaved();
  });
}

function confirmDeleteGymPost(postId: string, onDeleted: () => void): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Eliminar publicación</h2>
        <p class="subtitle">Esta acción no se puede deshacer. Si la publicaste también como Rep, ese Rep no se borra.</p>
        <div class="modal-actions">
          <button class="btn btn-danger" id="confirmDeleteGymPost" type="button">Eliminar</button>
          <button class="btn btn-outline" id="cancelDeleteGymPost" type="button">Volver</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("cancelDeleteGymPost")?.addEventListener("click", closeOverlay);
  document.getElementById("confirmDeleteGymPost")?.addEventListener("click", async () => {
    const btn = document.getElementById("confirmDeleteGymPost") as HTMLButtonElement;
    btn.disabled = true;
    const { error } = await deleteGymPost(postId);
    if (error) {
      alert(error);
      closeOverlay();
      return;
    }
    closeOverlay();
    onDeleted();
  });
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

/** Fusiona seguidores + seguidos (sin duplicar) -- "algún seguidor/seguido", no solo seguidores como el share de Reps. */
async function loadShareContacts(viewerId: string, search: string): Promise<FollowListRow[]> {
  const [followers, following] = await Promise.all([listFollowers(viewerId, search), listFollowing(viewerId, search)]);
  const byId = new Map<string, FollowListRow>();
  [...followers, ...following].forEach((r) => byId.set(r.id, r));
  return [...byId.values()];
}

function openShareGymPostModal(gymUsername: string, postId: string, gymDisplayName: string, viewerId: string | null): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  const url = buildGymPostUrl(gymUsername, postId);
  const shareText = `Mirá esta publicación de ${gymDisplayName} en Gym Social`;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Compartir publicación</h2>
        <div class="post-share-external">
          <button type="button" class="post-share-external-btn" data-net="whatsapp" aria-label="Compartir por WhatsApp"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5Z"/><path d="M8.3 8.1c.2-.4.4-.4.6-.4h.4c.2 0 .4 0 .5.4.2.4.6 1.4.6 1.5.1.1.1.3 0 .4-.1.2-.2.3-.3.4-.1.2-.3.3-.1.6.2.3.7 1.2 1.6 1.9 1.1.9 1.9 1.2 2.3 1.4.3.1.4.1.6-.1.2-.2.6-.7.8-1 .2-.2.4-.2.6-.1.2.1 1.4.6 1.6.7.3.1.4.2.5.3 0 .2 0 .8-.3 1.5-.3.7-1.5 1.3-2.1 1.4-.6.1-1.3.2-4-1S9 15.3 8 14c-.2-.2-1.6-2-1.6-4 0-.3 0-.8.2-1.2z" fill="currentColor" stroke="none"/></svg></button>
          <button type="button" class="post-share-external-btn" data-net="x" aria-label="Compartir en X"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l14 14M19 5L5 19"/></svg></button>
          <button type="button" class="post-share-external-btn" data-net="facebook" aria-label="Compartir en Facebook"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M13.5 21v-6.5h2.1l.3-2.6h-2.4V10c0-.8.2-1.3 1.3-1.3H16V6.1c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.1H7.9v2.6H10V21" fill="none"/></svg></button>
          <button type="button" class="post-share-external-btn" data-net="copy" aria-label="Copiar link"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg></button>
        </div>
        <p class="post-share-copied" id="gymPostShareCopiedMsg" hidden>¡Link copiado!</p>
        ${
          viewerId
            ? `
        <p class="subtitle">Enviásela a un seguidor, seguido o grupo.</p>
        <div class="routine-tabs" id="gymPostShareTabs">
          <button type="button" class="routine-tab active" data-tab="people">Personas</button>
          <button type="button" class="routine-tab" data-tab="groups">Grupos</button>
        </div>
        <div class="field"><input type="text" id="gymPostShareSearch" placeholder="Buscar..."></div>
        <div class="post-share-list" id="gymPostShareList"><p class="exc-pick-empty">Cargando...</p></div>
        `
            : ""
        }
        <div class="alert_message" id="gymPostShareAlert"></div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="gymPostShareClose" type="button">Cerrar</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("gymPostShareClose")?.addEventListener("click", closeOverlay);
  loaderBody.querySelectorAll<HTMLButtonElement>(".post-share-external-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const net = btn.dataset.net;
      if (net === "copy") {
        try {
          await navigator.clipboard.writeText(url);
          const msg = document.getElementById("gymPostShareCopiedMsg");
          if (msg) {
            msg.hidden = false;
            setTimeout(() => (msg.hidden = true), 2000);
          }
        } catch {
          // permiso de portapapeles negado, no es un error real
        }
        return;
      }
      const intentUrl =
        net === "whatsapp"
          ? `https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`
          : net === "x"
            ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`
            : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
      window.open(intentUrl, "_blank", "noopener");
    });
  });

  if (!viewerId) return;

  let activeShareTab: "people" | "groups" = "people";
  const listEl = document.getElementById("gymPostShareList")!;
  const searchInput = document.getElementById("gymPostShareSearch") as HTMLInputElement;

  async function sendTo(getConversationId: () => Promise<{ id?: string; error?: string }>, rowButtons: NodeListOf<HTMLButtonElement>): Promise<void> {
    rowButtons.forEach((b) => (b.disabled = true));
    const alertBox = document.getElementById("gymPostShareAlert")!;
    alertBox.innerHTML = "";
    const { id: conversationId, error: convError } = await getConversationId();
    if (convError || !conversationId) {
      alertBox.innerHTML = `<p>${escapeHtml(convError || "No se pudo abrir la conversación.")}</p>`;
      rowButtons.forEach((b) => (b.disabled = false));
      return;
    }
    const { error } = await sendMessage(conversationId, { sharedGymPostId: postId });
    if (error) {
      alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
      rowButtons.forEach((b) => (b.disabled = false));
      return;
    }
    loaderBody!.innerHTML = successCheckHtml("¡Publicación enviada!");
    setTimeout(closeOverlay, 1400);
  }

  function renderPeople(rows: FollowListRow[]): void {
    listEl.innerHTML = rows.length
      ? rows
          .map(
            (r) => `
      <button type="button" class="post-share-row" data-id="${r.id}">
        <img src="${escapeHtml(r.avatarUrl || DEFAULT_AVATAR)}" class="chat-avatar" alt="">
        <span class="post-share-name">${escapeHtml(r.username)}${renderVerifiedBadge(r.userType, r.isVerified)}</span>
      </button>
    `
          )
          .join("")
      : `<p class="exc-pick-empty">No se encontraron seguidores ni seguidos.</p>`;
    listEl.querySelectorAll<HTMLButtonElement>(".post-share-row").forEach((btn) => {
      btn.addEventListener("click", () => void sendTo(() => getOrCreateConversation(btn.dataset.id!), listEl.querySelectorAll<HTMLButtonElement>(".post-share-row")));
    });
  }

  function renderGroups(groups: ConversationSummary[]): void {
    listEl.innerHTML = groups.length
      ? groups
          .map(
            (g) => `
      <button type="button" class="post-share-row" data-conv-id="${g.conversation_id}">
        <img src="${escapeHtml(g.group_avatar_url || DEFAULT_AVATAR)}" class="chat-avatar" alt="">
        <span class="post-share-name">${escapeHtml(g.group_name || "Grupo")}</span>
      </button>
    `
          )
          .join("")
      : `<p class="exc-pick-empty">No formás parte de ningún grupo.</p>`;
    listEl.querySelectorAll<HTMLButtonElement>(".post-share-row").forEach((btn) => {
      btn.addEventListener("click", () => void sendTo(() => Promise.resolve({ id: btn.dataset.convId }), listEl.querySelectorAll<HTMLButtonElement>(".post-share-row")));
    });
  }

  async function runShareSearch(search: string): Promise<void> {
    try {
      if (activeShareTab === "people") renderPeople(await loadShareContacts(viewerId!, search));
      else {
        const conversations = await listConversations();
        const needle = search.trim().toLowerCase();
        renderGroups(conversations.filter((c) => c.kind === "group" && (!needle || (c.group_name ?? "").toLowerCase().includes(needle))));
      }
    } catch {
      listEl.innerHTML = `<p class="exc-pick-empty">No se pudo cargar la lista.</p>`;
    }
  }

  document.querySelectorAll<HTMLButtonElement>("#gymPostShareTabs .routine-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeShareTab = btn.dataset.tab as "people" | "groups";
      document.querySelectorAll<HTMLButtonElement>("#gymPostShareTabs .routine-tab").forEach((b) => b.classList.toggle("active", b === btn));
      listEl.innerHTML = `<p class="exc-pick-empty">Cargando...</p>`;
      void runShareSearch(searchInput.value.trim());
    });
  });

  let shareDebounce: ReturnType<typeof setTimeout> | undefined;
  searchInput.addEventListener("input", () => {
    clearTimeout(shareDebounce);
    shareDebounce = setTimeout(() => void runShareSearch(searchInput.value.trim()), 250);
  });

  void runShareSearch("");
}

// ---------- Visor principal ----------

export interface GymPostViewerOptions {
  posts: GymPostFull[];
  startIndex: number;
  author: PostAuthor;
  viewerId: string | null;
  isOwner: boolean;
  /** Se llama al pinear/editar/eliminar: el caller re-pide la lista y repinta la grilla. */
  onChanged: () => void;
}

/**
 * Visor de una publicación de gimnasio (estilo Instagram): en desktop, panel fijo con el media
 * a la izquierda y descripcion/comentarios a la derecha, con flechas afuera del modal para pasar
 * entre publicaciones. En mobile, pantalla completa por publicacion en una lista con scroll-snap
 * vertical (deslizar mueve de una publicacion a otra con naturalidad, sin fisica custom) y un
 * boton ✕ fijo para salir. Editar/Fijar/Eliminar cierran el visor y abren su propio modal (mismo
 * criterio que el visor de Reps), y al terminar avisan via onChanged para que la grilla se repinte.
 */
export function openGymPostViewer(options: GymPostViewerOptions): void {
  const { author, viewerId, isOwner, onChanged } = options;
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody || options.posts.length === 0) return;

  const posts = options.posts;
  let index = Math.max(Math.min(options.startIndex, posts.length - 1), 0);
  const isDesktop = window.matchMedia(DESKTOP_QUERY).matches;

  const commentsCache = new Map<string, GymPostCommentRow[]>();
  async function getComments(postId: string): Promise<GymPostCommentRow[]> {
    if (!commentsCache.has(postId)) {
      commentsCache.set(postId, await listGymPostComments(postId).catch(() => []));
    }
    return commentsCache.get(postId)!;
  }

  async function handleLike(post: GymPostFull, refresh: () => void): Promise<void> {
    if (!viewerId) return;
    const was = post.likedByMe;
    post.likedByMe = !was;
    post.likesCount += was ? -1 : 1;
    refresh();
    const { error } = await toggleGymPostLike(post.id, viewerId, was);
    if (error) {
      post.likedByMe = was;
      post.likesCount += was ? 1 : -1;
      refresh();
    }
  }

  async function handleComment(post: GymPostFull, input: HTMLTextAreaElement, refresh: () => void): Promise<void> {
    if (!viewerId) return;
    const validationError = validateGymPostComment(input.value);
    if (validationError) {
      alert(validationError);
      return;
    }
    const { comment, error } = await addGymPostComment(post.id, viewerId, input.value);
    if (error || !comment) {
      alert(error || "No se pudo comentar.");
      return;
    }
    commentsCache.set(post.id, [...(commentsCache.get(post.id) ?? []), comment]);
    post.commentsCount += 1;
    input.value = "";
    refresh();
  }

  function togglePinAndClose(post: GymPostFull): void {
    closeOverlay();
    void setGymPostPinned(post.id, !post.pinned).then(({ error }) => {
      if (error) alert(error);
      onChanged();
    });
  }

  if (isDesktop) {
    renderDesktop();
    // Un solo listener para toda la vida del visor -- renderDesktop() se vuelve a llamar en
    // cada navegacion (prev/next/like/comentario), y si se re-agregara aca adentro cada vez
    // quedarian varios apilados sobre document (cada flecha dispararia el handler N veces).
    document.addEventListener("keydown", onKeydownDesktop);
  } else {
    renderMobile();
  }

  // -------------------- Desktop: panel fijo, flechas afuera para pasar de publicacion --------------------
  function renderDesktop(): void {
    const post = posts[index];
    loaderBody!.innerHTML = `
      <div class="gym-post-viewer-desktop" id="gymPostViewerDesktop">
        <button type="button" class="gym-post-viewer-close" id="gymPostViewerClose" aria-label="Cerrar">✕</button>
        <button type="button" class="gym-post-viewer-nav gym-post-viewer-nav-prev" id="gymPostViewerPrev" aria-label="Publicación anterior" ${index === 0 ? "disabled" : ""}>‹</button>
        <button type="button" class="gym-post-viewer-nav gym-post-viewer-nav-next" id="gymPostViewerNext" aria-label="Publicación siguiente" ${index === posts.length - 1 ? "disabled" : ""}>›</button>

        <div class="gym-post-viewer-card">
          <div class="gym-post-viewer-media-col">${mediaCarouselHtml(post.media, "gymPostViewer")}</div>
          <div class="gym-post-viewer-side-col">
            <div class="gym-post-viewer-header">
              <img class="gym-post-comment-avatar" src="${escapeHtml(author.avatarUrl || DEFAULT_AVATAR)}" alt="">
              <div class="gym-post-viewer-header-text">
                <span class="gym-post-comment-author">${escapeHtml(author.username)}${renderVerifiedBadge(author.userType, author.isVerified, 13)}</span>
                ${post.location ? `<span class="gym-post-viewer-location">${escapeHtml(post.location)}</span>` : ""}
              </div>
              ${isOwner ? `<div class="profile-menu-wrap" id="gymPostViewerMenuWrap"><button type="button" class="profile-menu-btn" id="gymPostViewerMenuBtn" aria-label="Más opciones"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button><div class="profile-menu-panel" id="gymPostViewerMenuPanel" hidden></div></div>` : ""}
            </div>
            <div class="gym-post-viewer-comments" id="gymPostViewerComments"><p class="exc-pick-empty">Cargando comentarios...</p></div>
            <div class="gym-post-viewer-actions">
              <button type="button" class="post-action post-action-like${post.likedByMe ? " is-active" : ""}" id="gymPostViewerLike" aria-label="Me gusta">${post.likedByMe ? ICON_HEART_FILLED : ICON_HEART}</button>
              <button type="button" class="post-action" id="gymPostViewerCommentFocus" aria-label="Comentar">${ICON_COMMENT}</button>
              <button type="button" class="post-action" id="gymPostViewerShare" aria-label="Compartir">${ICON_SHARE}</button>
            </div>
            <p class="gym-post-viewer-likes-count" id="gymPostViewerLikesCount">${post.likesCount} me gusta</p>
            ${
              viewerId
                ? `<div class="gym-post-viewer-composer">
                    <div class="post-comment-modal-composer">
                      <img class="post-comment-modal-avatar" src="${escapeHtml(myAvatarUrl())}" alt="">
                      <textarea id="gymPostViewerCommentInput" class="post-comment-modal-textarea" rows="1" maxlength="500" placeholder="Agregá un comentario..."></textarea>
                    </div>
                    <div class="post-comment-modal-footer">
                      <button type="button" class="btn btn-primary btn-sm" id="gymPostViewerCommentSubmit">Publicar</button>
                    </div>
                  </div>`
                : ""
            }
          </div>
        </div>
      </div>
    `;

    const root = document.getElementById("gymPostViewerDesktop")!;
    wireCarousel(root, "gymPostViewer");

    document.getElementById("gymPostViewerClose")?.addEventListener("click", closeDesktop);
    root.addEventListener("click", (e) => {
      if (e.target === root) closeDesktop();
    });

    document.getElementById("gymPostViewerPrev")?.addEventListener("click", () => {
      if (index > 0) {
        index -= 1;
        renderDesktop();
      }
    });
    document.getElementById("gymPostViewerNext")?.addEventListener("click", () => {
      if (index < posts.length - 1) {
        index += 1;
        renderDesktop();
      }
    });

    document.getElementById("gymPostViewerLike")?.addEventListener("click", () => void handleLike(post, () => renderDesktop()));
    document.getElementById("gymPostViewerCommentFocus")?.addEventListener("click", () => {
      document.getElementById("gymPostViewerCommentInput")?.focus();
    });
    document.getElementById("gymPostViewerShare")?.addEventListener("click", () => {
      document.removeEventListener("keydown", onKeydownDesktop);
      openShareGymPostModal(author.username, post.id, author.username, viewerId);
    });
    document.getElementById("gymPostViewerCommentSubmit")?.addEventListener("click", () => {
      const input = document.getElementById("gymPostViewerCommentInput") as HTMLTextAreaElement;
      void handleComment(post, input, () => renderDesktop());
    });

    if (isOwner) {
      const menuBtn = document.getElementById("gymPostViewerMenuBtn");
      const menuPanel = document.getElementById("gymPostViewerMenuPanel");
      menuBtn?.addEventListener("click", () => {
        if (!menuPanel) return;
        menuPanel.hidden = !menuPanel.hidden;
      });
      if (menuPanel) {
        menuPanel.innerHTML = `
          <button type="button" class="profile-menu-item" id="gymPostViewerEdit">Editar</button>
          <button type="button" class="profile-menu-item" id="gymPostViewerPin">${post.pinned ? "Desfijar" : "Fijar"}</button>
          <button type="button" class="profile-menu-item profile-menu-item-danger" id="gymPostViewerDelete">${ICON_TRASH}Eliminar</button>
        `;
        document.getElementById("gymPostViewerEdit")?.addEventListener("click", () => {
          document.removeEventListener("keydown", onKeydownDesktop);
          openEditGymPostModal(post, onChanged);
        });
        document.getElementById("gymPostViewerPin")?.addEventListener("click", () => {
          document.removeEventListener("keydown", onKeydownDesktop);
          togglePinAndClose(post);
        });
        document.getElementById("gymPostViewerDelete")?.addEventListener("click", () => {
          document.removeEventListener("keydown", onKeydownDesktop);
          confirmDeleteGymPost(post.id, onChanged);
        });
      }
    }

    const commentsEl = document.getElementById("gymPostViewerComments")!;
    void getComments(post.id).then((comments) => {
      commentsEl.innerHTML = captionRowHtml(post, author) + comments.map(commentRowHtml).join("");
    });
  }

  function closeDesktop(): void {
    document.removeEventListener("keydown", onKeydownDesktop);
    closeOverlay();
  }

  function onKeydownDesktop(e: KeyboardEvent): void {
    if (e.key === "Escape") closeDesktop();
    else if (e.key === "ArrowLeft" && index > 0) {
      index -= 1;
      renderDesktop();
    } else if (e.key === "ArrowRight" && index < posts.length - 1) {
      index += 1;
      renderDesktop();
    }
  }

  // -------------------- Mobile: pagina de publicacion tipo Instagram (header/media/acciones/
  // caption/"ver comentarios"), apiladas en una lista con scroll-snap vertical para deslizar
  // entre publicaciones. Los comentarios viven en UNA sola hoja compartida (fixed al visor, no
  // anidada dentro de cada seccion) para no depender de la altura variable de cada publicacion.
  function renderMobile(): void {
    loaderBody!.innerHTML = `
      <div class="gym-post-viewer-mobile" id="gymPostViewerMobile">
        <button type="button" class="gym-post-viewer-close gym-post-viewer-close-mobile" id="gymPostViewerMobileClose" aria-label="Cerrar">✕</button>
        <div class="gym-post-viewer-mobile-scroller" id="gymPostViewerMobileScroller">
          ${posts.map((p, i) => mobileSectionHtml(p, i)).join("")}
        </div>
        <div class="gym-post-comments-sheet-backdrop" id="gymPostMobileCommentsBackdrop" hidden></div>
        <div class="gym-post-comments-sheet" id="gymPostMobileCommentsSheet" hidden>
          <div class="gym-post-comments-sheet-head">
            <h3>Comentarios</h3>
            <button type="button" class="gym-post-comments-sheet-close" id="gymPostMobileCommentsClose" aria-label="Cerrar">✕</button>
          </div>
          <div class="gym-post-comments-sheet-list" id="gymPostMobileCommentsList"></div>
          ${
            viewerId
              ? `<div class="gym-post-viewer-composer">
                  <div class="post-comment-modal-composer">
                    <img class="post-comment-modal-avatar" src="${escapeHtml(myAvatarUrl())}" alt="">
                    <textarea id="gymPostMobileCommentInput" class="post-comment-modal-textarea" rows="1" maxlength="500" placeholder="Agregá un comentario..."></textarea>
                  </div>
                  <div class="post-comment-modal-footer">
                    <button type="button" class="btn btn-primary btn-sm" id="gymPostMobileCommentSubmit">Publicar</button>
                  </div>
                </div>`
              : ""
          }
        </div>
      </div>
    `;

    document.getElementById("gymPostViewerMobileClose")?.addEventListener("click", closeOverlay);

    const scroller = document.getElementById("gymPostViewerMobileScroller")!;
    const backdrop = document.getElementById("gymPostMobileCommentsBackdrop")!;
    const sheet = document.getElementById("gymPostMobileCommentsSheet")!;
    const commentsList = document.getElementById("gymPostMobileCommentsList")!;
    let openPostId: string | null = null;

    function updateCommentsLabel(post: GymPostFull): void {
      const label = scroller.querySelector<HTMLElement>(`[data-post-id="${post.id}"] [data-comments-label]`);
      if (!label) return;
      label.hidden = post.commentsCount === 0;
      label.textContent = post.commentsCount === 1 ? "Ver 1 comentario" : `Ver los ${post.commentsCount} comentarios`;
    }

    function closeCommentsSheet(): void {
      sheet.hidden = true;
      backdrop.hidden = true;
      openPostId = null;
    }

    function paintComments(post: GymPostFull, comments: GymPostCommentRow[]): void {
      commentsList.innerHTML = comments.length || post.content ? captionRowHtml(post, author) + comments.map(commentRowHtml).join("") : `<p class="exc-pick-empty">Sé el primero en comentar.</p>`;
    }

    function openCommentsSheet(post: GymPostFull): void {
      openPostId = post.id;
      sheet.hidden = false;
      backdrop.hidden = false;
      commentsList.innerHTML = `<p class="exc-pick-empty">Cargando comentarios...</p>`;
      void getComments(post.id)
        .then((comments) => {
          if (openPostId === post.id) paintComments(post, comments);
        })
        .catch(() => {
          if (openPostId === post.id) commentsList.innerHTML = `<p class="exc-pick-empty">No se pudieron cargar los comentarios.</p>`;
        });
    }

    backdrop.addEventListener("click", closeCommentsSheet);
    document.getElementById("gymPostMobileCommentsClose")?.addEventListener("click", closeCommentsSheet);
    document.getElementById("gymPostMobileCommentSubmit")?.addEventListener("click", () => {
      const post = posts.find((p) => p.id === openPostId);
      const input = document.getElementById("gymPostMobileCommentInput") as HTMLTextAreaElement | null;
      if (!post || !input) return;
      void handleComment(post, input, () => {
        updateCommentsLabel(post);
        void getComments(post.id).then((comments) => paintComments(post, comments));
      });
    });

    posts.forEach((post, i) => {
      const section = scroller.querySelector<HTMLElement>(`[data-post-id="${post.id}"]`);
      if (!section) return;
      wireCarousel(section, `gymPostViewerM${i}`);
      wireMobileSection(section, post);
    });

    function wireMobileSection(section: HTMLElement, post: GymPostFull): void {
      function refreshActions(): void {
        const likeBtn = section.querySelector<HTMLElement>('[data-action="like"]');
        if (likeBtn) {
          likeBtn.classList.toggle("is-active", post.likedByMe);
          likeBtn.innerHTML = post.likedByMe ? ICON_HEART_FILLED : ICON_HEART;
        }
        const likesCountEl = section.querySelector<HTMLElement>("[data-likes-count]");
        if (likesCountEl) likesCountEl.textContent = post.likesCount === 1 ? "1 me gusta" : `${post.likesCount} me gusta`;
      }

      section.querySelector('[data-action="like"]')?.addEventListener("click", () => void handleLike(post, refreshActions));
      section.querySelectorAll('[data-action="comments"]').forEach((btn) => btn.addEventListener("click", () => openCommentsSheet(post)));
      section.querySelector('[data-action="share"]')?.addEventListener("click", () => openShareGymPostModal(author.username, post.id, author.username, viewerId));

      if (isOwner) {
        const menuBtn = section.querySelector<HTMLElement>('[data-action="menu"]');
        const menuPanel = section.querySelector<HTMLElement>(".profile-menu-panel");
        menuBtn?.addEventListener("click", () => {
          if (menuPanel) menuPanel.hidden = !menuPanel.hidden;
        });
        if (menuPanel) {
          menuPanel.innerHTML = `
            <button type="button" class="profile-menu-item" data-action="edit">Editar</button>
            <button type="button" class="profile-menu-item" data-action="pin">${post.pinned ? "Desfijar" : "Fijar"}</button>
            <button type="button" class="profile-menu-item profile-menu-item-danger" data-action="delete">${ICON_TRASH}Eliminar</button>
          `;
          menuPanel.querySelector('[data-action="edit"]')?.addEventListener("click", () => openEditGymPostModal(post, onChanged));
          menuPanel.querySelector('[data-action="pin"]')?.addEventListener("click", () => togglePinAndClose(post));
          menuPanel.querySelector('[data-action="delete"]')?.addEventListener("click", () => confirmDeleteGymPost(post.id, onChanged));
        }
      }
    }

    // Arranca en la publicacion tocada en la grilla, sin animacion.
    const startSection = scroller.querySelector<HTMLElement>(`[data-post-id="${posts[index].id}"]`);
    startSection?.scrollIntoView({ block: "start" });
  }

  function mobileSectionHtml(post: GymPostFull, i: number): string {
    const likesLabel = post.likesCount === 1 ? "1 me gusta" : `${post.likesCount} me gusta`;
    const commentsLabel = post.commentsCount === 1 ? "Ver 1 comentario" : `Ver los ${post.commentsCount} comentarios`;
    return `
      <section class="gym-post-viewer-mobile-section" data-post-id="${post.id}">
        <div class="gym-post-viewer-mobile-header">
          <img class="gym-post-comment-avatar" src="${escapeHtml(author.avatarUrl || DEFAULT_AVATAR)}" alt="">
          <div class="gym-post-viewer-mobile-header-text">
            <span class="gym-post-comment-author">${escapeHtml(author.username)}${renderVerifiedBadge(author.userType, author.isVerified, 13)}</span>
            ${post.location ? `<span class="gym-post-viewer-location">${escapeHtml(post.location)}</span>` : ""}
          </div>
          ${
            isOwner
              ? `<div class="profile-menu-wrap">
                  <button type="button" class="profile-menu-btn" data-action="menu" aria-label="Más opciones">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                  </button>
                  <div class="profile-menu-panel" hidden></div>
                </div>`
              : ""
          }
        </div>
        ${mediaCarouselHtml(post.media, `gymPostViewerM${i}`)}
        <div class="gym-post-viewer-mobile-actions">
          <button type="button" class="post-action post-action-like${post.likedByMe ? " is-active" : ""}" data-action="like" aria-label="Me gusta">${post.likedByMe ? ICON_HEART_FILLED : ICON_HEART}</button>
          <button type="button" class="post-action" data-action="comments" aria-label="Comentarios">${ICON_COMMENT}</button>
          <button type="button" class="post-action" data-action="share" aria-label="Compartir">${ICON_SHARE}</button>
        </div>
        <p class="gym-post-viewer-mobile-likes" data-likes-count>${likesLabel}</p>
        ${post.content ? `<p class="gym-post-viewer-mobile-caption-row"><span class="gym-post-comment-author">${escapeHtml(author.username)}</span> ${escapeHtml(post.content)}</p>` : ""}
        <button type="button" class="gym-post-viewer-view-comments" data-action="comments" data-comments-label ${post.commentsCount === 0 ? "hidden" : ""}>${commentsLabel}</button>
        <p class="gym-post-viewer-mobile-date">${formatTiempoRelativo(post.createdAt)}</p>
      </section>
    `;
  }
}
