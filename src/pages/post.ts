import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { renderVerifiedBadge } from "../lib/verifiedBadge";
import { formatTiempoRelativo } from "../lib/dias";
import { supabase } from "../lib/supabaseClient";
import { renderPostCard, wirePostCard, ICON_HEART, ICON_HEART_FILLED, type PostCardHandlers } from "../lib/postCard";
import { openQuoteModal, openShareToChatModal, openCommentModal, openCommentReplyModal, openPostMetricsModal, confirmDeletePost } from "../lib/postModals";
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
  type Post,
  type PostAuthor,
  type PostComment,
} from "../services/post.service";

setupNavToggle();
setupRevealObserver();
const userId = await requireAuth();

const DEFAULT_AVATAR = "/images/avatars/default.svg";

// Vuelve a la pagina anterior (feed, perfil, busqueda, etc.), sea cual sea --
// por eso no es un href fijo. El <a href="feed.html"> del markup queda como
// fallback si se abrio este Rep directo (sin historial previo en esta pestaña).
document.getElementById("postBackLink")?.addEventListener("click", (e) => {
  if (window.history.length > 1) {
    e.preventDefault();
    window.history.back();
  }
});

const threadListEl = document.getElementById("postThreadList")!;
const emptyEl = document.getElementById("postDetailEmpty") as HTMLDivElement;
const commentsWrapEl = document.getElementById("postCommentsWrap") as HTMLDivElement;
const commentsListEl = document.getElementById("postCommentsList")!;

const urlParams = new URLSearchParams(window.location.search);
const postId = urlParams.get("id");

let currentThread: FeedPost[] = [];
let focusedPostId: string | null = null;
let comments: FeedComment[] = [];

function showEmptyState(): void {
  threadListEl.innerHTML = "";
  commentsWrapEl.hidden = true;
  emptyEl.hidden = false;
}

function goToProfile(author: PostAuthor): void {
  window.location.href = `profile.html?u=${encodeURIComponent(author.username)}`;
}

async function handleLikeToggle(post: FeedPost): Promise<void> {
  const wasLiked = post.likedByMe;
  post.likedByMe = !wasLiked;
  post.likes_count += wasLiked ? -1 : 1;
  renderThread();
  const { error } = await toggleLike(post.id, userId, wasLiked);
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
  const { error } = await toggleRepost(post.id, userId, wasReposted);
  if (error) {
    post.repostedByMe = wasReposted;
    post.reposts_count += wasReposted ? 1 : -1;
    renderThread();
    alert(error);
  }
}

async function handleQuoteCreated(created: Post): Promise<void> {
  // La cita es un Rep nuevo, independiente de este hilo: no hace falta tocar el estado local acá.
  void created;
}

function handleCommentClick(post: FeedPost): void {
  openCommentModal(post, userId, () => {
    post.comments_count += 1;
    renderThread();
    // Si comentaste el Rep que esta mostrando esta pagina, el comentario nuevo
    // tiene que aparecer en la lista visible de abajo.
    if (post.id === postId) void refreshComments();
  });
}

function handleDeleteClick(post: FeedPost): void {
  confirmDeletePost(post, () => {
    if (currentThread.length <= 1) {
      window.location.href = "feed.html";
      return;
    }
    currentThread = currentThread.filter((p) => p.id !== post.id);
    if (post.id === focusedPostId) {
      window.location.href = "feed.html";
      return;
    }
    renderThread();
  });
}

function goToPost(id: string): void {
  window.location.href = `post.html?id=${encodeURIComponent(id)}`;
}

const postCardHandlers: PostCardHandlers = {
  onLikeToggle: (post) => void handleLikeToggle(post),
  onRepostToggle: (post) => void handleRepostToggle(post),
  onCommentClick: handleCommentClick,
  onQuoteClick: (post) => openQuoteModal(post, userId, (created) => void handleQuoteCreated(created)),
  onShareClick: (post) => void openShareToChatModal(post, userId),
  onDeleteClick: handleDeleteClick,
  onAuthorClick: goToProfile,
  onMetricsClick: (post) => openPostMetricsModal(post),
  onView: (post) => {
    if (post.author_id !== userId) void recordPostView(post.id, userId);
  },
  onOpenPost: (post) => {
    if (post.id !== focusedPostId) goToPost(post.id);
  },
};

// ---------------------------------------------------------------------------
// Hilo: ancestros + Rep enfocado (mas grande) + continuaciones
// ---------------------------------------------------------------------------

function renderThread(): void {
  threadListEl.innerHTML = currentThread
    .map((p) => {
      const isFocused = p.id === focusedPostId;
      const card = renderPostCard(p, userId, { compact: !isFocused });
      return isFocused ? `<div class="post-detail-focused">${card}</div>` : card;
    })
    .join("");
  wirePostCard(threadListEl, currentThread, postCardHandlers);
}

// ---------------------------------------------------------------------------
// Comentarios (planos, separados de los hilos)
// ---------------------------------------------------------------------------

// Arbol de comentarios armado en el cliente a partir de la lista plana (parent_comment_id):
// permite responder un comentario puntual y que las respuestas queden anidadas debajo, formando hilos.
function buildCommentTree(rows: FeedComment[]): Map<string | null, FeedComment[]> {
  const byParent = new Map<string | null, FeedComment[]>();
  for (const c of rows) {
    const key = c.parent_comment_id;
    const list = byParent.get(key) ?? [];
    list.push(c);
    byParent.set(key, list);
  }
  return byParent;
}

