import type { ViewModule } from "../shell/router";
import { escapeHtml } from "../lib/dom";
import { formatFechaCorta } from "../lib/dias";
import {
  listGymMembers,
  acceptGymMembershipRequest,
  rejectSocioRequest,
  removeSocio,
  deleteHistoricGymMembership,
  type GymMemberRow,
  type MembershipType,
  type MemberStatusFilter,
  type MemberSort,
} from "../services/gymMember.service";
import { renderVerifiedBadge } from "../lib/verifiedBadge";
import { wireCustomDropdown } from "../lib/customDropdown";
import { initListViewToggle } from "../lib/listViewToggle";

const VIEW_MARKUP = `
  <section class="page-hero">
    <div class="container">
      <a href="profile.html" class="back-link"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Volver al perfil</a>
      <span class="eyebrow">Gimnasio</span>
      <h1>Tus socios</h1>
      <p>Solicitudes, socios activos y el historial de bajas.</p>
    </div>
  </section>

  <section class="features">
    <div class="container">
      <div class="routine-tabs" id="sociosTabs">
        <button class="routine-tab" data-tab="pending" type="button">Solicitudes</button>
        <button class="routine-tab active" data-tab="active" type="button">Socios</button>
        <button class="routine-tab" data-tab="ended" type="button">Históricos</button>
      </div>
      <div class="member-filter-chips" id="sociosFilterChips">
        <button class="member-filter-chip active" data-filter="all" type="button">Todos</button>
        <button class="member-filter-chip" data-filter="ok" type="button">Al día</button>
        <button class="member-filter-chip" data-filter="expiring" type="button">Por vencer</button>
        <button class="member-filter-chip" data-filter="expired" type="button">Vencido</button>
      </div>
      <div class="member-list-controls">
        <form class="search-page-form" id="sociosSearchForm">
          <input type="search" id="sociosSearchInput" class="header-search-input" placeholder="Buscar por nombre o usuario...">
        </form>
        <div class="member-sort-wrap profile-menu-wrap" id="sociosSortWrap">
          <button class="member-sort-trigger" id="sociosSortBtn" type="button" aria-expanded="false" aria-haspopup="true"></button>
          <div class="profile-menu-panel" id="sociosSortPanel" hidden></div>
        </div>
      </div>
      <div class="list-view-bar">
        <p class="chart-sub" id="sociosSummary">Cargando...</p>
        <div id="sociosViewToggle"></div>
      </div>
      <div class="search-page-list" id="sociosList"></div>
    </div>
  </section>
`;

type ManageTab = "pending" | "active" | "ended";

const TAB_PARAM_MAP: Record<string, ManageTab> = { solicitudes: "pending", socios: "active", historicos: "ended" };

const MENU_GEAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;

function tierBadgeMarkup(m: GymMemberRow): string {
  if (m.tier === "expiring") return `<span class="member-status-badge member-status-badge-expiring">Por vencer</span>`;
  if (m.tier === "expired") return `<span class="member-status-badge member-status-badge-expired">Vencido</span>`;
  return `<span class="member-status-badge member-status-badge-ok">Al día</span>`;
}

function membershipLineMarkup(m: GymMemberRow): string {
  if (m.membershipType === "lifetime") return "Socio de por vida";
  if (m.expiresAt) return `Vence el ${escapeHtml(formatFechaCorta(m.expiresAt))}`;
  return "";
}

function pendingCardMarkup(m: GymMemberRow): string {
  const nombreCompleto = `${m.nombre} ${m.apellido}`.trim();
  return `
    <div class="follow-request-item" data-id="${m.id}">
      <a class="follow-request-user" href="profile.html?u=${encodeURIComponent(m.username)}">
        <img src="${escapeHtml(m.avatarUrl || "/images/avatars/default.svg")}" alt="" class="search-result-avatar">
        <span class="search-result-body">
          <span class="search-result-name">${escapeHtml(nombreCompleto)}${renderVerifiedBadge(m.userType, m.isVerified)}</span>
          <span class="search-result-username">@${escapeHtml(m.username)} · pidió ser socio el ${escapeHtml(formatFechaCorta(m.requestedAt))}</span>
        </span>
      </a>
      <div class="follow-request-actions">
        <button class="btn btn-primary btn-sm acceptSocioBtn" data-id="${m.id}" data-member="${m.memberId}" data-nombre="${escapeHtml(nombreCompleto)}" type="button">Aceptar</button>
        <button class="btn btn-outline btn-sm rejectSocioBtn" data-member="${m.memberId}" data-nombre="${escapeHtml(nombreCompleto)}" type="button">Rechazar</button>
      </div>
    </div>
  `;
}

