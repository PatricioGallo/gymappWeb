import type { ViewModule } from "../shell/router";
import { smartNavigate } from "../shell/router";
import { escapeHtml } from "../lib/dom";
import { searchProfiles, getSuggestedProfiles, type ProfileSearchResult, type SuggestedProfile } from "../services/search.service";
import { followUser } from "../services/follow.service";
import { resultAvatar, resultFullName } from "../lib/search";
import { renderVerifiedBadge } from "../lib/verifiedBadge";
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches, type RecentSearchEntry } from "../lib/recentSearches";

function resultBodyHtml(r: { username: string; nombre: string; apellido: string; user_type: ProfileSearchResult["user_type"]; is_verified: boolean; nacionalidad?: string | null }): string {
  const meta = r.nacionalidad ? `${escapeHtml(resultFullName(r))} · ${escapeHtml(r.nacionalidad)}` : escapeHtml(resultFullName(r));
  return `
    <span class="search-page-body">
      <p class="search-page-name">${escapeHtml(r.username)}${renderVerifiedBadge(r.user_type, r.is_verified)}</p>
      <p class="search-page-meta">${meta}</p>
    </span>
  `;
}

function suggestionRowHtml(s: SuggestedProfile): string {
  return `
    <div class="search-page-item search-suggestion-item" data-username="${encodeURIComponent(s.username)}">
      <img src="${escapeHtml(s.avatar_url || "/images/avatars/default.svg")}" alt="" class="search-page-avatar">
      ${resultBodyHtml(s)}
      <button type="button" class="btn btn-outline btn-sm follow-suggestion-btn" data-id="${escapeHtml(s.id)}">Seguir</button>
    </div>
  `;
}

function toRecentEntry(r: ProfileSearchResult): RecentSearchEntry {
  return { id: r.id, username: r.username, nombre: r.nombre, apellido: r.apellido, avatar_url: r.avatar_url, user_type: r.user_type, is_verified: r.is_verified };
}

const VIEW_MARKUP = `
  <section class="features">
    <div class="container">
      <span class="eyebrow eyebrow-standalone">Buscador</span>
      <form class="search-page-form" id="searchPageForm">
        <input type="search" id="searchPageInput" class="header-search-input" placeholder="Buscar usuarios, entrenadores o gimnasios..." autocomplete="off">
      </form>
      <p class="chart-sub" id="searchPageSummary"></p>
      <div class="search-page-list" id="searchPageList"></div>
      <div class="search-page-list" id="searchSuggestionsList" hidden></div>
    </div>
  </section>
`;

