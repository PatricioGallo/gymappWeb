import { escapeHtml } from "../lib/dom";
import { linkifyHtml } from "../lib/linkify";
import { extractFirstUrl, extractYouTubeVideoId, youtubeEmbedHtml } from "../lib/youtube";
import { renderVerifiedBadge } from "../lib/verifiedBadge";
import { supabase } from "../lib/supabaseClient";
import { AudioRecorder, formatDuration } from "../lib/audioRecorder";
import { getPostsByIds, type FeedPost } from "../services/post.service";
import { getGymPostsByIds, type GymPostChatPreview } from "../services/gymPost.service";
import {
  listConversations,
  listMessages,
  sendMessage,
  markConversationRead,
  acceptMessageRequest,
  declineMessageRequest,
  uploadChatImage,
  uploadChatVideo,
  uploadChatAudio,
  getChatAttachmentUrl,
  getConversationPeerMeta,
  getOrCreateConversation,
  pinMessage,
  unpinMessage,
  getConversationPinnedMessageId,
  getMessageById,
  reactToMessage,
  editMessage,
  deleteMessage,
  copyChatAttachment,
  openViewOnceMessage,
  listMyViewOnceOpens,
  deleteChatAttachment,
  groupParticipantsOf,
  MESSAGES_PAGE_SIZE,
  AUDIO_MAX_SECONDS,
  SIGNED_URL_TTL_SECONDS,
  type ChatMessage,
  type ConversationSummary,
  type GroupParticipant,
} from "../services/chat.service";
import { listFollowers, type FollowListRow } from "../services/follow.service";
import { openMediaLightbox } from "../lib/mediaLightbox";
import { refreshChatBadge } from "../lib/chat";
import { watchPeerOnline } from "../lib/presence";
import { getCachedMessages, cacheMessages } from "../lib/chatDb";
import { openGroupInfoPanel } from "./chatGroupInfo";
import type { ViewContext } from "../shell/viewContext";

/** Se re-firma una URL de adjunto si le quedan menos de estos minutos de vida. Importa porque
 * chats.ts mantiene vivo el DOM de cada hilo ya abierto durante toda la sesion (nunca se vuelve
 * a montar al reabrir, solo se oculta/muestra) -- si la conversacion queda abierta/oculta mas
 * de una hora y llega un mensaje nuevo por realtime, la URL firmada de ese adjunto puntual
 * todavia se resuelve de cero (nunca se cacheo), pero un click repetido en un adjunto viejo
 * dentro de la misma sesion larga reusa el cache en vez de pedir una URL nueva cada vez. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Techo del auto-grow del composer (ver el listener de "input" mas abajo) -- coincide con el
// max-height de .chat-composer-input en modern.css, tienen que ir sincronizados.
const COMPOSER_MAX_HEIGHT_PX = 200;

// Con preload="metadata", Safari/iOS (y a veces Chrome mobile) deja el <video> en blanco/gris
// hasta que se toca -- conoce la duracion pero no llega a pintar un frame solo. Buscar una
// posicion minima apenas carga la metadata fuerza ese decodeo, y queda mostrado como si fuera
// un poster estatico, sin autoplay ni cargar el video entero.
function primeVideoFrame(video: HTMLVideoElement): void {
  const nudge = (): void => {
    if (video.currentTime === 0) video.currentTime = 0.05;
  };
  if (video.readyState >= 1) nudge();
  else video.addEventListener("loadedmetadata", nudge, { once: true });
}

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
    <video id="chatPreviewVideo" muted playsinline preload="metadata" hidden></video>
    <span id="chatPreviewAudioLabel" hidden>🎤 Audio listo (<span id="chatPreviewAudioDuration"></span>)</span>
    <button type="button" class="chat-preview-viewonce-btn" id="chatPreviewViewOnceBtn" title="Se ve una sola vez" aria-pressed="false" hidden>1</button>
    <button type="button" class="chat-preview-cancel" id="chatPreviewCancel" aria-label="Quitar adjunto">✕</button>
  </div>

  <div class="chat-reply-bar" id="chatReplyBar" hidden>
    <div class="chat-reply-bar-body">
      <span class="chat-reply-bar-name" id="chatReplyBarName"></span>
      <span class="chat-reply-bar-text" id="chatReplyBarText"></span>
    </div>
    <button type="button" class="chat-reply-bar-cancel" id="chatReplyBarCancel" aria-label="Cancelar respuesta">✕</button>
  </div>

  <div class="chat-reply-bar chat-edit-bar" id="chatEditBar" hidden>
    <div class="chat-reply-bar-body">
      <span class="chat-reply-bar-name">Editando mensaje</span>
      <span class="chat-reply-bar-text" id="chatEditBarText"></span>
    </div>
    <button type="button" class="chat-reply-bar-cancel" id="chatEditBarCancel" aria-label="Cancelar edición">✕</button>
  </div>

  <div class="chat-composer-youtube-preview" id="chatComposerYoutubePreview" hidden></div>

  <div class="chat-composer" id="chatComposer">
    <label class="chat-composer-btn" title="Adjuntar foto o video">
      <input type="file" id="chatImageInput" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,video/3gpp,video/x-msvideo,video/x-matroska,video/mpeg,video/ogg" hidden>
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
  /**
   * Se acaba de marcar la conversación como leída (al abrirla o por un mensaje nuevo que llega
   * mientras está en pantalla). chats.ts la usa para limpiar el contador/resaltado de esta fila
   * en la lista sin esperar la suscripción realtime, que solo escucha la tabla conversations y
   * mark_conversation_read no la toca (solo conversation_participants.last_read_at).
   */
  onRead?(): void;
  /** chats.ts necesita el scrollTop de #chatMessages para devolver al usuario a donde estaba al
   * reabrir un hilo ya visitado (ver hideActiveInstance/openThread ahi) -- pero leerlo recien AL
   * ocultar llega tarde: un `display:none` en un ancestro (el que pone el router al navegar a
   * otra pagina, no solo el propio hide interno de chats.ts entre hilos) resetea scrollTop a 0
   * antes de que cualquier callback de "se oculto" alcance a leerlo. Por eso se reporta en cada
   * scroll, no una sola vez al final -- chats.ts siempre tiene el ultimo valor bueno a mano. */
  onScrollTopChange?(scrollTop: number): void;
  /** chats.ts ya tiene la lista de conversaciones cargada en memoria (la usa para pintar la
   * lista) -- si la conversacion que se abre esta ahi, se la pasamos para no volver a pedirla
   * de cero aca adentro (ver el `await listConversations()` que reemplaza mas abajo). Solo tiene
   * sentido para el open inicial: si no viene o no matchea el id (conversacion nueva que todavia
   * no entro a esa lista), se cae al fetch de siempre. */
  initialConversation?: ConversationSummary;
}

export interface ThreadController {
  /** chats.ts mantiene este hilo montado (oculto) mientras el usuario mira otro -- la unica
   * fuente de mensajes nuevos mientras tanto es el canal realtime de mas abajo, que en mobile
   * puede perder eventos si el navegador suspende el websocket en segundo plano (pantalla
   * bloqueada, app minimizada, chrome mata la pestaña de fondo). Se llama al volver a mostrarlo
   * (ver openThread en chats.ts) para traer la ultima pagina de la red y agregar lo que todavia
   * no se haya renderizado, sin tocar lo que ya esta pintado. */
  catchUp(): Promise<void>;
}

