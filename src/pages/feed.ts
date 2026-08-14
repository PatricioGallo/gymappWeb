import { setupNavToggle, setupRevealObserver, setupAutoHideHeader, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { renderPostCard, wirePostCard, youtubeEmbedHtml, type PostCardHandlers } from "../lib/postCard";
import { openQuoteModal, openShareToChatModal, openCommentModal, openPostMetricsModal, confirmDeletePost } from "../lib/postModals";
import {
  getPersonalizedFeed,
  createPost,
  toggleLike,
  toggleRepost,
  validatePostContent,
  validatePostVideoDuration,
  uploadPostMedia,
  deletePostMedia,
  extractFirstUrl,
  extractYouTubeVideoId,
  recordPostView,
  getPost,
  type FeedPost,
  type Post,
  type PostAuthor,
} from "../services/post.service";
import { getSuggestedProfiles, type SuggestedProfile } from "../services/search.service";
import { followUser } from "../services/follow.service";
import { resultAvatar, resultFullName } from "../lib/search";
import { renderVerifiedBadge } from "../lib/verifiedBadge";
import { attachMentionAutocomplete } from "../lib/mentionAutocomplete";
import { makeMentionEditable } from "../lib/mentionEditor";

setupNavToggle();
setupRevealObserver();
setupAutoHideHeader();
const userId = await requireAuth();

// Coincide con el limite por pagina que usa getPersonalizedFeed() por defecto en post.service.ts.
const FEED_PAGE_SIZE = 20;
const POST_MAX = 240;

const listEl = document.getElementById("postFeedList")!;
const sentinel = document.getElementById("postFeedSentinel")!;
const sentinelSpinner = document.getElementById("postFeedSentinelSpinner") as HTMLDivElement;

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
const youtubePreviewWrap = document.getElementById("postComposerYoutubePreview") as HTMLDivElement;
const uploadingOverlay = document.getElementById("postComposerUploadingOverlay") as HTMLDivElement;

let posts: FeedPost[] = [];

type PendingMedia = {
  file: File;
  previewUrl: string;
  kind: "image" | "video";
  status: "uploading" | "ready" | "error";
  uploadedUrl?: string;
  uploadedPath?: string;
  uploadedType?: "image" | "video";
};
let pendingMedia: PendingMedia | null = null;
// Se incrementa cada vez que se descarta el adjunto actual (remove, nuevo archivo
// elegido, o al publicar). La subida en curso lo chequea al terminar para no pisar
// un pendingMedia que ya no es el suyo (el usuario cambio o saco el archivo mientras subia).
let mediaUploadToken = 0;

// keepBlobUrl=true cuando el blob local se reutiliza para el Rep recien publicado
// (ver handlePublish): no lo revocamos aca, se revoca solo despues con un delay.
// keepUploadedFile=true cuando el archivo ya subido se va a usar igual (post recien
// publicado): en cualquier otro caso (sacar el adjunto, cambiarlo) hay que borrarlo
// del bucket para no dejarlo huerfano, porque la subida ocurre apenas se elige el
// archivo y no recien al publicar (ver handleMediaSelected).
function clearPendingMedia(keepBlobUrl = false, keepUploadedFile = false): void {
  mediaUploadToken++;
  if (pendingMedia && !keepBlobUrl) URL.revokeObjectURL(pendingMedia.previewUrl);
  if (pendingMedia?.status === "ready" && pendingMedia.uploadedPath && !keepUploadedFile) {
    void deletePostMedia(pendingMedia.uploadedPath);
  }
  pendingMedia = null;
  previewWrap.hidden = true;
  previewImg.hidden = true;
  previewVideo.hidden = true;
  previewImg.src = "";
  previewVideo.src = "";
  uploadingOverlay.hidden = true;
  updateComposerState();
  updateYoutubePreview();
}

// Vista previa en vivo del video de YouTube apenas se pega el link en el composer
// (estilo Facebook/Twitter, pero con el video de verdad, no solo una imagen). Nunca
// convive con un archivo adjunto: si hay media, esa es la intencion mas explicita.
function updateYoutubePreview(): void {
  const videoId = !pendingMedia ? extractYouTubeVideoId(extractFirstUrl(composerInput.value) ?? "") : null;
  if (!videoId) {
    youtubePreviewWrap.hidden = true;
    youtubePreviewWrap.innerHTML = "";
    delete youtubePreviewWrap.dataset.videoId;
    return;
  }
  if (youtubePreviewWrap.dataset.videoId === videoId) return; // mismo video que ya se esta mostrando, no re-crear el iframe
  youtubePreviewWrap.dataset.videoId = videoId;
  youtubePreviewWrap.hidden = false;
  youtubePreviewWrap.innerHTML = youtubeEmbedHtml(videoId);
}

function showMediaPreview(): void {
  if (!pendingMedia) return;
  previewWrap.hidden = false;
  previewImg.hidden = pendingMedia.kind !== "image";
  previewVideo.hidden = pendingMedia.kind !== "video";
  if (pendingMedia.kind === "image") previewImg.src = pendingMedia.previewUrl;
  else previewVideo.src = pendingMedia.previewUrl;
  uploadingOverlay.hidden = pendingMedia.status !== "uploading";
  updateComposerState();
  updateYoutubePreview();
}

// Algunos WebViews moviles (Android/iOS, sobre todo dentro de la PWA instalada)
// disparan el evento "change" del input de archivo dos veces para una sola
// seleccion. Sin esta traba, cada disparo arrancaba su propia subida en paralelo
// -- de ahi el archivo subiendose dos veces y el spinner tardando una eternidad
// (dos uploads pesados compitiendo por el mismo ancho de banda del celular).
let handlingMediaSelection = false;

mediaInput.addEventListener("change", () => {
  void handleMediaSelected();
});

// Sube el archivo a Supabase Storage apenas se elige, no cuando se publica: asi
// el spinner de "Subiendo..." refleja la subida real y el usuario puede ver el
// archivo ya confirmado antes de tocar Publicar (ver post-composer-preview-uploading).
async function handleMediaSelected(): Promise<void> {
  if (handlingMediaSelection) return; // ya hay una seleccion/subida en curso, ignorar el disparo duplicado
  const file = mediaInput.files?.[0];
  mediaInput.value = "";
  if (!file) return;

  handlingMediaSelection = true;
  try {
    composerAlert.innerHTML = "";

    const durationError = await validatePostVideoDuration(file);
    if (durationError) {
      composerAlert.innerHTML = `<p>${escapeHtml(durationError)}</p>`;
      return;
    }

    clearPendingMedia();
    const token = ++mediaUploadToken;
    const kind: "image" | "video" = file.type.startsWith("video") ? "video" : "image";
    pendingMedia = { file, previewUrl: URL.createObjectURL(file), kind, status: "uploading" };
    showMediaPreview();

    const { url, path, mediaType, error } = await uploadPostMedia(userId, file);
    if (token !== mediaUploadToken || !pendingMedia) {
      // Se saco o cambio el adjunto mientras subia: si igual se termino de subir, no
      // quedo referenciado por nada, hay que borrarlo para no dejarlo huerfano.
      if (path) void deletePostMedia(path);
      return;
    }

    if (error || !url) {
      pendingMedia.status = "error";
      composerAlert.innerHTML = `<p>${escapeHtml(error || "No se pudo subir el archivo.")}</p>`;
    } else {
      pendingMedia.status = "ready";
      pendingMedia.uploadedUrl = url;
      pendingMedia.uploadedPath = path;
      pendingMedia.uploadedType = mediaType;
    }
    uploadingOverlay.hidden = true;
    updateComposerState();
  } finally {
    handlingMediaSelection = false;
  }
}

removeMediaBtn.addEventListener("click", () => clearPendingMedia());

function updateComposerState(): void {
  const len = composerInput.value.length;
  composerCounter.textContent = String(POST_MAX - len);
  composerCounter.classList.toggle("post-composer-counter-over", len > POST_MAX);
  const mediaBlocking = pendingMedia?.status === "uploading" || pendingMedia?.status === "error";
  composerSubmit.disabled = (len === 0 && !pendingMedia) || len > POST_MAX || mediaBlocking;
}
composerInput.addEventListener("input", () => {
  updateComposerState();
  updateYoutubePreview();
});
updateComposerState();
attachMentionAutocomplete(makeMentionEditable(composerInput));

composerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  void handlePublish();
});