export const searchView: ViewModule = {
  async mount(container, params, ctx, authUserId) {
    const userId = authUserId!; // la ruta se registra con requiresAuth:true
    container.innerHTML = VIEW_MARKUP;
    const form = container.querySelector("#searchPageForm") as HTMLFormElement;
    const input = container.querySelector("#searchPageInput") as HTMLInputElement;
    const summaryEl = container.querySelector("#searchPageSummary")!;
    const listEl = container.querySelector("#searchPageList")!;
    const suggestionsEl = container.querySelector("#searchSuggestionsList") as HTMLDivElement;

    const DEBOUNCE_MS = 250;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    ctx.addCleanup(() => clearTimeout(debounceTimer));
    let requestId = 0;
    let suggestions: SuggestedProfile[] = [];

    function renderSuggestions(): void {
      if (suggestions.length === 0) {
        suggestionsEl.innerHTML = "";
        return;
      }

      suggestionsEl.innerHTML = `
        <div class="search-recent-header"><span>Sugerencias para seguir</span></div>
        ${suggestions.map((s) => suggestionRowHtml(s)).join("")}
      `;

      suggestionsEl.querySelectorAll<HTMLDivElement>(".search-suggestion-item").forEach((item) => {
        item.addEventListener("click", () => smartNavigate(`profile.html?u=${item.dataset.username}`));
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

    async function loadSuggestions(): Promise<void> {
      try {
        suggestions = await getSuggestedProfiles(6);
        renderSuggestions();
      } catch {
        // silencioso: si fallan las sugerencias, el resto de la busqueda sigue funcionando
      }
    }

    function renderRecents(): void {
      suggestionsEl.hidden = false;
      const recents = getRecentSearches();
      if (recents.length === 0) {
        summaryEl.textContent = "Escribí al menos 2 letras para buscar.";
        listEl.innerHTML = "";
        return;
      }

      summaryEl.textContent = "";
      listEl.innerHTML = `
        <div class="search-recent-header">
          <span>Recientes</span>
          <button type="button" class="search-recent-clear">Borrar todo</button>
        </div>
        ${recents
          .map(
            (r) => `
        <div class="search-page-item search-recent-item" data-username="${encodeURIComponent(r.username)}">
          <img src="${escapeHtml(resultAvatar(r))}" alt="" class="search-page-avatar">
          ${resultBodyHtml(r)}
          <button type="button" class="search-recent-remove" data-id="${escapeHtml(r.id)}" aria-label="Quitar de recientes" title="Quitar de recientes">×</button>
        </div>
      `
          )
          .join("")}
      `;

      listEl.querySelectorAll<HTMLDivElement>(".search-recent-item").forEach((item) => {
        item.addEventListener("click", () => smartNavigate(`profile.html?u=${item.dataset.username}`));
      });
      listEl.querySelectorAll<HTMLButtonElement>(".search-recent-remove").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          removeRecentSearch(btn.dataset.id!);
          renderRecents();
        });
      });
      listEl.querySelector(".search-recent-clear")?.addEventListener("click", () => {
        clearRecentSearches();
        renderRecents();
      });
    }

    function renderList(results: ProfileSearchResult[], query: string): void {
      if (query.trim().length < 2) {
        renderRecents();
        return;
      }

      suggestionsEl.hidden = true;
      summaryEl.textContent =
        results.length === 0 ? `Sin resultados para "${query.trim()}".` : `${results.length} resultado${results.length === 1 ? "" : "s"} para "${query.trim()}".`;

      listEl.innerHTML = results
        .map(
          (r) => `
        <a class="search-page-item" href="profile.html?u=${encodeURIComponent(r.username)}" data-id="${escapeHtml(r.id)}">
          <img src="${escapeHtml(resultAvatar(r))}" alt="" class="search-page-avatar">
          ${resultBodyHtml(r)}
        </a>
      `
        )
        .join("");

      listEl.querySelectorAll<HTMLAnchorElement>(".search-page-item").forEach((el) => {
        el.addEventListener("click", () => {
          const r = results.find((item) => item.id === el.dataset.id);
          if (r) addRecentSearch(toRecentEntry(r));
        });
      });
    }

    async function runSearch(query: string): Promise<void> {
      const myRequestId = ++requestId;
      const trimmed = query.trim();

      const url = new URL(window.location.href);
      if (trimmed) url.searchParams.set("q", trimmed);
      else url.searchParams.delete("q");
      window.history.replaceState({}, "", url);

      if (trimmed.length < 2) {
        renderList([], query);
        return;
      }

      try {
        const results = await searchProfiles(trimmed, 50);
        if (myRequestId !== requestId) return;
        renderList(results, query);
      } catch {
        if (myRequestId !== requestId) return;
        summaryEl.textContent = "No se pudo buscar. Probá de nuevo.";
        listEl.innerHTML = "";
      }
    }

    input.addEventListener(
      "input",
      () => {
        clearTimeout(debounceTimer);
        const query = input.value;
        debounceTimer = setTimeout(() => void runSearch(query), DEBOUNCE_MS);
      },
      { signal: ctx.signal }
    );

    form.addEventListener(
      "submit",
      (e) => {
        e.preventDefault();
        clearTimeout(debounceTimer);
        void runSearch(input.value);
      },
      { signal: ctx.signal }
    );

    const initialQuery = params.get("q") ?? "";
    input.value = initialQuery;
    void runSearch(initialQuery);
    void loadSuggestions();
  },
};
