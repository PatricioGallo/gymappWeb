import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { renderVerifiedBadge } from "../lib/verifiedBadge";
import { supabase } from "../lib/supabaseClient";
import { AudioRecorder, formatDuration } from "../lib/audioRecorder";
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
  MESSAGES_PAGE_SIZE,
  AUDIO_MAX_SECONDS,
  type ChatMessage,
} from "../services/chat.service";

setupNavToggle();
setupRevealObserver();
const userId = await requireAuth();

const conversationId = new URLSearchParams(window.location.search).get("c");
if (!conversationId) {
  window.location.href = "chats.html";
  throw new Error("missing conversation id");
}

const profileLink = document.getElementById("chatThreadProfileLink") as HTMLAnchorElement;
const avatarEl = document.getElementById("chatThreadAvatar") as HTMLImageElement;
const nameEl = document.getElementById("chatThreadName")!;
const requestBanner = document.getElementById("chatRequestBanner") as HTMLDivElement;
const requestBannerName = document.getElementById("chatRequestBannerName")!;
const bannerAcceptBtn = document.getElementById("chatBannerAccept") as HTMLButtonElement;
const bannerDeclineBtn = document.getElementById("chatBannerDecline") as HTMLButtonElement;
const pendingNote = document.getElementById("chatPendingNote") as HTMLParagraphElement;
const loadMoreBtn = document.getElementById("chatLoadMoreBtn") as HTMLButtonElement;
const messagesEl = document.getElementById("chatMessages") as HTMLDivElement;
const seenIndicatorEl = document.getElementById("chatSeenIndicator")!;
const composerForm = document.getElementById("chatComposer") as HTMLFormElement;
const composerInput = document.getElementById("chatComposerInput") as HTMLTextAreaElement;
const imageInput = document.getElementById("chatImageInput") as HTMLInputElement;
const micBtn = document.getElementById("chatMicBtn") as HTMLButtonElement;
const sendBtn = document.getElementById("chatSendBtn") as HTMLButtonElement;
const recordBar = document.getElementById("chatRecordBar") as HTMLDivElement;
const recordTimeEl = document.getElementById("chatRecordTime")!;
const recordCancelBtn = document.getElementById("chatRecordCancel") as HTMLButtonElement;
const previewBar = document.getElementById("chatPreviewBar") as HTMLDivElement;
const previewImg = document.getElementById("chatPreviewImg") as HTMLImageElement;
const previewAudioLabel = document.getElementById("chatPreviewAudioLabel") as HTMLSpanElement;
const previewAudioDuration = document.getElementById("chatPreviewAudioDuration")!;
const previewCancelBtn = document.getElementById("chatPreviewCancel") as HTMLButtonElement;

let messages: ChatMessage[] = [];
const renderedIds = new Set<string>();
const attachmentUrlCache = new Map<string, string>();
const audioPlayers = new Map<string, HTMLAudioElement>();
let currentlyPlayingId: string | null = null;
let isInitiator = false;
let conversationStatus: "pending" | "accepted" = "pending";

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