function setPublishing(publishing: boolean): void {
  composerSubmit.disabled = publishing;
  composerSubmit.innerHTML = publishing ? `<span class="btn-spinner"></span> Publicando...` : "Publicar";
  removeMediaBtn.disabled = publishing;
  mediaInput.disabled = publishing;
}

async function handlePublish(): Promise<void> {
  const content = composerInput.value;
  composerAlert.innerHTML = "";
  const validationError = validatePostContent(content, !!pendingMedia);
  if (validationError) {
    composerAlert.innerHTML = `<p>${escapeHtml(validationError)}</p>`;
    return;
  }
  // El submit ya deberia estar disabled mientras sube o si fallo (ver
  // updateComposerState), esto es solo un resguardo.
  if (pendingMedia && pendingMedia.status !== "ready") return;

  setPublishing(true);
  // Se guarda antes de publicar: si el post sale bien, esto se reusa para mostrar
  // el Rep recien publicado al toque (ver mas abajo) en vez del media_url
  // remoto, que recien subido tarda en volver a bajar de la red.
  const localPreviewUrl = pendingMedia?.previewUrl;
  const localPreviewKind = pendingMedia?.kind;
  const mediaUrl = pendingMedia?.uploadedUrl;
  const mediaType = pendingMedia?.uploadedType;

  // try/finally: si algo de aca adentro tira una excepcion no prevista (red,
  // render, lo que sea), el composer no puede quedar pegado en "Publicando..."
  // para siempre -- setPublishing(false) tiene que correr siempre.
  try {
    const { post, error } = await createPost(userId, content, mediaUrl, mediaType);
    if (error || !post) {
      composerAlert.innerHTML = `<p>${escapeHtml(error || "No se pudo publicar el Rep.")}</p>`;
      return;
    }

    const hydrated = await getPost(post.id).catch(() => null);
    if (hydrated) {
      if (localPreviewUrl && localPreviewKind === mediaType) {
        hydrated.media_url = localPreviewUrl;
        setTimeout(() => URL.revokeObjectURL(localPreviewUrl), 60_000);
      }
      posts = [hydrated, ...posts];
      renderFeed();
    }

    composerInput.value = "";
    // keepUploadedFile=true: el archivo ya subido es el que acaba de quedar
    // referenciado por el Rep recien publicado, no hay que borrarlo del bucket.
    clearPendingMedia(!!localPreviewUrl, true);
  } catch (err) {
    console.error("[feed] error publicando Rep:", err);
    composerAlert.innerHTML = `<p>No se pudo publicar el Rep. Probá de nuevo.</p>`;
  } finally {
    setPublishing(false);
    updateComposerState();
  }
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
  viewerId: userId,
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
  onOpenPost: (post) => goToPost(post.id),
  // El feed mezcla autores a proposito -- "otro video, sea del mismo usuario o de otro"
  // (a diferencia del perfil, ver getVideoQueue ahi). Cierra sobre `posts` en vivo (no una
  // copia): sigue trayendo videos nuevos aunque el Rep tocado venga de una tanda vieja de
  // scroll infinito cargada antes de que el feed creciera.
  getVideoQueue: () => posts.filter((p) => p.media_type === "video" && p.media_url),
};

