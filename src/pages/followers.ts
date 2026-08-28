import type { ViewModule } from "../shell/router";
import { escapeHtml } from "../lib/dom";
import { getProfile, getProfileByUsername, getProfileBasicByUsername, type Profile, type ProfileBasic } from "../services/profile.service";
import { getFollowStatus, listFollowers, listFollowing, type FollowListRow, type FollowStatus } from "../services/follow.service";
import { listSubscribers, removeSubscriber, type SubscriberListRow } from "../services/subscription.service";
import { USER_TYPE_BADGE } from "../lib/search";
import { renderVerifiedBadge } from "../lib/verifiedBadge";

type Tab = "followers" | "following" | "subscribers";
type ListRow = FollowListRow | SubscriberListRow;

const VIEW_MARKUP = `
  <section class="page-hero">
    <div class="container">
      <a href="profile.html" class="back-link" id="backLink"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Volver al perfil</a>
      <span class="eyebrow">Comunidad</span>
      <h1 id="followListTitle">Seguidores</h1>
      <p id="followListSubtitle"></p>
    </div>
  </section>

  <section class="features">
    <div class="container" id="followListBody">
      <div class="routine-tabs" id="followListTabs">
        <button class="routine-tab active" data-tab="followers" type="button">Seguidores</button>
        <button class="routine-tab" data-tab="following" type="button">Seguidos</button>
        <button class="routine-tab" data-tab="subscribers" type="button" id="subscribersTabBtn" hidden>Suscriptores</button>
      </div>
      <form class="search-page-form" id="followListSearchForm">
        <input type="search" id="followListSearchInput" class="header-search-input" placeholder="Buscar por nombre o usuario...">
      </form>
      <p class="chart-sub" id="followListSummary">Cargando...</p>
      <div class="search-page-list" id="followListResults"></div>
    </div>
  </section>
`;

// mount() define render() (arma el DOM entero desde cero cada vez -- reusar la instancia con
// otro ?u=/?tab= no tiene estado fino que preservar, a diferencia de un chat) y la deja
// referenciada aca para que update() la reuse sin desmontar toda la vista.
let updateHandler: ((params: URLSearchParams) => void) | null = null;

