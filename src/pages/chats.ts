import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { renderVerifiedBadge } from "../lib/verifiedBadge";
import { listFollowers, listFollowing, type FollowListRow } from "../services/follow.service";
import {
  listConversations,
  listMessages,
  MESSAGES_PAGE_SIZE,
  acceptMessageRequest,
  declineMessageRequest,
  getOrCreateConversation,
  type ConversationSummary,
} from "../services/chat.service";
import { cacheMessages } from "../lib/chatDb";

setupNavToggle();
setupRevealObserver();
const userId = await requireAuth();

function relativeTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "Ahora";
  if (diffMin < 60) return `${diffMin} min`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} d`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function avatarOf(c: ConversationSummary): string {
  return c.other_avatar_url || "/images/avatars/default.svg";
}

function previewText(c: ConversationSummary): string {
  const prefix = c.last_message_sender_is_me ? "Vos: " : "";
  return escapeHtml(`${prefix}${c.last_message_preview ?? "Empezá la conversación"}`);
}

let conversations: ConversationSummary[] = [];
let searchQuery = "";

const listEl = document.getElementById("chatList")!;
const tabsWrap = document.getElementById("chatTabs")!;
const messagesPanel = document.getElementById("chatMessagesPanel") as HTMLDivElement;
const requestsCountEl = document.getElementById("chatRequestsCount")!;
const requestsListEl = document.getElementById("chatRequestsList") as HTMLDivElement;
const searchInput = document.getElementById("chatSearchInput") as HTMLInputElement;
const peopleEl = document.getElementById("chatSearchPeople") as HTMLDivElement;
const threadPane = document.getElementById("chatThreadPane") as HTMLDivElement;
const threadPlaceholder = document.getElementById("chatThreadPlaceholder") as HTMLDivElement;

let activeConversationId: string | null = null;
let threadFrame: HTMLIFrameElement | null = null;

// El breakpoint desktop del proyecto (mismo que usa .site-nav para pasar de
// menu hamburguesa a nav horizontal). Solo en ese ancho tiene sentido el
// panel dividido estilo WhatsApp Web; en mobile se sigue navegando de pagina.
function isDesktopChatLayout(): boolean {
  return window.matchMedia("(min-width: 860px)").matches;
}

function matchesQuery(c: ConversationSummary): boolean {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  return (
    (c.other_username ?? "").toLowerCase().includes(q) ||
    (c.other_nombre ?? "").toLowerCase().includes(q) ||
    (c.other_apellido ?? "").toLowerCase().includes(q)
  );
}

function renderRequests() {
  const pending = conversations.filter((c) => c.status === "pending" && !c.is_initiator);
  requestsCountEl.hidden = pending.length === 0;
  requestsCountEl.textContent = String(pending.length);

  requestsListEl.innerHTML = pending.length
    ? pending
        .map(
          (c) => `
    <div class="chat-request-row" data-id="${c.conversation_id}">
      <button type="button" class="chat-request-open" data-id="${c.conversation_id}">
        <img src="${escapeHtml(avatarOf(c))}" class="chat-avatar" alt="">
        <span class="chat-request-body">
          <span class="chat-row-name">${escapeHtml(c.other_username ?? "")}${renderVerifiedBadge(c.other_user_type ?? "usuario", c.other_is_verified)}</span>
          <span class="chat-row-preview">${previewText(c)}</span>
        </span>
      </button>
      <span class="chat-request-actions">
        <button type="button" class="btn btn-primary btn-sm accept-btn" data-id="${c.conversation_id}">Aceptar</button>
        <button type="button" class="btn btn-outline btn-sm reject-btn" data-id="${c.conversation_id}">Rechazar</button>
      </span>
    </div>
  `
        )
        .join("")
    : `<p class="notif-empty">No tenés solicitudes de mensaje pendientes.</p>`;

  requestsListEl.querySelectorAll<HTMLButtonElement>(".chat-request-open").forEach((btn) => {
    btn.addEventListener("click", () => openThread(btn.dataset.id!));
  });
  requestsListEl.querySelectorAll<HTMLButtonElement>(".accept-btn").forEach((btn) => {
    btn.addEventListener("click", () => void handleRequestAction(btn.dataset.id!, "accept"));
  });
  requestsListEl.querySelectorAll<HTMLButtonElement>(".reject-btn").forEach((btn) => {
    btn.addEventListener("click", () => void handleRequestAction(btn.dataset.id!, "decline"));
  });
}

function renderList() {
  const main = conversations.filter((c) => (c.status === "accepted" || c.is_initiator) && matchesQuery(c));

  listEl.innerHTML =
    main
      .map((c) => {
        const seenBadge =
          c.unread_count > 0
            ? `<span class="notif-badge">${c.unread_count > 9 ? "9+" : c.unread_count}</span>`
            : c.last_message_sender_is_me && c.last_message_read
              ? `<span class="chat-seen">Visto</span>`
              : "";
        return `
      <button type="button" class="chat-row ${c.unread_count > 0 ? "unread" : ""}" data-id="${c.conversation_id}">
        <img src="${escapeHtml(avatarOf(c))}" class="chat-avatar" alt="">
        <span class="chat-row-body">
          <span class="chat-row-top">
            <span class="chat-row-name">${escapeHtml(c.other_username ?? "")}${renderVerifiedBadge(c.other_user_type ?? "usuario", c.other_is_verified)}</span>
            <span class="chat-row-time">${relativeTime(c.last_message_at)}</span>
          </span>
          <span class="chat-row-bottom">
            <span class="chat-row-preview">${previewText(c)}${c.status === "pending" ? " · Pendiente de aceptar" : ""}</span>
            ${seenBadge}
          </span>
        </span>
      </button>
    `;
      })
      .join("") ||
    `<p class="notif-empty">${searchQuery ? "No encontramos conversaciones con ese nombre." : "Todavía no tenés mensajes. Buscá a alguien arriba para escribirle."}</p>`;

  listEl.querySelectorAll<HTMLButtonElement>(".chat-row").forEach((btn) => {
    btn.addEventListener("click", () => openThread(btn.dataset.id!));
  });

  highlightActiveRow();
}

function highlightActiveRow(): void {
  listEl.querySelectorAll<HTMLButtonElement>(".chat-row").forEach((row) => {
    row.classList.toggle("active", row.dataset.id === activeConversationId);
  });
}

function openThread(conversationId: string): void {
  if (!isDesktopChatLayout()) {
    window.location.href = `chat.html?c=${conversationId}`;
    return;
  }

  activeConversationId = conversationId;
  threadPlaceholder.hidden = true;
  if (!threadFrame) {
    threadFrame = document.createElement("iframe");
    threadFrame.className = "chat-thread-frame";
    threadPane.appendChild(threadFrame);
  }
  threadFrame.src = `chat.html?c=${conversationId}&embed=1`;
  highlightActiveRow();
}

async function handleRequestAction(id: string, action: "accept" | "decline"): Promise<void> {
  if (action === "decline" && !confirm("¿Rechazar esta solicitud de mensaje?")) return;

  const row = requestsListEl.querySelector<HTMLElement>(`.chat-request-row[data-id="${id}"]`);
  row?.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.disabled = true));

  const { error } = action === "accept" ? await acceptMessageRequest(id) : await declineMessageRequest(id);
  if (error) {
    alert(error);
    row?.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.disabled = false));
    return;
  }

  if (action === "accept") {
    // En desktop ya no navegamos a otra pagina al abrir el hilo, asi que si no
    // actualizamos el estado local la solicitud aceptada queda mostrada como
    // pendiente en la pestaña "Solicitudes" mientras el chat se abre a la
    // derecha. La pasamos a la pestaña de mensajes para que quede coherente.
    const convo = conversations.find((c) => c.conversation_id === id);
    if (convo) convo.status = "accepted";
    renderRequests();
    renderList();
    tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "messages"));
    messagesPanel.hidden = false;
    requestsListEl.hidden = true;
    openThread(id);
    return;
  }

  conversations = conversations.filter((c) => c.conversation_id !== id);
  renderRequests();
  renderList();
}

let peopleRequestId = 0;
async function runPeopleSearch(query: string): Promise<void> {
  const myRequestId = ++peopleRequestId;
  if (query.length < 2) {
    peopleEl.hidden = true;
    peopleEl.innerHTML = "";
    return;
  }

  try {
    // El buscador de "nuevo mensaje" solo debe ofrecer gente con la que ya hay
    // relacion de seguimiento (en cualquier direccion), no cualquier perfil publico.
    const [followers, following] = await Promise.all([listFollowers(userId, query, 8), listFollowing(userId, query, 8)]);
    if (myRequestId !== peopleRequestId) return;

    const merged = new Map<string, FollowListRow>();
    for (const r of [...followers, ...following]) {
      if (r.id !== userId) merged.set(r.id, r);
    }
    const results = [...merged.values()].slice(0, 6);

    const existingIds = new Set(conversations.map((c) => c.other_user_id));
    peopleEl.hidden = results.length === 0;
    peopleEl.innerHTML = results.length
      ? `<p class="search-recent-header"><span>Personas</span></p>` +
        results
          .map(
            (r) => `
      <button type="button" class="search-result-item chat-person-row" data-id="${escapeHtml(r.id)}">
        <img src="${escapeHtml(r.avatarUrl || "/images/avatars/default.svg")}" alt="" class="search-result-avatar">
        <span class="search-result-body">
          <span class="search-result-name">${escapeHtml(r.username)}${renderVerifiedBadge(r.userType, r.isVerified)}</span>
          <span class="search-result-username">${escapeHtml(`${r.nombre} ${r.apellido}`.trim())}</span>
        </span>
        <span class="chat-person-cta">${existingIds.has(r.id) ? "Ver chat" : "Mensaje"}</span>
      </button>
    `
          )
          .join("")
      : "";

    peopleEl.querySelectorAll<HTMLButtonElement>(".chat-person-row").forEach((btn) => {
      btn.addEventListener("click", () => void startConversationWith(btn.dataset.id!));
    });
  } catch {
    // silencioso: la busqueda de personas simplemente no se actualiza en este ciclo
  }
}

async function startConversationWith(otherUserId: string): Promise<void> {
  const existing = conversations.find((c) => c.other_user_id === otherUserId);
  if (existing) {
    openThread(existing.conversation_id);
    return;
  }
  const { id, error } = await getOrCreateConversation(otherUserId);
  if (error || !id) {
    alert(error || "No se pudo iniciar la conversación.");
    return;
  }
  openThread(id);
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim();
  renderList();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void runPeopleSearch(searchQuery), 250);
});

tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((b) => b.classList.toggle("active", b === btn));
    messagesPanel.hidden = tab !== "messages";
    requestsListEl.hidden = tab !== "requests";
  });
});

const PREFETCH_CONVERSATIONS_COUNT = 30;
const PREFETCH_MESSAGES_PER_CHAT = MESSAGES_PAGE_SIZE;

/**
 * Al entrar a la lista, precarga en IndexedDB los primeros mensajes de los chats
 * mas recientes -- asi cuando se abren (ver chat.ts) se pintan al instante desde
 * ese cache en vez de esperar a la red. No bloquea el render de la lista.
 */
async function prefetchRecentThreads(): Promise<void> {
  const targets = conversations.filter((c) => c.status === "accepted" || c.is_initiator).slice(0, PREFETCH_CONVERSATIONS_COUNT);
  await Promise.all(
    targets.map(async (c) => {
      try {
        const page = await listMessages(c.conversation_id, undefined, PREFETCH_MESSAGES_PER_CHAT);
        await cacheMessages(c.conversation_id, page);
      } catch {
        // si falla el prefetch de un chat puntual no importa, chat.ts igual carga desde la red al abrirlo
      }
    })
  );
}

conversations = await listConversations();
renderRequests();
renderList();
void prefetchRecentThreads();