function activeCardMarkup(m: GymMemberRow): string {
  const nombreCompleto = `${m.nombre} ${m.apellido}`.trim();
  return `
    <div class="routine-card reveal student-card routine-card-has-menu" data-id="${m.id}">
      <div class="profile-menu-wrap routine-menu-wrap">
        <button type="button" class="profile-menu-btn routine-menu-btn" aria-label="Más opciones" aria-expanded="false">${MENU_GEAR_ICON}</button>
        <div class="profile-menu-panel routine-menu-panel" hidden>
          <button type="button" class="profile-menu-item profile-menu-item-danger removeSocioBtn" data-member="${m.memberId}" data-nombre="${escapeHtml(nombreCompleto)}">Dar de baja</button>
        </div>
      </div>
      <div class="student-card-head">
        <a class="follow-request-user" href="profile.html?u=${encodeURIComponent(m.username)}">
          <img src="${escapeHtml(m.avatarUrl || "/images/avatars/default.svg")}" alt="" class="search-result-avatar">
          <span class="search-result-body">
            <span class="search-result-name">${escapeHtml(nombreCompleto)}${renderVerifiedBadge(m.userType, m.isVerified)}</span>
            <span class="search-result-username">@${escapeHtml(m.username)}</span>
          </span>
        </a>
        ${tierBadgeMarkup(m)}
      </div>
      <div class="routine-stats">
        <div><span>Socio desde</span><strong>${escapeHtml(formatFechaCorta(m.requestedAt))}</strong></div>
        <div><span>Membresía</span><strong>${membershipLineMarkup(m)}</strong></div>
      </div>
    </div>
  `;
}

function endedCardMarkup(m: GymMemberRow): string {
  const nombreCompleto = `${m.nombre} ${m.apellido}`.trim();
  return `
    <div class="routine-card reveal student-card is-historic routine-card-has-menu" data-id="${m.id}">
      <div class="profile-menu-wrap routine-menu-wrap">
        <button type="button" class="profile-menu-btn routine-menu-btn" aria-label="Más opciones" aria-expanded="false">${MENU_GEAR_ICON}</button>
        <div class="profile-menu-panel routine-menu-panel" hidden>
          <button type="button" class="profile-menu-item profile-menu-item-danger deleteHistoricSocioBtn" data-member="${m.memberId}" data-nombre="${escapeHtml(nombreCompleto)}">Eliminar del historial</button>
        </div>
      </div>
      <div class="student-card-head">
        <a class="follow-request-user" href="profile.html?u=${encodeURIComponent(m.username)}">
          <img src="${escapeHtml(m.avatarUrl || "/images/avatars/default.svg")}" alt="" class="search-result-avatar">
          <span class="search-result-body">
            <span class="search-result-name">${escapeHtml(nombreCompleto)}${renderVerifiedBadge(m.userType, m.isVerified)}</span>
            <span class="search-result-username">@${escapeHtml(m.username)}</span>
          </span>
        </a>
      </div>
      <div class="routine-stats">
        <div><span>Socio desde</span><strong>${escapeHtml(formatFechaCorta(m.requestedAt))}</strong></div>
        <div><span>Baja</span><strong>${m.endedAt ? escapeHtml(formatFechaCorta(m.endedAt)) : "—"}</strong></div>
      </div>
    </div>
  `;
}