function bubbleHtml(m: ChatMessage, isMe: boolean): string {
  let mediaHtml = "";
  if (m.attachment_type === "image" && m.attachment_path) {
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
        <span class="chat-audio-time" data-id="${m.id}">${formatDuration(m.attachment_duration_seconds ?? 0)}</span>
      </div>
    `;
  }
  const textHtml = m.content ? `<p class="chat-bubble-text">${escapeHtml(m.content)}</p>` : "";
  return `
    <div class="chat-bubble ${isMe ? "chat-bubble-me" : "chat-bubble-other"}" data-id="${m.id}">
      ${mediaHtml}
      ${textHtml}
      <span class="chat-bubble-time">${timeLabel(m.created_at)}</span>
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

function renderSeenIndicator(): void {
  const last = messages[messages.length - 1];
  if (!last || last.sender_id !== userId) {
    seenIndicatorEl.textContent = "";
    return;
  }
  seenIndicatorEl.textContent = last.read_at ? `Visto · ${timeLabel(last.created_at)}` : `Enviado · ${timeLabel(last.created_at)}`;
}

function scrollToBottom(): void {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function renderInitialMessages(): Promise<void> {
  const page = await listMessages(conversationId!);
  messages = page.slice().reverse();
  messages.forEach((m) => renderedIds.add(m.id));
  messagesEl.innerHTML = messages.length
    ? buildMessagesHtml(messages)
    : `<p class="notif-empty">Todavía no hay mensajes. ¡Escribí el primero!</p>`;
  loadMoreBtn.hidden = page.length < MESSAGES_PAGE_SIZE;
  await hydrateImages();
  scrollToBottom();
  renderSeenIndicator();

  const hasUnreadFromOther = messages.some((m) => m.sender_id !== userId && !m.read_at);
  if (hasUnreadFromOther) void markConversationRead(conversationId!);
}

async function prependOlderMessages(): Promise<void> {
  if (messages.length === 0) return;
  loadMoreBtn.disabled = true;
  const older = await listMessages(conversationId!, messages[0].created_at);
  loadMoreBtn.disabled = false;
  if (older.length === 0) {
    loadMoreBtn.hidden = true;
    return;
  }
  const ascendingOlder = older.slice().reverse();
  ascendingOlder.forEach((m) => renderedIds.add(m.id));
  messages = [...ascendingOlder, ...messages];

  const prevScrollHeight = messagesEl.scrollHeight;
  messagesEl.innerHTML = buildMessagesHtml(messages);
  await hydrateImages();
  messagesEl.scrollTop = messagesEl.scrollHeight - prevScrollHeight;
  loadMoreBtn.hidden = older.length < MESSAGES_PAGE_SIZE;
}

loadMoreBtn.addEventListener("click", () => void prependOlderMessages());

function appendMessage(m: ChatMessage): void {
  if (renderedIds.has(m.id)) return;
  renderedIds.add(m.id);

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
  renderSeenIndicator();
}

await renderInitialMessages();

// ---------------------------------------------------------------------------
// Realtime: mensajes nuevos + actualizaciones de lectura (doble check)
// ---------------------------------------------------------------------------

supabase
  .channel(`chat-thread-${conversationId}`)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
    const msg = payload.new as ChatMessage;
    appendMessage(msg);
    if (msg.sender_id !== userId && document.visibilityState === "visible") {
      void markConversationRead(conversationId!);
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
    renderSeenIndicator();
  })
  .subscribe();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const hasUnreadFromOther = messages.some((m) => m.sender_id !== userId && !m.read_at);
  if (hasUnreadFromOther) void markConversationRead(conversationId!);
});

// ---------------------------------------------------------------------------
// Audio: reproducción de mensajes grabados
// ---------------------------------------------------------------------------

function setPlayIcon(btn: HTMLButtonElement, showPlay: boolean): void {
  btn.querySelector(".chat-audio-icon-play")?.toggleAttribute("hidden", !showPlay);
  btn.querySelector(".chat-audio-icon-pause")?.toggleAttribute("hidden", showPlay);
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
    const timeEl = messagesEl.querySelector<HTMLElement>(`.chat-audio-time[data-id="${id}"]`);
    const originalDuration = timeEl?.textContent ?? "0:00";
    audio.addEventListener("timeupdate", () => {
      if (!timeEl || !audio) return;
      const remaining = Math.max(0, Math.ceil(audio.duration - audio.currentTime));
      timeEl.textContent = Number.isFinite(remaining) ? formatDuration(remaining) : originalDuration;
    });
    audio.addEventListener("ended", () => {
      setPlayIcon(btn, true);
      if (timeEl) timeEl.textContent = originalDuration;
      currentlyPlayingId = null;
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

function updateSendState(): void {
  sendBtn.disabled = sending || (!composerInput.value.trim() && !pendingAttachment);
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

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  imageInput.value = "";
  if (!file) return;
  clearPendingAttachment();
  pendingAttachment = { kind: "image", file, previewUrl: URL.createObjectURL(file) };
  showPreview();
});

previewCancelBtn.addEventListener("click", clearPendingAttachment);

async function handleMicClick(): Promise<void> {
  if (recorder.isRecording) {
    clearInterval(recordTimer);
    const result = await recorder.stop();
    recordBar.hidden = true;
    if (result.durationSeconds < 1) return;
    clearPendingAttachment();
    pendingAttachment = { kind: "audio", blob: result.blob, durationSeconds: result.durationSeconds };
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
  recordTimer = setInterval(() => {
    recordSeconds += 1;
    recordTimeEl.textContent = formatDuration(recordSeconds);
    if (recordSeconds >= AUDIO_MAX_SECONDS) void handleMicClick();
  }, 1000);
}

micBtn.addEventListener("click", () => void handleMicClick());

recordCancelBtn.addEventListener("click", () => {
  clearInterval(recordTimer);
  recorder.cancel();
  recordBar.hidden = true;
});

composerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  void handleSend();
});

async function handleSend(): Promise<void> {
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
  appendMessage(message);

  if (conversationStatus === "pending" && isInitiator === false) {
    conversationStatus = "accepted";
    renderBanners();
  }

  updateSendState();
}
