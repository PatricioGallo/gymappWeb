import { escapeHtml } from "./dom";
import { renderVerifiedBadge } from "./verifiedBadge";
import { formatTiempoRelativo } from "./dias";
import { resultFullName } from "./search";
import { supabase } from "./supabaseClient";
import { renderPostCard, wirePostCard, type PostCardHandlers } from "./postCard";
import { openQuoteModal, openShareToChatModal, openCommentModal, openCommentReplyModal, openPostMetricsModal, confirmDeletePost } from "./postModals";
import { confirmDialog } from "./confirmDialog";
import { renderCommentsHtml, wireCommentsList, collectCommentAndDescendantIds, type CommentListHandlers } from "./postComments";
import {
  getPost,
  getThread,
  toggleLike,
  toggleRepost,
  listComments,
  deleteComment,
  toggleCommentLike,
  recordPostView,
  type FeedPost,
  type FeedComment,
  type PostAuthor,
  type PostComment,
} from "../services/post.service";
import { getFollowStatus, followUser, unfollowOrCancel, type FollowStatus } from "../services/follow.service";
import type { RealtimeChannel } from "@supabase/supabase-js";

const DEFAULT_AVATAR = "/images/avatars/default.svg";
const ICON_BACK = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;
const ICON_NOT_FOUND = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>`;

export interface PostDetailOptions {
  viewerId: string;
  /** El usuario esta en el Rep raiz (no hay a donde volver dentro del hilo) y toco la flecha de
   * volver -- cada contexto decide que significa "salir" (cerrar el modal, o volver atras en el
   * historial del navegador). */
  onExit(): void;
  /** Ir al perfil de un autor (avatar, nombre o @usuario) -- cada contexto decide si hace falta
   * cerrar algo antes de navegar (el modal lo cierra; la pagina de detalle solo navega). */
  onAuthorClick(username: string): void;
  /** Se llama justo antes de abrir un modal secundario que SI comparte el slot #loaderBody
   * (citar, compartir, metricas, borrar el Rep -- comentar/responder/borrar un comentario NO
   * pasan por aca, se montan aparte arriba de este componente, ver openReplyModal en
   * postModals.ts y confirmDialog.ts): si este componente esta viviendo ADENTRO de #loaderBody
   * (ver postDetailModal.ts), el sub-modal lo va a pisar sin avisar -- hay que soltar el scroll
   * lock del body y el canal realtime ANTES, o quedan colgados (el body se queda con
   * position:fixed para siempre y la pagina de atras parece trabada). La pagina de detalle
   * (post.ts) no vive en #loaderBody y no necesita hacer nada aca. */
  onSubmodalOpening?(): void;
  /** Se comento (o respondio) un Rep desde adentro de este componente -- avisa el id para que
   * quien abrio el modal (feed/perfil) pueda sumarle 1 al contador de comentarios de SU propia
   * copia de ese Rep en la lista de atras. */
  onCommentPosted?(postId: string): void;
  /** Abre el composer de comentario solito apenas termina de cargar el Rep enfocado -- usado
   * cuando se toca "Comentar" directo desde una tarjeta del feed/perfil (ver goToPostAndComment). */
  autoOpenComment?: boolean;
}

export interface PostDetailController {
  /** Corta el canal realtime sin tocar el DOM ya pintado -- para cuando la vista se oculta pero
   * sigue cacheada (ver onHide en post.ts), sin perder lo ya renderizado. */
  pause(): void;
  /** Corta el canal realtime y el listener de la flecha de volver -- desmontaje final. */
  dispose(): void;
}

function shellHtml(): string {
  return `
    <div class="post-detail-modal-header">
      <button type="button" class="post-detail-modal-back" id="postDetailBackBtn" aria-label="Volver">${ICON_BACK}</button>
      <h2 class="post-detail-modal-title">Post</h2>
      <span class="post-detail-modal-header-spacer" aria-hidden="true"></span>
    </div>
    <div class="post-detail-modal-body" id="postDetailModalBody">
      <div class="post-detail-thread" id="postDetailThread"></div>
      <div class="post-detail-empty" id="postDetailEmpty" hidden>
        <div class="empty-state reveal">
          <div class="icon">${ICON_NOT_FOUND}</div>
          <h3>Este Rep no existe o no tenés acceso a él</h3>
        </div>
      </div>
      <div class="post-detail-comments" id="postDetailComments" hidden></div>
    </div>
  `;
}

function authorHeaderHtml(author: PostAuthor, timestampIso: string, showFollow: boolean): string {
  return `
    <div class="post-detail-author">
      <button type="button" class="post-detail-avatar-btn" data-role="author" aria-label="Ver perfil de ${escapeHtml(author.username)}">
        <img class="post-detail-avatar" src="${escapeHtml(author.avatarUrl || DEFAULT_AVATAR)}" alt="" draggable="false">
      </button>
      <button type="button" class="post-detail-author-info" data-role="author">
        <span class="post-detail-author-name">${escapeHtml(resultFullName(author))}${renderVerifiedBadge(author.userType, author.isVerified, 14)}</span>
        <span class="post-detail-author-handle">@${escapeHtml(author.username)} · ${formatTiempoRelativo(timestampIso)}</span>
      </button>
      ${showFollow ? `<button type="button" class="btn btn-sm post-detail-follow-btn" id="postDetailFollowBtn" hidden></button>` : ""}
    </div>
  `;
}

function paintFollowBtn(btn: HTMLButtonElement, status: FollowStatus): void {
  btn.textContent = status === "pending" ? "Solicitud enviada" : "Seguir";
  btn.classList.toggle("btn-primary", status !== "pending");
  btn.classList.toggle("btn-outline", status === "pending");
}

/**
 * Reconstruye el hilo (ancestros + Rep enfocado + continuaciones) y la lista de comentarios de
 * un Rep adentro de `container`, con su propio header (flecha de volver + "Post"). Reusado tanto
 * por la pagina de detalle (post.ts, para links compartidos que aterrizan directo en post.html)
 * como por el modal que se abre al tocar un Rep desde el feed/perfil/hilo (ver
 * postDetailModal.ts) -- mismo componente, dos formas de montarlo.
 */
export async function mountPostDetail(container: HTMLElement, postId: string, opts: PostDetailOptions): Promise<PostDetailController> {
  const { viewerId } = opts;
  container.classList.add("post-detail-modal");
  container.innerHTML = shellHtml();

  const bodyEl = container.querySelector<HTMLElement>("#postDetailModalBody")!;
  const threadEl = container.querySelector<HTMLElement>("#postDetailThread")!;
  const emptyEl = container.querySelector<HTMLElement>("#postDetailEmpty")!;
  const commentsEl = container.querySelector<HTMLElement>("#postDetailComments")!;

  let currentId = postId;
  const backStack: string[] = [];
  let currentThread: FeedPost[] = [];
  let comments: FeedComment[] = [];
  let activeChannel: RealtimeChannel | null = null;
  let followStatusFor: string | null = null;
  let followStatusValue: FollowStatus | null = null;

  function pauseRealtime(): void {
    if (activeChannel) {
      void supabase.removeChannel(activeChannel);
      activeChannel = null;
    }
  }

  function openId(id: string, push: boolean): void {
    if (push) backStack.push(currentId);
    currentId = id;
    void load(id);
  }

  function handleBack(): void {
    if (backStack.length > 0) {
      currentId = backStack.pop()!;
      void load(currentId);
    } else {
      opts.onExit();
    }
  }

  const backBtn = container.querySelector<HTMLButtonElement>("#postDetailBackBtn")!;
  backBtn.addEventListener("click", handleBack);

  // -----------------------------------------------------------------------
  // Header de autor del Rep enfocado (avatar arriba, nombre en negrita, @usuario abajo, seguir)
  // -----------------------------------------------------------------------

  async function handleFollowClick(btn: HTMLButtonElement, targetId: string): Promise<void> {
    btn.disabled = true;
    if (followStatusValue === "pending") {
      const { error } = await unfollowOrCancel(viewerId, targetId);
      btn.disabled = false;
      if (error) {
        alert(error);
        return;
      }
      followStatusValue = "none";
      paintFollowBtn(btn, "none");
      return;
    }
    const { status, error } = await followUser(viewerId, targetId);
    btn.disabled = false;
    if (error) {
      alert(error);
      return;
    }
    followStatusValue = status ?? "accepted";
    if (followStatusValue === "accepted" || followStatusValue === "self") btn.hidden = true;
    else paintFollowBtn(btn, followStatusValue);
  }

  function wireAuthorHeader(root: ParentNode, author: PostAuthor): void {
    root.querySelectorAll<HTMLButtonElement>('[data-role="author"]').forEach((btn) => {
      btn.addEventListener("click", () => opts.onAuthorClick(author.username));
    });

    const followBtn = root.querySelector<HTMLButtonElement>("#postDetailFollowBtn");
    if (!followBtn) return;

    function applyStatus(status: FollowStatus): void {
      if (status === "accepted" || status === "self") {
        followBtn!.hidden = true;
        return;
      }
      followBtn!.hidden = false;
      paintFollowBtn(followBtn!, status);
    }

    if (followStatusFor === author.id && followStatusValue) {
      applyStatus(followStatusValue);
    } else {
      followStatusFor = author.id;
      void getFollowStatus(author.id).then((status) => {
        followStatusValue = status;
        if (followStatusFor === author.id) applyStatus(status);
      });
    }

    followBtn.addEventListener("click", () => void handleFollowClick(followBtn, author.id));
  }

  // -----------------------------------------------------------------------
  // Hilo: ancestros + Rep enfocado (con header propio) + continuaciones
  // -----------------------------------------------------------------------

  function goToProfile(author: PostAuthor): void {
    opts.onAuthorClick(author.username);
  }

  async function handleLikeToggle(post: FeedPost): Promise<void> {
    const wasLiked = post.likedByMe;
    post.likedByMe = !wasLiked;
    post.likes_count += wasLiked ? -1 : 1;
    renderThread();
    const { error } = await toggleLike(post.id, viewerId, wasLiked);
    if (error) {
      post.likedByMe = wasLiked;
      post.likes_count += wasLiked ? 1 : -1;
      renderThread();
      alert(error);
    }
  }

  async function handleRepostToggle(post: FeedPost): Promise<void> {
    const wasReposted = post.repostedByMe;
    post.repostedByMe = !wasReposted;
    post.reposts_count += wasReposted ? -1 : 1;
    renderThread();
    const { error } = await toggleRepost(post.id, viewerId, wasReposted);
    if (error) {
      post.repostedByMe = wasReposted;
      post.reposts_count += wasReposted ? 1 : -1;
      renderThread();
      alert(error);
    }
  }

  // Sin opts.onSubmodalOpening(): el composer se monta arriba de este modal (ver openReplyModal
  // en postModals.ts), no lo pisa -- comentar ya no necesita cerrar/reabrir nada.
  function handleCommentClick(post: FeedPost): void {
    openCommentModal(post, viewerId, () => {
      post.comments_count += 1;
      updateCommentCountDisplay(post.id);
      if (post.id === currentId) void refreshComments();
      opts.onCommentPosted?.(post.id);
    });
  }

  // Actualiza solo el numerito del boton de comentar de un Rep del hilo, sin volver a pintar toda
  // la tarjeta (avatar, video, boton de seguir...) como haria renderThread() -- eso alcanzaba a
  // reiniciar un video en reproduccion o parpadear la tarjeta con cada comentario nuevo.
  function updateCommentCountDisplay(postId: string): void {
    const post = currentThread.find((p) => p.id === postId);
    if (!post) return;
    const countEl = threadEl.querySelector(`.post-card[data-post-id="${postId}"] [data-action="comment"] span`);
    if (countEl) countEl.textContent = String(post.comments_count);
  }

  function handleDeleteClick(post: FeedPost): void {
    opts.onSubmodalOpening?.();
    confirmDeletePost(post, () => {
      if (currentThread.length <= 1 || post.id === currentId) {
        opts.onExit();
        return;
      }
      currentThread = currentThread.filter((p2) => p2.id !== post.id);
      renderThread();
    });
  }

  const postCardHandlers: PostCardHandlers = {
    viewerId,
    onLikeToggle: (post) => void handleLikeToggle(post),
    onRepostToggle: (post) => void handleRepostToggle(post),
    onCommentClick: handleCommentClick,
    // Citar crea un Rep nuevo, independiente de este hilo: no hace falta tocar el estado local acá.
    onQuoteClick: (post) => {
      opts.onSubmodalOpening?.();
      openQuoteModal(post, viewerId, () => {});
    },
    onShareClick: (post) => {
      opts.onSubmodalOpening?.();
      void openShareToChatModal(post, viewerId);
    },
    onDeleteClick: handleDeleteClick,
    onAuthorClick: goToProfile,
    onMetricsClick: (post) => {
      opts.onSubmodalOpening?.();
      openPostMetricsModal(post);
    },
    onView: (post) => {
      if (post.author_id !== viewerId) void recordPostView(post.id, viewerId);
    },
    onOpenPost: (post) => {
      if (post.id !== currentId) openId(post.id, true);
    },
    onQuotedClick: (quotedId) => openId(quotedId, true),
    onMediaOpening: opts.onSubmodalOpening,
    // El hilo puede traer Reps de otros autores (citas encadenadas): el swipe-arriba se queda
    // siempre en el autor del Rep que se tocó, no en el del Rep enfocado.
    getVideoQueue: (current) => currentThread.filter((p2) => p2.author_id === current.author_id && p2.media_type === "video" && p2.media_url),
  };

  function renderThread(): void {
    threadEl.innerHTML = currentThread
      .map((post) => {
        if (post.id === currentId) {
          const showFollow = post.author.id !== viewerId;
          return `<div class="post-detail-focused">${authorHeaderHtml(post.author, post.feedTimestamp, showFollow)}${renderPostCard(post, viewerId, { hideHeader: true })}</div>`;
        }
        return renderPostCard(post, viewerId, { compact: true });
      })
      .join("");
    wirePostCard(threadEl, currentThread, postCardHandlers);
    const focusedPost = currentThread.find((p) => p.id === currentId);
    if (focusedPost) wireAuthorHeader(threadEl, focusedPost.author);
  }

  // -----------------------------------------------------------------------
  // Comentarios (planos, separados del hilo -- ver postComments.ts)
  // -----------------------------------------------------------------------

  const commentListHandlers: CommentListHandlers = {
    viewerId,
    onAuthorClick: (username) => opts.onAuthorClick(username),
    onLikeToggle: (comment) => void handleCommentLikeToggle(comment.id),
    onReplyClick: (comment) => {
      openCommentReplyModal(comment, viewerId, () => {
        const post = currentThread.find((p) => p.id === comment.post_id);
        if (post) {
          post.comments_count += 1;
          updateCommentCountDisplay(post.id);
        }
        void refreshComments();
        opts.onCommentPosted?.(comment.post_id);
      });
    },
    onDeleteClick: (comment) => handleDeleteComment(comment.id),
  };

  async function handleCommentLikeToggle(id: string): Promise<void> {
    const comment = comments.find((c) => c.id === id);
    if (!comment) return;
    const wasLiked = comment.likedByMe;
    comment.likedByMe = !wasLiked;
    comment.likes_count += wasLiked ? -1 : 1;
    renderComments();
    const { error } = await toggleCommentLike(id, viewerId, wasLiked);
    if (error) {
      comment.likedByMe = wasLiked;
      comment.likes_count += wasLiked ? 1 : -1;
      renderComments();
      alert(error);
    }
  }

  // confirmDialog (no confirmDeletePost/openCommentModal) a proposito: se monta en su propio
  // <div> directo en <body>, no en #loaderBody, asi que no pisa este modal -- no hace falta
  // opts.onSubmodalOpening() y el usuario nunca se va del post con solo borrar un comentario.
  async function handleDeleteComment(id: string): Promise<void> {
    const confirmed = await confirmDialog("Las respuestas que tenga también se van a borrar.", {
      title: "Eliminar comentario",
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!confirmed) return;

    const idsToRemove = collectCommentAndDescendantIds(comments, id);
    const deletePromise = deleteComment(id);
    await animateCommentRemoval(idsToRemove);

    const previous = comments;
    comments = comments.filter((c) => !idsToRemove.has(c.id));
    renderComments();

    const { error } = await deletePromise;
    if (error) {
      comments = previous;
      renderComments();
      alert(error);
    }
  }

  // Encoge y desvanece cada comentario a borrar (el tocado + sus respuestas, ver
  // collectCommentAndDescendantIds) ANTES de sacarlo del array y volver a pintar -- si no, el
  // re-render de renderComments() los hace desaparecer de un salto. Arranca desde la altura real
  // medida (no un valor fijo) para que el colapso se sienta proporcional a cada fila.
  function animateCommentRemoval(ids: Set<string>): Promise<void> {
    const els = [...ids]
      .map((id) => commentsEl.querySelector<HTMLElement>(`.post-comment[data-id="${id}"]`))
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      let pending = els.length;
      function onDone(): void {
        pending -= 1;
        if (pending <= 0) resolve();
      }
      els.forEach((el) => {
        el.style.maxHeight = `${el.offsetHeight}px`;
        void el.offsetHeight; // fuerza el reflow: sin esto el navegador funde el maxHeight inicial con el final y no anima nada
        el.classList.add("post-comment-collapsed");
        el.addEventListener("transitionend", onDone, { once: true });
      });
      setTimeout(resolve, 400); // salvavidas si transitionend no llega a disparar
    });
  }

  function renderComments(): void {
    commentsEl.innerHTML = renderCommentsHtml(comments);
    wireCommentsList(commentsEl, comments, commentListHandlers);
  }

  // Trae los comentarios de nuevo (se acaba de comentar/responder, o llego uno por realtime) y
  // anima de entrada los que sean nuevos -- mismo criterio que animateCommentRemoval, en espejo,
  // para que un comentario nuevo aparezca con transicion en vez de saltar de golpe a la lista.
  //
  // Comentar dispara DOS llamadas casi juntas: la de acá (el callback de onReplied) y la del
  // realtime (el INSERT que la propia insercion dispara, ver subscribeToComments), y el chequeo
  // "ya lo tengo" del realtime compara contra `comments` ANTES de que la primera termine de
  // resolver -- sin coalescerlas, la segunda vuelve a pintar la lista (con renderComments(),
  // que reemplaza el innerHTML entero) a mitad de la animacion de la primera, cortandola en seco
  // y arrancandola de nuevo: se ve como si el comentario "parpadeara"/entrara dos veces. Si ya
  // hay una carga en curso, las llamadas de mas se enganchan a esa misma en vez de arrancar otra.
  let refreshInFlight: Promise<void> | null = null;
  async function refreshComments(): Promise<void> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      const previousIds = new Set(comments.map((c) => c.id));
      comments = await listComments(currentId);
      renderComments();
      const newIds = comments.map((c) => c.id).filter((id) => !previousIds.has(id));
      animateCommentsEntering(newIds);
    })();
    try {
      await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  }

  function animateCommentsEntering(ids: string[]): void {
    const els = ids.map((id) => commentsEl.querySelector<HTMLElement>(`.post-comment[data-id="${id}"]`)).filter((el): el is HTMLElement => !!el);
    els.forEach((el) => {
      const targetHeight = el.offsetHeight;
      el.classList.add("post-comment-collapsed"); // arranca colapsado
      el.style.maxHeight = `${targetHeight}px`; // valor de llegada, ignorado mientras la clase siga puesta (ver !important en el CSS)
      void el.offsetHeight; // fuerza el reflow con el estado colapsado ya pintado, antes de animar
      el.classList.remove("post-comment-collapsed"); // ahora el inline maxHeight (y el resto de la fila) toma efecto, animado
      setTimeout(() => (el.style.maxHeight = ""), 320); // suelta el limite fijo: si el contenido crece despues no queda recortado
    });
  }

  // -----------------------------------------------------------------------
  // Carga: getPost + listComments arrancan en paralelo (listComments no depende del post), y
  // getThread arranca apenas se conoce el thread_root_id -- evita la cadena de 3 awaits en serie
  // que hacia lenta la version anterior de esta pantalla.
  // -----------------------------------------------------------------------

  function showEmpty(): void {
    threadEl.innerHTML = "";
    commentsEl.hidden = true;
    emptyEl.hidden = false;
  }

  function subscribeToComments(id: string): void {
    const channel = supabase
      .channel(`post-comments-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_comments", filter: `post_id=eq.${id}` }, (payload) => {
        const row = payload.new as PostComment;
        if (comments.some((c) => c.id === row.id)) return;
        void refreshComments();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "post_comments", filter: `post_id=eq.${id}` }, (payload) => {
        const row = payload.old as { id?: string };
        if (!row.id) return;
        comments = comments.filter((c) => c.id !== row.id);
        renderComments();
      })
      .subscribe();
    activeChannel = channel;
  }

  async function load(id: string): Promise<void> {
    pauseRealtime();
    emptyEl.hidden = true;
    commentsEl.hidden = false;
    threadEl.innerHTML = `<div class="post-detail-loading"><span class="modern-spinner"></span></div>`;
    commentsEl.innerHTML = "";

    const postPromise = getPost(id);
    const commentsPromise = listComments(id).catch(() => [] as FeedComment[]);

    const post = await postPromise.catch(() => null);
    if (currentId !== id) return; // se navego de nuevo (stack/drill-down) antes de que termine esta carga
    if (!post) {
      showEmpty();
      return;
    }

    const rootId = post.thread_root_id ?? post.id;
    const [thread, commentRows] = await Promise.all([getThread(rootId).catch(() => [] as FeedPost[]), commentsPromise]);
    if (currentId !== id) return;

    currentThread = thread.length > 0 ? thread : [post];
    comments = commentRows;

    renderThread();
    renderComments();
    bodyEl.scrollTo({ top: 0 });
    subscribeToComments(id);
  }

  await load(currentId);

  // Atajo para "Comentar" tocado directo desde una tarjeta del feed/perfil (sin abrir el Rep a
  // mano primero): apenas termina de cargar, abre el composer de una -- el usuario ve primero
  // el Rep y de ahi el modal de comentario, como pidio (ver goToPostAndComment en feed.ts).
  if (opts.autoOpenComment) {
    const focusedPost = currentThread.find((p) => p.id === currentId);
    if (focusedPost) handleCommentClick(focusedPost);
  }

  return {
    pause: pauseRealtime,
    dispose: () => {
      pauseRealtime();
      backBtn.removeEventListener("click", handleBack);
    },
  };
}
