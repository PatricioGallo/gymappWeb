import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { renderVerifiedBadge } from "../lib/verifiedBadge";
import { supabase } from "../lib/supabaseClient";
import { AudioRecorder, formatDuration } from "../lib/audioRecorder";
import { getPostsByIds, type FeedPost } from "../services/post.service";
import {
  listConversations,
  listMessages,
  sendMessage,
  markConversationRead,
  acceptMessageRequest,
  declineMessageRequest,
  uploadChatImage,
  uploadChatAudio,
  getChatAttachmentUrl,
  getConversationPeerMeta,
  MESSAGES_PAGE_SIZE,
  AUDIO_MAX_SECONDS,
  type ChatMessage,
} from "../services/chat.service";
import { refreshChatBadge } from "../lib/chat";
import { watchPeerOnline } from "../lib/presence";
import { getCachedMessages, cacheMessages } from "../lib/chatDb";

setupNavToggle();
setupRevealObserver();
const userId = await requireAuth();

const urlParams = new URLSearchParams(window.location.search);
const conversationId = urlParams.get("c");
if (!conversationId) {
  window.location.href = "chats.html";
  throw new Error("missing conversation id");
}

// Cargado dentro del iframe del panel derecho en chats.html (vista de escritorio):
// oculta el header/flecha-atras propios via CSS y evita que el link al perfil
// navegue solo el iframe angosto (target=_top rompe afuera, a toda la pestaña).
const isEmbedded = urlParams.get("embed") === "1";
if (isEmbedded) document.body.classList.add("chat-embedded");

// mark_conversation_read solo actualiza "messages", no dispara la suscripcion realtime
// del badge del header (que escucha "conversations") -- por eso el iconito de mensaje
// pendiente se quedaba pegado hasta el proximo poll. Lo refrescamos a mano aca mismo.
// En desktop este chat corre embebido en un iframe dentro de chats.html (ver arriba), asi
// que el header/badge visible es el del documento padre, no el de este iframe.
async function markReadAndRefreshBadge(): Promise<void> {
  await markConversationRead(conversationId!);
  void refreshChatBadge();
  if (isEmbedded && window.parent !== window) void refreshChatBadge(window.parent.document);
}

const profileLink = document.getElementById("chatThreadProfileLink") as HTMLAnchorElement;
if (isEmbedded) profileLink.target = "_top";
const avatarEl = document.getElementById("chatThreadAvatar") as HTMLImageElement;
const nameEl = document.getElementById("chatThreadName")!;
const statusEl = document.getElementById("chatThreadStatus")!;
const requestBanner = document.getElementById("chatRequestBanner") as HTMLDivElement;
const requestBannerName = document.getElementById("chatRequestBannerName")!;
const bannerAcceptBtn = document.getElementById("chatBannerAccept") as HTMLButtonElement;
const bannerDeclineBtn = document.getElementById("chatBannerDecline") as HTMLButtonElement;
const pendingNote = document.getElementById("chatPendingNote") as HTMLParagraphElement;
const messagesEl = document.getElementById("chatMessages") as HTMLDivElement;
const scrollBottomBtn = document.getElementById("chatScrollBottomBtn") as HTMLButtonElement;
const composerInput = document.getElementById("chatComposerInput") as HTMLTextAreaElement;
const imageInput = document.getElementById("chatImageInput") as HTMLInputElement;
const micBtn = document.getElementById("chatMicBtn") as HTMLButtonElement;
const sendBtn = document.getElementById("chatSendBtn") as HTMLButtonElement;
const recordBar = document.getElementById("chatRecordBar") as HTMLDivElement;
const recordTimeEl = document.getElementById("chatRecordTime")!;
const recordWaveCanvas = document.getElementById("chatRecordWave") as HTMLCanvasElement;
const recordCancelBtn = document.getElementById("chatRecordCancel") as HTMLButtonElement;
const previewBar = document.getElementById("chatPreviewBar") as HTMLDivElement;
const previewImg = document.getElementById("chatPreviewImg") as HTMLImageElement;
const previewAudioLabel = document.getElementById("chatPreviewAudioLabel") as HTMLSpanElement;
const previewAudioDuration = document.getElementById("chatPreviewAudioDuration")!;
const previewCancelBtn = document.getElementById("chatPreviewCancel") as HTMLButtonElement;

