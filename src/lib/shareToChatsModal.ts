import { escapeHtml } from "./dom";
import { renderVerifiedBadge } from "./verifiedBadge";
import { makeMentionEditable } from "./mentionEditor";
import { attachMentionAutocomplete } from "./mentionAutocomplete";
import { createPost, validatePostContent } from "../services/post.service";
import {
  listConversations,
  getOrCreateConversation,
  sendMessage,
  groupParticipantsOf,
  type ConversationSummary,
  type SendMessageInput,
} from "../services/chat.service";
import { listFollowers, type FollowListRow } from "../services/follow.service";

const POST_MAX = 240;
const DEFAULT_AVATAR = "/images/avatars/default.svg";
const GROUP_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

// Iconos de compartir externo -- mismos que postModals.ts (openShareToChatModal).
const SHARE_ICON_WHATSAPP = `<path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5Z"/><path d="M8.3 8.1c.2-.4.4-.4.6-.4h.4c.2 0 .4 0 .5.4.2.4.6 1.4.6 1.5.1.1.1.3 0 .4-.1.2-.2.3-.3.4-.1.2-.3.3-.1.6.2.3.7 1.2 1.6 1.9 1.1.9 1.9 1.2 2.3 1.4.3.1.4.1.6-.1.2-.2.6-.7.8-1 .2-.2.4-.2.6-.1.2.1 1.4.6 1.6.7.3.1.4.2.5.3 0 .2 0 .8-.3 1.5-.3.7-1.5 1.3-2.1 1.4-.6.1-1.3.2-4-1S9 15.3 8 14c-.2-.2-1.6-2-1.6-4 0-.3 0-.8.2-1.2z" fill="currentColor" stroke="none"/>`;
const SHARE_ICON_X = `<path d="M5 5l14 14M19 5L5 19"/>`;
const SHARE_ICON_FACEBOOK = `<circle cx="12" cy="12" r="9"/><path d="M13.5 21v-6.5h2.1l.3-2.6h-2.4V10c0-.8.2-1.3 1.3-1.3H16V6.1c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.1H7.9v2.6H10V21" fill="none"/>`;
const SHARE_ICON_LINK = `<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/>`;

