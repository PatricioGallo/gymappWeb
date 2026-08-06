import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { getProfile, getProfileByUsername, getProfileBasicByUsername, type Profile, type ProfileBasic } from "../services/profile.service";
import { getFollowStatus, listFollowers, listFollowing, type FollowListRow, type FollowStatus } from "../services/follow.service";
import { listSubscribers, type SubscriberListRow } from "../services/subscription.service";
import { USER_TYPE_BADGE } from "../lib/search";
import { renderVerifiedBadge } from "../lib/verifiedBadge";

setupNavToggle();
setupRevealObserver();
const myId = await requireAuth();

type Tab = "followers" | "following" | "subscribers";
type ListRow = FollowListRow | SubscriberListRow;

const params = new URLSearchParams(window.location.search);
const usernameParam = params.get("u");
const tabParam = params.get("tab");
let activeTab: Tab = tabParam === "following" ? "following" : tabParam === "subscribers" ? "subscribers" : "followers";

const titleEl = document.getElementById("followListTitle")!;
const subtitleEl = document.getElementById("followListSubtitle")!;
const backLink = document.getElementById("backLink") as HTMLAnchorElement;
const bodyEl = document.getElementById("followListBody")!;
const tabsWrap = document.getElementById("followListTabs")!;
const searchForm = document.getElementById("followListSearchForm") as HTMLFormElement;
const searchInput = document.getElementById("followListSearchInput") as HTMLInputElement;
const summaryEl = document.getElementById("followListSummary")!;
const listEl = document.getElementById("followListResults")!;

const DEBOUNCE_MS = 250;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let requestId = 0;

async function main() {
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
    document.getElementById("backLink")?.remove();
    return;
  }

  const targetId = target.id!;
  const isOwner = targetId === myId;
  const nombre = target.nombre ?? "Este usuario";
  backLink.href = `profile.html?u=${encodeURIComponent(target.username ?? "")}`;

  // Suscriptores solo aplica a perfiles de entrenador (gimnasio tendra su propio sistema despues).
  const isTrainer = target.user_type === "entrenador";
  const subscribersTabBtn = document.getElementById("subscribersTabBtn") as HTMLButtonElement | null;
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

  function updateHeaderTexts() {
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

  function renderList(rows: ListRow[], query: string) {
    summaryEl.textContent = rows.length === 0 ? emptyMessage(query) : `${rows.length} resultado${rows.length === 1 ? "" : "s"}.`;
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
  }

  async function runList() {
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
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === activeTab) return;
      activeTab = btn.dataset.tab as Tab;
      tabsWrap.querySelectorAll(".routine-tab").forEach((b) => b.classList.toggle("active", b === btn));
      updateHeaderTexts();
      const url = new URL(window.location.href);
      url.searchParams.set("tab", activeTab);
      window.history.replaceState({}, "", url);
      void runList();
    });
  });

  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void runList(), DEBOUNCE_MS);
  });

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearTimeout(debounceTimer);
    void runList();
  });

  tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === activeTab));
  updateHeaderTexts();
  void runList();
}

void main();