let messages: ChatMessage[] = [];
const renderedIds = new Set<string>();
const attachmentUrlCache = new Map<string, string>();
// Reps compartidos en el chat: se resuelven en batch (una consulta por pagina cargada,
// no una por burbuja) y quedan cacheados por id para no repetir el fetch.
const sharedPostsCache = new Map<string, FeedPost>();
const audioPlayers = new Map<string, HTMLAudioElement>();
// Forma de onda precalculada (una vez por mensaje) a partir del audio ya grabado, para
// mostrar las barras reales y no solo un pulso generico. Aparte del <audio> de reproduccion:
// si el fetch falla (ej. CORS), el audio sigue sonando igual, solo sin la onda dibujada.
const audioWaveLevels = new Map<string, number[]>();
let currentlyPlayingId: string | null = null;
let isInitiator = false;
let conversationStatus: "pending" | "accepted" = "pending";
let readReceiptsEnabled = true;

// ---------------------------------------------------------------------------
// Carga inicial: encuentro la conversación en mi propia lista (ya trae el
// perfil del otro participante resuelto) en vez de pedir un RPC dedicado.
// ---------------------------------------------------------------------------

const conversations = await listConversations();
const conversation = conversations.find((c) => c.conversation_id === conversationId);
if (!conversation) {
  window.location.href = "chats.html";
  throw new Error("conversation not found or not a participant");
}

isInitiator = conversation.is_initiator;
conversationStatus = conversation.status as "pending" | "accepted";

nameEl.textContent = "";
nameEl.insertAdjacentHTML("beforeend", `${escapeHtml(conversation.other_username ?? "")}${renderVerifiedBadge(conversation.other_user_type ?? "usuario", conversation.other_is_verified)}`);
avatarEl.src = conversation.other_avatar_url || "/images/avatars/default.svg";
profileLink.href = `profile.html?u=${encodeURIComponent(conversation.other_username ?? "")}`;
requestBannerName.textContent = conversation.other_username ?? "";

// lastSeenAt viene null si la privacidad reciproca (la mia y la del otro) no
// permite mostrarla; readReceiptsEnabled gatea el "visto azul" de cada tick.
const peerMeta = await getConversationPeerMeta(conversation.other_user_id);
readReceiptsEnabled = peerMeta.readReceiptsEnabled;
let peerLastSeenAt = peerMeta.lastSeenAt;
let peerOnline = false;
statusEl.textContent = peerLastSeenAt ? lastSeenLabel(peerLastSeenAt) : "";

// "En línea" respeta la misma privacidad reciproca que ya gatea last_seen_at server-side:
// si vino null es que ninguno de los dos quiere mostrar su actividad, y no tendria sentido
// revelar presencia en vivo cuando ni el ultimo visto se muestra.
if (peerLastSeenAt) {
  watchPeerOnline(conversation.other_user_id, (online) => {
    if (!online && peerOnline) peerLastSeenAt = new Date().toISOString(); // se acaba de desconectar
    peerOnline = online;
    statusEl.textContent = online ? "En línea" : peerLastSeenAt ? lastSeenLabel(peerLastSeenAt) : "";
  });
}

function renderBanners(): void {
  requestBanner.hidden = !(conversationStatus === "pending" && !isInitiator);
  pendingNote.hidden = !(conversationStatus === "pending" && isInitiator);
}
renderBanners();

bannerAcceptBtn.addEventListener("click", async () => {
  bannerAcceptBtn.disabled = true;
  bannerDeclineBtn.disabled = true;
  const { error } = await acceptMessageRequest(conversationId!);
  if (error) {
    alert(error);
    bannerAcceptBtn.disabled = false;
    bannerDeclineBtn.disabled = false;
    return;
  }
  conversationStatus = "accepted";
  renderBanners();
});

bannerDeclineBtn.addEventListener("click", async () => {
  if (!confirm("¿Rechazar esta solicitud de mensaje?")) return;
  bannerAcceptBtn.disabled = true;
  bannerDeclineBtn.disabled = true;
  const { error } = await declineMessageRequest(conversationId!);
  if (error) {
    alert(error);
    bannerAcceptBtn.disabled = false;
    bannerDeclineBtn.disabled = false;
    return;
  }
  window.location.href = "chats.html";
});

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Hoy";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function lastSeenLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "Últ. vez hace un momento";
  if (diffMin < 60) return `Últ. vez hace ${diffMin} min`;
  const time = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Últ. vez hoy a las ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Últ. vez ayer a las ${time}`;
  return `Últ. vez el ${d.toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`;
}

const CHECK_ICON_PATHS = `<path d="M1 7.5 4.5 11 11 3"/><path d="M5 7.5 8.5 11 15 3"/>`;

function ticksHtml(m: ChatMessage): string {
  const isRead = readReceiptsEnabled && Boolean(m.read_at);
  return `<svg class="chat-bubble-ticks${isRead ? " is-read" : ""}" viewBox="0 0 16 15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${CHECK_ICON_PATHS}</svg>`;
}