function commentHtml(c: FeedComment, depth: number): string {
  const isOwner = userId === c.author_id;
  return `
    <div class="post-comment${depth > 0 ? " post-comment-nested" : ""}" data-id="${c.id}" style="margin-left:${Math.min(depth, 6) * 28}px">
      <img class="post-comment-avatar" src="${escapeHtml(c.author.avatarUrl || DEFAULT_AVATAR)}" alt="">
      <div class="post-comment-body">
        <div class="post-comment-head">
          <span class="post-comment-name">${escapeHtml(c.author.username)}${renderVerifiedBadge(c.author.userType, c.author.isVerified, 12)}</span>
          <span class="post-comment-time">${formatTiempoRelativo(c.created_at)}</span>
        </div>
        <p class="post-comment-text">${escapeHtml(c.content).replace(/\n/g, "<br>")}</p>
        <div class="post-comment-actions">
          <button type="button" class="post-comment-like${c.likedByMe ? " is-active" : ""}" data-action="like" data-id="${c.id}" aria-label="Me gusta">${c.likedByMe ? ICON_HEART_FILLED : ICON_HEART}<span>${c.likes_count}</span></button>
          <button type="button" class="post-comment-reply" data-id="${c.id}">Responder</button>
        </div>
      </div>
      ${isOwner ? `<button type="button" class="post-comment-delete" data-id="${c.id}" aria-label="Eliminar comentario">✕</button>` : ""}
    </div>
  `;
}

function renderCommentBranch(byParent: Map<string | null, FeedComment[]>, parentId: string | null, depth: number): string {
  const children = byParent.get(parentId) ?? [];
  return children.map((c) => commentHtml(c, depth) + renderCommentBranch(byParent, c.id, depth + 1)).join("");
}

async function handleCommentLikeToggle(id: string): Promise<void> {
  const comment = comments.find((c) => c.id === id);
  if (!comment) return;
  const wasLiked = comment.likedByMe;
  comment.likedByMe = !wasLiked;
  comment.likes_count += wasLiked ? -1 : 1;
  renderComments();
  const { error } = await toggleCommentLike(id, userId, wasLiked);
  if (error) {
    comment.likedByMe = wasLiked;
    comment.likes_count += wasLiked ? 1 : -1;
    renderComments();
    alert(error);
  }
}

function renderComments(): void {
  const byParent = buildCommentTree(comments);
  commentsListEl.innerHTML = comments.length ? renderCommentBranch(byParent, null, 0) : `<p class="exc-pick-empty">Sé el primero en comentar.</p>`;

  commentsListEl.querySelectorAll<HTMLButtonElement>(".post-comment-delete").forEach((btn) => {
    btn.addEventListener("click", () => void handleDeleteComment(btn.dataset.id!));
  });
  commentsListEl.querySelectorAll<HTMLButtonElement>(".post-comment-reply").forEach((btn) => {
    btn.addEventListener("click", () => {
      const comment = comments.find((c) => c.id === btn.dataset.id);
      if (comment) openCommentReplyModal(comment, userId, () => void refreshComments());
    });
  });
  commentsListEl.querySelectorAll<HTMLButtonElement>(".post-comment-like").forEach((btn) => {
    btn.addEventListener("click", () => void handleCommentLikeToggle(btn.dataset.id!));
  });
}

// Borrar un comentario con respuestas las borra tambien en la base (cascade); reflejamos
// lo mismo del lado local para no dejar respuestas huerfanas hasta el proximo refresh.
function collectCommentAndDescendantIds(id: string): Set<string> {
  const ids = new Set<string>([id]);
  let added = true;
  while (added) {
    added = false;
    for (const c of comments) {
      if (c.parent_comment_id && ids.has(c.parent_comment_id) && !ids.has(c.id)) {
        ids.add(c.id);
        added = true;
      }
    }
  }
  return ids;
}

async function handleDeleteComment(id: string): Promise<void> {
  if (!confirm("¿Eliminar este comentario? Las respuestas que tenga también se van a borrar.")) return;
  const idsToRemove = collectCommentAndDescendantIds(id);
  const previous = comments;
  comments = comments.filter((c) => !idsToRemove.has(c.id));
  renderComments();
  const { error } = await deleteComment(id);
  if (error) {
    comments = previous;
    renderComments();
    alert(error);
  }
}

async function refreshComments(): Promise<void> {
  comments = await listComments(postId!);
  renderComments();
}

// ---------------------------------------------------------------------------
// Carga inicial
// ---------------------------------------------------------------------------

async function loadAndRender(id: string): Promise<void> {
  const post = await getPost(id);
  if (!post) {
    showEmptyState();
    return;
  }

  focusedPostId = post.id;
  const rootId = post.thread_root_id ?? post.id;
  const thread = await getThread(rootId).catch(() => [] as FeedPost[]);
  currentThread = thread.length > 0 ? thread : [post];

  emptyEl.hidden = true;
  commentsWrapEl.hidden = false;
  renderThread();

  await refreshComments();
  subscribeToComments(id);
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

  window.addEventListener("beforeunload", () => {
    void supabase.removeChannel(channel);
  });
}

if (!postId) {
  showEmptyState();
} else {
  await loadAndRender(postId);
}
