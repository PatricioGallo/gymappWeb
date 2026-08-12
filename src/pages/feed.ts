import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
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

setupNavToggle();
setupRevealObserver();
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