async function hydrateSharedPosts(list: ChatMessage[]): Promise<void> {
  const ids = [...new Set(list.map((m) => m.shared_post_id).filter((id): id is string => !!id))].filter((id) => !sharedPostsCache.has(id));
  if (ids.length === 0) return;
  const map = await getPostsByIds(ids);
  map.forEach((post, id) => sharedPostsCache.set(id, post));
}

function sharedPostPreviewHtml(postId: string): string {
  const post = sharedPostsCache.get(postId);
  if (!post) return `<div class="chat-shared-post chat-shared-post-missing">Rep no disponible</div>`;
  const content = post.content ?? "";
  const preview = content.length > 100 ? `${content.slice(0, 100)}…` : content;
  const thumb = post.media_url
    ? post.media_type === "video"
      ? `<video class="chat-shared-post-thumb" src="${escapeHtml(post.media_url)}" muted playsinline autoplay loop preload="metadata"></video>`
      : `<img class="chat-shared-post-thumb" src="${escapeHtml(post.media_url)}" alt="">`
    : "";
  return `
    <a class="chat-shared-post" href="post.html?id=${encodeURIComponent(post.id)}">
      <div class="chat-shared-post-head">
        <img class="chat-shared-post-avatar" src="${escapeHtml(post.author.avatarUrl || "/images/avatars/default.svg")}" alt="">
        <span class="chat-shared-post-name">${escapeHtml(post.author.username)}${renderVerifiedBadge(post.author.userType, post.author.isVerified, 12)}</span>
      </div>
      ${preview ? `<p class="chat-shared-post-text">${escapeHtml(preview)}</p>` : ""}
      ${thumb}
    </a>
  `;
}

function bubbleHtml(m: ChatMessage, isMe: boolean): string {
  let mediaHtml = "";
  if (m.shared_post_id) {
    mediaHtml = sharedPostPreviewHtml(m.shared_post_id);
  } else if (m.attachment_type === "image" && m.attachment_path) {
    mediaHtml = `
      <button type="button" class="chat-bubble-image" data-path="${escapeHtml(m.attachment_path)}">
        <img data-path="${escapeHtml(m.attachment_path)}" alt="Foto" class="chat-bubble-img-el">
      </button>
    `;
  } else if (m.attachment_type === "audio" && m.attachment_path) {
    mediaHtml = `
      <div class="chat-audio-player">
        <button type="button" class="chat-audio-toggle" data-id="${m.id}" data-path="${escapeHtml(m.attachment_path)}" aria-label="Reproducir audio">
          <svg class="chat-audio-icon-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          <svg class="chat-audio-icon-pause" viewBox="0 0 24 24" fill="currentColor" hidden><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>
        <canvas class="chat-audio-wave" data-id="${m.id}"></canvas>
        <span class="chat-audio-time" data-id="${m.id}">${formatDuration(m.attachment_duration_seconds ?? 0)}</span>
      </div>
    `;
  }
  const textHtml = m.content ? `<p class="chat-bubble-text">${escapeHtml(m.content)}</p>` : "";
  return `
    <div class="chat-bubble ${isMe ? "chat-bubble-me" : "chat-bubble-other"}" data-id="${m.id}">
      ${mediaHtml}
      ${textHtml}
      <span class="chat-bubble-time">${timeLabel(m.created_at)}${isMe ? ticksHtml(m) : ""}</span>
    </div>
  `;
}

function buildMessagesHtml(list: ChatMessage[]): string {
  let html = "";
  let lastDay: string | null = null;
  for (const m of list) {
    const day = new Date(m.created_at).toDateString();
    if (day !== lastDay) {
      html += `<div class="chat-date-divider"><span>${dayLabel(m.created_at)}</span></div>`;
      lastDay = day;
    }
    html += bubbleHtml(m, m.sender_id === userId);
  }
  return html;
}

