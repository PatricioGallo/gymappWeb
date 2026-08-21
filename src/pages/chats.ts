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
  createGroupConversation,
  uploadGroupAvatar,
  setGroupAvatar,
  type ConversationSummary,
} from "../services/chat.service";
import { cacheMessages } from "../lib/chatDb";
import { refreshChatBadge } from "../lib/chat";
import { supabase } from "../lib/supabaseClient";
import type { ViewModule } from "../shell/router";
import { navigate } from "../shell/router";
import { createViewContext, type ViewContext } from "../shell/viewContext";
import { mountThread, type ThreadController } from "./chatThread";

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

const GROUP_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

function avatarHtml(c: ConversationSummary): string {
  if (c.kind === "group") {
    return c.group_avatar_url
      ? `<img src="${escapeHtml(c.group_avatar_url)}" class="chat-avatar" alt="">`
      : `<span class="chat-avatar chat-avatar-group">${GROUP_ICON_SVG}</span>`;
  }
  return `<img src="${escapeHtml(c.other_avatar_url || "/images/avatars/default.svg")}" class="chat-avatar" alt="">`;
}

function titleHtml(c: ConversationSummary): string {
  if (c.kind === "group") return escapeHtml(c.group_name ?? "Grupo");
  return `${escapeHtml(c.other_username ?? "")}${renderVerifiedBadge(c.other_user_type ?? "usuario", c.other_is_verified)}`;
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
            <div class="pull-refresh-indicator" id="chatPullRefreshIndicator" aria-hidden="true"><div class="modern-spinner"></div></div>
            <div class="chat-list-toolbar">
              <div class="chat-list-search">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="search" id="chatSearchInput" placeholder="Buscar conversaciones o personas..." autocomplete="off">
              </div>
              <button type="button" class="btn btn-outline btn-sm" id="chatNewGroupBtn">+ Grupo</button>
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
    const chatListPane = container.querySelector(".chat-list-pane") as HTMLDivElement;
    const pullIndicator = container.querySelector("#chatPullRefreshIndicator") as HTMLDivElement;
    const tabsWrap = container.querySelector("#chatTabs")!;
    const messagesPanel = container.querySelector("#chatMessagesPanel") as HTMLDivElement;
    const requestsCountEl = container.querySelector("#chatRequestsCount") as HTMLElement;
    const requestsListEl = container.querySelector("#chatRequestsList") as HTMLDivElement;
    const searchInput = container.querySelector("#chatSearchInput") as HTMLInputElement;
    const newGroupBtn = container.querySelector("#chatNewGroupBtn") as HTMLButtonElement;
    const peopleEl = container.querySelector("#chatSearchPeople") as HTMLDivElement;
    const threadPlaceholder = container.querySelector("#chatThreadPlaceholder") as HTMLDivElement;
    const threadPage = container.querySelector("#chatThreadPage") as HTMLElement;
    const threadContentEl = container.querySelector("#chatThreadContent") as HTMLDivElement;

    let activeConversationId: string | null = null;
    // Una instancia de DOM por conversacion abierta en esta sesion -- nunca se destruye al
    // cambiar de conversacion o cerrar el hilo, solo se oculta. Reabrirla despues es
    // instantaneo (mismos <img>, mismo scroll, ningun re-render) en vez de volver a montar
    // todo de cero como con el iframe de antes.
    // controller: undefined mientras mountThread todavia esta resolviendo (ver mas abajo) --
    // openThread no llama catchUp() en esa ventana porque ese primer mount ya trae todo fresco.
    const threadInstances = new Map<string, { el: HTMLDivElement; ctx: ViewContext; scrollTop: number; controller?: ThreadController }>();
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
      if (c.kind === "group") return (c.group_name ?? "").toLowerCase().includes(q);
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
            ${avatarHtml(c)}
            <span class="chat-request-body">
              <span class="chat-row-name">${titleHtml(c)}</span>
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
                : c.kind === "direct" && c.last_message_sender_is_me && c.last_message_read
                  ? `<span class="chat-seen">Visto</span>`
                  : "";
            return `
          <button type="button" class="chat-row ${c.unread_count > 0 ? "unread" : ""}" data-id="${c.conversation_id}">
            ${avatarHtml(c)}
            <span class="chat-row-body">
              <span class="chat-row-top">
                <span class="chat-row-name">${titleHtml(c)}</span>
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

    // mark_conversation_read solo toca conversation_participants.last_read_at (o messages.read_at
    // en directo), nunca la tabla conversations -- así que la suscripción realtime de más abajo
    // (que solo escucha conversations) no se entera cuando yo leo algo. Sin esto, el contador/
    // resaltado de "no leído" de una fila quedaba pegado hasta el próximo mensaje nuevo en
    // CUALQUIER chat (lo único que sí dispara esa suscripción).
    function markLocalRead(conversationId: string): void {
      const convo = conversations.find((c) => c.conversation_id === conversationId);
      if (convo && convo.unread_count > 0) {
        convo.unread_count = 0;
        renderList();
      }
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
        void markConversationRead(conversationId).then(() => {
          refreshChatBadge();
          markLocalRead(conversationId);
        });
        // Mientras estuvo oculto, la unica fuente de mensajes nuevos era el canal realtime del
        // propio hilo, que en mobile puede perder eventos si el navegador suspende el websocket
        // en segundo plano -- sin esto, un chat ya visitado se quedaba pegado atras del resumen
        // que la lista de la izquierda ya mostraba actualizado (via su propio refresh completo).
        void existing.controller?.catchUp();
        return;
      }

      const el = document.createElement("div");
      el.className = "chat-thread-instance";
      threadContentEl.appendChild(el);
      const threadCtx: ViewContext = createViewContext();
      threadInstances.set(conversationId, { el, ctx: threadCtx, scrollTop: 0 });
      void mountThread(el, conversationId, userId, threadCtx, {
        // Ya la tenemos en memoria (es la misma lista que pinta la izquierda) -- se la pasamos
        // para que mountThread no vuelva a pedirla de cero (ver initialConversation ahi).
        initialConversation: conversations.find((c) => c.conversation_id === conversationId),
        onMissingConversation: () => {
          threadInstances.delete(conversationId);
          threadCtx.dispose();
          el.remove();
          closeThread({ updateUrl: true });
          // Salir de un grupo (o cualquier otro motivo por el que la conversación deja de ser
          // accesible) solo toca conversation_participants, no conversations -- la suscripción
          // realtime de la lista escucha esa segunda tabla, así que no se entera sola. Sin este
          // refresh manual la fila vieja se quedaba pegada en la lista.
          void (async () => {
            conversations = await listConversations();
            renderRequests();
            renderList();
          })();
        },
        onBack: () => navigate("chats.html"),
        onRead: () => markLocalRead(conversationId),
      })
        .then((controller) => {
          const instance = threadInstances.get(conversationId);
          if (instance) instance.controller = controller;
        })
        .catch((err) => {
          // Si mountThread explota a mitad de camino (ej. un hiccup de red en list_conversations)
          // el header se queda pegado en "Cargando..." para siempre si nadie atrapa el rechazo --
          // mejor cerrar el hilo y avisar que abrirlo de nuevo.
          console.error("No se pudo abrir la conversación", err);
          threadInstances.delete(conversationId);
          threadCtx.dispose();
          el.remove();
          closeThread({ updateUrl: true });
          alert("No se pudo abrir la conversación. Probá de nuevo.");
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

    // Modal de 2 pasos (elegir integrantes -> nombre/foto) para crear un grupo, reusando el
    // mismo overlay #loaderBody + .modal-card/.post-share-list que openForwardModal en
    // chatThread.ts, y las mismas listFollowers/listFollowing que ya usa runPeopleSearch.
    function openNewGroupModal(): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;

      const selected = new Map<string, FollowListRow>();
      let pendingAvatarFile: File | null = null;

      function close(): void {
        loaderBody!.innerHTML = "";
      }

      function renderPickStep(): void {
        loaderBody!.innerHTML = `
          <div class="success-check-container">
            <div class="modal-card">
              <h2>Nuevo grupo</h2>
              <p class="subtitle">Elegí al menos 2 personas para armar el grupo.</p>
              <div class="field">
                <input type="text" id="chatGroupPickSearch" placeholder="Buscar entre tus seguidores...">
              </div>
              <div class="post-share-list" id="chatGroupPickList"><p class="exc-pick-empty">Cargando...</p></div>
              <div class="alert_message" id="chatGroupPickAlert"></div>
              <div class="modal-actions">
                <button class="btn btn-outline" id="chatGroupPickCancel" type="button">Cancelar</button>
                <button class="btn btn-primary" id="chatGroupPickNext" type="button" disabled>Siguiente (<span id="chatGroupPickCount">0</span>)</button>
              </div>
            </div>
          </div>
        `;
        document.getElementById("chatGroupPickCancel")?.addEventListener("click", close);
        document.getElementById("chatGroupPickNext")?.addEventListener("click", () => renderDetailsStep());

        const listEl = document.getElementById("chatGroupPickList")!;
        const searchInput2 = document.getElementById("chatGroupPickSearch") as HTMLInputElement;
        const nextBtn = document.getElementById("chatGroupPickNext") as HTMLButtonElement;
        const countEl = document.getElementById("chatGroupPickCount")!;

        function updateCount(): void {
          countEl.textContent = String(selected.size);
          nextBtn.disabled = selected.size < 2;
        }
        updateCount();

        function renderRows(rows: FollowListRow[]): void {
          listEl.innerHTML = rows.length
            ? rows
                .map(
                  (r) => `
          <button type="button" class="post-share-row chat-group-pick-row${selected.has(r.id) ? " selected" : ""}" data-id="${escapeHtml(r.id)}">
            <img src="${escapeHtml(r.avatarUrl || "/images/avatars/default.svg")}" class="chat-avatar" alt="">
            <span class="post-share-name">${escapeHtml(r.username)}${renderVerifiedBadge(r.userType, r.isVerified)}</span>
            <input type="checkbox" ${selected.has(r.id) ? "checked" : ""} tabindex="-1">
          </button>
        `
                )
                .join("")
            : `<p class="exc-pick-empty">No se encontraron seguidores.</p>`;

          listEl.querySelectorAll<HTMLButtonElement>(".chat-group-pick-row").forEach((btn) => {
            btn.addEventListener("click", () => {
              const id = btn.dataset.id!;
              const row = rows.find((r) => r.id === id);
              if (!row) return;
              const checkbox = btn.querySelector("input[type=checkbox]") as HTMLInputElement;
              if (selected.has(id)) {
                selected.delete(id);
                checkbox.checked = false;
              } else {
                selected.set(id, row);
                checkbox.checked = true;
              }
              btn.classList.toggle("selected", selected.has(id));
              updateCount();
            });
          });
        }

        async function runSearch(search: string): Promise<void> {
          try {
            const [followers, following] = await Promise.all([listFollowers(userId, search, 30), listFollowing(userId, search, 30)]);
            const merged = new Map<string, FollowListRow>();
            for (const r of [...followers, ...following]) {
              if (r.id !== userId) merged.set(r.id, r);
            }
            renderRows([...merged.values()]);
          } catch {
            listEl.innerHTML = `<p class="exc-pick-empty">No se pudo cargar tus seguidores.</p>`;
          }
        }

        let pickDebounce: ReturnType<typeof setTimeout> | undefined;
        searchInput2.addEventListener("input", () => {
          clearTimeout(pickDebounce);
          pickDebounce = setTimeout(() => void runSearch(searchInput2.value.trim()), 250);
        });

        void runSearch("");
      }

      function renderDetailsStep(): void {
        loaderBody!.innerHTML = `
          <div class="success-check-container">
            <div class="modal-card">
              <h2>Nuevo grupo</h2>
              <p class="subtitle">${selected.size} integrantes elegidos.</p>
              <div class="avatar-wrap avatar-wrap-sm">
                <img src="/images/avatars/default.svg" alt="" id="chatGroupAvatarPreview">
                <label class="avatar-edit" title="Elegir foto del grupo">
                  <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="4"/></svg>
                  <input type="file" id="chatGroupAvatarInput" accept="image/jpeg,image/png,image/webp">
                </label>
              </div>
              <div class="field">
                <input type="text" id="chatGroupName" placeholder="Nombre del grupo" maxlength="80">
              </div>
              <div class="alert_message" id="chatGroupDetailsAlert"></div>
              <div class="modal-actions">
                <button class="btn btn-outline" id="chatGroupBack" type="button">Atrás</button>
                <button class="btn btn-primary" id="chatGroupCreate" type="button">Crear grupo</button>
              </div>
            </div>
          </div>
        `;
        document.getElementById("chatGroupBack")?.addEventListener("click", () => renderPickStep());

        const nameInput = document.getElementById("chatGroupName") as HTMLInputElement;
        const avatarPreview = document.getElementById("chatGroupAvatarPreview") as HTMLImageElement;
        const avatarInput = document.getElementById("chatGroupAvatarInput") as HTMLInputElement;
        avatarInput.addEventListener("change", () => {
          const file = avatarInput.files?.[0] ?? null;
          pendingAvatarFile = file;
          if (file) avatarPreview.src = URL.createObjectURL(file);
        });

        document.getElementById("chatGroupCreate")?.addEventListener("click", async () => {
          const name = nameInput.value.trim();
          const alertBox = document.getElementById("chatGroupDetailsAlert")!;
          alertBox.innerHTML = "";
          if (!name) {
            alertBox.innerHTML = `<p>Ponele un nombre al grupo.</p>`;
            return;
          }
          const createBtn = document.getElementById("chatGroupCreate") as HTMLButtonElement;
          createBtn.disabled = true;
          createBtn.textContent = "Creando...";

          try {
            const { id, error } = await createGroupConversation(name, [...selected.keys()]);
            if (error || !id) {
              alertBox.innerHTML = `<p>${escapeHtml(error || "No se pudo crear el grupo.")}</p>`;
              return;
            }

            let avatarWarning: string | null = null;
            if (pendingAvatarFile) {
              // La foto es secundaria -- si falla no bloqueamos la creación del grupo (ya quedó
              // creado y usable); se puede reintentar después desde "Info del grupo". Pero el
              // error hay que avisarlo igual, antes solo quedaba en la consola y no se enteraba
              // nadie de por qué "no aparecía" la foto.
              const { url, error: avatarError } = await uploadGroupAvatar(id, pendingAvatarFile);
              if (url) {
                const setResult = await setGroupAvatar(id, url);
                if (setResult.error) avatarWarning = setResult.error;
              } else {
                avatarWarning = avatarError ?? "No se pudo subir la foto.";
              }
            }

            close();
            conversations = await listConversations();
            renderRequests();
            renderList();
            openThread(id, { pushHistory: true });
            if (avatarWarning) alert(`El grupo se creó, pero no se pudo guardar la foto: ${avatarWarning}`);
          } catch {
            alertBox.innerHTML = `<p>No se pudo crear el grupo. Probá de nuevo.</p>`;
          } finally {
            createBtn.disabled = false;
            createBtn.textContent = "Crear grupo";
          }
        });
      }

      renderPickStep();
    }

    newGroupBtn?.addEventListener("click", () => openNewGroupModal(), { signal: ctx.signal });

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

    // ---------------------------------------------------------------------------
    // Pull-to-refresh (gesto táctil): arrastrar hacia abajo estando ya arriba del todo de la
    // lista pide las conversaciones de nuevo. A diferencia del feed, .chat-list-pane scrollea
    // siempre ella misma (mobile y desktop, ver esa clase en modern.css) -- no hace falta
    // distinguir "scrollea la ventana" vs "scrollea el panel" segun el ancho.
    // ---------------------------------------------------------------------------

    const PULL_THRESHOLD = 70;
    const PULL_MAX = 110;
    const PULL_LOADING_HEIGHT = 56;

    let pullDragging = false;
    let pullActive = false; // true una vez que se movio hacia abajo lo suficiente como para contar como "pull" y no un scroll comun
    let pullStartY = 0;
    let isRefreshingList = false;

    function isListAtTop(): boolean {
      return chatListPane.scrollTop <= 0;
    }

    function setPullHeight(px: number, animated: boolean): void {
      pullIndicator.classList.toggle("pull-refresh-animate", animated);
      pullIndicator.style.height = `${px}px`;
    }

    async function refreshConversationsList(): Promise<void> {
      isRefreshingList = true;
      setPullHeight(PULL_LOADING_HEIGHT, true);
      try {
        conversations = await listConversations();
        renderRequests();
        renderList();
      } catch {
        // silencioso: un pull-to-refresh fallido no tiene mucho mas que mostrar que "no paso nada"
      } finally {
        setPullHeight(0, true);
        isRefreshingList = false;
      }
    }

    chatListPane.addEventListener(
      "touchstart",
      (e) => {
        if (isRefreshingList || !isListAtTop()) return;
        pullDragging = true;
        pullActive = false;
        pullStartY = e.touches[0].clientY;
      },
      { passive: true, signal: ctx.signal }
    );

    chatListPane.addEventListener(
      "touchmove",
      (e) => {
        if (!pullDragging) return;
        const deltaY = e.touches[0].clientY - pullStartY;
        if (deltaY <= 0 || !isListAtTop()) {
          pullDragging = false;
          if (pullActive) setPullHeight(0, true);
          pullActive = false;
          return;
        }
        pullActive = true;
        e.preventDefault(); // corta el rebote/pull-to-refresh nativo mientras dura el gesto propio
        setPullHeight(Math.min(deltaY * 0.5, PULL_MAX), false);
      },
      { passive: false, signal: ctx.signal }
    );

    function onPullEnd(): void {
      if (!pullDragging) return;
      pullDragging = false;
      if (!pullActive) return;
      pullActive = false;
      const reached = pullIndicator.getBoundingClientRect().height >= PULL_THRESHOLD;
      if (reached) void refreshConversationsList();
      else setPullHeight(0, true);
    }
    chatListPane.addEventListener("touchend", onPullEnd, { signal: ctx.signal });
    chatListPane.addEventListener("touchcancel", onPullEnd, { signal: ctx.signal });

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
