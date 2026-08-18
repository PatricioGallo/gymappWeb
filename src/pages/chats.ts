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
  markConversationRead,
  type ConversationSummary,
} from "../services/chat.service";
import { cacheMessages } from "../lib/chatDb";
import { refreshChatBadge } from "../lib/chat";
import { supabase } from "../lib/supabaseClient";
import type { ViewModule } from "../shell/router";
import { navigate } from "../shell/router";
import { createViewContext, type ViewContext } from "../shell/viewContext";
import { mountThread } from "./chatThread";

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

// Fallback para el bug de Chrome en la app instalada de Android (WebAPK): ver misma nota
// que tenia chat.ts -- 100dvh a veces no descuenta la barra de navegacion del sistema.
function setAppViewportHeight(): void {
  document.documentElement.style.setProperty("--app-vh", `${window.innerHeight * 0.01}px`);
}

// El wrapper <section class="features"><div class="container chat-page-container"> vive aca
// adentro (no en pages/chats.html) a proposito: #view-root es un unico elemento de DOM que
// persiste entre navegaciones SPA, y sus propias clases estaticas quedan fijas para siempre
// segun cual pagina cargo primero de verdad -- si estuvieran en el HTML estatico, se le
// pegarian (o faltarian) al resto de las vistas que se muestran ahi adentro despues, segun el
// orden de carga real. Cada vista tiene que traer su propio layout, container incluido.
const VIEW_MARKUP = `
  <section class="features">
    <div class="container chat-page-container">
      <div class="routine-tabs" id="chatTabs">
        <button class="routine-tab active" data-tab="messages" type="button">Tus mensajes</button>
        <button class="routine-tab" data-tab="requests" type="button">Solicitudes<span class="notif-badge" id="chatRequestsCount" hidden>0</span></button>
      </div>

      <div id="chatMessagesPanel">
        <div class="chat-split">
          <div class="chat-list-pane">
            <div class="chat-list-toolbar">
              <div class="chat-list-search">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="search" id="chatSearchInput" placeholder="Buscar conversaciones o personas..." autocomplete="off">
              </div>
            </div>

            <div id="chatSearchPeople" hidden></div>

            <div class="chat-list" id="chatList"></div>
          </div>

          <div class="chat-thread-pane" id="chatThreadPane">
            <div class="chat-thread-placeholder" id="chatThreadPlaceholder">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              <p>Elegí una conversación para empezar a chatear</p>
            </div>
            <section class="chat-thread-page" id="chatThreadPage" hidden>
              <div class="container chat-thread-container" id="chatThreadContent"></div>
            </section>
          </div>
        </div>
      </div>

      <div class="chat-requests-list" id="chatRequestsList" hidden></div>
    </div>
  </section>
`;

// mount() la arma cada vez que se monta la vista; se referencia desde el objeto exportado
// (que el router necesita tener siempre definido, incluso antes del primer mount) para poder
// delegarle los cambios de ?c=ID sin desmontar toda la vista de chats.
let updateHandler: ((params: URLSearchParams) => void) | null = null;
// Reflejado por openThread/closeThread -- onShow lo usa para restaurar la clase de <body> que
// pone en pantalla completa el hilo en mobile, si justo eso era lo que se estaba viendo antes
// de que esta vista pasara a segundo plano (ver onHide, que siempre la saca al ocultarse).
let isThreadOpen = false;