export async function mountThread(
  container: HTMLElement,
  conversationId: string,
  userId: string,
  ctx: ViewContext,
  opts: MountThreadOptions
): Promise<ThreadController | undefined> {
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
  const previewVideo = container.querySelector("#chatPreviewVideo") as HTMLVideoElement;
  const previewAudioLabel = container.querySelector("#chatPreviewAudioLabel") as HTMLSpanElement;
  const previewAudioDuration = container.querySelector("#chatPreviewAudioDuration")!;
  const previewViewOnceBtn = container.querySelector("#chatPreviewViewOnceBtn") as HTMLButtonElement;
  const previewCancelBtn = container.querySelector("#chatPreviewCancel") as HTMLButtonElement;
  const youtubePreviewWrap = container.querySelector("#chatComposerYoutubePreview") as HTMLDivElement;
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
  const editBar = container.querySelector("#chatEditBar") as HTMLDivElement;
  const editBarText = container.querySelector("#chatEditBarText")!;
  const editBarCancelBtn = container.querySelector("#chatEditBarCancel") as HTMLButtonElement;

  backBtn.addEventListener("click", opts.onBack, { signal: ctx.signal });

  let messages: ChatMessage[] = [];
  const renderedIds = new Set<string>();
  // Fotos/videos efímeros de GRUPO que YO ya abrí (ver open_view_once_message): a diferencia
  // de 1 a 1, donde messages.viewed_once_at/by alcanza (un unico espectador posible para toda
  // la conversacion), en grupo cada integrante tiene su propio estado "ya la vi" -- no vive en
  // la fila del mensaje (esa nunca cambia para mensajes de grupo), se trackea aparte y se
  // hidrata con listMyViewOnceOpens al cargar/paginar el hilo (ver hydrateMyViewOnceOpens).
  const myGroupViewOnceOpened = new Set<string>();
  // Mientras esperamos la respuesta de react_to_message para un mensaje, un UPDATE por
  // realtime ajeno a la reacción (ej. el mark-as-read automático al abrir el hilo, que
  // pisa toda la fila) puede llegar de vuelta con las reactions *previas* a la que
  // acabamos de agregar optimistamente, si su propio echo por realtime tarda más en
  // llegar. Mientras dure la mutación local, no dejamos que ningún UPDATE ajeno pise las
  // reactions -- la respuesta del propio RPC (o su echo) es la única fuente de verdad.
  const reactionMutationInFlight = new Set<string>();
  const sharedPostsCache = new Map<string, FeedPost>();
  const sharedGymPostsCache = new Map<string, GymPostChatPreview>();
  const audioPlayers = new Map<string, HTMLAudioElement>();
  const audioWaveLevels = new Map<string, number[]>();
  const audioOriginalDuration = new Map<string, string>();
  const audioPlaybackRate = new Map<string, number>();
  let currentlyPlayingId: string | null = null;
  let playbackRaf = 0;
  const PLAYBACK_SPEEDS = [1, 1.5, 2];
  let isInitiator = false;
  let conversationStatus: "pending" | "accepted" = "pending";
  let readReceiptsEnabled = true;
  let pinnedMessageId: string | null = null;
  let replyTarget: ChatMessage | null = null;
  let editingMessage: ChatMessage | null = null;
  const quotedMessageCache = new Map<string, ChatMessage | null>();

  async function markReadAndRefreshBadge(): Promise<void> {
    await markConversationRead(conversationId);
    void refreshChatBadge();
    opts.onRead?.();
  }

  // document.visibilityState solo dice si la pestaña está en primer plano, no si ESTE hilo
  // puntual es el que se está viendo -- chats.ts mantiene cada conversación abierta viva pero
  // oculta en background (ver el comentario de REFRESH_MARGIN_MS más arriba). Sin este chequeo
  // extra, un mensaje que llega en un hilo oculto mientras estás mirando otra vista (ej. el
  // perfil, en la misma pestaña) se marcaba como leído al toque sin que lo hayas visto nunca,
  // y el badge nunca llegaba a contarlo.
  function isThreadOnScreen(): boolean {
    return document.visibilityState === "visible" && container.offsetParent !== null;
  }

  // chats.ts ya la tiene en memoria (por eso mount() empieza sabiendo que conversacion abrir) --
  // solo si no vino, o quedo vieja (id no matchea, ej. conversacion recien creada), se pide la
  // lista de nuevo. Antes esto pedia la lista SIEMPRE, aunque el caller ya la tuviera: era la
  // misma demora redundante que tenia postDetail.ts con getPost antes del fix ahi.
  let conversation =
    opts.initialConversation?.conversation_id === conversationId ? opts.initialConversation : undefined;
  if (!conversation) {
    const conversations = await listConversations();
    conversation = conversations.find((c) => c.conversation_id === conversationId);
  }
  if (!conversation) {
    opts.onMissingConversation();
    return;
  }

  isInitiator = conversation.is_initiator;
  conversationStatus = conversation.status as "pending" | "accepted";
  const isGroup = conversation.kind === "group";

  // Indice por user_id -- senderLabel/bubbleHtml necesitan resolver quien mando cada mensaje
  // ajeno del grupo (nombre + avatar), y sin esto cada uno hacia su propio groupParticipantsOf(
  // conversation!).find(...) (recorrido lineal, reconstruyendo el array cada vez) sobre TODA la
  // pagina de mensajes al montar -- se arma una sola vez aca en vez de una vez por mensaje.
  const participantsById = new Map<string, GroupParticipant>(isGroup ? groupParticipantsOf(conversation).map((p) => [p.user_id, p]) : []);

  function renderHeaderIdentity(): void {
    nameEl.textContent = "";
    if (isGroup) {
      nameEl.textContent = conversation!.group_name ?? "Grupo";
      avatarEl.src = conversation!.group_avatar_url || "/images/avatars/default.svg";
      statusEl.textContent = `${groupParticipantsOf(conversation!).filter((p) => !p.left_at).length} integrantes`;
    } else {
      nameEl.insertAdjacentHTML(
        "beforeend",
        `${escapeHtml(conversation!.other_username ?? "")}${renderVerifiedBadge(conversation!.other_user_type ?? "usuario", conversation!.other_is_verified)}`
      );
      avatarEl.src = conversation!.other_avatar_url || "/images/avatars/default.svg";
    }
  }
  renderHeaderIdentity();
  requestBannerName.textContent = conversation.other_username ?? "";

  let peerLastSeenAt: string | null = null;
  let peerOnline = false;

  // Se dispara ya (sin await) y se resuelve mas abajo junto con getConversationPinnedMessageId
  // -- las dos son independientes entre si y de listConversations/lo de arriba, asi que no hay
  // motivo para pagarlas en serie (esperar una, despues la otra) antes de poder pintar mensajes.
  const peerMetaPromise = isGroup ? null : getConversationPeerMeta(conversation.other_user_id);

  if (isGroup) {
    // El link del header deja de navegar a un perfil individual: abre el panel de info/
    // administración del grupo (chatGroupInfo.ts), que además maneja "Salir del grupo".
    profileLink.removeAttribute("href");
    profileLink.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        // onMissingConversation (no onBack): salir del grupo deja esta conversación inaccesible
        // para mí -- mismo camino de limpieza que "esta conversación ya no existe/no tengo
        // permiso" (chats.ts destruye la instancia del hilo Y refresca la lista para sacarla).
        openGroupInfoPanel(conversation!, userId, { onLeft: opts.onMissingConversation });
      },
      { signal: ctx.signal }
    );
    // La foto del grupo tiene su propio destino (visor a pantalla completa, mismo lightbox
    // que las fotos de los mensajes) en vez de abrir el panel de info -- se frena antes de
    // que el click llegue al listener de arriba.
    avatarEl.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = conversation!.group_avatar_url;
        if (!url) return;
        openMediaLightbox({
          queue: [{ url }],
          startIndex: 0,
          getMedia: (item) => ({ url: item.url, kind: "image" }),
        });
      },
      { signal: ctx.signal }
    );
  } else {
    profileLink.href = `profile.html?u=${encodeURIComponent(conversation.other_username ?? "")}`;
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

  const [peerMeta, resolvedPinnedId] = await Promise.all([peerMetaPromise, getConversationPinnedMessageId(conversationId)]);
  if (peerMeta) {
    readReceiptsEnabled = peerMeta.readReceiptsEnabled;
    peerLastSeenAt = peerMeta.lastSeenAt;
    statusEl.textContent = peerLastSeenAt ? lastSeenLabel(peerLastSeenAt) : "";
    if (peerLastSeenAt) {
      watchPeerOnline(conversation.other_user_id, (online) => {
        if (!online && peerOnline) peerLastSeenAt = new Date().toISOString();
        peerOnline = online;
        statusEl.textContent = online ? "En línea" : peerLastSeenAt ? lastSeenLabel(peerLastSeenAt) : "";
      });
    }
  }
  pinnedMessageId = resolvedPinnedId;
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

  // ---------------------------------------------------------------------------
  // Reacciones (emoji) a mensajes
  // ---------------------------------------------------------------------------

  const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

  function getReactions(m: ChatMessage): Record<string, string[]> {
    return (m.reactions as unknown as Record<string, string[]>) ?? {};
  }

  function myReaction(m: ChatMessage): string | null {
    const reactions = getReactions(m);
    return Object.keys(reactions).find((emoji) => reactions[emoji]?.includes(userId)) ?? null;
  }

  /** Misma lógica que el RPC react_to_message: saca al usuario de todos los emojis y, si el
   * emoji tocado no era el suyo, se lo agrega. Se usa para actualizar la UI al toque, antes de
   * que confirme el servidor. */
  function toggleReactionLocal(reactions: Record<string, string[]>, emoji: string): Record<string, string[]> {
    const next: Record<string, string[]> = {};
    let hadThisEmoji = false;
    for (const [key, users] of Object.entries(reactions)) {
      if (key === emoji && users.includes(userId)) hadThisEmoji = true;
      const filtered = users.filter((u) => u !== userId);
      if (filtered.length > 0) next[key] = filtered;
    }
    if (!hadThisEmoji) next[emoji] = [...(next[emoji] ?? []), userId];
    return next;
  }

  function reactionsHtml(m: ChatMessage): string {
    const reactions = getReactions(m);
    const emojis = Object.keys(reactions).filter((k) => reactions[k]?.length);
    if (emojis.length === 0) return "";
    return `
      <div class="chat-bubble-reactions">
        ${emojis
          .map((emoji) => {
            const count = reactions[emoji].length;
            const mine = reactions[emoji].includes(userId);
            return `<button type="button" class="chat-reaction-pill${mine ? " is-mine" : ""}" data-emoji="${escapeHtml(emoji)}">${emoji}${count > 1 ? `<span class="chat-reaction-count">${count}</span>` : ""}</button>`;
          })
          .join("")}
      </div>
    `;
  }

  async function toggleReaction(message: ChatMessage, emoji: string): Promise<void> {
    reactionMutationInFlight.add(message.id);
    const prevReactions = message.reactions;
    message.reactions = toggleReactionLocal(getReactions(message), emoji) as unknown as ChatMessage["reactions"];
    refreshBubbleReactions(message);

    try {
      const { message: updated, error } = await reactToMessage(message.id, emoji);
      if (error) {
        message.reactions = prevReactions;
        refreshBubbleReactions(message);
        alert(error);
        return;
      }
      if (updated) {
        const idx = messages.findIndex((x) => x.id === updated.id);
        if (idx !== -1) messages[idx] = updated;
        refreshBubbleReactions(updated);
      }
    } finally {
      reactionMutationInFlight.delete(message.id);
    }
  }

  function refreshBubbleReactions(m: ChatMessage): void {
    const bubble = messagesEl.querySelector<HTMLElement>(`.chat-bubble[data-id="${m.id}"]`);
    if (!bubble) return;
    bubble.classList.toggle("has-reactions", Object.values(getReactions(m)).some((users) => users.length > 0));
    bubble.querySelector(".chat-bubble-reactions")?.remove();
    bubble.insertAdjacentHTML("beforeend", reactionsHtml(m));
  }

  // Editar/eliminar reemplazan todo el cuerpo de la burbuja (texto/adjunto/reacciones), a
  // diferencia de refreshBubbleReactions/refreshBubbleTicks que tocan solo su pedacito -- por
  // eso NO se usa para cada UPDATE por realtime (destruiría el <canvas> de la onda de audio ya
  // dibujada, el <img> ya cargado, etc. en cualquier bubble que no cambió de contenido).
  function refreshBubbleBody(m: ChatMessage): void {
    const bubble = messagesEl.querySelector<HTMLElement>(`.chat-bubble[data-id="${m.id}"]`);
    if (!bubble) return;
    const isMe = m.sender_id === userId;
    const isSticker = !m.deleted_at && m.attachment_type === "sticker";
    const hasReactions = !m.deleted_at && Object.values(getReactions(m)).some((users) => users.length > 0);
    bubble.classList.toggle("chat-bubble-deleted", !!m.deleted_at);
    bubble.classList.toggle("chat-bubble-sticker-wrap", isSticker);
    bubble.classList.toggle("has-reactions", hasReactions);
    bubble.innerHTML = bubbleBodyHtml(m, isMe);
  }

  // Cualquier burbuja que citaba este mensaje (responder a) tiene su propio preview embebido
  // (nombre + snippet) -- si el original se edita/elimina, ese preview queda desactualizado
  // hasta que se refresque a mano.
  function refreshQuotePreviewsFor(m: ChatMessage): void {
    messagesEl.querySelectorAll<HTMLElement>(`.chat-bubble-quote[data-quote-id="${m.id}"]`).forEach((el) => {
      el.innerHTML = `
        <span class="chat-bubble-quote-name">${escapeHtml(senderLabel(m))}</span>
        <span class="chat-bubble-quote-text">${escapeHtml(messageSnippet(m))}</span>
      `;
    });
  }

  /** Punto único para aplicar una edición/eliminación (propia o ajena vía realtime): sincroniza
   * el array local, el cache de citas y el DOM (burbuja + cualquier respuesta que la cite). */
  function applyMessageContentUpdate(m: ChatMessage): void {
    const idx = messages.findIndex((x) => x.id === m.id);
    if (idx !== -1) messages[idx] = m;
    if (quotedMessageCache.has(m.id)) quotedMessageCache.set(m.id, m);
    refreshBubbleBody(m);
    refreshQuotePreviewsFor(m);
  }

  async function hydrateSharedPosts(list: ChatMessage[]): Promise<void> {
    const ids = [...new Set(list.map((m) => m.shared_post_id).filter((id): id is string => !!id))].filter((id) => !sharedPostsCache.has(id));
    const gymIds = [...new Set(list.map((m) => m.shared_gym_post_id).filter((id): id is string => !!id))].filter((id) => !sharedGymPostsCache.has(id));
    if (ids.length === 0 && gymIds.length === 0) return;
    const [map, gymMap] = await Promise.all([
      ids.length ? getPostsByIds(ids) : Promise.resolve(new Map<string, FeedPost>()),
      gymIds.length ? getGymPostsByIds(gymIds) : Promise.resolve(new Map<string, GymPostChatPreview>()),
    ]);
    map.forEach((post, id) => sharedPostsCache.set(id, post));
    gymMap.forEach((post, id) => sharedGymPostsCache.set(id, post));
  }

  /** Completa myGroupViewOnceOpened para los mensajes efímeros de grupo recién cargados que
   * todavía no sabemos si YO ya abrí (ver esa constante mas arriba). Devuelve true si encontró
   * algo nuevo, para que el caller sepa si vale la pena volver a pintar. */
  async function hydrateMyViewOnceOpens(list: ChatMessage[]): Promise<boolean> {
    if (!isGroup) return false;
    const ids = list.filter((m) => m.view_once && m.sender_id !== userId && !myGroupViewOnceOpened.has(m.id)).map((m) => m.id);
    if (ids.length === 0) return false;
    const opened = await listMyViewOnceOpens(ids);
    opened.forEach((id) => myGroupViewOnceOpened.add(id));
    return opened.length > 0;
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

  // Sin pagina propia por publicacion (a diferencia de los Reps con post.html): el link va al
  // perfil del gimnasio, que ya aterriza en la pestaña Publicaciones por default (ver profile.ts).
  function sharedGymPostPreviewHtml(postId: string): string {
    const post = sharedGymPostsCache.get(postId);
    if (!post) return `<div class="chat-shared-post chat-shared-post-missing">Publicación no disponible</div>`;
    const content = post.content ?? "";
    const preview = content.length > 100 ? `${content.slice(0, 100)}…` : content;
    const cover = post.media[0];
    const thumb = cover
      ? cover.type === "video"
        ? `<video class="chat-shared-post-thumb" src="${escapeHtml(cover.url)}" muted playsinline autoplay loop preload="metadata"></video>`
        : `<img class="chat-shared-post-thumb" src="${escapeHtml(cover.url)}" alt="">`
      : "";
    return `
      <a class="chat-shared-post" href="profile.html?u=${encodeURIComponent(post.gymUsername)}&post=${encodeURIComponent(post.id)}">
        <div class="chat-shared-post-head">
          <img class="chat-shared-post-avatar" src="${escapeHtml(post.gymAvatarUrl || "/images/avatars/default.svg")}" alt="">
          <span class="chat-shared-post-name">${escapeHtml(post.gymUsername)}${renderVerifiedBadge("gimnasio", post.gymIsVerified, 12)}</span>
        </div>
        ${preview ? `<p class="chat-shared-post-text">${escapeHtml(preview)}</p>` : ""}
        ${thumb}
      </a>
    `;
  }

  function messageSnippet(m: ChatMessage): string {
    if (m.deleted_at) return "Mensaje eliminado";
    if (m.attachment_type === "sticker") return `${m.content ?? ""} Sticker`;
    if (m.content) return m.content;
    if (m.shared_post_id) return "🔁 Rep compartido";
    if (m.shared_gym_post_id) return "📌 Publicación compartida";
    if (m.attachment_type === "image") return m.view_once ? "📷 Foto efímera" : "📷 Foto";
    if (m.attachment_type === "video") return m.view_once ? "🎥 Video efímero" : "🎥 Video";
    if (m.attachment_type === "audio") return "🎤 Audio";
    return "Mensaje";
  }

  function senderLabel(m: ChatMessage): string {
    if (m.sender_id === userId) return "Vos";
    if (isGroup) return participantsById.get(m.sender_id)?.username ?? "Alguien";
    return conversation!.other_username ?? "";
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

  // Foto/video efímero: nunca se hidrata como <img>/<video> con data-path (hydrateMedia los
  // ignora, y de paso el storage tampoco dejaría leerlos todavía -- ver policy
  // chat_attachments_select). Tres estados: sin abrir (destinatario ve un botón "Toca para
  // ver"), ya visto, o soy quien lo mandó (nunca puedo verlo yo mismo, ni antes ni después de
  // que lo abran). En 1 a 1 hay un unico destinatario posible, asi que m.viewed_once_at (en la
  // fila del mensaje) ya dice si "ya se vio" para cualquiera de los dos. En grupo cada
  // integrante tiene su propio estado -- la fila nunca cambia, se consulta myGroupViewOnceOpened
  // (ver mas arriba) en su lugar, y por eso el sender siempre queda en "enviada" (nunca abre la
  // suya propia) sin importar cuántos del grupo ya la vieron.
  function viewOnceMediaHtml(m: ChatMessage, isMe: boolean, kind: "image" | "video"): string {
    const noun = kind === "image" ? "Foto" : "Video";
    const viewedByMe = isGroup ? myGroupViewOnceOpened.has(m.id) : !!m.viewed_once_at;
    if (viewedByMe) {
      return `
        <div class="chat-bubble-viewonce chat-bubble-viewonce-seen">
          <span class="chat-bubble-viewonce-badge">✓</span>
          <span>${noun} vista</span>
        </div>
      `;
    }
    if (isMe) {
      return `
        <div class="chat-bubble-viewonce chat-bubble-viewonce-sent">
          <span class="chat-bubble-viewonce-badge">1</span>
          <span>${noun}</span>
        </div>
      `;
    }
    return `
      <button type="button" class="chat-bubble-viewonce chat-bubble-viewonce-unseen" data-viewonce-id="${m.id}">
        <span class="chat-bubble-viewonce-badge">1</span>
        <span>Toca para ver la ${noun.toLowerCase()}</span>
      </button>
    `;
  }

  function bubbleBodyHtml(m: ChatMessage, isMe: boolean): string {
    if (m.deleted_at) {
      return `
        <p class="chat-bubble-deleted-text">🚫 Mensaje eliminado</p>
        <span class="chat-bubble-time">${timeLabel(m.created_at)}${isMe && !isGroup ? ticksHtml(m) : ""}</span>
      `;
    }
    let mediaHtml = "";
    if (m.shared_post_id) {
      mediaHtml = sharedPostPreviewHtml(m.shared_post_id);
    } else if (m.shared_gym_post_id) {
      mediaHtml = sharedGymPostPreviewHtml(m.shared_gym_post_id);
    } else if (m.attachment_type === "image" && m.attachment_path) {
      mediaHtml = m.view_once ? viewOnceMediaHtml(m, isMe, "image") : `
        <button type="button" class="chat-bubble-image" data-path="${escapeHtml(m.attachment_path)}">
          <img data-path="${escapeHtml(m.attachment_path)}" alt="Foto" class="chat-bubble-img-el">
        </button>
      `;
    } else if (m.attachment_type === "video" && m.attachment_path) {
      mediaHtml = m.view_once ? viewOnceMediaHtml(m, isMe, "video") : `
        <button type="button" class="chat-bubble-image chat-bubble-video" data-path="${escapeHtml(m.attachment_path)}" data-kind="video">
          <video data-path="${escapeHtml(m.attachment_path)}" muted playsinline preload="metadata" class="chat-bubble-img-el chat-bubble-video-el"></video>
          <span class="chat-bubble-video-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
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
          <span class="chat-audio-time" data-id="${m.id}" data-duration="${m.attachment_duration_seconds ?? 0}">${formatDuration(m.attachment_duration_seconds ?? 0)}</span>
          <button type="button" class="chat-audio-speed" data-id="${m.id}" aria-label="Velocidad de reproducción">1×</button>
        </div>
      `;
    }
    const isSticker = m.attachment_type === "sticker";
    const stickerHtml = isSticker ? `<span class="chat-bubble-sticker">${escapeHtml(m.content ?? "")}</span>` : "";
    const textHtml = !isSticker && m.content ? `<p class="chat-bubble-text">${linkifyHtml(m.content)}</p>` : "";
    // Sin adjunto/Rep compartido de por medio (mediaHtml vacio) y con un link de YouTube en el
    // texto: mismo criterio que postCard.ts, el embed va debajo del texto linkificado (que
    // sigue mostrando la URL como link normal, por si el iframe no carga).
    const youtubeId = !mediaHtml && m.content ? extractYouTubeVideoId(extractFirstUrl(m.content) ?? "") : null;
    const youtubeHtml = youtubeId ? `<div class="chat-bubble-youtube-embed">${youtubeEmbedHtml(youtubeId)}</div>` : "";
    const forwardedHtml = m.is_forwarded ? `<span class="chat-bubble-forwarded">Reenviado</span>` : "";
    const editedHtml = m.edited_at ? `<span class="chat-bubble-edited">editado</span>` : "";
    return `
      ${forwardedHtml}
      ${replyQuoteHtml(m)}
      ${mediaHtml}
      ${stickerHtml}
      ${textHtml}
      ${youtubeHtml}
      <span class="chat-bubble-time">${editedHtml}${timeLabel(m.created_at)}${isMe && !isGroup ? ticksHtml(m) : ""}</span>
      ${reactionsHtml(m)}
    `;
  }

  // Aviso tipo "Fulano cambió el nombre del grupo a 'X'" (o la foto) -- lo insertan las RPC
  // rename_group/set_group_avatar como un mensaje mas (attachment_type='system'), asi que
  // llega por los mismos canales (historial, realtime, push) sin logica aparte. Se pinta
  // como una linea centrada y muda, sin avatar/nombre/hora/menu -- no es un mensaje "de
  // alguien", es un evento del grupo (mismo criterio que .chat-date-divider).
  function bubbleHtml(m: ChatMessage, isMe: boolean, isFirstInRun = true, isLastInRun = true): string {
    if (m.attachment_type === "system") {
      return `<div class="chat-system-message">${escapeHtml(m.content ?? "")}</div>`;
    }
    const isSticker = !m.deleted_at && m.attachment_type === "sticker";
    const hasReactions = !m.deleted_at && Object.values(getReactions(m)).some((users) => users.length > 0);
    const bubbleEl = `
      <div class="chat-bubble ${isMe ? "chat-bubble-me" : "chat-bubble-other"}${isSticker ? " chat-bubble-sticker-wrap" : ""}${m.id === pinnedMessageId ? " is-pinned" : ""}${hasReactions ? " has-reactions" : ""}${m.deleted_at ? " chat-bubble-deleted" : ""}" data-id="${m.id}">
        ${bubbleBodyHtml(m, isMe)}
      </div>
    `;

    // Mensajes ajenos en un grupo: foto afuera de la burbuja a la izquierda (solo en el
    // último de una tanda seguida del mismo remitente) y nombre afuera y arriba (solo en el
    // primero) -- estilo WhatsApp/Instagram. En 1 a 1 el nombre/foto ya están en el header,
    // no hace falta repetirlos por mensaje.
    if (isGroup && !isMe) {
      const avatarUrl = participantsById.get(m.sender_id)?.avatar_url;
      const nameHtml = isFirstInRun ? `<span class="chat-bubble-sender-name">${escapeHtml(senderLabel(m))}</span>` : "";
      const rowAvatarHtml = isLastInRun
        ? `<img src="${escapeHtml(avatarUrl || "/images/avatars/default.svg")}" class="chat-bubble-avatar" alt="">`
        : "";
      return `
        <div class="chat-bubble-row${isFirstInRun ? " chat-bubble-row-first" : ""}">
          <div class="chat-bubble-avatar-slot">${rowAvatarHtml}</div>
          <div class="chat-bubble-col">
            ${nameHtml}
            ${bubbleEl}
          </div>
        </div>
      `;
    }

    return bubbleEl;
  }

  function sameDay(a: ChatMessage, b: ChatMessage): boolean {
    return new Date(a.created_at).toDateString() === new Date(b.created_at).toDateString();
  }

  function buildMessagesHtml(list: ChatMessage[]): string {
    let html = "";
    let lastDay: string | null = null;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const day = new Date(m.created_at).toDateString();
      if (day !== lastDay) {
        html += `<div class="chat-date-divider"><span>${dayLabel(m.created_at)}</span></div>`;
        lastDay = day;
      }
      const prev = list[i - 1];
      const next = list[i + 1];
      const isFirstInRun = !prev || prev.sender_id !== m.sender_id || !sameDay(prev, m);
      const isLastInRun = !next || next.sender_id !== m.sender_id || !sameDay(next, m);
      html += bubbleHtml(m, m.sender_id === userId, isFirstInRun, isLastInRun);
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

  // Nombre generico (ya no es solo imagenes): resuelve la URL firmada tanto de <img> como de
  // <video> marcados con .chat-bubble-img-el[data-path] (las fotos y los videos comparten esa
  // clase para el tamano/recorte del thumbnail, ver bubbleBodyHtml).
  async function hydrateMedia(): Promise<void> {
    const els = messagesEl.querySelectorAll<HTMLImageElement | HTMLVideoElement>(".chat-bubble-img-el[data-path]");
    await Promise.all(
      Array.from(els)
        .filter((el) => !el.src)
        .map(async (el) => {
          const url = await resolveAttachmentUrl(el.dataset.path!);
          if (!url) return;
          el.src = url;
          if (el instanceof HTMLVideoElement) primeVideoFrame(el);
        })
    );
  }

  // Dibuja la onda de cada mensaje de audio apenas se renderiza el mensaje, en vez de esperar
  // a que se apriete play -- mismo criterio que hydrateMedia con las fotos.
  async function hydrateAudioWaveforms(): Promise<void> {
    const canvases = messagesEl.querySelectorAll<HTMLCanvasElement>(".chat-audio-wave[data-id]");
    await Promise.all(
      Array.from(canvases)
        .filter((canvas) => !audioWaveLevels.has(canvas.dataset.id!))
        .map(async (canvas) => {
          const id = canvas.dataset.id!;
          const path = messagesEl.querySelector<HTMLButtonElement>(`.chat-audio-toggle[data-id="${id}"]`)?.dataset.path;
          if (!path) return;
          const url = await resolveAttachmentUrl(path);
          if (url) await loadWaveform(id, url);
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
    if (m.sender_id !== userId || isGroup) return;
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
  messagesEl.addEventListener("scroll", () => opts.onScrollTopChange?.(messagesEl.scrollTop), { signal: ctx.signal });
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
      await hydrateMyViewOnceOpens(messages);
      messagesEl.innerHTML = buildMessagesHtml(messages);
      // El scroll no tiene que esperar a que las imagenes/audio terminen de resolver su URL
      // firmada -- el alto de cada media ya esta fijo por CSS (no depende de que cargue), asi
      // que hacerlo esperar solo se sentia como "aparece arriba y recien despues salta al
      // final". Se hidratan en paralelo, sin bloquear nada visible.
      scrollToBottom("instant");
      void hydrateMedia();
      void hydrateMissingQuotes();
      void hydrateAudioWaveforms();
    } else {
      messagesEl.innerHTML = `<div class="chat-messages-loading"><div class="modern-spinner"></div></div>`;
    }

    const page = await listMessages(conversationId);
    messages = page.slice().reverse();
    messages.forEach((m) => renderedIds.add(m.id));
    await hydrateSharedPosts(messages);
    await hydrateMyViewOnceOpens(messages);
    olderExhausted = page.length < MESSAGES_PAGE_SIZE;
    messagesEl.innerHTML = messages.length
      ? (olderExhausted ? "" : SENTINEL_HTML) + buildMessagesHtml(messages)
      : `<p class="notif-empty">Todavía no hay mensajes. ¡Escribí el primero!</p>`;
    scrollToBottom("instant");
    void hydrateMedia();
    void hydrateMissingQuotes();
    void hydrateAudioWaveforms();
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
    await hydrateMyViewOnceOpens(ascendingOlder);

    olderExhausted = older.length < MESSAGES_PAGE_SIZE;
    // Reemplazar innerHTML reinicia el scrollTop a 0 -- sin guardar donde estaba ANTES del
    // swap (no solo el alto previo), la cuenta de mas abajo pierde la posicion real del
    // usuario y lo tira a "altura de lo que se acaba de agregar arriba", ignorando cuanto
    // habia scrolleado el ya. Con historiales largos (o al reabrir un hilo cacheado con
    // scrollTop grande, ver hideActiveInstance/openThread en chats.ts) el salto es enorme.
    const prevScrollTop = messagesEl.scrollTop;
    const prevScrollHeight = messagesEl.scrollHeight;
    messagesEl.innerHTML = (olderExhausted ? "" : SENTINEL_HTML) + buildMessagesHtml(messages);
    await hydrateMedia();
    void hydrateMissingQuotes();
    void hydrateAudioWaveforms();
    const target = prevScrollTop + (messagesEl.scrollHeight - prevScrollHeight);
    messagesEl.scrollTo({ top: target, left: 0, behavior: "instant" });
    if (olderExhausted) olderMessagesObserver.disconnect();
    else observeLoadSentinel();
  }

  async function appendMessage(m: ChatMessage): Promise<void> {
    if (renderedIds.has(m.id)) return;
    renderedIds.add(m.id);
    await hydrateSharedPosts([m]);

    const prevMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    messages.push(m);

    const wasNearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 150;
    if (messagesEl.querySelector(".notif-empty")) messagesEl.innerHTML = "";

    const isFirstInRun = !prevMessage || prevMessage.sender_id !== m.sender_id || !sameDay(prevMessage, m);

    if (!isFirstInRun && prevMessage && isGroup && prevMessage.sender_id !== userId) {
      // El mensaje nuevo sigue la tanda del mismo remitente -- la burbuja anterior deja de
      // ser la última de esa tanda, así que le sacamos el avatar (la foto "baja" a esta nueva).
      const prevBubble = messagesEl.querySelector(`.chat-bubble[data-id="${prevMessage.id}"]`);
      prevBubble?.closest(".chat-bubble-row")?.querySelector(".chat-bubble-avatar-slot")?.replaceChildren();
    }

    let html = "";
    if (!prevMessage || !sameDay(prevMessage, m)) html += `<div class="chat-date-divider"><span>${dayLabel(m.created_at)}</span></div>`;
    html += bubbleHtml(m, m.sender_id === userId, isFirstInRun, true);
    messagesEl.insertAdjacentHTML("beforeend", html);
    void hydrateMedia();
    void hydrateMissingQuotes();
    void hydrateAudioWaveforms();
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
      if (msg.sender_id !== userId && isThreadOnScreen()) {
        void markReadAndRefreshBadge();
      }
      if (msg.sender_id !== userId && conversationStatus === "pending" && isInitiator) {
        conversationStatus = "accepted";
        renderBanners();
      }
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
      const incoming = payload.new as ChatMessage;
      const idx = messages.findIndex((m) => m.id === incoming.id);
      const previous = idx !== -1 ? messages[idx] : null;
      const updated = reactionMutationInFlight.has(incoming.id) && idx !== -1 ? { ...incoming, reactions: messages[idx].reactions } : incoming;
      const contentChanged =
        previous &&
        (previous.content !== updated.content ||
          previous.deleted_at !== updated.deleted_at ||
          previous.edited_at !== updated.edited_at ||
          previous.viewed_once_at !== updated.viewed_once_at);
      if (contentChanged) {
        applyMessageContentUpdate(updated);
      } else {
        if (idx !== -1) messages[idx] = updated;
        refreshBubbleTicks(updated);
        refreshBubbleReactions(updated);
      }
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conversationId}` }, (payload) => {
      const updatedConversation = payload.new as { pinned_message_id: string | null; group_name: string | null; group_avatar_url: string | null };
      if (updatedConversation.pinned_message_id !== pinnedMessageId) {
        pinnedMessageId = updatedConversation.pinned_message_id;
        void renderPinnedBanner();
        refreshPinnedBubbleClass();
      }
      if (isGroup && (updatedConversation.group_name !== conversation!.group_name || updatedConversation.group_avatar_url !== conversation!.group_avatar_url)) {
        conversation!.group_name = updatedConversation.group_name as string;
        conversation!.group_avatar_url = updatedConversation.group_avatar_url as string;
        renderHeaderIdentity();
      }
    })
    .subscribe();
  ctx.addCleanup(() => void supabase.removeChannel(channel));

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!isThreadOnScreen()) return;
      // Se estaba mirando ESTE hilo justo cuando el navegador paso a segundo plano (pantalla
      // bloqueada, se cambio de app) y volvio -- mismo canal realtime fragil que catchUp() cubre
      // al reabrir desde chats.ts (ver ThreadController arriba), pero este caso es distinto: acá
      // nunca se salio del hilo, asi que openThread() nunca vuelve a correr para dispararlo.
      void catchUpMessages();
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

  function stopPlaybackLoop(): void {
    cancelAnimationFrame(playbackRaf);
    playbackRaf = 0;
  }

  // El evento "timeupdate" del <audio> dispara solo unas pocas veces por segundo (varía por
  // navegador), no cuadro a cuadro -- por eso la onda se sentía atrasada respecto de lo que se
  // escuchaba. Mientras el audio está en reproducción, leemos audio.currentTime en cada frame
  // con requestAnimationFrame en vez de depender de ese evento.
  //
  // Ni knownDurationSeconds (lo que midió el grabador, guardado en la base) ni audio.duration
  // (poco confiable en los blobs webm/opus que genera MediaRecorder -- a veces Infinity, a veces
  // mal calculada) son 100% confiables por separado. Si el "techo" usado queda corto, la barra
  // llega al tope y se queda ahí trabada mientras el audio real sigue sonando -- por eso el techo
  // se estira en vivo apenas currentTime lo alcanza, en vez de fijarse de antemano. Nunca muestra
  // el 100% mientras sigue sonando: eso solo pasa cuando el audio termina de verdad ("ended").
  function startPlaybackLoop(id: string, audio: HTMLAudioElement, timeEl: HTMLElement | null, originalDuration: string, knownDurationSeconds: number): void {
    stopPlaybackLoop();
    let ceiling = knownDurationSeconds > 0 ? knownDurationSeconds : Number.isFinite(audio.duration) ? audio.duration : 0;
    const tick = (): void => {
      if (audio.paused || audio.ended) return;
      if (Number.isFinite(audio.duration) && audio.duration > ceiling) ceiling = audio.duration;
      if (audio.currentTime >= ceiling) ceiling = audio.currentTime + 1;
      const remaining = Math.max(0, Math.ceil(ceiling - audio.currentTime));
      if (timeEl) timeEl.textContent = Number.isFinite(remaining) ? formatDuration(remaining) : originalDuration;
      drawPlaybackWave(id, ceiling ? Math.min(0.99, audio.currentTime / ceiling) : 0);
      playbackRaf = requestAnimationFrame(tick);
    };
    playbackRaf = requestAnimationFrame(tick);
  }

  function cyclePlaybackSpeed(btn: HTMLButtonElement): void {
    const id = btn.dataset.id!;
    const current = audioPlaybackRate.get(id) ?? 1;
    const next = PLAYBACK_SPEEDS[(PLAYBACK_SPEEDS.indexOf(current) + 1) % PLAYBACK_SPEEDS.length];
    audioPlaybackRate.set(id, next);
    btn.textContent = `${next}×`;
    const audio = audioPlayers.get(id);
    if (audio) audio.playbackRate = next;
  }

  async function toggleAudioMessage(btn: HTMLButtonElement): Promise<void> {
    const id = btn.dataset.id!;
    const path = btn.dataset.path!;
    let audio = audioPlayers.get(id);
    const timeEl = messagesEl.querySelector<HTMLElement>(`.chat-audio-time[data-id="${id}"]`);

    if (!audio) {
      const url = await resolveAttachmentUrl(path);
      if (!url) {
        alert("No se pudo cargar el audio.");
        return;
      }
      audio = new Audio(url);
      audio.playbackRate = audioPlaybackRate.get(id) ?? 1;
      audioPlayers.set(id, audio);
      void loadWaveform(id, url);
      audioOriginalDuration.set(id, timeEl?.textContent ?? "0:00");
      audio.addEventListener("ended", () => {
        stopPlaybackLoop();
        setPlayIcon(btn, true);
        if (timeEl) timeEl.textContent = audioOriginalDuration.get(id) ?? "0:00";
        currentlyPlayingId = null;
        drawPlaybackWave(id, 0);
      });
    }

    if (currentlyPlayingId && currentlyPlayingId !== id) {
      stopPlaybackLoop();
      const prevAudio = audioPlayers.get(currentlyPlayingId);
      prevAudio?.pause();
      const prevBtn = messagesEl.querySelector<HTMLButtonElement>(`.chat-audio-toggle[data-id="${currentlyPlayingId}"]`);
      if (prevBtn) setPlayIcon(prevBtn, true);
    }

    if (audio.paused) {
      await audio.play();
      setPlayIcon(btn, false);
      currentlyPlayingId = id;
      startPlaybackLoop(id, audio, timeEl, audioOriginalDuration.get(id) ?? "0:00", Number(timeEl?.dataset.duration) || 0);
    } else {
      audio.pause();
      stopPlaybackLoop();
      setPlayIcon(btn, true);
      currentlyPlayingId = null;
    }
  }
  ctx.addCleanup(() => {
    stopPlaybackLoop();
    audioPlayers.forEach((audio) => audio.pause());
  });

  async function openLightbox(path: string, kind: "image" | "video"): Promise<void> {
    const url = await resolveAttachmentUrl(path);
    if (!url) return;
    openMediaLightbox({
      queue: [{ url }],
      startIndex: 0,
      getMedia: (item) => ({ url: item.url, kind }),
    });
  }

  let openingViewOnceId: string | null = null;

  /** Abre una foto/video efímero: primero lo marca visto server-side (atómico, una sola vez --
   * ver open_view_once_message), y solo si eso funcionó descarga los bytes completos (fetch a
   * blob, no un <img src> directo) antes de mostrarlo, para poder borrar el archivo del bucket
   * apenas termina de bajar sin arriesgarse a cortar la descarga a mitad de camino. */
  async function openViewOnceAttachment(message: ChatMessage): Promise<void> {
    if (openingViewOnceId) return;
    openingViewOnceId = message.id;
    const btn = messagesEl.querySelector<HTMLButtonElement>(`.chat-bubble-viewonce-unseen[data-viewonce-id="${message.id}"]`);
    btn?.classList.add("is-loading");
    try {
      const { message: opened, fullyViewed, error } = await openViewOnceMessage(message.id);
      if (error || !opened) {
        alert(error || "Ya no está disponible.");
        return;
      }
      // En grupo la fila del mensaje no cambia (viewed_once_at/by quedan null para siempre) --
      // mi propio "ya la vi" vive aca, en el Set local, y hay que sumarla ANTES de re-pintar
      // la burbuja para que el re-render la agarre (ver viewOnceMediaHtml).
      if (isGroup) myGroupViewOnceOpened.add(message.id);
      applyMessageContentUpdate(opened);
      const path = opened.attachment_path!;
      const url = await resolveAttachmentUrl(path);
      if (!url) return;
      const resp = await fetch(url);
      if (!resp.ok) return;
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      // En 1 a 1 fullyViewed siempre da true (un unico destinatario posible). En grupo recien
      // da true cuando TODOS los integrantes activos ya la abrieron cada uno la suya -- borrar
      // antes le arruinaria la foto a quien todavia no le tocó verla.
      if (fullyViewed) void deleteChatAttachment(path);
      openMediaLightbox({
        queue: [{ url: blobUrl }],
        startIndex: 0,
        getMedia: (item) => ({ url: item.url, kind: opened.attachment_type === "video" ? "video" : "image" }),
        onClose: () => URL.revokeObjectURL(blobUrl),
      });
    } finally {
      btn?.classList.remove("is-loading");
      openingViewOnceId = null;
    }
  }

  messagesEl.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement;
      const viewOnceBtn = target.closest<HTMLButtonElement>(".chat-bubble-viewonce-unseen");
      if (viewOnceBtn?.dataset.viewonceId) {
        const message = messages.find((m) => m.id === viewOnceBtn.dataset.viewonceId);
        if (message) void openViewOnceAttachment(message);
        return;
      }
      const imageBtn = target.closest<HTMLButtonElement>(".chat-bubble-image");
      if (imageBtn) {
        void openLightbox(imageBtn.dataset.path!, imageBtn.dataset.kind === "video" ? "video" : "image");
        return;
      }
      const audioBtn = target.closest<HTMLButtonElement>(".chat-audio-toggle");
      if (audioBtn) {
        void toggleAudioMessage(audioBtn);
        return;
      }
      const speedBtn = target.closest<HTMLButtonElement>(".chat-audio-speed");
      if (speedBtn) {
        cyclePlaybackSpeed(speedBtn);
        return;
      }
      const quoteBtn = target.closest<HTMLButtonElement>(".chat-bubble-quote:not(.chat-bubble-quote-missing)");
      if (quoteBtn?.dataset.quoteId) {
        scrollToMessage(quoteBtn.dataset.quoteId);
        return;
      }
      const reactionPill = target.closest<HTMLButtonElement>(".chat-reaction-pill");
      if (reactionPill?.dataset.emoji) {
        const message = messages.find((m) => m.id === reactionPill.closest<HTMLElement>(".chat-bubble")?.dataset.id);
        if (message) void toggleReaction(message, reactionPill.dataset.emoji);
        return;
      }
      if (target.closest(".chat-shared-post")) return;
      if (target.closest("a")) return;
      const bubble = target.closest<HTMLElement>(".chat-bubble");
      if (bubble?.dataset.id) {
        const message = messages.find((m) => m.id === bubble.dataset.id);
        // Un mensaje eliminado no tiene menú: nada para responder/reenviar/reaccionar/editar
        // sobre un placeholder vacío -- mismo criterio que WhatsApp.
        if (message && !message.deleted_at) openMessageMenu(message, bubble);
      }
    },
    { signal: ctx.signal }
  );

  // ---------------------------------------------------------------------------
  // Menú de mensaje: responder / reenviar / anclar / editar / eliminar
  // ---------------------------------------------------------------------------

  let closeOpenMessageMenu: (() => void) | null = null;
  ctx.addCleanup(() => closeOpenMessageMenu?.());

  function openMessageMenu(message: ChatMessage, anchor: HTMLElement): void {
    closeOpenMessageMenu?.();

    const isMe = message.sender_id === userId;
    const isPinned = pinnedMessageId === message.id;
    const myEmoji = myReaction(message);
    const canEdit = isMe && !message.attachment_path && !message.shared_post_id && !message.shared_gym_post_id && message.attachment_type !== "sticker";
    const menu = document.createElement("div");
    menu.className = "chat-msg-menu";
    menu.innerHTML = `
      <div class="chat-reaction-bar">
        ${QUICK_REACTIONS.map((emoji) => `<button type="button" class="chat-reaction-option${emoji === myEmoji ? " is-active" : ""}" data-emoji="${emoji}">${emoji}</button>`).join("")}
      </div>
      <button type="button" data-action="reply">Responder</button>
      ${message.view_once ? "" : `<button type="button" data-action="forward">Reenviar</button>`}
      ${message.content ? `<button type="button" data-action="copy">Copiar</button>` : ""}
      <button type="button" data-action="pin">${isPinned ? "Desanclar" : "Anclar"}</button>
      ${canEdit ? `<button type="button" data-action="edit">Editar</button>` : ""}
      ${isMe ? `<button type="button" data-action="delete" class="chat-msg-menu-danger">Eliminar</button>` : ""}
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
      const reactionBtn = (e.target as HTMLElement).closest<HTMLButtonElement>(".chat-reaction-option");
      if (reactionBtn?.dataset.emoji) {
        closeOpenMessageMenu?.();
        void toggleReaction(message, reactionBtn.dataset.emoji);
        return;
      }
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
      else if (action === "edit") startEditMessage(message);
      else if (action === "delete") confirmDeleteMessage(message);
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
    cancelEditMessage();
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

  function cancelEditMessage(): void {
    editingMessage = null;
    editBar.hidden = true;
    composerInput.value = "";
    composerInput.style.height = "auto";
    updateSendState();
  }

  function startEditMessage(message: ChatMessage): void {
    replyTarget = null;
    replyBar.hidden = true;
    clearPendingAttachment();
    editingMessage = message;
    editBarText.textContent = message.content ?? "";
    editBar.hidden = false;
    composerInput.value = message.content ?? "";
    composerInput.style.height = "auto";
    composerInput.style.height = `${Math.min(composerInput.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
    composerInput.focus();
    updateSendState();
  }

  editBarCancelBtn.addEventListener("click", cancelEditMessage, { signal: ctx.signal });

  /** Confirmacion de borrado, mismo mecanismo que confirmDeletePost en postModals.ts. */
  function confirmDeleteMessage(message: ChatMessage): void {
    const loaderBody = document.getElementById("loaderBody");
    if (!loaderBody) return;
    loaderBody.innerHTML = `
      <div class="success-check-container">
        <div class="modal-card">
          <h2>Eliminar mensaje</h2>
          <p class="subtitle">Esta acción no se puede deshacer.</p>
          <div class="alert_message" id="chatDeleteMsgAlert"></div>
          <div class="modal-actions">
            <button class="btn btn-danger" id="confirmDeleteMsg" type="button">Eliminar</button>
            <button class="btn btn-outline" id="cancelDeleteMsg" type="button">Cancelar</button>
          </div>
        </div>
      </div>
    `;
    const close = () => (loaderBody.innerHTML = "");
    document.getElementById("cancelDeleteMsg")?.addEventListener("click", close);
    document.getElementById("confirmDeleteMsg")?.addEventListener("click", async () => {
      const btn = document.getElementById("confirmDeleteMsg") as HTMLButtonElement;
      btn.disabled = true;
      const { message: updated, error } = await deleteMessage(message.id);
      if (error) {
        const alertBox = document.getElementById("chatDeleteMsgAlert");
        if (alertBox) alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
        btn.disabled = false;
        return;
      }
      close();
      if (!updated) return;
      applyMessageContentUpdate(updated);
      if (editingMessage?.id === updated.id) cancelEditMessage();
      if (replyTarget?.id === updated.id) {
        replyTarget = null;
        replyBar.hidden = true;
      }
    });
  }

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
            attachmentType: (message.attachment_type as "image" | "video" | "audio" | "sticker" | null) ?? undefined,
            attachmentDurationSeconds: message.attachment_duration_seconds ?? undefined,
            sharedPostId: message.shared_post_id ?? undefined,
            sharedGymPostId: message.shared_gym_post_id ?? undefined,
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

  type PendingAttachment =
    | { kind: "image"; file: File; previewUrl: string }
    | { kind: "video"; file: File; previewUrl: string }
    | { kind: "audio"; blob: Blob; durationSeconds: number };

  let pendingAttachment: PendingAttachment | null = null;
  let pendingViewOnce = false;
  let sending = false;
  const recorder = new AudioRecorder();
  let recordTimer: ReturnType<typeof setInterval> | undefined;
  let recordSeconds = 0;

  /** Redimensiona el buffer del canvas (en px físicos) para que coincida con su tamaño CSS
   * actual -- si no se hace ANTES del primer dibujo, el canvas arranca con su buffer por
   * default (300x150) estirado dentro de la caja chica del composer y se ve distorsionado. */
  function sizeWaveCanvas(canvas: HTMLCanvasElement): { width: number; height: number } | null {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return null;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    return { width, height };
  }

  function drawBars(canvas: HTMLCanvasElement, levels: number[], liveLevel: number, fillStyle: string | CanvasGradient): void {
    const ctx2d = canvas.getContext("2d");
    const size = ctx2d && sizeWaveCanvas(canvas);
    if (!ctx2d || !size) return;
    const { width, height } = size;
    const dpr = window.devicePixelRatio || 1;
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, width, height);

    const barWidth = 3;
    const gap = 3;
    const step = barWidth + gap;
    const barsFit = Math.max(1, Math.floor(width / step));
    // La barra "en vivo" (liveLevel) no se guarda en el historial: se agrega solo para dibujar,
    // así sigue el nivel de audio en tiempo real cuadro a cuadro sin inflar el array de niveles.
    const visible = [...levels, liveLevel].slice(-barsFit);

    ctx2d.fillStyle = fillStyle;
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

  const WAVE_SAMPLE_MS = 90;
  const waveLevels: number[] = [];
  let waveRaf = 0;
  let waveLastSampleAt = 0;

  // Antes se redibujaba con setInterval cada 100ms, desacoplado del ciclo de pintado del
  // navegador -- eso es lo que se sentía "trabado" (10fps, con tirones cuando el hilo principal
  // se ocupaba con otra cosa). requestAnimationFrame sincroniza el redibujo con el pintado real
  // (hasta 60fps) y se pausa solo si la pestaña está oculta, en vez de seguir corriendo a ciegas.
  function startWave(): void {
    waveLevels.length = 0;
    waveLastSampleAt = 0;
    const size = sizeWaveCanvas(recordWaveCanvas);
    const ctx2d = recordWaveCanvas.getContext("2d");

    // Colores leídos una sola vez (no en cada frame: getComputedStyle fuerza recálculo de
    // estilos y llamarlo a 60fps sería contraproducente). Gradiente --accent-2 -> --accent,
    // el mismo par que ya usa el resto de la web (botón de enviar, avatares, etc).
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue("--accent").trim() || "#ff4d4d";
    const accent2 = style.getPropertyValue("--accent-2").trim() || "#ff8a3d";
    let fillStyle: string | CanvasGradient = accent;
    if (ctx2d && size) {
      const gradient = ctx2d.createLinearGradient(0, 0, size.width, 0);
      gradient.addColorStop(0, accent2);
      gradient.addColorStop(1, accent);
      fillStyle = gradient;
    }

    const tick = (now: number): void => {
      if (!recorder.isRecording) return;
      const level = recorder.getLevel();
      if (now - waveLastSampleAt >= WAVE_SAMPLE_MS) {
        waveLastSampleAt = now;
        waveLevels.push(level);
      }
      drawBars(recordWaveCanvas, waveLevels, level, fillStyle);
      waveRaf = requestAnimationFrame(tick);
    };
    waveRaf = requestAnimationFrame(tick);
  }

  function stopWave(): void {
    cancelAnimationFrame(waveRaf);
    waveLevels.length = 0;
    const ctx2d = recordWaveCanvas.getContext("2d");
    ctx2d?.clearRect(0, 0, recordWaveCanvas.width, recordWaveCanvas.height);
  }

  function updateSendState(): void {
    sendBtn.disabled = sending || (!composerInput.value.trim() && !pendingAttachment && !recorder.isRecording);
  }

  function clearPendingAttachment(): void {
    if (pendingAttachment?.kind === "image" || pendingAttachment?.kind === "video") URL.revokeObjectURL(pendingAttachment.previewUrl);
    pendingAttachment = null;
    pendingViewOnce = false;
    previewBar.hidden = true;
    previewImg.hidden = true;
    previewVideo.hidden = true;
    previewVideo.src = "";
    previewAudioLabel.hidden = true;
    previewViewOnceBtn.hidden = true;
    previewViewOnceBtn.classList.remove("is-active");
    previewViewOnceBtn.setAttribute("aria-pressed", "false");
    updateSendState();
    updateYoutubePreview();
  }

  function showPreview(): void {
    previewBar.hidden = false;
    previewImg.hidden = true;
    previewVideo.hidden = true;
    previewAudioLabel.hidden = true;
    if (pendingAttachment?.kind === "image") {
      previewImg.hidden = false;
      previewImg.src = pendingAttachment.previewUrl;
    } else if (pendingAttachment?.kind === "video") {
      previewVideo.hidden = false;
      previewVideo.src = pendingAttachment.previewUrl;
      primeVideoFrame(previewVideo);
    } else if (pendingAttachment?.kind === "audio") {
      previewAudioLabel.hidden = false;
      previewAudioDuration.textContent = formatDuration(pendingAttachment.durationSeconds);
    }
    previewViewOnceBtn.hidden = pendingAttachment?.kind !== "image" && pendingAttachment?.kind !== "video";
    updateSendState();
    updateYoutubePreview();
  }

  // Vista previa en vivo del video de YouTube apenas se pega el link en el composer -- mismo
  // criterio que el composer de Reps (ver updateYoutubePreview en feed.ts): nunca convive con
  // un adjunto, si hay uno esa es la intencion mas explicita.
  function updateYoutubePreview(): void {
    const videoId = !pendingAttachment ? extractYouTubeVideoId(extractFirstUrl(composerInput.value) ?? "") : null;
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

  composerInput.addEventListener(
    "input",
    () => {
      composerInput.style.height = "auto";
      composerInput.style.height = `${Math.min(composerInput.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
      updateSendState();
      updateYoutubePreview();
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
      const kind = file.type.startsWith("video/") ? "video" : "image";
      pendingAttachment = { kind, file, previewUrl: URL.createObjectURL(file) };
      showPreview();
    },
    { signal: ctx.signal }
  );

  previewViewOnceBtn.addEventListener(
    "click",
    () => {
      pendingViewOnce = !pendingViewOnce;
      previewViewOnceBtn.classList.toggle("is-active", pendingViewOnce);
      previewViewOnceBtn.setAttribute("aria-pressed", String(pendingViewOnce));
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
    cancelAnimationFrame(waveRaf);
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
    if (editingMessage) {
      const content = composerInput.value.trim();
      if (!content || sending) return;
      const target = editingMessage;
      sending = true;
      updateSendState();
      const { message, error } = await editMessage(target.id, content);
      sending = false;
      if (error || !message) {
        alert(error || "No se pudo editar el mensaje.");
        updateSendState();
        return;
      }
      applyMessageContentUpdate(message);
      cancelEditMessage();
      return;
    }

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
    let attachmentType: "image" | "video" | "audio" | undefined;
    let attachmentDurationSeconds: number | undefined;
    const viewOnce = pendingViewOnce && (pendingAttachment?.kind === "image" || pendingAttachment?.kind === "video");

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
    } else if (pendingAttachment?.kind === "video") {
      const { path, error } = await uploadChatVideo(conversationId, pendingAttachment.file);
      if (error || !path) {
        alert(error || "No se pudo subir el video.");
        sending = false;
        updateSendState();
        return;
      }
      attachmentPath = path;
      attachmentType = "video";
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
      viewOnce,
    });

    sending = false;

    if (error || !message) {
      alert(error || "No se pudo enviar el mensaje.");
      updateSendState();
      return;
    }

    composerInput.value = "";
    composerInput.style.height = "auto";
    clearPendingAttachment(); // tambien limpia la vista previa de YouTube, ver updateYoutubePreview()
    replyTarget = null;
    replyBar.hidden = true;
    void appendMessage(message);

    if (conversationStatus === "pending" && isInitiator === false) {
      conversationStatus = "accepted";
      renderBanners();
    }

    updateSendState();
  }

  async function catchUpMessages(): Promise<void> {
    const page = await listMessages(conversationId).catch(() => [] as ChatMessage[]);
    // Ascendente (mas viejo primero), mismo orden que appendMessage espera para ir pegando
    // abajo en secuencia -- listMessages() sin cursor trae la ultima pagina, mas nuevo primero.
    for (const m of page.slice().reverse()) {
      if (!renderedIds.has(m.id)) await appendMessage(m);
    }
  }

  return { catchUp: catchUpMessages };
}