async function resolveAttachmentUrl(path: string): Promise<string | null> {
  const cached = attachmentUrlCache.get(path);
  if (cached) return cached;
  const url = await getChatAttachmentUrl(path);
  if (url) attachmentUrlCache.set(path, url);
  return url;
}

async function hydrateImages(): Promise<void> {
  const imgs = messagesEl.querySelectorAll<HTMLImageElement>(".chat-bubble-img-el[data-path]");
  await Promise.all(
    Array.from(imgs)
      .filter((img) => !img.src)
      .map(async (img) => {
        const url = await resolveAttachmentUrl(img.dataset.path!);
        if (url) img.src = url;
      })
  );
}

function refreshBubbleTicks(m: ChatMessage): void {
  if (m.sender_id !== userId) return;
  const timeEl = messagesEl.querySelector<HTMLElement>(`.chat-bubble[data-id="${m.id}"] .chat-bubble-time`);
  if (!timeEl) return;
  timeEl.innerHTML = `${timeLabel(m.created_at)}${ticksHtml(m)}`;
}

// .chat-messages tiene scroll-behavior:smooth en CSS (para que un mensaje nuevo
// aparezca con una animacion linda) -- esa propiedad tambien pisa una asignacion
// directa de scrollTop, no solo scrollTo()/scrollIntoView(). Por eso hace falta
// pedir "instant" explicitamente para las correcciones de posicion que no
// tienen que animarse (abrir la conversacion, cargar mensajes viejos arriba).
function scrollToBottom(behavior: ScrollBehavior = "smooth"): void {
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, left: 0, behavior });
}

// Aparece si te alejaste bastante del final (mismo umbral que "wasNearBottom" en
// appendMessage) -- para volver de un salto si scrolleaste muy arriba en el historial.
function updateScrollBottomBtn(): void {
  const distanceFromBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
  scrollBottomBtn.hidden = distanceFromBottom < 300;
}

messagesEl.addEventListener("scroll", updateScrollBottomBtn);
scrollBottomBtn.addEventListener("click", () => scrollToBottom());

// Solo se carga la ultima pagina de entrada (arranca directo ahi, ver
// scrollToBottom("instant") mas abajo); el resto de la conversacion se trae de a
// paginas cuando el usuario scrollea cerca del principio (ver olderMessagesObserver),
// nunca todo junto -- pensado para conversaciones que con el tiempo pueden ser largas.
const SENTINEL_HTML = `<div class="chat-load-sentinel" id="chatLoadSentinel"><div class="modern-spinner" id="chatLoadSpinner" hidden></div></div>`;

let olderExhausted = false;
let isLoadingOlder = false;

// El sentinel vive siempre como primer hijo de #chatMessages, asi que cada
// reconstruccion del innerHTML lo recrea -- por eso se vuelve a observar el
// nodo nuevo despues de cada render en vez de observar uno solo fijo.
const olderMessagesObserver = new IntersectionObserver(
  (entries) => {
    if (entries[0]?.isIntersecting) void prependOlderMessages();
  },
  { root: messagesEl, rootMargin: "150px 0px" }
);

function observeLoadSentinel(): void {
  const sentinel = document.getElementById("chatLoadSentinel");
  if (sentinel) olderMessagesObserver.observe(sentinel);
}

async function renderInitialMessages(): Promise<void> {
  // Pintado instantaneo desde IndexedDB si este chat ya fue precargado (ver
  // prefetchRecentThreads en chats.ts) o visitado antes -- evita el spinner de
  // entrada en el caso comun. Igual se reconcilia siempre contra el servidor
  // abajo, este primer pintado es solo para no hacer esperar a la red.
  const cached = await getCachedMessages(conversationId!);
  if (cached.length > 0) {
    messages = cached;
    messages.forEach((m) => renderedIds.add(m.id));
    await hydrateSharedPosts(messages);
    messagesEl.innerHTML = buildMessagesHtml(messages);
    await hydrateImages();
    scrollToBottom("instant");
  } else {
    messagesEl.innerHTML = `<div class="chat-messages-loading"><div class="modern-spinner"></div></div>`;
  }

  const page = await listMessages(conversationId!);
  messages = page.slice().reverse();
  messages.forEach((m) => renderedIds.add(m.id));
  await hydrateSharedPosts(messages);
  olderExhausted = page.length < MESSAGES_PAGE_SIZE;
  messagesEl.innerHTML = messages.length
    ? (olderExhausted ? "" : SENTINEL_HTML) + buildMessagesHtml(messages)
    : `<p class="notif-empty">Todavía no hay mensajes. ¡Escribí el primero!</p>`;
  await hydrateImages();
  scrollToBottom("instant"); // abre directo posicionado ahi, sin animar el salto
  if (!olderExhausted) observeLoadSentinel();
  void cacheMessages(conversationId!, page);

  const hasUnreadFromOther = messages.some((m) => m.sender_id !== userId && !m.read_at);
  if (hasUnreadFromOther) void markReadAndRefreshBadge();
}

