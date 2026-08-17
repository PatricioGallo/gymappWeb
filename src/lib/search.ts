import { escapeHtml } from "./dom";
import { searchProfiles, type ProfileSearchResult } from "../services/search.service";
import { renderVerifiedBadge } from "./verifiedBadge";
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches, type RecentSearchEntry } from "./recentSearches";
import { smartNavigate } from "../shell/router";

// Mismo breakpoint que .user-menu-toggle/.notif-dropdown en modern.css (860px).
const MOBILE_QUERY = "(max-width: 859px)";
const DEBOUNCE_MS = 250;
const INLINE_RESULTS_LIMIT = 6;

export const USER_TYPE_BADGE: Record<string, string> = {
  admin: "Admin",
  colaborador: "Colaborador",
  gimnasio: "Gimnasio",
  entrenador: "Entrenador",
  usuario: "Gymbro",
};

export function resultAvatar(r: { avatar_url: string | null }): string {
  return r.avatar_url || "/images/avatars/default.svg";
}

export function resultFullName(r: { nombre: string; apellido: string }): string {
  return `${r.nombre} ${r.apellido}`.trim();
}

function resultBodyHtml(r: { username: string; nombre: string; apellido: string; user_type: ProfileSearchResult["user_type"]; is_verified: boolean }): string {
  return `
    <span class="search-result-body">
      <span class="search-result-name">${escapeHtml(r.username)}${renderVerifiedBadge(r.user_type, r.is_verified)}</span>
      <span class="search-result-username">${escapeHtml(resultFullName(r))}</span>
    </span>
  `;
}

function toRecentEntry(r: ProfileSearchResult): RecentSearchEntry {
  return {
    id: r.id,
    username: r.username,
    nombre: r.nombre,
    apellido: r.apellido,
    avatar_url: r.avatar_url,
    user_type: r.user_type,
    is_verified: r.is_verified,
  };
}

/** Buscador del header (lupa junto al brand). No-op en paginas sin el markup. */
export function setupHeaderSearch(): void {
  const btn = document.getElementById("headerSearchBtn");
  const panel = document.getElementById("headerSearchPanel");
  const input = document.getElementById("headerSearchInput") as HTMLInputElement | null;
  const results = document.getElementById("headerSearchResults");
  const viewAll = document.getElementById("headerSearchViewAll") as HTMLAnchorElement | null;
  if (!btn || !panel || !input || !results || !viewAll) return;

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let requestId = 0;

  function renderRecents() {
    const recents = getRecentSearches();
    if (recents.length === 0) {
      results!.innerHTML = `<p class="notif-empty">Escribí al menos 2 letras para buscar.</p>`;
      viewAll!.hidden = true;
      return;
    }

    results!.innerHTML = `
      <div class="search-recent-header">
        <span>Recientes</span>
        <button type="button" class="search-recent-clear">Borrar todo</button>
      </div>
      ${recents
        .map(
          (r) => `
        <div class="search-result-item search-recent-item" data-username="${encodeURIComponent(r.username)}">
          <img src="${escapeHtml(resultAvatar(r))}" alt="" class="search-result-avatar">
          ${resultBodyHtml(r)}
          <button type="button" class="search-recent-remove" data-id="${escapeHtml(r.id)}" aria-label="Quitar de recientes" title="Quitar de recientes">×</button>
        </div>
      `
        )
        .join("")}
    `;
    viewAll!.hidden = true;

    results!.querySelectorAll<HTMLDivElement>(".search-recent-item").forEach((item) => {
      item.addEventListener("click", () => {
        smartNavigate(`profile.html?u=${item.dataset.username}`);
      });
    });
    results!.querySelectorAll<HTMLButtonElement>(".search-recent-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeRecentSearch(btn.dataset.id!);
        renderRecents();
      });
    });
    results!.querySelector(".search-recent-clear")?.addEventListener("click", () => {
      clearRecentSearches();
      renderRecents();
    });
  }

  function renderResults(list: ProfileSearchResult[], query: string) {
    if (query.trim().length < 2) {
      renderRecents();
      return;
    }

    results!.innerHTML =
      list
        .map(
          (r) => `
        <a class="search-result-item" href="profile.html?u=${encodeURIComponent(r.username)}" data-id="${escapeHtml(r.id)}">
          <img src="${escapeHtml(resultAvatar(r))}" alt="" class="search-result-avatar">
          ${resultBodyHtml(r)}
        </a>
      `
        )
        .join("") || `<p class="notif-empty">No encontramos resultados para "${escapeHtml(query)}".</p>`;

    results!.querySelectorAll<HTMLAnchorElement>(".search-result-item").forEach((el) => {
      el.addEventListener("click", () => {
        const r = list.find((item) => item.id === el.dataset.id);
        if (r) addRecentSearch(toRecentEntry(r));
      });
    });

    viewAll!.href = `search.html?q=${encodeURIComponent(query)}`;
    viewAll!.hidden = false;
  }

  async function runSearch(query: string) {
    const myRequestId = ++requestId;
    try {
      const list = await searchProfiles(query, INLINE_RESULTS_LIMIT);
      if (myRequestId !== requestId) return; // una busqueda mas nueva ya esta en curso
      renderResults(list, query);
    } catch {
      if (myRequestId !== requestId) return;
      results!.innerHTML = `<p class="notif-empty">No se pudo buscar. Probá de nuevo.</p>`;
    }
  }

  function openPanel() {
    panel!.hidden = false;
    btn!.classList.add("open");
    btn!.setAttribute("aria-expanded", "true");
    input!.focus();
    renderResults([], input!.value);
  }

  function closePanel() {
    panel!.hidden = true;
    btn!.classList.remove("open");
    btn!.setAttribute("aria-expanded", "false");
  }

  btn.addEventListener("click", () => {
    // En mobile no entra comodo un panel flotante: mandamos directo a la pagina de busqueda.
    if (window.matchMedia(MOBILE_QUERY).matches) {
      smartNavigate("search.html");
      return;
    }
    if (panel.hidden) openPanel();
    else closePanel();
  });

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const query = input.value;
    debounceTimer = setTimeout(() => void runSearch(query), DEBOUNCE_MS);
  });

  document.addEventListener("click", (e) => {
    if (panel.hidden) return;
    const target = e.target as Node;
    if (panel.contains(target) || btn.contains(target)) return;
    closePanel();
  });
}