function renderFeed(): void {
  listEl.innerHTML = posts.length
    ? posts.map((p) => renderPostCard(p, userId)).join("")
    : `<p class="exc-pick-empty">Todavía no hay Reps. ¡Publicá el primero!</p>`;
  wirePostCard(listEl, posts, postCardHandlers);
}

// Suma posts al final sin tocar los ya renderizados (a diferencia de renderFeed,
// que pisa TODO el innerHTML): reemplazar toda la lista al cargar mas Reps hacia
// abajo le hacia perder al navegador la referencia de scroll y saltaba al principio
// de la pagina. Wireado en un contenedor aparte para no volver a enganchar los
// listeners de las cards viejas (quedarian duplicados).
function appendFeedPosts(newPosts: FeedPost[]): void {
  const temp = document.createElement("div");
  temp.innerHTML = newPosts.map((p) => renderPostCard(p, userId)).join("");
  wirePostCard(temp, newPosts, postCardHandlers);
  while (temp.firstChild) listEl.appendChild(temp.firstChild);
}

// Mismo criterio que appendFeedPosts pero al principio (pull-to-refresh, ver mas abajo):
// no hace falta preservar scroll aca porque este gesto solo dispara estando ya arriba
// del todo, asi que los Reps nuevos aparecen justo donde esta mirando el usuario.
function prependFeedPosts(newPosts: FeedPost[]): void {
  listEl.querySelector(".exc-pick-empty")?.remove();
  const temp = document.createElement("div");
  temp.innerHTML = newPosts.map((p) => renderPostCard(p, userId)).join("");
  wirePostCard(temp, newPosts, postCardHandlers);
  while (temp.lastChild) listEl.insertBefore(temp.lastChild, listEl.firstChild);
}

