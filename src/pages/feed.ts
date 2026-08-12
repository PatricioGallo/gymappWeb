import { setupNavToggle, setupRevealObserver, setupAutoHideHeader, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { renderPostCard, wirePostCard, type PostCardHandlers } from "../lib/postCard";
import { openQuoteModal, openShareToChatModal, openCommentModal, confirmDeletePost } from "../lib/postModals";
import {
  getFeed,
  createPost,
  toggleLike,
  toggleRepost,
  validatePostContent,
  uploadPostMedia,
  getPost,
  type FeedPost,
  type Post,
  type PostAuthor,
} from "../services/post.service";
import { getSuggestedProfiles, type SuggestedProfile } from "../services/search.service";
import { followUser } from "../services/follow.service";
import { resultAvatar, resultFullName } from "../lib/search";
import { renderVerifiedBadge } from "../lib/verifiedBadge";

setupNavToggle();
setupRevealObserver();
setupAutoHideHeader();
const userId = await requireAuth();

// Coincide con el limite por pagina que usa getFeed() por defecto en post.service.ts.
const FEED_PAGE_SIZE = 20;
const POST_MAX = 140;

const listEl = document.getElementById("postFeedList")!;
const loadMoreBtn = document.getElementById("postFeedLoadMoreBtn") as HTMLButtonElement;

const composerForm = document.getElementById("postComposerForm") as HTMLFormElement;
const composerInput = document.getElementById("postComposerInput") as HTMLTextAreaElement;
const composerCounter = document.getElementById("postComposerCounter")!;
const composerSubmit = document.getElementById("postComposerSubmit") as HTMLButtonElement;
const composerAlert = document.getElementById("postComposerAlert")!;
const mediaInput = document.getElementById("postComposerMediaInput") as HTMLInputElement;
const previewWrap = document.getElementById("postComposerPreview") as HTMLDivElement;
const previewImg = document.getElementById("postComposerPreviewImg") as HTMLImageElement;
const previewVideo = document.getElementById("postComposerPreviewVideo") as HTMLVideoElement;
const removeMediaBtn = document.getElementById("postComposerRemoveMedia") as HTMLButtonElement;

let posts: FeedPost[] = [];

type PendingMedia = { file: File; previewUrl: string; kind: "image" | "video" };
let pendingMedia: PendingMedia | null = null;

function clearPendingMedia(): void {
  if (pendingMedia) URL.revokeObjectURL(pendingMedia.previewUrl);
  pendingMedia = null;
  previewWrap.hidden = true;
  previewImg.hidden = true;
  previewVideo.hidden = true;
  previewImg.src = "";
  previewVideo.src = "";
  updateComposerState();
}

function showMediaPreview(): void {
  if (!pendingMedia) return;
  previewWrap.hidden = false;
  previewImg.hidden = pendingMedia.kind !== "image";
  previewVideo.hidden = pendingMedia.kind !== "video";
  if (pendingMedia.kind === "image") previewImg.src = pendingMedia.previewUrl;
  else previewVideo.src = pendingMedia.previewUrl;
  updateComposerState();
}

mediaInput.addEventListener("change", () => {
  const file = mediaInput.files?.[0];
  mediaInput.value = "";
  if (!file) return;
  clearPendingMedia();
  pendingMedia = { file, previewUrl: URL.createObjectURL(file), kind: file.type.startsWith("video") ? "video" : "image" };
  showMediaPreview();
});

removeMediaBtn.addEventListener("click", clearPendingMedia);

function updateComposerState(): void {
  const len = composerInput.value.length;
  composerCounter.textContent = String(POST_MAX - len);
  composerCounter.classList.toggle("post-composer-counter-over", len > POST_MAX);
  composerSubmit.disabled = (len === 0 && !pendingMedia) || len > POST_MAX;
}
composerInput.addEventListener("input", updateComposerState);
updateComposerState();

composerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  void handlePublish();
});

async function handlePublish(): Promise<void> {
  const content = composerInput.value;
  composerAlert.innerHTML = "";
  const validationError = validatePostContent(content, !!pendingMedia);
  if (validationError) {
    composerAlert.innerHTML = `<p>${escapeHtml(validationError)}</p>`;
    return;
  }

  composerSubmit.disabled = true;
  let mediaUrl: string | undefined;
  let mediaType: "image" | "video" | undefined;
  if (pendingMedia) {
    const { url, mediaType: type, error } = await uploadPostMedia(userId, pendingMedia.file);
    if (error || !url) {
      composerAlert.innerHTML = `<p>${escapeHtml(error || "No se pudo subir el archivo.")}</p>`;
      composerSubmit.disabled = false;
      return;
    }
    mediaUrl = url;
    mediaType = type;
  }

  const { post, error } = await createPost(userId, content, mediaUrl, mediaType);
  if (error || !post) {
    composerAlert.innerHTML = `<p>${escapeHtml(error || "No se pudo publicar el Rep.")}</p>`;
    composerSubmit.disabled = false;
    return;
  }

  const hydrated = await getPost(post.id).catch(() => null);
  if (hydrated) {
    posts = [hydrated, ...posts];
    renderFeed();
  }

  composerInput.value = "";
  clearPendingMedia();
  updateComposerState();
}

// ---------------------------------------------------------------------------
// Feed: render, acciones y paginación
// ---------------------------------------------------------------------------

function handleCommentClick(post: FeedPost): void {
  openCommentModal(post, userId, () => {
    post.comments_count += 1;
    renderFeed();
  });
}

