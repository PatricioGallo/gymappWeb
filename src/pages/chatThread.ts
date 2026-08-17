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
  getOrCreateConversation,
  pinMessage,
  unpinMessage,
  getConversationPinnedMessageId,
  getMessageById,
  copyChatAttachment,
  MESSAGES_PAGE_SIZE,
  AUDIO_MAX_SECONDS,
  SIGNED_URL_TTL_SECONDS,
  type ChatMessage,
} from "../services/chat.service";
import { listFollowers, type FollowListRow } from "../services/follow.service";
import { openMediaLightbox } from "../lib/mediaLightbox";
import { refreshChatBadge } from "../lib/chat";
import { watchPeerOnline } from "../lib/presence";
import { getCachedMessages, cacheMessages } from "../lib/chatDb";
import type { ViewContext } from "../shell/viewContext";

/** Se re-firma una URL de adjunto si le quedan menos de estos minutos de vida. Importa porque
 * chats.ts mantiene vivo el DOM de cada hilo ya abierto durante toda la sesion (nunca se vuelve
 * a montar al reabrir, solo se oculta/muestra) -- si la conversacion queda abierta/oculta mas
 * de una hora y llega un mensaje nuevo por realtime, la URL firmada de ese adjunto puntual
 * todavia se resuelve de cero (nunca se cacheo), pero un click repetido en un adjunto viejo
 * dentro de la misma sesion larga reusa el cache en vez de pedir una URL nueva cada vez. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const THREAD_MARKUP = `
  <div class="chat-thread-header">
    <button type="button" class="chat-thread-back" id="chatThreadBackBtn" aria-label="Volver a mensajes">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
    </button>
    <a href="profile.html" id="chatThreadProfileLink" class="chat-thread-peer">
      <img src="/images/avatars/default.svg" id="chatThreadAvatar" alt="" class="chat-avatar">
      <span class="chat-thread-peer-info">
        <span class="chat-thread-peer-name" id="chatThreadName">Cargando...</span>
        <span class="chat-thread-peer-status" id="chatThreadStatus"></span>
      </span>
    </a>
  </div>

  <div class="chat-pinned-banner" id="chatPinnedBanner" hidden>
    <button type="button" class="chat-pinned-banner-main" id="chatPinnedBannerMain">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6.5L17 12l-5 1.5V22l-1-1-1 1v-8.5L5 12l5-3.5V2z"/></svg>
      <span class="chat-pinned-banner-text" id="chatPinnedBannerText"></span>
    </button>
    <button type="button" class="chat-pinned-banner-unpin" id="chatPinnedBannerUnpin" aria-label="Desanclar mensaje">✕</button>
  </div>

  <div class="chat-request-banner" id="chatRequestBanner" hidden>
    <p><strong id="chatRequestBannerName"></strong> te envió una solicitud de mensaje. Si respondés, la aceptás automáticamente.</p>
    <div class="chat-request-banner-actions">
      <button type="button" class="btn btn-primary btn-sm" id="chatBannerAccept">Aceptar</button>
      <button type="button" class="btn btn-outline btn-sm" id="chatBannerDecline">Rechazar</button>
    </div>
  </div>

  <p class="chat-pending-note" id="chatPendingNote" hidden>Le enviaste una solicitud de mensaje. Vas a poder chatear normalmente cuando la acepte.</p>

  <div class="chat-messages-wrap">
    <div class="chat-messages" id="chatMessages"></div>
    <button type="button" class="chat-scroll-bottom-btn" id="chatScrollBottomBtn" aria-label="Ir al mensaje más reciente" hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
    </button>
  </div>

  <div class="chat-record-bar" id="chatRecordBar" hidden>
    <span class="chat-record-dot"></span>
    <span id="chatRecordTime">0:00</span>
    <canvas class="chat-record-wave" id="chatRecordWave"></canvas>
    <button type="button" class="chat-record-cancel" id="chatRecordCancel" aria-label="Cancelar grabación">✕</button>
  </div>

  <div class="chat-preview-bar" id="chatPreviewBar" hidden>
    <img id="chatPreviewImg" alt="" hidden>
    <span id="chatPreviewAudioLabel" hidden>🎤 Audio listo (<span id="chatPreviewAudioDuration"></span>)</span>
    <button type="button" class="chat-preview-cancel" id="chatPreviewCancel" aria-label="Quitar adjunto">✕</button>
  </div>

  <div class="chat-reply-bar" id="chatReplyBar" hidden>
    <div class="chat-reply-bar-body">
      <span class="chat-reply-bar-name" id="chatReplyBarName"></span>
      <span class="chat-reply-bar-text" id="chatReplyBarText"></span>
    </div>
    <button type="button" class="chat-reply-bar-cancel" id="chatReplyBarCancel" aria-label="Cancelar respuesta">✕</button>
  </div>

  <div class="chat-composer" id="chatComposer">
    <label class="chat-composer-btn" title="Adjuntar foto">
      <input type="file" id="chatImageInput" accept="image/jpeg,image/png,image/webp" hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="4"/></svg>
    </label>
    <textarea id="chatComposerInput" class="chat-composer-input" placeholder="Escribí un mensaje..." rows="1"></textarea>
    <div class="chat-sticker-wrap">
      <button type="button" class="chat-composer-btn" id="chatStickerBtn" title="Enviar un sticker" aria-expanded="false">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/></svg>
      </button>
      <div class="chat-sticker-panel" id="chatStickerPanel" hidden>
          <button type="button" class="chat-sticker-item" data-emoji="💪">💪</button>
          <button type="button" class="chat-sticker-item" data-emoji="🔥">🔥</button>
          <button type="button" class="chat-sticker-item" data-emoji="🏆">🏆</button>
          <button type="button" class="chat-sticker-item" data-emoji="👏">👏</button>
          <button type="button" class="chat-sticker-item" data-emoji="🎉">🎉</button>
          <button type="button" class="chat-sticker-item" data-emoji="❤️">❤️</button>
          <button type="button" class="chat-sticker-item" data-emoji="👍">👍</button>
          <button type="button" class="chat-sticker-item" data-emoji="🙌">🙌</button>
          <button type="button" class="chat-sticker-item" data-emoji="🥵">🥵</button>
          <button type="button" class="chat-sticker-item" data-emoji="😮‍💨">😮‍💨</button>
          <button type="button" class="chat-sticker-item" data-emoji="🚀">🚀</button>
          <button type="button" class="chat-sticker-item" data-emoji="✅">✅</button>
          <button type="button" class="chat-sticker-item" data-emoji="💯">💯</button>
          <button type="button" class="chat-sticker-item" data-emoji="😂">😂</button>
          <button type="button" class="chat-sticker-item" data-emoji="😅">😅</button>
          <button type="button" class="chat-sticker-item" data-emoji="😢">😢</button>
          <button type="button" class="chat-sticker-item" data-emoji="🥳">🥳</button>
          <button type="button" class="chat-sticker-item" data-emoji="👀">👀</button>
          <button type="button" class="chat-sticker-item" data-emoji="🤝">🤝</button>
          <button type="button" class="chat-sticker-item" data-emoji="🫡">🫡</button>
          <button type="button" class="chat-sticker-item" data-emoji="😴">😴</button>
          <button type="button" class="chat-sticker-item" data-emoji="🤯">🤯</button>
          <button type="button" class="chat-sticker-item" data-emoji="🙏">🙏</button>
          <button type="button" class="chat-sticker-item" data-emoji="⚡">⚡</button>
      </div>
    </div>
    <button type="button" class="chat-composer-btn" id="chatMicBtn" title="Grabar audio">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/></svg>
    </button>
    <button type="button" class="chat-composer-send" id="chatSendBtn" disabled aria-label="Enviar">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg>
    </button>
  </div>
`;

export interface MountThreadOptions {
  /** La conversacion no aparece en la lista del usuario (borrada, sin permiso, etc). */
  onMissingConversation(): void;
  /** El botón "‹" del header del hilo (solo visible en mobile, ver CSS). */
  onBack(): void;
}

