import { escapeHtml } from "./dom";
import { searchProfiles, type ProfileSearchResult } from "../services/search.service";

// Mismo breakpoint que .user-menu-toggle/.notif-dropdown en modern.css (860px).
const MOBILE_QUERY = "(max-width: 859px)";
const DEBOUNCE_MS = 250;
const INLINE_RESULTS_LIMIT = 6;

export const USER_TYPE_BADGE: Record<string, string> = {
  admin: "Admin",
  gimnasio: "Gimnasio",
  entrenador: "Entrenador",
  usuario: "Gymbro",
};

export function resultAvatar(r: ProfileSearchResult): string {
  return r.avatar_url || "/images/avatars/default.svg";
}

export function resultFullName(r: ProfileSearchResult): string {
  return `${r.nombre} ${r.apellido}`.trim();
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

  function renderResults(list: ProfileSearchResult[], query: string) {
    if (query.trim().length < 2) {
      results!.innerHTML = `<p class="notif-empty">Escribí al menos 2 letras para buscar.</p>`;
      viewAll!.hidden = true;
      return;
    }

    results!.innerHTML =
      list
        .map(
          (r) => `
        <a class="search-result-item" href="profile.html?u=${encodeURIComponent(r.username)}">
          <img src="${escapeHtml(resultAvatar(r))}" alt="" class="search-result-avatar">
          <span class="search-result-body">
            <span class="search-result-name">${escapeHtml(resultFullName(r))}</span>
            <span class="search-result-username">@${escapeHtml(r.username)} · ${escapeHtml(USER_TYPE_BADGE[r.user_type] ?? r.user_type)}</span>
          </span>
        </a>
      `
        )
        .join("") || `<p class="notif-empty">No encontramos resultados para "${escapeHtml(query)}".</p>`;

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
      window.location.href = "search.html";
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