function shareIconSvg(path: string): string {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function closeModal(): void {
  const loaderBody = document.getElementById("loaderBody");
  if (loaderBody) loaderBody.innerHTML = "";
}

function successHtml(message: string): string {
  return `
    <div class="success-check-container">
      <div class="success-icon">
        <svg viewBox="0 0 52 52" class="success-svg">
          <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
          <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
        </svg>
      </div>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

export interface ShareToChatsConfig {
  viewerId: string;
  /** Título del modal, ej. "Compartir rutina". */
  title: string;
  /** Bajada ya formateada (se escapa). */
  subtitle: string;
  /** Línea gris opcional bajo la bajada. */
  hint?: string;
  /** Mensaje de éxito tras enviar a un chat, ej. "¡Rutina enviada!". */
  sentMessage: string;
  /** Placeholder del textarea de "Publicar como Rep". */
  repPlaceholder: string;
  /**
   * Prepara el link externo. Los botones (afuera / Rep) quedan deshabilitados hasta que
   * resuelve -- la rutina lo usa para marcarse compartible antes de tener token. Un error acá
   * corta el modal mostrando el mensaje.
   */
  prepare: () => Promise<{ shareUrl: string; shareText: string; repDefaultText: string } | { error: string }>;
  /** Qué mandar cuando se elige un chat/persona (ej. { sharedRoutineId } / { sharedProfileId }). */
  sendInput: SendMessageInput;
}

/**
 * Modal genérico "compartir X con chats": mandarlo a un chat (grupo o 1 a 1) o a un seguidor,
 * publicarlo como Rep, o copiar / compartir el link afuera. Mismo repertorio que compartir un
 * Rep (openShareToChatModal en postModals.ts). Lo usan openShareRoutineModal y
 * openShareProfileModal.
 */
export async function openShareToChatsModal(cfg: ShareToChatsConfig): Promise<void> {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>${escapeHtml(cfg.title)}</h2>
        <p class="subtitle">${escapeHtml(cfg.subtitle)}</p>
        ${cfg.hint ? `<p class="field-hint">${escapeHtml(cfg.hint)}</p>` : ""}

        <div class="modal-actions" style="margin-top:0;margin-bottom:16px">
          <button class="btn btn-primary" id="shareChatsAsRep" type="button" disabled>Publicar como Rep</button>
        </div>

        <div class="post-share-external">
          <button type="button" class="post-share-external-btn" data-net="whatsapp" aria-label="Compartir por WhatsApp" disabled>${shareIconSvg(SHARE_ICON_WHATSAPP)}</button>
          <button type="button" class="post-share-external-btn" data-net="x" aria-label="Compartir en X" disabled>${shareIconSvg(SHARE_ICON_X)}</button>
          <button type="button" class="post-share-external-btn" data-net="facebook" aria-label="Compartir en Facebook" disabled>${shareIconSvg(SHARE_ICON_FACEBOOK)}</button>
          <button type="button" class="post-share-external-btn" data-net="copy" aria-label="Copiar link" disabled>${shareIconSvg(SHARE_ICON_LINK)}</button>
        </div>
        <p class="post-share-copied" id="shareChatsCopiedMsg" hidden>¡Link copiado!</p>

        <div class="field">
          <input type="text" id="shareChatsSearch" placeholder="Buscar un chat o seguidor...">
        </div>
        <div class="post-share-list" id="shareChatsList"><p class="exc-pick-empty">Cargando...</p></div>
        <div class="alert_message" id="shareChatsAlert"></div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="shareChatsCancel" type="button">Cerrar</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("shareChatsCancel")?.addEventListener("click", closeModal);

  const alertBox = document.getElementById("shareChatsAlert")!;
  const externalBtns = [...loaderBody.querySelectorAll<HTMLButtonElement>(".post-share-external-btn")];
  const asRepBtn = document.getElementById("shareChatsAsRep") as HTMLButtonElement;

  const prepared = await cfg.prepare();
  if ("error" in prepared) {
    alertBox.innerHTML = `<p>${escapeHtml(prepared.error)}</p>`;
    return;
  }
  const { shareUrl, shareText, repDefaultText } = prepared;

  externalBtns.forEach((b) => (b.disabled = false));
  asRepBtn.disabled = false;

  externalBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const net = btn.dataset.net;
      if (net === "copy") {
        try {
          await navigator.clipboard.writeText(shareUrl);
          const msg = document.getElementById("shareChatsCopiedMsg");
          if (msg) {
            msg.hidden = false;
            setTimeout(() => (msg.hidden = true), 2000);
          }
        } catch {
          // el usuario negó el permiso de portapapeles, no es un error real
        }
        return;
      }
      const intentUrl =
        net === "whatsapp"
          ? `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`
          : net === "x"
            ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
            : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
      window.open(intentUrl, "_blank", "noopener");
    });
  });

  asRepBtn.addEventListener("click", () => openAsRepModal(cfg.viewerId, repDefaultText, cfg.repPlaceholder));

  const listEl = document.getElementById("shareChatsList")!;
  const searchInput = document.getElementById("shareChatsSearch") as HTMLInputElement;

  interface ShareTarget {
    key: string;
    conversationId?: string;
    userId?: string;
    name: string;
    searchName: string;
    avatarHtml: string;
    subtitle: string;
  }

  function conversationTarget(c: ConversationSummary): ShareTarget {
    if (c.kind === "group") {
      const count = groupParticipantsOf(c).filter((p) => p.left_at === null).length;
      return {
        key: `c:${c.conversation_id}`,
        conversationId: c.conversation_id,
        name: escapeHtml(c.group_name || "Grupo"),
        searchName: (c.group_name || "grupo").toLowerCase(),
        avatarHtml: c.group_avatar_url
          ? `<img src="${escapeHtml(c.group_avatar_url)}" class="chat-avatar" alt="">`
          : `<span class="chat-avatar chat-avatar-group">${GROUP_ICON}</span>`,
        subtitle: count ? `Grupo · ${count} integrantes` : "Grupo",
      };
    }
    return {
      key: `c:${c.conversation_id}`,
      conversationId: c.conversation_id,
      name: `${escapeHtml(c.other_username ?? "")}${renderVerifiedBadge(c.other_user_type ?? "usuario", c.other_is_verified)}`,
      searchName: (c.other_username ?? "").toLowerCase(),
      avatarHtml: `<img src="${escapeHtml(c.other_avatar_url || DEFAULT_AVATAR)}" class="chat-avatar" alt="">`,
      subtitle: "Chat",
    };
  }

  function followerTarget(f: FollowListRow): ShareTarget {
    return {
      key: `u:${f.id}`,
      userId: f.id,
      name: `${escapeHtml(f.username)}${renderVerifiedBadge(f.userType, f.isVerified)}`,
      searchName: f.username.toLowerCase(),
      avatarHtml: `<img src="${escapeHtml(f.avatarUrl || DEFAULT_AVATAR)}" class="chat-avatar" alt="">`,
      subtitle: "Seguidor",
    };
  }

  let allTargets: ShareTarget[] = [];

  function renderTargets(term: string): void {
    const q = term.trim().toLowerCase();
    const filtered = q ? allTargets.filter((t) => t.searchName.includes(q)) : allTargets;
    if (filtered.length === 0) {
      listEl.innerHTML = `<p class="exc-pick-empty">${
        q ? "No encontramos chats ni seguidores con ese nombre." : "Todavía no tenés chats. Copiá el link o compartilo afuera."
      }</p>`;
      return;
    }
    listEl.innerHTML = filtered
      .map(
        (t) => `
      <button type="button" class="post-share-row" data-key="${escapeHtml(t.key)}">
        ${t.avatarHtml}
        <span class="post-share-name">${t.name}<span style="opacity:.6;font-weight:400">· ${escapeHtml(t.subtitle)}</span></span>
      </button>
    `
      )
      .join("");

    listEl.querySelectorAll<HTMLButtonElement>(".post-share-row").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = allTargets.find((t) => t.key === btn.dataset.key);
        if (target) void sendToTarget(target);
      });
    });
  }

  async function sendToTarget(target: ShareTarget): Promise<void> {
    const rows = listEl.querySelectorAll<HTMLButtonElement>(".post-share-row");
    rows.forEach((b) => (b.disabled = true));
    alertBox.innerHTML = "";

    let conversationId = target.conversationId;
    if (!conversationId && target.userId) {
      const { id, error } = await getOrCreateConversation(target.userId);
      if (error || !id) {
        alertBox.innerHTML = `<p>${escapeHtml(error || "No se pudo abrir la conversación.")}</p>`;
        rows.forEach((b) => (b.disabled = false));
        return;
      }
      conversationId = id;
    }
    if (!conversationId) return;

    const { error } = await sendMessage(conversationId, cfg.sendInput);
    if (error) {
      alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
      rows.forEach((b) => (b.disabled = false));
      return;
    }
    loaderBody!.innerHTML = successHtml(cfg.sentMessage);
    setTimeout(closeModal, 1400);
  }

  try {
    const [conversations, followers] = await Promise.all([
      listConversations().catch(() => [] as ConversationSummary[]),
      listFollowers(cfg.viewerId).catch(() => [] as FollowListRow[]),
    ]);
    const directUserIds = new Set(conversations.filter((c) => c.kind === "direct").map((c) => c.other_user_id));
    allTargets = [
      ...conversations.map(conversationTarget),
      ...followers.filter((f) => !directUserIds.has(f.id)).map(followerTarget),
    ];
    renderTargets("");
  } catch {
    listEl.innerHTML = `<p class="exc-pick-empty">No se pudo cargar tus chats.</p>`;
  }

  let debounce: ReturnType<typeof setTimeout> | undefined;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => renderTargets(searchInput.value), 160);
  });
}

/** Sub-modal "Publicar como Rep": composer con texto precargado, publica con createPost.
 * Mismo patrón que openShareMeasurementModal en medidas.ts. */
function openAsRepModal(viewerId: string, defaultText: string, placeholder: string): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card modal-card-lg">
        <h2>Publicar como Rep</h2>
        <p class="subtitle">Se va a publicar en tu feed. Editá el texto como quieras.</p>
        <div class="field">
          <textarea id="shareRepText" class="quote-composer-input" rows="6" placeholder="${escapeHtml(placeholder)}">${escapeHtml(defaultText)}</textarea>
          <span class="post-composer-counter" id="shareRepCounter">${POST_MAX}</span>
        </div>
        <div class="alert_message" id="shareRepAlert"></div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="shareRepSubmit" type="button">Publicar</button>
          <button class="btn btn-outline" id="shareRepCancel" type="button">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("shareRepCancel")?.addEventListener("click", closeModal);

  const textEl = document.getElementById("shareRepText") as HTMLTextAreaElement;
  const counterEl = document.getElementById("shareRepCounter")!;
  function updateCounter(): void {
    const remaining = POST_MAX - textEl.value.length;
    counterEl.textContent = String(remaining);
    counterEl.classList.toggle("post-composer-counter-over", remaining < 0);
  }
  textEl.addEventListener("input", updateCounter);
  updateCounter();
  attachMentionAutocomplete(makeMentionEditable(textEl));

  document.getElementById("shareRepSubmit")?.addEventListener("click", async () => {
    const alertEl = document.getElementById("shareRepAlert")!;
    alertEl.innerHTML = "";
    const text = textEl.value;
    const validationError = validatePostContent(text, false);
    if (validationError) {
      alertEl.innerHTML = `<p>${escapeHtml(validationError)}</p>`;
      return;
    }

    const submitBtn = document.getElementById("shareRepSubmit") as HTMLButtonElement;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="btn-spinner"></span> Publicando...`;

    const { post, error } = await createPost(viewerId, text);
    if (error || !post) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Publicar";
      alertEl.innerHTML = `<p>${escapeHtml(error || "No se pudo publicar el Rep.")}</p>`;
      return;
    }

    loaderBody.innerHTML = successHtml("¡Rep publicado! Lo vas a ver en tu feed.");
    setTimeout(closeModal, 1600);
  });
}