function goToProfile(author: PostAuthor): void {
  window.location.href = `profile.html?u=${encodeURIComponent(author.username)}`;
}

function goToPost(postId: string): void {
  window.location.href = `post.html?id=${encodeURIComponent(postId)}`;
}

async function handleLikeToggle(post: FeedPost): Promise<void> {
  const wasLiked = post.likedByMe;
  post.likedByMe = !wasLiked;
  post.likes_count += wasLiked ? -1 : 1;
  renderFeed();
  const { error } = await toggleLike(post.id, userId, wasLiked);
  if (error) {
    post.likedByMe = wasLiked;
    post.likes_count += wasLiked ? 1 : -1;
    renderFeed();
    alert(error);
  }
}

async function handleRepostToggle(post: FeedPost): Promise<void> {
  const wasReposted = post.repostedByMe;
  post.repostedByMe = !wasReposted;
  post.reposts_count += wasReposted ? -1 : 1;
  renderFeed();
  const { error } = await toggleRepost(post.id, userId, wasReposted);
  if (error) {
    post.repostedByMe = wasReposted;
    post.reposts_count += wasReposted ? 1 : -1;
    renderFeed();
    alert(error);
  }
}

async function handleQuoteCreated(created: Post): Promise<void> {
  const hydrated = await getPost(created.id).catch(() => null);
  if (hydrated) {
    posts = [hydrated, ...posts];
    renderFeed();
  }
}

function handleDeleteClick(post: FeedPost): void {
  confirmDeletePost(post, () => {
    posts = posts.filter((p) => p.id !== post.id);
    renderFeed();
  });
}

const postCardHandlers: PostCardHandlers = {
  onLikeToggle: (post) => void handleLikeToggle(post),
  onRepostToggle: (post) => void handleRepostToggle(post),
  onCommentClick: handleCommentClick,
  onQuoteClick: (post) => openQuoteModal(post, userId, (created) => void handleQuoteCreated(created)),
  onShareClick: (post) => void openShareToChatModal(post, userId),
  onDeleteClick: handleDeleteClick,
  onAuthorClick: goToProfile,
  onOpenPost: (post) => goToPost(post.id),
};

function renderFeed(): void {
  listEl.innerHTML = posts.length
    ? posts.map((p) => renderPostCard(p, userId)).join("")
    : `<p class="exc-pick-empty">Todavía no hay Reps. ¡Publicá el primero!</p>`;
  wirePostCard(listEl, posts, postCardHandlers);
}

async function loadMore(): Promise<void> {
  if (posts.length === 0) return;
  loadMoreBtn.disabled = true;
  const older = await getFeed(posts[posts.length - 1].feedTimestamp);
  loadMoreBtn.disabled = false;
  if (older.length === 0) {
    loadMoreBtn.hidden = true;
    return;
  }
  posts = [...posts, ...older];
  renderFeed();
  loadMoreBtn.hidden = older.length < FEED_PAGE_SIZE;
}

loadMoreBtn.addEventListener("click", () => void loadMore());

posts = await getFeed();
renderFeed();
loadMoreBtn.hidden = posts.length < FEED_PAGE_SIZE;

// ---------------------------------------------------------------------------
// Sidebar derecha: "a quién seguir" (solo desktop, ver .feed-side-right en CSS)
// ---------------------------------------------------------------------------

const suggestionsEl = document.getElementById("feedSuggestionsList");
let suggestions: SuggestedProfile[] = [];

function suggestionRowHtml(s: SuggestedProfile): string {
  return `
    <div class="search-page-item search-suggestion-item" data-username="${encodeURIComponent(s.username)}">
      <img src="${escapeHtml(resultAvatar(s))}" alt="" class="search-page-avatar">
      <span class="search-page-body">
        <p class="search-page-name">${escapeHtml(s.username)}${renderVerifiedBadge(s.user_type, s.is_verified)}</p>
        <p class="search-page-meta">${escapeHtml(resultFullName(s))}</p>
      </span>
      <button type="button" class="btn btn-outline btn-sm follow-suggestion-btn" data-id="${escapeHtml(s.id)}">Seguir</button>
    </div>
  `;
}

function renderSuggestions(): void {
  if (!suggestionsEl) return;
  suggestionsEl.innerHTML = suggestions.length
    ? suggestions.map((s) => suggestionRowHtml(s)).join("")
    : `<p class="exc-pick-empty">No hay sugerencias por ahora.</p>`;

  suggestionsEl.querySelectorAll<HTMLDivElement>(".search-suggestion-item").forEach((item) => {
    item.addEventListener("click", () => {
      window.location.href = `profile.html?u=${item.dataset.username}`;
    });
  });
  suggestionsEl.querySelectorAll<HTMLButtonElement>(".follow-suggestion-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      void handleFollowSuggestion(btn);
    });
  });
}

async function handleFollowSuggestion(btn: HTMLButtonElement): Promise<void> {
  const targetId = btn.dataset.id!;
  btn.disabled = true;
  const { status, error } = await followUser(userId, targetId);
  if (error) {
    alert(error);
    btn.disabled = false;
    return;
  }
  btn.textContent = status === "pending" ? "Solicitud enviada" : "Siguiendo";
  suggestions = suggestions.filter((s) => s.id !== targetId);
}

if (suggestionsEl) {
  getSuggestedProfiles(5)
    .then((list) => {
      suggestions = list;
      renderSuggestions();
    })
    .catch(() => {
      // silencioso: si fallan las sugerencias, el feed sigue funcionando
    });
}