export const sociosView: ViewModule = {
  async mount(container, params, ctx, authUserId) {
    const myId = authUserId!; // la ruta se registra con auth: "required"
    container.innerHTML = VIEW_MARKUP;

    const summaryEl = container.querySelector("#sociosSummary")!;
    const listEl = container.querySelector("#sociosList")!;
    const tabsWrap = container.querySelector("#sociosTabs")!;
    const chipsWrap = container.querySelector("#sociosFilterChips") as HTMLElement;
    const searchForm = container.querySelector("#sociosSearchForm") as HTMLFormElement;
    const searchInput = container.querySelector("#sociosSearchInput") as HTMLInputElement;
    const viewToggleWrap = container.querySelector("#sociosViewToggle") as HTMLElement;

    const initialTab = TAB_PARAM_MAP[params.get("tab") ?? ""] ?? "active";
    let activeTab: ManageTab = initialTab;
    let activeFilter: MemberStatusFilter = "all";
    let currentSort: MemberSort = "recent";
    const DEBOUNCE_MS = 250;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let requestId = 0;
    ctx.addCleanup(() => clearTimeout(debounceTimer));

    const viewToggle = initListViewToggle({
      storageKey: "socios",
      listEl: listEl as HTMLElement,
      mountEl: viewToggleWrap,
      signal: ctx.signal,
      onChange: () => syncTabUi(),
    });

    function syncTabUi(): void {
      tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === activeTab));
      // Los filtros de estado (Al dia/Por vencer/Vencido) solo tienen sentido en la pestaña de
      // socios activos. En Solicitudes tampoco tiene sentido buscar (la lista siempre es chica).
      chipsWrap.hidden = activeTab !== "active";
      chipsWrap.querySelectorAll<HTMLButtonElement>(".member-filter-chip").forEach((b) => b.classList.toggle("active", b.dataset.filter === activeFilter));
      searchForm.hidden = activeTab === "pending";
      // Las solicitudes se muestran como filas de acción (aceptar/rechazar): el modo retrato no
      // aplica ahí, así que ocultamos el toggle y forzamos filas mientras esa pestaña esté activa.
      const showToggle = activeTab !== "pending";
      viewToggleWrap.hidden = !showToggle;
      listEl.classList.toggle("is-portrait", showToggle && viewToggle.get() === "portrait");
    }
    syncTabUi();

    // ---------- Menu de tuerca por socio (Dar de baja / Eliminar del historial) ----------

    document.addEventListener(
      "click",
      (e) => {
        const target = e.target as HTMLElement;
        if (target.closest(".routine-menu-wrap")) return;
        container.querySelectorAll<HTMLElement>(".routine-menu-panel").forEach((p) => (p.hidden = true));
        container.querySelectorAll<HTMLButtonElement>(".routine-menu-btn").forEach((b) => {
          b.classList.remove("open");
          b.setAttribute("aria-expanded", "false");
        });
      },
      { signal: ctx.signal }
    );

    function wireMemberMenus(root: HTMLElement): void {
      root.querySelectorAll<HTMLButtonElement>(".routine-menu-btn").forEach((btn) => {
        const panel = btn.nextElementSibling as HTMLElement | null;
        if (!panel) return;
        btn.addEventListener("click", () => {
          const willOpen = panel.hidden;
          root.querySelectorAll<HTMLElement>(".routine-menu-panel").forEach((p) => (p.hidden = true));
          root.querySelectorAll<HTMLButtonElement>(".routine-menu-btn").forEach((b) => {
            b.classList.remove("open");
            b.setAttribute("aria-expanded", "false");
          });
          panel.hidden = !willOpen;
          btn.classList.toggle("open", willOpen);
          btn.setAttribute("aria-expanded", String(willOpen));
        });
      });
    }

    function closeOverlay(): void {
      const loaderBody = document.getElementById("loaderBody");
      if (loaderBody) loaderBody.innerHTML = "";
    }

    function showSuccessAndRefresh(message: string): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="success-icon">
            <svg viewBox="0 0 52 52" class="success-svg">
              <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
              <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
            </svg>
          </div>
          <p>${escapeHtml(message)}</p>
        </div>
      `;
      const t = setTimeout(() => {
        closeOverlay();
        void runSearch(searchInput.value.trim());
      }, 1600);
      ctx.addCleanup(() => clearTimeout(t));
    }

    // ---------- Aceptar solicitud: el gimnasio elige "para siempre" o una duracion fija ----------

    function openAcceptModal(membershipId: string, nombre: string): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>Aceptar a ${escapeHtml(nombre)} como socio</h2>
            <p class="subtitle">Elegí por cuánto tiempo va a ser socio de tu gimnasio.</p>
            <label class="member-accept-option">
              <input type="radio" name="acceptMembershipType" value="lifetime" checked>
              Para siempre
            </label>
            <label class="member-accept-option">
              <input type="radio" name="acceptMembershipType" value="fixed">
              Por tiempo determinado
            </label>
            <div class="field member-accept-duration" id="acceptDurationField" hidden>
              <label for="acceptDurationMonths">Meses</label>
              <input type="number" id="acceptDurationMonths" min="1" step="1" value="1">
            </div>
            <div class="modal-actions">
              <button class="btn btn-primary" id="confirmAcceptSocio" type="button">Aceptar</button>
              <button class="btn btn-outline" id="cancelAcceptSocio" type="button">Cancelar</button>
            </div>
          </div>
        </div>
      `;
      document.getElementById("cancelAcceptSocio")?.addEventListener("click", closeOverlay);

      const durationField = document.getElementById("acceptDurationField") as HTMLElement;
      document.querySelectorAll<HTMLInputElement>('input[name="acceptMembershipType"]').forEach((radio) => {
        radio.addEventListener("change", () => {
          durationField.hidden = radio.value !== "fixed" || !radio.checked;
        });
      });

      document.getElementById("confirmAcceptSocio")?.addEventListener("click", async () => {
        const confirmBtn = document.getElementById("confirmAcceptSocio") as HTMLButtonElement;
        const type = (document.querySelector('input[name="acceptMembershipType"]:checked') as HTMLInputElement | null)?.value as MembershipType | undefined;
        const durationInput = document.getElementById("acceptDurationMonths") as HTMLInputElement | null;
        const months = durationInput ? parseInt(durationInput.value, 10) : undefined;
        if (!type) return;
        if (type === "fixed" && (!months || months < 1)) {
          alert("Ingresá una cantidad de meses válida.");
          return;
        }
        confirmBtn.disabled = true;
        const { error } = await acceptGymMembershipRequest(membershipId, type, type === "fixed" ? months : undefined);
        if (error) {
          alert(error);
          closeOverlay();
          return;
        }
        showSuccessAndRefresh(`${nombre} ya es socio de tu gimnasio.`);
      });
    }

    function confirmRejectSocio(memberId: string, nombre: string): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>Rechazar solicitud</h2>
            <p class="subtitle">${escapeHtml(nombre)} no va a ser socio de tu gimnasio. Va a poder volver a pedirlo cuando quiera.</p>
            <div class="modal-actions">
              <button class="btn btn-danger" id="confirmRejectSocio" type="button">Rechazar</button>
              <button class="btn btn-outline" id="cancelRejectSocio" type="button">Volver</button>
            </div>
          </div>
        </div>
      `;
      document.getElementById("cancelRejectSocio")?.addEventListener("click", closeOverlay);
      document.getElementById("confirmRejectSocio")?.addEventListener("click", async () => {
        const confirmBtn = document.getElementById("confirmRejectSocio") as HTMLButtonElement;
        confirmBtn.disabled = true;
        const { error } = await rejectSocioRequest(myId, memberId);
        if (error) {
          alert(error);
          closeOverlay();
          return;
        }
        showSuccessAndRefresh("Solicitud rechazada.");
      });
    }

    function confirmRemoveSocio(memberId: string, nombre: string): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>Dar de baja a ${escapeHtml(nombre)}</h2>
            <p class="subtitle">Deja de ser socio de tu gimnasio. Va a pasar a Históricos y va a poder volver a pedir ser socio más adelante.</p>
            <div class="modal-actions">
              <button class="btn btn-danger" id="confirmRemoveSocio" type="button">Dar de baja</button>
              <button class="btn btn-outline" id="cancelRemoveSocio" type="button">Volver</button>
            </div>
          </div>
        </div>
      `;
      document.getElementById("cancelRemoveSocio")?.addEventListener("click", closeOverlay);
      document.getElementById("confirmRemoveSocio")?.addEventListener("click", async () => {
        const confirmBtn = document.getElementById("confirmRemoveSocio") as HTMLButtonElement;
        confirmBtn.disabled = true;
        const { error } = await removeSocio(myId, memberId);
        if (error) {
          alert(error);
          closeOverlay();
          return;
        }
        showSuccessAndRefresh("Socio dado de baja. Pasó a Históricos.");
      });
    }

    function confirmDeleteHistoricSocio(memberId: string, nombre: string): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>Eliminar del historial</h2>
            <p class="subtitle">Se borra el registro de ${escapeHtml(nombre)} como ex socio. Si vuelve a pedir ser socio más adelante, va a quedar como una relación nueva, sin la fecha de alta original.</p>
            <div class="modal-actions">
              <button class="btn btn-danger" id="confirmDeleteHistoricSocio" type="button">Eliminar</button>
              <button class="btn btn-outline" id="cancelDeleteHistoricSocio" type="button">Volver</button>
            </div>
          </div>
        </div>
      `;
      document.getElementById("cancelDeleteHistoricSocio")?.addEventListener("click", closeOverlay);
      document.getElementById("confirmDeleteHistoricSocio")?.addEventListener("click", async () => {
        const { error } = await deleteHistoricGymMembership(myId, memberId);
        if (error) {
          alert(error);
          closeOverlay();
          return;
        }
        closeOverlay();
        void runSearch(searchInput.value.trim());
      });
    }

    function renderList(rows: GymMemberRow[], query: string): void {
      const emptyMessages: Record<ManageTab, { withQuery: string; empty: string }> = {
        pending: { withQuery: `Sin resultados para "${query}".`, empty: "No tenés solicitudes pendientes." },
        active: { withQuery: `Sin resultados para "${query}".`, empty: "Todavía no tenés socios. Cuando alguien pida ser socio y lo aceptes, va a aparecer acá." },
        ended: { withQuery: `Sin resultados para "${query}".`, empty: "Todavía no tenés socios históricos." },
      };
      const nounByTab: Record<ManageTab, [string, string]> = {
        pending: ["solicitud", "solicitudes"],
        active: ["socio", "socios"],
        ended: ["ex socio", "ex socios"],
      };
      const [singular, plural] = nounByTab[activeTab];
      const msgs = emptyMessages[activeTab];
      summaryEl.textContent = rows.length === 0 ? (query ? msgs.withQuery : msgs.empty) : `${rows.length} ${rows.length === 1 ? singular : plural}.`;

      const markup = activeTab === "pending" ? pendingCardMarkup : activeTab === "active" ? activeCardMarkup : endedCardMarkup;
      listEl.innerHTML = rows.map(markup).join("");

      if (activeTab === "pending") {
        listEl.querySelectorAll<HTMLButtonElement>(".acceptSocioBtn").forEach((btn) => {
          btn.addEventListener("click", () => openAcceptModal(btn.dataset.id!, btn.dataset.nombre!));
        });
        listEl.querySelectorAll<HTMLButtonElement>(".rejectSocioBtn").forEach((btn) => {
          btn.addEventListener("click", () => confirmRejectSocio(btn.dataset.member!, btn.dataset.nombre!));
        });
      } else {
        wireMemberMenus(listEl as HTMLElement);
        listEl.querySelectorAll<HTMLButtonElement>(".removeSocioBtn").forEach((btn) => {
          btn.addEventListener("click", () => confirmRemoveSocio(btn.dataset.member!, btn.dataset.nombre!));
        });
        listEl.querySelectorAll<HTMLButtonElement>(".deleteHistoricSocioBtn").forEach((btn) => {
          btn.addEventListener("click", () => confirmDeleteHistoricSocio(btn.dataset.member!, btn.dataset.nombre!));
        });
      }
    }

    async function runSearch(query: string): Promise<void> {
      const myRequestId = ++requestId;
      summaryEl.textContent = "Cargando...";
      const statusFilter: MemberStatusFilter = activeTab === "pending" ? "pending" : activeTab === "ended" ? "ended" : activeFilter;
      try {
        const rows = await listGymMembers(myId, { search: query, statusFilter, sort: currentSort });
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
          const tab = btn.dataset.tab as ManageTab;
          if (tab === activeTab) return;
          activeTab = tab;
          activeFilter = "all";
          syncTabUi();
          searchInput.value = "";
          void runSearch("");
        },
        { signal: ctx.signal }
      );
    });

    chipsWrap.querySelectorAll<HTMLButtonElement>(".member-filter-chip").forEach((btn) => {
      btn.addEventListener(
        "click",
        () => {
          const filter = btn.dataset.filter as MemberStatusFilter;
          if (filter === activeFilter) return;
          activeFilter = filter;
          syncTabUi();
          void runSearch(searchInput.value.trim());
        },
        { signal: ctx.signal }
      );
    });

    wireCustomDropdown(
      "sociosSortBtn",
      "sociosSortPanel",
      [
        { value: "recent", label: "Más recientes primero" },
        { value: "oldest", label: "Más antiguos primero" },
      ],
      currentSort,
      (value) => {
        currentSort = value as MemberSort;
        void runSearch(searchInput.value.trim());
      },
      ctx.signal
    );

    searchInput.addEventListener(
      "input",
      () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => void runSearch(searchInput.value.trim()), DEBOUNCE_MS);
      },
      { signal: ctx.signal }
    );

    searchForm.addEventListener(
      "submit",
      (e) => {
        e.preventDefault();
        clearTimeout(debounceTimer);
        void runSearch(searchInput.value.trim());
      },
      { signal: ctx.signal }
    );

    void runSearch("");
  },
};