export const followersView: ViewModule = {
  async mount(container, params, ctx, authUserId) {
    const myId = authUserId!; // la ruta se registra con requiresAuth:true

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let requestId = 0;
    ctx.addCleanup(() => clearTimeout(debounceTimer));

    async function render(p: URLSearchParams): Promise<void> {
      container.innerHTML = VIEW_MARKUP;
      clearTimeout(debounceTimer);

      const usernameParam = p.get("u");
      const tabParam = p.get("tab");
      let activeTab: Tab = tabParam === "following" ? "following" : tabParam === "subscribers" ? "subscribers" : "followers";

      const titleEl = container.querySelector("#followListTitle")!;
      const subtitleEl = container.querySelector("#followListSubtitle")!;
      const bodyEl = container.querySelector("#followListBody")!;
      const tabsWrap = container.querySelector("#followListTabs")!;
      const searchForm = container.querySelector("#followListSearchForm") as HTMLFormElement;
      const searchInput = container.querySelector("#followListSearchInput") as HTMLInputElement;
      const summaryEl = container.querySelector("#followListSummary")!;
      const listEl = container.querySelector("#followListResults")!;

      let profile: Profile | null;
      let basicProfile: ProfileBasic | null = null;

      if (usernameParam) {
        profile = await getProfileByUsername(usernameParam);
        if (!profile) basicProfile = await getProfileBasicByUsername(usernameParam);
      } else {
        profile = await getProfile(myId);
      }

      const target = profile ?? basicProfile;
      if (!target) {
        titleEl.textContent = "Este perfil no existe";
        subtitleEl.remove();
        bodyEl.remove();
        container.querySelector("#backLink")?.remove();
        return;
      }

      const targetId = target.id!;
      const isOwner = targetId === myId;
      const nombre = target.nombre ?? "Este usuario";
      (container.querySelector("#backLink") as HTMLAnchorElement).href = `profile.html?u=${encodeURIComponent(target.username ?? "")}`;

      // Suscriptores solo aplica a perfiles de entrenador (gimnasio tendra su propio sistema despues).
      const isTrainer = target.user_type === "entrenador";
      const subscribersTabBtn = container.querySelector("#subscribersTabBtn") as HTMLButtonElement | null;
      if (isTrainer) {
        subscribersTabBtn?.removeAttribute("hidden");
      } else if (activeTab === "subscribers") {
        activeTab = "followers";
      }

      const followStatus: FollowStatus = isOwner ? "self" : await getFollowStatus(targetId).catch(() => "none" as FollowStatus);
      // Misma regla que profile.ts: dueño, admin/entrenador (profile completo via RLS),
      // perfil publico, o seguidor aceptado pueden ver la lista. El resto, no.
      const isPrivateForViewer = !isOwner && !profile && !basicProfile?.is_public && followStatus !== "accepted";

      if (isPrivateForViewer) {
        titleEl.textContent = "Este perfil es privado";
        subtitleEl.textContent = "";
        bodyEl.innerHTML = `
          <div class="empty-state reveal">
            <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
            <h3>No podés ver esta información</h3>
            <p>${escapeHtml(nombre)} decidió que solo sus seguidores puedan ver quién lo sigue y a quién sigue.</p>
          </div>
        `;
        return;
      }

      function updateHeaderTexts(): void {
        if (activeTab === "followers") {
          titleEl.textContent = isOwner ? "Tus seguidores" : `Seguidores de ${nombre}`;
          subtitleEl.textContent = isOwner ? "Personas que te siguen." : `Personas que siguen a ${nombre}.`;
        } else if (activeTab === "following") {
          titleEl.textContent = isOwner ? "Tus seguidos" : `Seguidos de ${nombre}`;
          subtitleEl.textContent = isOwner ? "Personas que seguís." : `Personas que sigue ${nombre}.`;
        } else {
          titleEl.textContent = isOwner ? "Tus suscriptores" : `Suscriptores de ${nombre}`;
          subtitleEl.textContent = isOwner ? "Personas suscriptas a tu perfil." : `Personas suscriptas al perfil de ${nombre}.`;
        }
      }

      function emptyMessage(query: string): string {
        if (query) return `Sin resultados para "${query}".`;
        if (activeTab === "followers") return isOwner ? "Todavía no tenés seguidores." : `${nombre} todavía no tiene seguidores.`;
        if (activeTab === "following") return isOwner ? "Todavía no seguís a nadie." : `${nombre} todavía no sigue a nadie.`;
        return isOwner ? "Todavía no tenés suscriptores." : `${nombre} todavía no tiene suscriptores.`;
      }

      function countLabel(n: number): string {
        const nouns: Record<Tab, [string, string]> = {
          followers: ["seguidor", "seguidores"],
          following: ["seguido", "seguidos"],
          subscribers: ["suscriptor", "suscriptores"],
        };
        const [singular, plural] = nouns[activeTab];
        return `${n} ${n === 1 ? singular : plural}.`;
      }

      function renderList(rows: ListRow[], query: string): void {
        summaryEl.textContent = rows.length === 0 ? emptyMessage(query) : countLabel(rows.length);

        // Se recalcula en cada render (no como const arriba): activeTab cambia al
        // clickear las pestañas, despues de que esta funcion ya fue definida.
        const canRemoveSubscribers = isOwner && activeTab === "subscribers";
        if (!canRemoveSubscribers) {
          listEl.innerHTML = rows
            .map(
              (r) => `
            <a class="search-page-item" href="profile.html?u=${encodeURIComponent(r.username)}">
              <img src="${escapeHtml(r.avatarUrl || "/images/avatars/default.svg")}" alt="" class="search-page-avatar">
              <span class="search-page-body">
                <p class="search-page-name">${escapeHtml(`${r.nombre} ${r.apellido}`.trim())}${renderVerifiedBadge(r.userType, r.isVerified)}</p>
                <p class="search-page-meta">@${escapeHtml(r.username)}</p>
              </span>
              <span class="search-page-badge">${escapeHtml(USER_TYPE_BADGE[r.userType] ?? r.userType)}</span>
            </a>
          `
            )
            .join("");
          return;
        }

        // El entrenador puede cancelar la suscripcion de cualquiera de sus
        // suscriptores en cualquier momento: la fila deja de ser un unico <a>
        // (misma estructura que .follow-request-item, que ya separa el link del
        // usuario de los botones de accion).
        listEl.innerHTML = rows
          .map(
            (r) => `
          <div class="follow-request-item" data-id="${r.id}">
            <a class="follow-request-user" href="profile.html?u=${encodeURIComponent(r.username)}">
              <img src="${escapeHtml(r.avatarUrl || "/images/avatars/default.svg")}" alt="" class="search-result-avatar">
              <span class="search-result-body">
                <span class="search-result-name">${escapeHtml(`${r.nombre} ${r.apellido}`.trim())}${renderVerifiedBadge(r.userType, r.isVerified)}</span>
                <span class="search-result-username">@${escapeHtml(r.username)}</span>
              </span>
            </a>
            <div class="follow-request-actions">
              <button class="btn btn-outline btn-sm remove-subscriber-btn" data-id="${r.id}" type="button">Cancelar suscripción</button>
            </div>
          </div>
        `
          )
          .join("");

        listEl.querySelectorAll<HTMLButtonElement>(".remove-subscriber-btn").forEach((btn) => {
          btn.addEventListener("click", () => void handleRemoveSubscriber(btn.dataset.id!), { signal: ctx.signal });
        });
      }

      async function handleRemoveSubscriber(subscriberId: string): Promise<void> {
        const row = listEl.querySelector<HTMLElement>(`.follow-request-item[data-id="${subscriberId}"]`);
        row?.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.disabled = true));

        const { error } = await removeSubscriber(targetId, subscriberId);
        if (error) {
          alert(error);
          row?.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.disabled = false));
          return;
        }
        void runList();
      }

      async function runList(): Promise<void> {
        const myRequestId = ++requestId;
        const query = searchInput.value.trim();
        try {
          const rows: ListRow[] =
            activeTab === "followers" ? await listFollowers(targetId, query) : activeTab === "following" ? await listFollowing(targetId, query) : await listSubscribers(targetId, query);
          if (myRequestId !== requestId) return;
          renderList(rows, query);
        } catch {
          if (myRequestId !== requestId) return;
          summaryEl.textContent = "No se pudo cargar la lista. Probá de nuevo.";
          listEl.innerHTML = "";
        }
      }

      tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((btn) => {
        btn.addEventListener(
          "click",
          () => {
            if (btn.dataset.tab === activeTab) return;
            activeTab = btn.dataset.tab as Tab;
            tabsWrap.querySelectorAll(".routine-tab").forEach((b) => b.classList.toggle("active", b === btn));
            updateHeaderTexts();
            const url = new URL(window.location.href);
            url.searchParams.set("tab", activeTab);
            window.history.replaceState({}, "", url);
            void runList();
          },
          { signal: ctx.signal }
        );
      });

      searchInput.addEventListener(
        "input",
        () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => void runList(), 250);
        },
        { signal: ctx.signal }
      );

      searchForm.addEventListener(
        "submit",
        (e) => {
          e.preventDefault();
          clearTimeout(debounceTimer);
          void runList();
        },
        { signal: ctx.signal }
      );

      tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === activeTab));
      updateHeaderTexts();
      void runList();
    }

    await render(params);

    updateHandler = (nextParams) => void render(nextParams);
    ctx.addCleanup(() => {
      updateHandler = null;
    });
  },
  update(params) {
    updateHandler?.(params);
  },
};