async function prependOlderMessages(): Promise<void> {
  if (messages.length === 0 || olderExhausted || isLoadingOlder) return;
  isLoadingOlder = true;
  const spinner = document.getElementById("chatLoadSpinner");
  if (spinner) spinner.hidden = false; // si tarda un toque, que se note que esta cargando

  const older = await listMessages(conversationId!, messages[0].created_at);
  isLoadingOlder = false;

  if (older.length === 0) {
    olderExhausted = true;
    olderMessagesObserver.disconnect();
    document.getElementById("chatLoadSentinel")?.remove();
    return;
  }
  const ascendingOlder = older.slice().reverse();
  ascendingOlder.forEach((m) => renderedIds.add(m.id));
  messages = [...ascendingOlder, ...messages];
  await hydrateSharedPosts(ascendingOlder);

  olderExhausted = older.length < MESSAGES_PAGE_SIZE;
  const prevScrollHeight = messagesEl.scrollHeight;
  messagesEl.innerHTML = (olderExhausted ? "" : SENTINEL_HTML) + buildMessagesHtml(messages);
  await hydrateImages();
  messagesEl.scrollTo({ top: messagesEl.scrollHeight - prevScrollHeight, left: 0, behavior: "instant" });
  if (olderExhausted) olderMessagesObserver.disconnect();
  else observeLoadSentinel();
}

async function appendMessage(m: ChatMessage): Promise<void> {
  if (renderedIds.has(m.id)) return;
  renderedIds.add(m.id);
  await hydrateSharedPosts([m]);

  const lastDayBefore = messages.length > 0 ? new Date(messages[messages.length - 1].created_at).toDateString() : null;
  messages.push(m);

  const wasNearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 150;
  if (messagesEl.querySelector(".notif-empty")) messagesEl.innerHTML = "";

  let html = "";
  const day = new Date(m.created_at).toDateString();
  if (day !== lastDayBefore) html += `<div class="chat-date-divider"><span>${dayLabel(m.created_at)}</span></div>`;
  html += bubbleHtml(m, m.sender_id === userId);
  messagesEl.insertAdjacentHTML("beforeend", html);
  void hydrateImages();
  if (wasNearBottom) scrollToBottom();
  else updateScrollBottomBtn(); // el mensaje nuevo alejo aun mas el final, sin disparar "scroll"
}

await renderInitialMessages();

// ---------------------------------------------------------------------------
// Realtime: mensajes nuevos + actualizaciones de lectura (doble check)
// ---------------------------------------------------------------------------

supabase
  .channel(`chat-thread-${conversationId}`)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
    const msg = payload.new as ChatMessage;
    void appendMessage(msg);
    if (msg.sender_id !== userId && document.visibilityState === "visible") {
      void markReadAndRefreshBadge();
    }
    if (msg.sender_id !== userId && conversationStatus === "pending" && isInitiator) {
      conversationStatus = "accepted";
      renderBanners();
    }
  })
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
    const updated = payload.new as ChatMessage;
    const idx = messages.findIndex((m) => m.id === updated.id);
    if (idx !== -1) messages[idx] = updated;
    refreshBubbleTicks(updated);
  })
  .subscribe();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const hasUnreadFromOther = messages.some((m) => m.sender_id !== userId && !m.read_at);
  if (hasUnreadFromOther) void markReadAndRefreshBadge();
});

// ---------------------------------------------------------------------------
// Audio: reproducción de mensajes grabados
// ---------------------------------------------------------------------------

function setPlayIcon(btn: HTMLButtonElement, showPlay: boolean): void {
  btn.querySelector(".chat-audio-icon-play")?.toggleAttribute("hidden", !showPlay);
  btn.querySelector(".chat-audio-icon-pause")?.toggleAttribute("hidden", showPlay);
}

