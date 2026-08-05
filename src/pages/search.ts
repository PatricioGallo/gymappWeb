import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { searchProfiles, type ProfileSearchResult } from "../services/search.service";
import { resultAvatar, resultFullName } from "../lib/search";
import { renderVerifiedBadge } from "../lib/verifiedBadge";
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches, type RecentSearchEntry } from "../lib/recentSearches";

setupNavToggle();
setupRevealObserver();
await requireAuth();

const form = document.getElementById("searchPageForm") as HTMLFormElement;
const input = document.getElementById("searchPageInput") as HTMLInputElement;
const summaryEl = document.getElementById("searchPageSummary")!;
const listEl = document.getElementById("searchPageList")!;

const DEBOUNCE_MS = 250;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let requestId = 0;

function resultBodyHtml(r: { username: string; nombre: string; apellido: string; user_type: ProfileSearchResult["user_type"]; is_verified: boolean; nacionalidad?: string | null }): string {
  const meta = r.nacionalidad ? `${escapeHtml(resultFullName(r))} · ${escapeHtml(r.nacionalidad)}` : escapeHtml(resultFullName(r));
  return `
    <span class="search-page-body">
      <p class="search-page-name">${escapeHtml(r.username)}${renderVerifiedBadge(r.user_type, r.is_verified)}</p>
      <p class="search-page-meta">${meta}</p>
    </span>
  `;
}

function renderRecents() {
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
    item.addEventListener("click", () => {
      window.location.href = `profile.html?u=${item.dataset.username}`;
    });
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

function toRecentEntry(r: ProfileSearchResult): RecentSearchEntry {
  return { id: r.id, username: r.username, nombre: r.nombre, apellido: r.apellido, avatar_url: r.avatar_url, user_type: r.user_type, is_verified: r.is_verified };
}

function renderList(results: ProfileSearchResult[], query: string) {
  if (query.trim().length < 2) {
    renderRecents();
    return;
  }

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

async function runSearch(query: string) {
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

input.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  const query = input.value;
  debounceTimer = setTimeout(() => void runSearch(query), DEBOUNCE_MS);
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  clearTimeout(debounceTimer);
  void runSearch(input.value);
});

const initialQuery = new URLSearchParams(window.location.search).get("q") ?? "";
input.value = initialQuery;
void runSearch(initialQuery);