export const chatsView: ViewModule = {
  async mount(container, params, ctx, authUserId) {
    const userId = authUserId!; // la ruta se registra con requiresAuth:true
    container.innerHTML = VIEW_MARKUP;

    setAppViewportHeight();
    window.addEventListener("resize", setAppViewportHeight, { signal: ctx.signal });
    window.addEventListener("orientationchange", setAppViewportHeight, { signal: ctx.signal });

    let conversations: ConversationSummary[] = [];
    let searchQuery = "";

    const listEl = container.querySelector("#chatList")!;
    const tabsWrap = container.querySelector("#chatTabs")!;
    const messagesPanel = container.querySelector("#chatMessagesPanel") as HTMLDivElement;
    const requestsCountEl = container.querySelector("#chatRequestsCount") as HTMLElement;
    const requestsListEl = container.querySelector("#chatRequestsList") as HTMLDivElement;
    const searchInput = container.querySelector("#chatSearchInput") as HTMLInputElement;
    const peopleEl = container.querySelector("#chatSearchPeople") as HTMLDivElement;
    const threadPlaceholder = container.querySelector("#chatThreadPlaceholder") as HTMLDivElement;
    const threadPage = container.querySelector("#chatThreadPage") as HTMLElement;
    const threadContentEl = container.querySelector("#chatThreadContent") as HTMLDivElement;

    let activeConversationId: string | null = null;
    // Una instancia de DOM por conversacion abierta en esta sesion -- nunca se destruye al
    // cambiar de conversacion o cerrar el hilo, solo se oculta. Reabrirla despues es
    // instantaneo (mismos <img>, mismo scroll, ningun re-render) en vez de volver a montar
    // todo de cero como con el iframe de antes.
    const threadInstances = new Map<string, { el: HTMLDivElement; ctx: ViewContext; scrollTop: number }>();
    ctx.addCleanup(() => {
      threadInstances.forEach((instance) => instance.ctx.dispose());
      threadInstances.clear();
    });

    function hideActiveInstance(): void {
      if (!activeConversationId) return;
      const instance = threadInstances.get(activeConversationId);
      if (!instance) return;
      const messagesEl = instance.el.querySelector<HTMLElement>(".chat-messages");
      instance.scrollTop = messagesEl?.scrollTop ?? 0;
      instance.el.hidden = true;
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

    function renderRequests(): void {
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
        btn.addEventListener("click", () => openThread(btn.dataset.id!, { pushHistory: true }));
      });
      requestsListEl.querySelectorAll<HTMLButtonElement>(".accept-btn").forEach((btn) => {
        btn.addEventListener("click", () => void handleRequestAction(btn.dataset.id!, "accept"));
      });
      requestsListEl.querySelectorAll<HTMLButtonElement>(".reject-btn").forEach((btn) => {
        btn.addEventListener("click", () => void handleRequestAction(btn.dataset.id!, "decline"));
      });
    }

    function renderList(): void {
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
        btn.addEventListener("click", () => openThread(btn.dataset.id!, { pushHistory: true }));
      });

      highlightActiveRow();
    }

    function highlightActiveRow(): void {
      listEl.querySelectorAll<HTMLButtonElement>(".chat-row").forEach((row) => {
        row.classList.toggle("active", row.dataset.id === activeConversationId);
      });
    }

    function openThread(conversationId: string, opts: { pushHistory: boolean }): void {
      if (conversationId === activeConversationId) return;

      hideActiveInstance();
      activeConversationId = conversationId;
      highlightActiveRow();
      threadPlaceholder.hidden = true;
      threadPage.hidden = false;
      isThreadOpen = true;
      document.body.classList.add("chats-thread-open");

      if (opts.pushHistory) navigate(`chats.html?c=${conversationId}`);
      else history.replaceState(null, "", `chats.html?c=${conversationId}`);

      const existing = threadInstances.get(conversationId);
      if (existing) {
        // Ya se habia abierto en esta sesion: el DOM entero (mensajes, imagenes, composer)
        // sigue intacto tal cual quedo, solo hay que mostrarlo y devolver el scroll. Mientras
        // estuvo oculto, chatThread.ts no marca como leidos los mensajes que llegan por
        // realtime (a proposito, ver isThreadOnScreen ahi) -- reabrirlo es el momento en que
        // realmente se estan viendo, asi que es responsabilidad de aca marcarlos leidos.
        existing.el.hidden = false;
        const messagesEl = existing.el.querySelector<HTMLElement>(".chat-messages");
        if (messagesEl) messagesEl.scrollTop = existing.scrollTop;
        void markConversationRead(conversationId).then(() => refreshChatBadge());
        return;
      }

      const el = document.createElement("div");
      el.className = "chat-thread-instance";
      threadContentEl.appendChild(el);
      const threadCtx: ViewContext = createViewContext();
      threadInstances.set(conversationId, { el, ctx: threadCtx, scrollTop: 0 });
      void mountThread(el, conversationId, userId, threadCtx, {
        onMissingConversation: () => {
          threadInstances.delete(conversationId);
          threadCtx.dispose();
          el.remove();
          closeThread({ updateUrl: true });
        },
        onBack: () => navigate("chats.html"),
      });
    }

    function closeThread(opts: { updateUrl: boolean }): void {
      hideActiveInstance();
      activeConversationId = null;
      highlightActiveRow();
      threadPlaceholder.hidden = false;
      threadPage.hidden = true;
      isThreadOpen = false;
      document.body.classList.remove("chats-thread-open");
      if (opts.updateUrl) navigate("chats.html", { replace: true });
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
        const convo = conversations.find((c) => c.conversation_id === id);
        if (convo) convo.status = "accepted";
        renderRequests();
        renderList();
        tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "messages"));
        messagesPanel.hidden = false;
        requestsListEl.hidden = true;
        openThread(id, { pushHistory: true });
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
        openThread(existing.conversation_id, { pushHistory: true });
        return;
      }
      const { id, error } = await getOrCreateConversation(otherUserId);
      if (error || !id) {
        alert(error || "No se pudo iniciar la conversación.");
        return;
      }
      openThread(id, { pushHistory: true });
    }

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    ctx.addCleanup(() => clearTimeout(debounceTimer));
    searchInput.addEventListener(
      "input",
      () => {
        searchQuery = searchInput.value.trim();
        renderList();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => void runPeopleSearch(searchQuery), 250);
      },
      { signal: ctx.signal }
    );

    tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((btn) => {
      btn.addEventListener(
        "click",
        () => {
          const tab = btn.dataset.tab;
          tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((b) => b.classList.toggle("active", b === btn));
          messagesPanel.hidden = tab !== "messages";
          requestsListEl.hidden = tab !== "requests";
        },
        { signal: ctx.signal }
      );
    });

    const PREFETCH_CONVERSATIONS_COUNT = 30;
    const PREFETCH_MESSAGES_PER_CHAT = MESSAGES_PAGE_SIZE;

    async function prefetchRecentThreads(): Promise<void> {
      const targets = conversations.filter((c) => c.status === "accepted" || c.is_initiator).slice(0, PREFETCH_CONVERSATIONS_COUNT);
      await Promise.all(
        targets.map(async (c) => {
          try {
            const page = await listMessages(c.conversation_id, undefined, PREFETCH_MESSAGES_PER_CHAT);
            await cacheMessages(c.conversation_id, page);
          } catch {
            // si falla el prefetch de un chat puntual no importa, mountThread igual carga desde la red al abrirlo
          }
        })
      );
    }

    conversations = await listConversations();
    renderRequests();
    renderList();
    void prefetchRecentThreads();

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    ctx.addCleanup(() => clearTimeout(refreshTimer));
    function scheduleConversationsRefresh(): void {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(async () => {
        conversations = await listConversations();
        renderRequests();
        renderList();
      }, 150);
    }

    const conversationsChannel = supabase
      .channel("chats-list-conversations")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, scheduleConversationsRefresh)
      .subscribe();
    ctx.addCleanup(() => void supabase.removeChannel(conversationsChannel));

    window.addEventListener(
      "pageshow",
      (e) => {
        if (e.persisted) scheduleConversationsRefresh();
      },
      { signal: ctx.signal }
    );

    const initialId = params.get("c");
    if (initialId) openThread(initialId, { pushHistory: false });

    updateHandler = (nextParams: URLSearchParams) => {
      const id = nextParams.get("c");
      if (id) openThread(id, { pushHistory: false });
      else closeThread({ updateUrl: false });
    };
    ctx.addCleanup(() => {
      updateHandler = null;
    });
  },
  update(params) {
    updateHandler?.(params);
  },
  onShow() {
    document.body.classList.add("chats-page");
    if (isThreadOpen) document.body.classList.add("chats-thread-open");
  },
  onHide() {
    document.body.classList.remove("chats-page", "chats-thread-open");
  },
};
