import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { searchProfiles, type ProfileSearchResult } from "../services/search.service";
import { USER_TYPE_BADGE, resultAvatar, resultFullName } from "../lib/search";

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

function renderList(results: ProfileSearchResult[], query: string) {
  if (query.trim().length < 2) {
    summaryEl.textContent = "Escribí al menos 2 letras para buscar.";
    listEl.innerHTML = "";
    return;
  }

  summaryEl.textContent =
    results.length === 0 ? `Sin resultados para "${query.trim()}".` : `${results.length} resultado${results.length === 1 ? "" : "s"} para "${query.trim()}".`;

  listEl.innerHTML = results
    .map(
      (r) => `
    <a class="search-page-item" href="profile.html?id=${r.id}">
      <img src="${escapeHtml(resultAvatar(r))}" alt="" class="search-page-avatar">
      <span class="search-page-body">
        <p class="search-page-name">${escapeHtml(resultFullName(r))}</p>
        <p class="search-page-meta">@${escapeHtml(r.username)}${r.nacionalidad ? ` · ${escapeHtml(r.nacionalidad)}` : ""}</p>
      </span>
      <span class="search-page-badge">${escapeHtml(USER_TYPE_BADGE[r.user_type] ?? r.user_type)}</span>
    </a>
  `
    )
    .join("");
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