export async function mountThread(
  container: HTMLElement,
  conversationId: string,
  userId: string,
  ctx: ViewContext,
  opts: MountThreadOptions
): Promise<void> {
  container.innerHTML = THREAD_MARKUP;
  const attachmentUrlCache = new Map<string, { url: string; expiresAt: number }>();

  const profileLink = container.querySelector("#chatThreadProfileLink") as HTMLAnchorElement;
  const backBtn = container.querySelector("#chatThreadBackBtn") as HTMLButtonElement;
  const avatarEl = container.querySelector("#chatThreadAvatar") as HTMLImageElement;
  const nameEl = container.querySelector("#chatThreadName")!;
  const statusEl = container.querySelector("#chatThreadStatus")!;
  const requestBanner = container.querySelector("#chatRequestBanner") as HTMLDivElement;
  const requestBannerName = container.querySelector("#chatRequestBannerName")!;
  const bannerAcceptBtn = container.querySelector("#chatBannerAccept") as HTMLButtonElement;
  const bannerDeclineBtn = container.querySelector("#chatBannerDecline") as HTMLButtonElement;
  const pendingNote = container.querySelector("#chatPendingNote") as HTMLParagraphElement;
  const messagesEl = container.querySelector("#chatMessages") as HTMLDivElement;
  const scrollBottomBtn = container.querySelector("#chatScrollBottomBtn") as HTMLButtonElement;
  const composerInput = container.querySelector("#chatComposerInput") as HTMLTextAreaElement;
  const imageInput = container.querySelector("#chatImageInput") as HTMLInputElement;
  const micBtn = container.querySelector("#chatMicBtn") as HTMLButtonElement;
  const sendBtn = container.querySelector("#chatSendBtn") as HTMLButtonElement;
  const recordBar = container.querySelector("#chatRecordBar") as HTMLDivElement;
  const recordTimeEl = container.querySelector("#chatRecordTime")!;
  const recordWaveCanvas = container.querySelector("#chatRecordWave") as HTMLCanvasElement;
  const recordCancelBtn = container.querySelector("#chatRecordCancel") as HTMLButtonElement;
  const previewBar = container.querySelector("#chatPreviewBar") as HTMLDivElement;
  const previewImg = container.querySelector("#chatPreviewImg") as HTMLImageElement;
  const previewAudioLabel = container.querySelector("#chatPreviewAudioLabel") as HTMLSpanElement;
  const previewAudioDuration = container.querySelector("#chatPreviewAudioDuration")!;
  const previewCancelBtn = container.querySelector("#chatPreviewCancel") as HTMLButtonElement;
  const stickerBtn = container.querySelector("#chatStickerBtn") as HTMLButtonElement;
  const stickerPanel = container.querySelector("#chatStickerPanel") as HTMLDivElement;
  const pinnedBanner = container.querySelector("#chatPinnedBanner") as HTMLDivElement;
  const pinnedBannerText = container.querySelector("#chatPinnedBannerText")!;
  const pinnedBannerMain = container.querySelector("#chatPinnedBannerMain") as HTMLButtonElement;
  const pinnedBannerUnpin = container.querySelector("#chatPinnedBannerUnpin") as HTMLButtonElement;
  const replyBar = container.querySelector("#chatReplyBar") as HTMLDivElement;
  const replyBarName = container.querySelector("#chatReplyBarName")!;
  const replyBarText = container.querySelector("#chatReplyBarText")!;
  const replyBarCancelBtn = container.querySelector("#chatReplyBarCancel") as HTMLButtonElement;

  backBtn.addEventListener("click", opts.onBack, { signal: ctx.signal });

  let messages: ChatMessage[] = [];
  const renderedIds = new Set<string>();
  const sharedPostsCache = new Map<string, FeedPost>();
  const audioPlayers = new Map<string, HTMLAudioElement>();
  const audioWaveLevels = new Map<string, number[]>();
  let currentlyPlayingId: string | null = null;
  let isInitiator = false;
  let conversationStatus: "pending" | "accepted" = "pending";
  let readReceiptsEnabled = true;
  let pinnedMessageId: string | null = null;
  let replyTarget: ChatMessage | null = null;
  const quotedMessageCache = new Map<string, ChatMessage | null>();

  async function markReadAndRefreshBadge(): Promise<void> {
    await markConversationRead(conversationId);
    void refreshChatBadge();
  }

  const conversations = await listConversations();
  const conversation = conversations.find((c) => c.conversation_id === conversationId);
  if (!conversation) {
    opts.onMissingConversation();
    return;
  }

  isInitiator = conversation.is_initiator;
  conversationStatus = conversation.status as "pending" | "accepted";

  nameEl.textContent = "";
  nameEl.insertAdjacentHTML("beforeend", `${escapeHtml(conversation.other_username ?? "")}${renderVerifiedBadge(conversation.other_user_type ?? "usuario", conversation.other_is_verified)}`);
  avatarEl.src = conversation.other_avatar_url || "/images/avatars/default.svg";
  profileLink.href = `profile.html?u=${encodeURIComponent(conversation.other_username ?? "")}`;
  requestBannerName.textContent = conversation.other_username ?? "";

  const peerMeta = await getConversationPeerMeta(conversation.other_user_id);
  readReceiptsEnabled = peerMeta.readReceiptsEnabled;
  let peerLastSeenAt = peerMeta.lastSeenAt;
  let peerOnline = false;
  statusEl.textContent = peerLastSeenAt ? lastSeenLabel(peerLastSeenAt) : "";

  if (peerLastSeenAt) {
    watchPeerOnline(conversation.other_user_id, (online) => {
      if (!online && peerOnline) peerLastSeenAt = new Date().toISOString();
      peerOnline = online;
      statusEl.textContent = online ? "En línea" : peerLastSeenAt ? lastSeenLabel(peerLastSeenAt) : "";
    });
  }

  function renderBanners(): void {
    requestBanner.hidden = !(conversationStatus === "pending" && !isInitiator);
    pendingNote.hidden = !(conversationStatus === "pending" && isInitiator);
  }
  renderBanners();

  bannerAcceptBtn.addEventListener(
    "click",
    async () => {
      bannerAcceptBtn.disabled = true;
      bannerDeclineBtn.disabled = true;
      const { error } = await acceptMessageRequest(conversationId);
      if (error) {
        alert(error);
        bannerAcceptBtn.disabled = false;
        bannerDeclineBtn.disabled = false;
        return;
      }
      conversationStatus = "accepted";
      renderBanners();
    },
    { signal: ctx.signal }
  );

  bannerDeclineBtn.addEventListener(
    "click",
    async () => {
      if (!confirm("¿Rechazar esta solicitud de mensaje?")) return;
      bannerAcceptBtn.disabled = true;
      bannerDeclineBtn.disabled = true;
      const { error } = await declineMessageRequest(conversationId);
      if (error) {
        alert(error);
        bannerAcceptBtn.disabled = false;
        bannerDeclineBtn.disabled = false;
        return;
      }
      opts.onBack();
    },
    { signal: ctx.signal }
  );

  // ---------------------------------------------------------------------------
  // Mensaje anclado
  // ---------------------------------------------------------------------------

  async function renderPinnedBanner(): Promise<void> {
    if (!pinnedMessageId) {
      pinnedBanner.hidden = true;
      return;
    }
    if (!quotedMessageCache.has(pinnedMessageId)) {
      const local = messages.find((m) => m.id === pinnedMessageId) ?? null;
      quotedMessageCache.set(pinnedMessageId, local ?? (await getMessageById(pinnedMessageId)));
    }
    const pinned = quotedMessageCache.get(pinnedMessageId!) ?? null;
    if (!pinned) {
      pinnedBanner.hidden = true;
      return;
    }
    pinnedBannerText.textContent = `${senderLabel(pinned)}: ${messageSnippet(pinned)}`;
    pinnedBanner.hidden = false;
  }

  pinnedBannerMain.addEventListener(
    "click",
    () => {
      if (pinnedMessageId) scrollToMessage(pinnedMessageId);
    },
    { signal: ctx.signal }
  );

  pinnedBannerUnpin.addEventListener(
    "click",
    async () => {
      const prev = pinnedMessageId;
      pinnedMessageId = null;
      pinnedBanner.hidden = true;
      const { error } = await unpinMessage(conversationId);
      if (error) {
        pinnedMessageId = prev;
        alert(error);
        void renderPinnedBanner();
      }
    },
    { signal: ctx.signal }
  );

  async function togglePin(message: ChatMessage): Promise<void> {
    const prev = pinnedMessageId;
    if (pinnedMessageId === message.id) {
      pinnedMessageId = null;
      await renderPinnedBanner();
      const { error } = await unpinMessage(conversationId);
      if (error) {
        pinnedMessageId = prev;
        alert(error);
        void renderPinnedBanner();
      }
    } else {
      pinnedMessageId = message.id;
      quotedMessageCache.set(message.id, message);
      await renderPinnedBanner();
      const { error } = await pinMessage(conversationId, message.id);
      if (error) {
        pinnedMessageId = prev;
        alert(error);
        void renderPinnedBanner();
      }
    }
    refreshPinnedBubbleClass();
  }

  function refreshPinnedBubbleClass(): void {
    messagesEl.querySelectorAll(".chat-bubble.is-pinned").forEach((el) => el.classList.remove("is-pinned"));
    if (pinnedMessageId) messagesEl.querySelector(`.chat-bubble[data-id="${pinnedMessageId}"]`)?.classList.add("is-pinned");
  }

  pinnedMessageId = await getConversationPinnedMessageId(conversationId);
  void renderPinnedBanner();

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

  function messageSnippet(m: ChatMessage): string {
    if (m.attachment_type === "sticker") return `${m.content ?? ""} Sticker`;
    if (m.content) return m.content;
    if (m.shared_post_id) return "🔁 Rep compartido";
    if (m.attachment_type === "image") return "📷 Foto";
    if (m.attachment_type === "audio") return "🎤 Audio";
    return "Mensaje";
  }

  function senderLabel(m: ChatMessage): string {
    return m.sender_id === userId ? "Vos" : (conversation!.other_username ?? "");
  }

  function replyQuoteHtml(m: ChatMessage): string {
    if (!m.reply_to_message_id) return "";
    const original = messages.find((x) => x.id === m.reply_to_message_id) ?? quotedMessageCache.get(m.reply_to_message_id);
    if (!original) {
      return `<button type="button" class="chat-bubble-quote chat-bubble-quote-missing" data-quote-id="${escapeHtml(m.reply_to_message_id)}">
        <span class="chat-bubble-quote-text">Cargando…</span>
      </button>`;
    }
    return `
      <button type="button" class="chat-bubble-quote" data-quote-id="${escapeHtml(original.id)}">
        <span class="chat-bubble-quote-name">${escapeHtml(senderLabel(original))}</span>
        <span class="chat-bubble-quote-text">${escapeHtml(messageSnippet(original))}</span>
      </button>
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
    const isSticker = m.attachment_type === "sticker";
    const stickerHtml = isSticker ? `<span class="chat-bubble-sticker">${escapeHtml(m.content ?? "")}</span>` : "";
    const textHtml = !isSticker && m.content ? `<p class="chat-bubble-text">${escapeHtml(m.content)}</p>` : "";
    const forwardedHtml = m.is_forwarded ? `<span class="chat-bubble-forwarded">Reenviado</span>` : "";
    return `
      <div class="chat-bubble ${isMe ? "chat-bubble-me" : "chat-bubble-other"}${isSticker ? " chat-bubble-sticker-wrap" : ""}${m.id === pinnedMessageId ? " is-pinned" : ""}" data-id="${m.id}">
        ${forwardedHtml}
        ${replyQuoteHtml(m)}
        ${mediaHtml}
        ${stickerHtml}
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
    if (cached && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS) return cached.url;
    const url = await getChatAttachmentUrl(path);
    if (url) attachmentUrlCache.set(path, { url, expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 });
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

  async function hydrateMissingQuotes(): Promise<void> {
    const nodes = messagesEl.querySelectorAll<HTMLButtonElement>(".chat-bubble-quote-missing[data-quote-id]");
    await Promise.all(
      Array.from(new Set(Array.from(nodes).map((el) => el.dataset.quoteId!))).map(async (id) => {
        if (!quotedMessageCache.has(id)) quotedMessageCache.set(id, await getMessageById(id));
        const original = quotedMessageCache.get(id);
        messagesEl.querySelectorAll<HTMLButtonElement>(`.chat-bubble-quote-missing[data-quote-id="${id}"]`).forEach((el) => {
          if (!original) {
            el.innerHTML = `<span class="chat-bubble-quote-text">Mensaje no disponible</span>`;
            return;
          }
          el.classList.remove("chat-bubble-quote-missing");
          el.innerHTML = `
            <span class="chat-bubble-quote-name">${escapeHtml(senderLabel(original))}</span>
            <span class="chat-bubble-quote-text">${escapeHtml(messageSnippet(original))}</span>
          `;
        });
      })
    );
  }

  function refreshBubbleTicks(m: ChatMessage): void {
    if (m.sender_id !== userId) return;
    const timeEl = messagesEl.querySelector<HTMLElement>(`.chat-bubble[data-id="${m.id}"] .chat-bubble-time`);
    if (!timeEl) return;
    timeEl.innerHTML = `${timeLabel(m.created_at)}${ticksHtml(m)}`;
  }

  function scrollToBottom(behavior: ScrollBehavior = "smooth"): void {
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, left: 0, behavior });
  }

  function scrollToMessage(id: string): void {
    const bubble = messagesEl.querySelector<HTMLElement>(`.chat-bubble[data-id="${id}"]`);
    if (!bubble) return;
    bubble.scrollIntoView({ block: "center", behavior: "smooth" });
    bubble.classList.add("chat-bubble-flash");
    setTimeout(() => bubble.classList.remove("chat-bubble-flash"), 1200);
  }

  function updateScrollBottomBtn(): void {
    const distanceFromBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
    scrollBottomBtn.hidden = distanceFromBottom < 300;
  }

  messagesEl.addEventListener("scroll", updateScrollBottomBtn, { signal: ctx.signal });
  scrollBottomBtn.addEventListener("click", () => scrollToBottom(), { signal: ctx.signal });

  const SENTINEL_HTML = `<div class="chat-load-sentinel" id="chatLoadSentinel"><div class="modern-spinner" id="chatLoadSpinner" hidden></div></div>`;

  let olderExhausted = false;
  let isLoadingOlder = false;

  const olderMessagesObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) void prependOlderMessages();
    },
    { root: messagesEl, rootMargin: "150px 0px" }
  );
  ctx.addCleanup(() => olderMessagesObserver.disconnect());

  function observeLoadSentinel(): void {
    const sentinel = messagesEl.querySelector("#chatLoadSentinel");
    if (sentinel) olderMessagesObserver.observe(sentinel);
  }

  async function renderInitialMessages(): Promise<void> {
    // mountThread corre una sola vez por conversacion en toda la sesion (chats.ts mantiene
    // vivo el DOM del hilo y solo lo oculta/muestra al cambiar de conversacion, nunca lo
    // vuelve a montar) -- este pintado inicial pasa una unica vez, no en cada reapertura.
    const cachedMsgs = await getCachedMessages(conversationId);
    if (cachedMsgs.length > 0) {
      messages = cachedMsgs;
      messages.forEach((m) => renderedIds.add(m.id));
      await hydrateSharedPosts(messages);
      messagesEl.innerHTML = buildMessagesHtml(messages);
      await hydrateImages();
      void hydrateMissingQuotes();
      scrollToBottom("instant");
    } else {
      messagesEl.innerHTML = `<div class="chat-messages-loading"><div class="modern-spinner"></div></div>`;
    }

    const page = await listMessages(conversationId);
    messages = page.slice().reverse();
    messages.forEach((m) => renderedIds.add(m.id));
    await hydrateSharedPosts(messages);
    olderExhausted = page.length < MESSAGES_PAGE_SIZE;
    messagesEl.innerHTML = messages.length
      ? (olderExhausted ? "" : SENTINEL_HTML) + buildMessagesHtml(messages)
      : `<p class="notif-empty">Todavía no hay mensajes. ¡Escribí el primero!</p>`;
    await hydrateImages();
    void hydrateMissingQuotes();
    scrollToBottom("instant");
    if (!olderExhausted) observeLoadSentinel();
    void cacheMessages(conversationId, page);

    const hasUnreadFromOther = messages.some((m) => m.sender_id !== userId && !m.read_at);
    if (hasUnreadFromOther) void markReadAndRefreshBadge();
  }

  async function prependOlderMessages(): Promise<void> {
    if (messages.length === 0 || olderExhausted || isLoadingOlder) return;
    isLoadingOlder = true;
    const spinner = messagesEl.querySelector<HTMLElement>("#chatLoadSpinner");
    if (spinner) spinner.hidden = false;

    const older = await listMessages(conversationId, messages[0].created_at);
    isLoadingOlder = false;

    if (older.length === 0) {
      olderExhausted = true;
      olderMessagesObserver.disconnect();
      messagesEl.querySelector("#chatLoadSentinel")?.remove();
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
    void hydrateMissingQuotes();
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
    void hydrateMissingQuotes();
    if (wasNearBottom) scrollToBottom();
    else updateScrollBottomBtn();
  }

  await renderInitialMessages();

  // ---------------------------------------------------------------------------
  // Realtime: mensajes nuevos + actualizaciones de lectura (doble check)
  // ---------------------------------------------------------------------------

  const channel = supabase
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
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conversationId}` }, (payload) => {
      const updatedConversation = payload.new as { pinned_message_id: string | null };
      if (updatedConversation.pinned_message_id === pinnedMessageId) return;
      pinnedMessageId = updatedConversation.pinned_message_id;
      void renderPinnedBanner();
      refreshPinnedBubbleClass();
    })
    .subscribe();
  ctx.addCleanup(() => void supabase.removeChannel(channel));

  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState !== "visible") return;
      const hasUnreadFromOther = messages.some((m) => m.sender_id !== userId && !m.read_at);
      if (hasUnreadFromOther) void markReadAndRefreshBadge();
    },
    { signal: ctx.signal }
  );

  // ---------------------------------------------------------------------------
  // Audio: reproducción de mensajes grabados
  // ---------------------------------------------------------------------------

  function setPlayIcon(btn: HTMLButtonElement, showPlay: boolean): void {
    btn.querySelector(".chat-audio-icon-play")?.toggleAttribute("hidden", !showPlay);
    btn.querySelector(".chat-audio-icon-pause")?.toggleAttribute("hidden", showPlay);
  }

  async function loadWaveform(id: string, url: string): Promise<void> {
    if (audioWaveLevels.has(id)) return;
    try {
      const arrayBuffer = await (await fetch(url)).arrayBuffer();
      const audioCtx = new AudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      void audioCtx.close();

      const channelData = audioBuffer.getChannelData(0);
      const barsCount = 40;
      const blockSize = Math.max(1, Math.floor(channelData.length / barsCount));
      const peaks: number[] = [];
      for (let i = 0; i < barsCount; i++) {
        const start = i * blockSize;
        const end = Math.min(channelData.length, start + blockSize);
        let sum = 0;
        for (let j = start; j < end; j++) sum += Math.abs(channelData[j]);
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

  function drawPlaybackWave(id: string, progress: number): void {
    const levels = audioWaveLevels.get(id);
    const canvas = messagesEl.querySelector<HTMLCanvasElement>(`.chat-audio-wave[data-id="${id}"]`);
    if (!levels || !canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, width, height);

    const barWidth = 3;
    const gap = 2;
    const step = barWidth + gap;
    const color = getComputedStyle(canvas).color;

    levels.forEach((level, i) => {
      const x = i * step;
      if (x > width) return;
      const barHeight = Math.max(2, level * height);
      const y = (height - barHeight) / 2;
      ctx2d.globalAlpha = i / levels.length <= progress ? 1 : 0.35;
      ctx2d.fillStyle = color;
      ctx2d.beginPath();
      if (ctx2d.roundRect) ctx2d.roundRect(x, y, barWidth, barHeight, barWidth / 2);
      else ctx2d.rect(x, y, barWidth, barHeight);
      ctx2d.fill();
    });
    ctx2d.globalAlpha = 1;
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
  ctx.addCleanup(() => {
    audioPlayers.forEach((audio) => audio.pause());
  });

  async function openLightbox(path: string): Promise<void> {
    const url = await resolveAttachmentUrl(path);
    if (!url) return;
    openMediaLightbox({
      queue: [{ url }],
      startIndex: 0,
      getMedia: (item) => ({ url: item.url, kind: "image" }),
    });
  }

  messagesEl.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement;
      const imageBtn = target.closest<HTMLButtonElement>(".chat-bubble-image");
      if (imageBtn) {
        void openLightbox(imageBtn.dataset.path!);
        return;
      }
      const audioBtn = target.closest<HTMLButtonElement>(".chat-audio-toggle");
      if (audioBtn) {
        void toggleAudioMessage(audioBtn);
        return;
      }
      const quoteBtn = target.closest<HTMLButtonElement>(".chat-bubble-quote:not(.chat-bubble-quote-missing)");
      if (quoteBtn?.dataset.quoteId) {
        scrollToMessage(quoteBtn.dataset.quoteId);
        return;
      }
      if (target.closest(".chat-shared-post")) return;
      const bubble = target.closest<HTMLElement>(".chat-bubble");
      if (bubble?.dataset.id) {
        const message = messages.find((m) => m.id === bubble.dataset.id);
        if (message) openMessageMenu(message, bubble);
      }
    },
    { signal: ctx.signal }
  );

  // ---------------------------------------------------------------------------
  // Menú de mensaje: responder / reenviar / anclar
  // ---------------------------------------------------------------------------

  let closeOpenMessageMenu: (() => void) | null = null;
  ctx.addCleanup(() => closeOpenMessageMenu?.());

  function openMessageMenu(message: ChatMessage, anchor: HTMLElement): void {
    closeOpenMessageMenu?.();

    const isMe = message.sender_id === userId;
    const isPinned = pinnedMessageId === message.id;
    const menu = document.createElement("div");
    menu.className = "chat-msg-menu";
    menu.innerHTML = `
      <button type="button" data-action="reply">Responder</button>
      <button type="button" data-action="forward">Reenviar</button>
      ${message.content ? `<button type="button" data-action="copy">Copiar</button>` : ""}
      <button type="button" data-action="pin">${isPinned ? "Desanclar" : "Anclar"}</button>
    `;
    document.body.appendChild(menu);

    const rect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let top = rect.bottom + 6;
    let left = isMe ? rect.right - menuRect.width : rect.left;
    left = Math.min(Math.max(8, left), window.innerWidth - menuRect.width - 8);
    if (top + menuRect.height > window.innerHeight - 8) top = rect.top - menuRect.height - 6;
    menu.style.top = `${Math.max(8, top)}px`;
    menu.style.left = `${left}px`;

    function onMenuClick(e: MouseEvent): void {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "copy") {
        navigator.clipboard.writeText(message.content ?? "").catch(() => {});
        btn.textContent = "¡Copiado!";
        btn.disabled = true;
        setTimeout(() => closeOpenMessageMenu?.(), 700);
        return;
      }
      closeOpenMessageMenu?.();
      if (action === "reply") startReply(message);
      else if (action === "forward") void openForwardModal(message);
      else if (action === "pin") void togglePin(message);
    }
    function onDocClick(e: MouseEvent): void {
      if (!menu.contains(e.target as Node)) closeOpenMessageMenu?.();
    }
    function onKeydown(e: KeyboardEvent): void {
      if (e.key === "Escape") closeOpenMessageMenu?.();
    }

    function onScroll(): void {
      closeOpenMessageMenu?.();
    }

    menu.addEventListener("click", onMenuClick);
    setTimeout(() => document.addEventListener("click", onDocClick), 0);
    document.addEventListener("keydown", onKeydown);
    messagesEl.addEventListener("scroll", onScroll);

    closeOpenMessageMenu = () => {
      menu.remove();
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeydown);
      messagesEl.removeEventListener("scroll", onScroll);
      closeOpenMessageMenu = null;
    };
  }

  function startReply(message: ChatMessage): void {
    replyTarget = message;
    replyBarName.textContent = senderLabel(message);
    replyBarText.textContent = messageSnippet(message);
    replyBar.hidden = false;
    composerInput.focus();
  }

  replyBarCancelBtn.addEventListener(
    "click",
    () => {
      replyTarget = null;
      replyBar.hidden = true;
    },
    { signal: ctx.signal }
  );

  async function openForwardModal(message: ChatMessage): Promise<void> {
    const loaderBody = document.getElementById("loaderBody");
    if (!loaderBody) return;

    loaderBody.innerHTML = `
      <div class="success-check-container">
        <div class="modal-card">
          <h2>Reenviar mensaje</h2>
          <p class="subtitle">Elegí a quién enviárselo.</p>
          <p class="chat-forward-preview">${escapeHtml(messageSnippet(message))}</p>
          <div class="field">
            <input type="text" id="chatForwardSearch" placeholder="Buscar entre tus seguidores...">
          </div>
          <div class="post-share-list" id="chatForwardList"><p class="exc-pick-empty">Cargando...</p></div>
          <div class="alert_message" id="chatForwardAlert"></div>
          <div class="modal-actions">
            <button class="btn btn-outline" id="chatForwardCancel" type="button">Cerrar</button>
          </div>
        </div>
      </div>
    `;
    const close = () => (loaderBody.innerHTML = "");
    document.getElementById("chatForwardCancel")?.addEventListener("click", close);

    const listEl = document.getElementById("chatForwardList")!;
    const searchInput = document.getElementById("chatForwardSearch") as HTMLInputElement;

    function renderRows(rows: FollowListRow[]): void {
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
          const alertBox = document.getElementById("chatForwardAlert")!;
          alertBox.innerHTML = "";

          const { id: targetConversationId, error: convError } = await getOrCreateConversation(btn.dataset.id!);
          if (convError || !targetConversationId) {
            alertBox.innerHTML = `<p>${escapeHtml(convError || "No se pudo abrir la conversación.")}</p>`;
            rowButtons.forEach((b) => (b.disabled = false));
            return;
          }

          let attachmentPath: string | undefined;
          if (message.attachment_path) {
            const { path, error } = await copyChatAttachment(message.attachment_path, targetConversationId);
            if (error || !path) {
              alertBox.innerHTML = `<p>${escapeHtml(error || "No se pudo reenviar el adjunto.")}</p>`;
              rowButtons.forEach((b) => (b.disabled = false));
              return;
            }
            attachmentPath = path;
          }

          const { error } = await sendMessage(targetConversationId, {
            content: message.content ?? undefined,
            attachmentPath,
            attachmentType: (message.attachment_type as "image" | "audio" | "sticker" | null) ?? undefined,
            attachmentDurationSeconds: message.attachment_duration_seconds ?? undefined,
            sharedPostId: message.shared_post_id ?? undefined,
            isForwarded: true,
          });
          if (error) {
            alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
            rowButtons.forEach((b) => (b.disabled = false));
            return;
          }
          loaderBody!.innerHTML = `
            <div class="success-check-container">
              <div class="success-icon">
                <svg viewBox="0 0 52 52" class="success-svg">
                  <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
                  <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
                </svg>
              </div>
              <p>¡Mensaje reenviado!</p>
            </div>
          `;
          setTimeout(close, 1400);
        });
      });
    }

    async function runSearch(search: string): Promise<void> {
      try {
        renderRows(await listFollowers(userId, search));
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

  // ---------------------------------------------------------------------------
  // Composer: texto, foto y grabación de audio
  // ---------------------------------------------------------------------------

  type PendingAttachment = { kind: "image"; file: File; previewUrl: string } | { kind: "audio"; blob: Blob; durationSeconds: number };

  let pendingAttachment: PendingAttachment | null = null;
  let sending = false;
  const recorder = new AudioRecorder();
  let recordTimer: ReturnType<typeof setInterval> | undefined;
  let recordSeconds = 0;

  function drawBars(canvas: HTMLCanvasElement, levels: number[], color: string): void {
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, width, height);

    const barWidth = 3;
    const gap = 3;
    const step = barWidth + gap;
    const barsFit = Math.max(1, Math.floor(width / step));
    const visible = levels.slice(-barsFit);

    ctx2d.fillStyle = color;
    const startX = width - visible.length * step;
    visible.forEach((level, i) => {
      const barHeight = Math.max(3, level * height);
      const x = startX + i * step;
      const y = (height - barHeight) / 2;
      ctx2d.beginPath();
      if (ctx2d.roundRect) ctx2d.roundRect(x, y, barWidth, barHeight, barWidth / 2);
      else ctx2d.rect(x, y, barWidth, barHeight);
      ctx2d.fill();
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
    const ctx2d = recordWaveCanvas.getContext("2d");
    ctx2d?.clearRect(0, 0, recordWaveCanvas.width, recordWaveCanvas.height);
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

  composerInput.addEventListener(
    "input",
    () => {
      composerInput.style.height = "auto";
      composerInput.style.height = `${Math.min(composerInput.scrollHeight, 120)}px`;
      updateSendState();
    },
    { signal: ctx.signal }
  );

  composerInput.addEventListener("focus", () => document.body.classList.add("keyboard-open"), { signal: ctx.signal });
  composerInput.addEventListener("blur", () => document.body.classList.remove("keyboard-open"), { signal: ctx.signal });
  ctx.addCleanup(() => document.body.classList.remove("keyboard-open"));

  composerInput.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      e.preventDefault();
      if (!sendBtn.disabled) void handleSend();
    },
    { signal: ctx.signal }
  );

  imageInput.addEventListener(
    "change",
    () => {
      const file = imageInput.files?.[0];
      imageInput.value = "";
      if (!file) return;
      clearPendingAttachment();
      pendingAttachment = { kind: "image", file, previewUrl: URL.createObjectURL(file) };
      showPreview();
    },
    { signal: ctx.signal }
  );

  previewCancelBtn.addEventListener("click", clearPendingAttachment, { signal: ctx.signal });

  // ---------------------------------------------------------------------------
  // Stickers
  // ---------------------------------------------------------------------------

  function closeStickerPanel(): void {
    stickerPanel.hidden = true;
    stickerBtn.setAttribute("aria-expanded", "false");
  }

  function toggleStickerPanel(): void {
    stickerPanel.hidden = !stickerPanel.hidden;
    stickerBtn.setAttribute("aria-expanded", String(!stickerPanel.hidden));
  }

  stickerBtn.addEventListener("click", toggleStickerPanel, { signal: ctx.signal });

  document.addEventListener(
    "click",
    (e) => {
      if (stickerPanel.hidden) return;
      const target = e.target as Node;
      if (stickerPanel.contains(target) || stickerBtn.contains(target)) return;
      closeStickerPanel();
    },
    { signal: ctx.signal }
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && !stickerPanel.hidden) closeStickerPanel();
    },
    { signal: ctx.signal }
  );

  async function sendSticker(emoji: string): Promise<void> {
    if (sending) return;
    sending = true;
    closeStickerPanel();

    const { message, error } = await sendMessage(conversationId, {
      content: emoji,
      attachmentType: "sticker",
      replyToMessageId: replyTarget?.id,
    });

    sending = false;
    updateSendState();

    if (error || !message) {
      alert(error || "No se pudo enviar el sticker.");
      return;
    }

    replyTarget = null;
    replyBar.hidden = true;
    void appendMessage(message);

    if (conversationStatus === "pending" && isInitiator === false) {
      conversationStatus = "accepted";
      renderBanners();
    }
  }

  stickerPanel.addEventListener(
    "click",
    (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".chat-sticker-item");
      if (btn?.dataset.emoji) void sendSticker(btn.dataset.emoji);
    },
    { signal: ctx.signal }
  );

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

  micBtn.addEventListener("click", () => void handleMicClick(), { signal: ctx.signal });

  recordCancelBtn.addEventListener(
    "click",
    () => {
      clearInterval(recordTimer);
      stopWave();
      recorder.cancel();
      recordBar.hidden = true;
      updateSendState();
    },
    { signal: ctx.signal }
  );

  ctx.addCleanup(() => {
    clearInterval(waveTimer);
    clearInterval(recordTimer);
    if (recorder.isRecording) recorder.cancel();
  });

  sendBtn.addEventListener("mousedown", (e) => e.preventDefault(), { signal: ctx.signal });
  sendBtn.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      if (!sendBtn.disabled) void handleSend();
    },
    { passive: false, signal: ctx.signal }
  );

  sendBtn.addEventListener(
    "click",
    () => {
      if (!sendBtn.disabled) void handleSend();
    },
    { signal: ctx.signal }
  );

  async function handleSend(): Promise<void> {
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
      const { path, error } = await uploadChatImage(conversationId, pendingAttachment.file);
      if (error || !path) {
        alert(error || "No se pudo subir la imagen.");
        sending = false;
        updateSendState();
        return;
      }
      attachmentPath = path;
      attachmentType = "image";
    } else if (pendingAttachment?.kind === "audio") {
      const { path, error } = await uploadChatAudio(conversationId, pendingAttachment.blob);
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

    const { message, error } = await sendMessage(conversationId, {
      content: content || undefined,
      attachmentPath,
      attachmentType,
      attachmentDurationSeconds,
      replyToMessageId: replyTarget?.id,
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
    replyTarget = null;
    replyBar.hidden = true;
    void appendMessage(message);

    if (conversationStatus === "pending" && isInitiator === false) {
      conversationStatus = "accepted";
      renderBanners();
    }

    updateSendState();
  }
}