// Cuenta solo lo que ya trajo el server (no la lista local, que puede tener
// Reps propios agregados adelante al publicar/citar) -- el orden prioriza la
// fecha pero no es puramente cronologico (algoritmo + variedad aleatoria en
// cada llamada, ver get_personalized_feed), asi que un cursor de "antes de
// tal fecha" no sirve para paginar; offset es lo mas simple que funciona.
let feedOffset = 0;
let isLoadingMore = false;
let feedExhausted = false;

// Un seed fijo por carga de pagina (no por request): se lo mandamos a CADA
// llamada de getPersonalizedFeed (la inicial y todos los loadMore) para que el
// orden con jitter aleatorio del algoritmo sea estable durante todo el scroll y
// no repita un Rep que ya se mostro en una pagina anterior. Distinto en cada
// entrada al feed (F5, volver a la pagina), asi sigue habiendo variedad entre
// visitas. Ver el comentario en get_personalized_feed para el detalle.
const feedSeed = crypto.randomUUID();
const shownPostIds = new Set<string>();

async function loadMore(): Promise<void> {
  if (isLoadingMore || feedExhausted) return;
  isLoadingMore = true;
  sentinelSpinner.hidden = false;
  const older = await getPersonalizedFeed(feedOffset, FEED_PAGE_SIZE, feedSeed);
  isLoadingMore = false;
  sentinelSpinner.hidden = true;

  feedOffset += older.length;
  // Segunda barrera ademas del seed estable: bajo ningun motivo se repite un
  // Rep ya mostrado en esta sesion de scroll, pase lo que pase del lado del server.
  const fresh = older.filter((p) => !shownPostIds.has(p.id));
  fresh.forEach((p) => shownPostIds.add(p.id));

  if (older.length === 0) {
    feedExhausted = true;
    feedObserver.disconnect();
    return;
  }
  if (fresh.length > 0) {
    posts = [...posts, ...fresh];
    appendFeedPosts(fresh);
  }
  if (older.length < FEED_PAGE_SIZE) {
    feedExhausted = true;
    feedObserver.disconnect();
    return;
  }
  // Si esta pagina vino entera repetida (0 nuevos), el sentinel no vuelve a
  // disparar solo -- pedimos la proxima pagina de una para no dejar el feed
  // trabado sin avisar.
  if (fresh.length === 0) void loadMore();
}

// Scroll infinito: el sentinel vive siempre al final de la lista (fuera de
// #postFeedList, asi renderFeed() no lo pisa) y dispara loadMore() apenas
// entra en viewport. rootMargin adelanta el disparo ~600px antes de que el
// sentinel sea visible de verdad, para que la carga no se note como corte.
// root:null funciona igual en mobile (scrollea la ventana) que en desktop
// (scrollea .feed-main): IntersectionObserver respeta el clipping de
// cualquier ancestro con overflow, no solo el root explicito.
const feedObserver = new IntersectionObserver(
  (entries) => {
    if (entries[0]?.isIntersecting) void loadMore();
  },
  { rootMargin: "600px 0px" }
);
feedObserver.observe(sentinel);