/** Decodifica el audio ya subido para sacar la forma real de la onda (picos por bloque), una sola vez por mensaje. */
async function loadWaveform(id: string, url: string): Promise<void> {
  if (audioWaveLevels.has(id)) return;
  try {
    const arrayBuffer = await (await fetch(url)).arrayBuffer();
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    void audioCtx.close();

    const channel = audioBuffer.getChannelData(0);
    const barsCount = 40;
    const blockSize = Math.max(1, Math.floor(channel.length / barsCount));
    const peaks: number[] = [];
    for (let i = 0; i < barsCount; i++) {
      const start = i * blockSize;
      const end = Math.min(channel.length, start + blockSize);
      let sum = 0;
      for (let j = start; j < end; j++) sum += Math.abs(channel[j]);
      peaks.push(sum / Math.max(1, end - start));
    }
    const max = Math.max(...peaks, 0.0001);
    audioWaveLevels.set(
      id,
      peaks.map((v) => Math.max(0.12, v / max))
    );
    drawPlaybackWave(id, 0);
  } catch {
    // silencioso: sin CORS o error de red no se puede analizar el archivo, pero el
    // audio se sigue reproduciendo normal a traves del <audio> de siempre.
  }
}

/** Dibuja la onda de un mensaje ya reproducido/en reproduccion, resaltando lo ya escuchado (0 a 1). */
function drawPlaybackWave(id: string, progress: number): void {
  const levels = audioWaveLevels.get(id);
  const canvas = messagesEl.querySelector<HTMLCanvasElement>(`.chat-audio-wave[data-id="${id}"]`);
  if (!levels || !canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const barWidth = 3;
  const gap = 2;
  const step = barWidth + gap;
  const color = getComputedStyle(canvas).color;

  levels.forEach((level, i) => {
    const x = i * step;
    if (x > width) return;
    const barHeight = Math.max(2, level * height);
    const y = (height - barHeight) / 2;
    ctx.globalAlpha = i / levels.length <= progress ? 1 : 0.35;
    ctx.fillStyle = color;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
    else ctx.rect(x, y, barWidth, barHeight);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

async function toggleAudioMessage(btn: HTMLButtonElement): Promise<void> {
  const id = btn.dataset.id!;
  const path = btn.dataset.path!;
  let audio = audioPlayers.get(id);

  if (!audio) {
    const url = await resolveAttachmentUrl(path);
    if (!url) {
      alert("No se pudo cargar el audio.");
      return;
    }
    audio = new Audio(url);
    audioPlayers.set(id, audio);
    void loadWaveform(id, url);
    const timeEl = messagesEl.querySelector<HTMLElement>(`.chat-audio-time[data-id="${id}"]`);
    const originalDuration = timeEl?.textContent ?? "0:00";
    audio.addEventListener("timeupdate", () => {
      if (!timeEl || !audio) return;
      const remaining = Math.max(0, Math.ceil(audio.duration - audio.currentTime));
      timeEl.textContent = Number.isFinite(remaining) ? formatDuration(remaining) : originalDuration;
      drawPlaybackWave(id, audio.duration ? audio.currentTime / audio.duration : 0);
    });
    audio.addEventListener("ended", () => {
      setPlayIcon(btn, true);
      if (timeEl) timeEl.textContent = originalDuration;
      currentlyPlayingId = null;
      drawPlaybackWave(id, 0);
    });
  }

  if (currentlyPlayingId && currentlyPlayingId !== id) {
    const prevAudio = audioPlayers.get(currentlyPlayingId);
    prevAudio?.pause();
    const prevBtn = messagesEl.querySelector<HTMLButtonElement>(`.chat-audio-toggle[data-id="${currentlyPlayingId}"]`);
    if (prevBtn) setPlayIcon(prevBtn, true);
  }

  if (audio.paused) {
    await audio.play();
    setPlayIcon(btn, false);
    currentlyPlayingId = id;
  } else {
    audio.pause();
    setPlayIcon(btn, true);
    currentlyPlayingId = null;
  }
}

async function openLightbox(path: string): Promise<void> {
  const url = await resolveAttachmentUrl(path);
  if (!url) return;
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="chat-lightbox">
        <img src="${escapeHtml(url)}" alt="Foto">
        <button type="button" class="btn btn-outline" id="closeChatLightbox">Cerrar</button>
      </div>
    </div>
  `;
  document.getElementById("closeChatLightbox")?.addEventListener("click", () => {
    loaderBody.innerHTML = "";
  });
}

messagesEl.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const imageBtn = target.closest<HTMLButtonElement>(".chat-bubble-image");
  if (imageBtn) {
    void openLightbox(imageBtn.dataset.path!);
    return;
  }
  const audioBtn = target.closest<HTMLButtonElement>(".chat-audio-toggle");
  if (audioBtn) void toggleAudioMessage(audioBtn);
});

// ---------------------------------------------------------------------------
// Composer: texto, foto y grabación de audio
// ---------------------------------------------------------------------------

type PendingAttachment =
  | { kind: "image"; file: File; previewUrl: string }
  | { kind: "audio"; blob: Blob; durationSeconds: number };

let pendingAttachment: PendingAttachment | null = null;
let sending = false;
const recorder = new AudioRecorder();
let recordTimer: ReturnType<typeof setInterval> | undefined;
let recordSeconds = 0;

// ---------------------------------------------------------------------------
// Onda estilo WhatsApp (barras que van apareciendo de derecha a izquierda
// con la altura del volumen muestreado): se reutiliza tanto al grabar como
// al escuchar un audio ya enviado.
// ---------------------------------------------------------------------------

function drawBars(canvas: HTMLCanvasElement, levels: number[], color: string): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const barWidth = 3;
  const gap = 3;
  const step = barWidth + gap;
  const barsFit = Math.max(1, Math.floor(width / step));
  const visible = levels.slice(-barsFit);

  ctx.fillStyle = color;
  const startX = width - visible.length * step;
  visible.forEach((level, i) => {
    const barHeight = Math.max(3, level * height);
    const x = startX + i * step;
    const y = (height - barHeight) / 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
    else ctx.rect(x, y, barWidth, barHeight);
    ctx.fill();
  });
}

const waveLevels: number[] = [];
let waveTimer: ReturnType<typeof setInterval> | undefined;
const recordWaveColor = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff4d4d";

function startWave(): void {
  waveLevels.length = 0;
  waveTimer = setInterval(() => {
    waveLevels.push(recorder.getLevel());
    drawBars(recordWaveCanvas, waveLevels, recordWaveColor());
  }, 100);
}

function stopWave(): void {
  clearInterval(waveTimer);
  waveLevels.length = 0;
  const ctx = recordWaveCanvas.getContext("2d");
  ctx?.clearRect(0, 0, recordWaveCanvas.width, recordWaveCanvas.height);
}

function updateSendState(): void {
  sendBtn.disabled = sending || (!composerInput.value.trim() && !pendingAttachment && !recorder.isRecording);
}

function clearPendingAttachment(): void {
  if (pendingAttachment?.kind === "image") URL.revokeObjectURL(pendingAttachment.previewUrl);
  pendingAttachment = null;
  previewBar.hidden = true;
  previewImg.hidden = true;
  previewAudioLabel.hidden = true;
  updateSendState();
}

function showPreview(): void {
  previewBar.hidden = false;
  previewImg.hidden = true;
  previewAudioLabel.hidden = true;
  if (pendingAttachment?.kind === "image") {
    previewImg.hidden = false;
    previewImg.src = pendingAttachment.previewUrl;
  } else if (pendingAttachment?.kind === "audio") {
    previewAudioLabel.hidden = false;
    previewAudioDuration.textContent = formatDuration(pendingAttachment.durationSeconds);
  }
  updateSendState();
}

composerInput.addEventListener("input", () => {
  composerInput.style.height = "auto";
  composerInput.style.height = `${Math.min(composerInput.scrollHeight, 120)}px`;
  updateSendState();
});

// En mobile, cuando aparece el teclado el layout (100dvh) no siempre se achica,
// asi que el padding extra de abajo del composer le come espacio de pantalla
// al teclado. Lo reducimos apenas se enfoca el textarea (y lo restauramos al
// perder el foco) -- enganchado a focus/blur en vez de a un resize del
// visualViewport porque ese evento compite con la animacion nativa del
// teclado y en iOS provoca parpadeos (el teclado a veces ni llega a abrirse).
composerInput.addEventListener("focus", () => document.body.classList.add("keyboard-open"));
composerInput.addEventListener("blur", () => document.body.classList.remove("keyboard-open"));

// Enter envía el mensaje; Shift+Enter agrega un salto de línea.
composerInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.shiftKey) return;
  e.preventDefault();
  if (!sendBtn.disabled) void handleSend();
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  imageInput.value = "";
  if (!file) return;
  clearPendingAttachment();
  pendingAttachment = { kind: "image", file, previewUrl: URL.createObjectURL(file) };
  showPreview();
});

previewCancelBtn.addEventListener("click", clearPendingAttachment);

/** Corta la grabación en curso y devuelve el adjunto resultante (o null si duró menos de 1s). */
async function stopRecording(): Promise<PendingAttachment | null> {
  clearInterval(recordTimer);
  stopWave();
  const result = await recorder.stop();
  recordBar.hidden = true;
  if (result.durationSeconds < 1) return null;
  return { kind: "audio", blob: result.blob, durationSeconds: result.durationSeconds };
}

async function handleMicClick(): Promise<void> {
  if (recorder.isRecording) {
    const attachment = await stopRecording();
    if (!attachment) return;
    clearPendingAttachment();
    pendingAttachment = attachment;
    showPreview();
    return;
  }

  try {
    await recorder.start();
  } catch {
    alert("No se pudo acceder al micrófono. Revisá los permisos del navegador.");
    return;
  }

  recordSeconds = 0;
  recordTimeEl.textContent = "0:00";
  recordBar.hidden = false;
  startWave();
  updateSendState();
  recordTimer = setInterval(() => {
    recordSeconds += 1;
    recordTimeEl.textContent = formatDuration(recordSeconds);
    if (recordSeconds >= AUDIO_MAX_SECONDS) void handleMicClick();
  }, 1000);
}

micBtn.addEventListener("click", () => void handleMicClick());

recordCancelBtn.addEventListener("click", () => {
  clearInterval(recordTimer);
  stopWave();
  recorder.cancel();
  recordBar.hidden = true;
  updateSendState();
});

// Sin esto, tocar "enviar" con el teclado abierto le saca el foco al textarea
// antes de que el click llegue a dispararse: el teclado se cierra, el layout se
// corre (vuelve el padding grande de .chat-thread-container) y el dedo ya no
// queda sobre el boton, asi que hace falta un segundo toque para que registre.
// Evitando el foco por defecto en touchstart/mousedown el teclado se queda
// abierto y el primer toque ya alcanza para enviar.
sendBtn.addEventListener("mousedown", (e) => e.preventDefault());
sendBtn.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });

sendBtn.addEventListener("click", () => {
  if (!sendBtn.disabled) void handleSend();
});

async function handleSend(): Promise<void> {
  // Enter o el boton de enviar mientras se graba: corta la grabacion y manda
  // el audio directo, sin pasar por el paso intermedio de previsualizacion.
  if (recorder.isRecording) {
    const attachment = await stopRecording();
    if (attachment) {
      clearPendingAttachment();
      pendingAttachment = attachment;
    }
  }

  const content = composerInput.value.trim();
  if (sending || (!content && !pendingAttachment)) return;

  sending = true;
  updateSendState();

  let attachmentPath: string | undefined;
  let attachmentType: "image" | "audio" | undefined;
  let attachmentDurationSeconds: number | undefined;

  if (pendingAttachment?.kind === "image") {
    const { path, error } = await uploadChatImage(conversationId!, pendingAttachment.file);
    if (error || !path) {
      alert(error || "No se pudo subir la imagen.");
      sending = false;
      updateSendState();
      return;
    }
    attachmentPath = path;
    attachmentType = "image";
  } else if (pendingAttachment?.kind === "audio") {
    const { path, error } = await uploadChatAudio(conversationId!, pendingAttachment.blob);
    if (error || !path) {
      alert(error || "No se pudo subir el audio.");
      sending = false;
      updateSendState();
      return;
    }
    attachmentPath = path;
    attachmentType = "audio";
    attachmentDurationSeconds = pendingAttachment.durationSeconds;
  }

  const { message, error } = await sendMessage(conversationId!, {
    content: content || undefined,
    attachmentPath,
    attachmentType,
    attachmentDurationSeconds,
  });

  sending = false;

  if (error || !message) {
    alert(error || "No se pudo enviar el mensaje.");
    updateSendState();
    return;
  }

  composerInput.value = "";
  composerInput.style.height = "auto";
  clearPendingAttachment();
  void appendMessage(message);

  if (conversationStatus === "pending" && isInitiator === false) {
    conversationStatus = "accepted";
    renderBanners();
  }

  updateSendState();
}