// ---------------------------------------------------------------------------
// Pull-to-refresh (solo mobile, gesto táctil): arrastrar hacia abajo estando ya
// arriba del todo del feed pide Reps nuevos y los mete al principio, sin tocar
// los que ya se venían mostrando (mismo shownPostIds que usa loadMore() para no
// repetir nada, ahora también contra ese lado).
// ---------------------------------------------------------------------------

const pullIndicator = document.getElementById("pullRefreshIndicator") as HTMLDivElement;
const PULL_THRESHOLD = 70;
const PULL_MAX = 110;
const PULL_LOADING_HEIGHT = 56;

let pullDragging = false;
let pullActive = false; // true una vez que se movio hacia abajo lo suficiente como para contar como "pull" y no un scroll comun
let pullStartY = 0;
let isRefreshing = false;

function isMobileFeedLayout(): boolean {
  return window.matchMedia("(max-width: 859px)").matches;
}

// En mobile el que scrollea es la ventana (ver comentario del IntersectionObserver
// arriba); en desktop es .feed-main, pero el gesto de pull solo esta pensado para touch
// en mobile, asi que alcanza con mirar el scroll de la ventana.
function isAtTop(): boolean {
  return (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
}

function setPullHeight(px: number, animated: boolean): void {
  pullIndicator.classList.toggle("pull-refresh-animate", animated);
  pullIndicator.style.height = `${px}px`;
}

async function refreshFeed(): Promise<void> {
  isRefreshing = true;
  setPullHeight(PULL_LOADING_HEIGHT, true);
  try {
    const fresh = await getPersonalizedFeed(0, FEED_PAGE_SIZE, crypto.randomUUID());
    const newOnes = fresh.filter((p) => !shownPostIds.has(p.id));
    newOnes.forEach((p) => shownPostIds.add(p.id));
    if (newOnes.length > 0) {
      posts = [...newOnes, ...posts];
      prependFeedPosts(newOnes);
    }
  } catch {
    // silencioso: un pull-to-refresh fallido no tiene mucho mas que mostrar que "no paso nada"
  } finally {
    setPullHeight(0, true);
    isRefreshing = false;
  }
}

document.addEventListener(
  "touchstart",
  (e) => {
    if (isRefreshing || !isMobileFeedLayout() || !isAtTop()) return;
    pullDragging = true;
    pullActive = false;
    pullStartY = e.touches[0].clientY;
  },
  { passive: true }
);

document.addEventListener(
  "touchmove",
  (e) => {
    if (!pullDragging) return;
    const deltaY = e.touches[0].clientY - pullStartY;
    if (deltaY <= 0 || !isAtTop()) {
      pullDragging = false;
      if (pullActive) setPullHeight(0, true);
      pullActive = false;
      return;
    }
    pullActive = true;
    e.preventDefault(); // corta el rebote/pull-to-refresh nativo mientras dura el gesto propio
    setPullHeight(Math.min(deltaY * 0.5, PULL_MAX), false);
  },
  { passive: false }
);

function onPullEnd(): void {
  if (!pullDragging) return;
  pullDragging = false;
  if (!pullActive) return;
  pullActive = false;
  const reached = pullIndicator.getBoundingClientRect().height >= PULL_THRESHOLD;
  if (reached) void refreshFeed();
  else setPullHeight(0, true);
}
document.addEventListener("touchend", onPullEnd);
document.addEventListener("touchcancel", onPullEnd);

posts = await getPersonalizedFeed(0, FEED_PAGE_SIZE, feedSeed);
posts.forEach((p) => shownPostIds.add(p.id));
feedOffset = posts.length;
renderFeed();
if (posts.length < FEED_PAGE_SIZE) {
  feedExhausted = true;
  feedObserver.disconnect();
}

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
