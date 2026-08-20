import type { ViewModule } from "../shell/router";
import { escapeHtml } from "../lib/dom";
import { formatFechaCorta } from "../lib/dias";
import {
  listGymTrainers,
  acceptGymTrainerRequest,
  removeTrainerFromGym,
  deleteHistoricGymTrainer,
  inviteGymTrainer,
  type GymTrainerRow,
  type MembershipType,
  type TrainerStatusFilter,
  type TrainerSort,
} from "../services/gymTrainer.service";
import { searchProfiles } from "../services/search.service";
import { renderVerifiedBadge } from "../lib/verifiedBadge";
import { wireCustomDropdown } from "../lib/customDropdown";

const VIEW_MARKUP = `
  <section class="page-hero">
    <div class="container">
      <a href="profile.html" class="back-link"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Volver al perfil</a>
      <span class="eyebrow">Gimnasio</span>
      <h1>Tus entrenadores</h1>
      <p>Solicitudes, plantel activo y el historial de entrenadores que fueron handle de tu gimnasio.</p>
    </div>
  </section>

  <section class="features">
    <div class="container">
      <div class="routines-header-actions">
        <button class="btn btn-primary btn-sm" id="inviteTrainerBtn" type="button">+ Invitar entrenador</button>
      </div>
      <div class="routine-tabs" id="entrenadoresTabs">
        <button class="routine-tab" data-tab="pending" type="button">Solicitudes</button>
        <button class="routine-tab active" data-tab="active" type="button">Entrenadores</button>
        <button class="routine-tab" data-tab="ended" type="button">Históricos</button>
      </div>
      <div class="member-filter-chips" id="entrenadoresFilterChips">
        <button class="member-filter-chip active" data-filter="all" type="button">Todos</button>
        <button class="member-filter-chip" data-filter="ok" type="button">Al día</button>
        <button class="member-filter-chip" data-filter="expiring" type="button">Por vencer</button>
        <button class="member-filter-chip" data-filter="expired" type="button">Vencido</button>
      </div>
      <div class="member-list-controls">
        <form class="search-page-form" id="entrenadoresSearchForm">
          <input type="search" id="entrenadoresSearchInput" class="header-search-input" placeholder="Buscar por nombre o usuario...">
        </form>
        <div class="member-sort-wrap profile-menu-wrap" id="entrenadoresSortWrap">
          <button class="member-sort-trigger" id="entrenadoresSortBtn" type="button" aria-expanded="false" aria-haspopup="true"></button>
          <div class="profile-menu-panel" id="entrenadoresSortPanel" hidden></div>
        </div>
      </div>
      <p class="chart-sub" id="entrenadoresSummary">Cargando...</p>
      <div class="search-page-list" id="entrenadoresList"></div>
    </div>
  </section>
`;

type ManageTab = "pending" | "active" | "ended";

const TAB_PARAM_MAP: Record<string, ManageTab> = { solicitudes: "pending", entrenadores: "active", historicos: "ended" };

const MENU_GEAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;

function tierBadgeMarkup(m: GymTrainerRow): string {
  if (m.tier === "expiring") return `<span class="member-status-badge member-status-badge-expiring">Por vencer</span>`;
  if (m.tier === "expired") return `<span class="member-status-badge member-status-badge-expired">Vencido</span>`;
  return `<span class="member-status-badge member-status-badge-ok">Al día</span>`;
}

function membershipLineMarkup(m: GymTrainerRow): string {
  if (m.membershipType === "lifetime") return "Handle de por vida";
  if (m.expiresAt) return `Vence el ${escapeHtml(formatFechaCorta(m.expiresAt))}`;
  return "";
}

function pendingCardMarkup(m: GymTrainerRow): string {
  const nombreCompleto = `${m.nombre} ${m.apellido}`.trim();
  const isTrainerInitiated = m.initiatedBy === "trainer";
  const meta = isTrainerInitiated
    ? `pidió ser handle el ${escapeHtml(formatFechaCorta(m.requestedAt))}`
    : `invitación enviada el ${escapeHtml(formatFechaCorta(m.requestedAt))} · esperando respuesta`;
  const actions = isTrainerInitiated
    ? `
      <button class="btn btn-primary btn-sm acceptHandleBtn" data-id="${m.id}" data-trainer="${m.trainerId}" data-nombre="${escapeHtml(nombreCompleto)}" type="button">Aceptar</button>
      <button class="btn btn-outline btn-sm rejectHandleBtn" data-trainer="${m.trainerId}" data-nombre="${escapeHtml(nombreCompleto)}" type="button">Rechazar</button>
    `
    : `<button class="btn btn-outline btn-sm rejectHandleBtn" data-trainer="${m.trainerId}" data-nombre="${escapeHtml(nombreCompleto)}" type="button">Cancelar invitación</button>`;

  return `
    <div class="follow-request-item" data-id="${m.id}">
      <a class="follow-request-user" href="profile.html?u=${encodeURIComponent(m.username)}">
        <img src="${escapeHtml(m.avatarUrl || "/images/avatars/default.svg")}" alt="" class="search-result-avatar">
        <span class="search-result-body">
          <span class="search-result-name">${escapeHtml(nombreCompleto)}${renderVerifiedBadge(m.userType, m.isVerified)}</span>
          <span class="search-result-username">@${escapeHtml(m.username)} · ${meta}</span>
        </span>
      </a>
      <div class="follow-request-actions">${actions}</div>
    </div>
  `;
}

function activeCardMarkup(m: GymTrainerRow): string {
  const nombreCompleto = `${m.nombre} ${m.apellido}`.trim();
  return `
    <div class="routine-card reveal student-card routine-card-has-menu" data-id="${m.id}">
      <div class="profile-menu-wrap routine-menu-wrap">
        <button type="button" class="profile-menu-btn routine-menu-btn" aria-label="Más opciones" aria-expanded="false">${MENU_GEAR_ICON}</button>
        <div class="profile-menu-panel routine-menu-panel" hidden>
          <button type="button" class="profile-menu-item profile-menu-item-danger removeHandleBtn" data-trainer="${m.trainerId}" data-nombre="${escapeHtml(nombreCompleto)}">Desvincular</button>
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
        <div><span>Handle desde</span><strong>${escapeHtml(formatFechaCorta(m.requestedAt))}</strong></div>
        <div><span>Membresía</span><strong>${membershipLineMarkup(m)}</strong></div>
      </div>
    </div>
  `;
}

function endedCardMarkup(m: GymTrainerRow): string {
  const nombreCompleto = `${m.nombre} ${m.apellido}`.trim();
  return `
    <div class="routine-card reveal student-card is-historic routine-card-has-menu" data-id="${m.id}">
      <div class="profile-menu-wrap routine-menu-wrap">
        <button type="button" class="profile-menu-btn routine-menu-btn" aria-label="Más opciones" aria-expanded="false">${MENU_GEAR_ICON}</button>
        <div class="profile-menu-panel routine-menu-panel" hidden>
          <button type="button" class="profile-menu-item profile-menu-item-danger deleteHistoricHandleBtn" data-trainer="${m.trainerId}" data-nombre="${escapeHtml(nombreCompleto)}">Eliminar del historial</button>
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
        <div><span>Handle desde</span><strong>${escapeHtml(formatFechaCorta(m.requestedAt))}</strong></div>
        <div><span>Baja</span><strong>${m.endedAt ? escapeHtml(formatFechaCorta(m.endedAt)) : "—"}</strong></div>
      </div>
    </div>
  `;
}

function durationFormMarkup(idPrefix: string): string {
  return `
    <label class="member-accept-option">
      <input type="radio" name="${idPrefix}MembershipType" value="lifetime" checked>
      Para siempre
    </label>
    <label class="member-accept-option">
      <input type="radio" name="${idPrefix}MembershipType" value="fixed">
      Por tiempo determinado
    </label>
    <div class="field member-accept-duration" id="${idPrefix}DurationField" hidden>
      <label for="${idPrefix}DurationMonths">Meses</label>
      <input type="number" id="${idPrefix}DurationMonths" min="1" step="1" value="1">
    </div>
  `;
}

function wireDurationForm(idPrefix: string): void {
  const durationField = document.getElementById(`${idPrefix}DurationField`) as HTMLElement | null;
  if (!durationField) return;
  document.querySelectorAll<HTMLInputElement>(`input[name="${idPrefix}MembershipType"]`).forEach((radio) => {
    radio.addEventListener("change", () => {
      durationField.hidden = radio.value !== "fixed" || !radio.checked;
    });
  });
}

function readDurationForm(idPrefix: string): { type: MembershipType; months?: number } | null {
  const type = (document.querySelector(`input[name="${idPrefix}MembershipType"]:checked`) as HTMLInputElement | null)?.value as MembershipType | undefined;
  if (!type) return null;
  const durationInput = document.getElementById(`${idPrefix}DurationMonths`) as HTMLInputElement | null;
  const months = durationInput ? parseInt(durationInput.value, 10) : undefined;
  if (type === "fixed" && (!months || months < 1)) return null;
  return { type, months: type === "fixed" ? months : undefined };
}

export const entrenadoresView: ViewModule = {
  async mount(container, params, ctx, authUserId) {
    const myId = authUserId!; // la ruta se registra con auth: "required"
    container.innerHTML = VIEW_MARKUP;

    const summaryEl = container.querySelector("#entrenadoresSummary")!;
    const listEl = container.querySelector("#entrenadoresList")!;
    const tabsWrap = container.querySelector("#entrenadoresTabs")!;
    const chipsWrap = container.querySelector("#entrenadoresFilterChips") as HTMLElement;
    const searchForm = container.querySelector("#entrenadoresSearchForm") as HTMLFormElement;
    const searchInput = container.querySelector("#entrenadoresSearchInput") as HTMLInputElement;
    const inviteBtn = container.querySelector("#inviteTrainerBtn") as HTMLButtonElement;

    const initialTab = TAB_PARAM_MAP[params.get("tab") ?? ""] ?? "active";
    let activeTab: ManageTab = initialTab;
    let activeFilter: TrainerStatusFilter = "all";
    let currentSort: TrainerSort = "recent";
    const DEBOUNCE_MS = 250;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let inviteDebounceTimer: ReturnType<typeof setTimeout> | undefined;
    let requestId = 0;
    ctx.addCleanup(() => clearTimeout(debounceTimer));
    ctx.addCleanup(() => clearTimeout(inviteDebounceTimer));

    function syncTabUi(): void {
      tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === activeTab));
      // Los filtros de estado (Al dia/Por vencer/Vencido) solo tienen sentido en la pestaña de
      // entrenadores activos. En Solicitudes tampoco tiene sentido buscar (la lista siempre es chica).
      chipsWrap.hidden = activeTab !== "active";
      chipsWrap.querySelectorAll<HTMLButtonElement>(".member-filter-chip").forEach((b) => b.classList.toggle("active", b.dataset.filter === activeFilter));
      searchForm.hidden = activeTab === "pending";
    }
    syncTabUi();

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

    function wireHandleMenus(root: HTMLElement): void {
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

    // ---------- Aceptar solicitud de un entrenador (el gimnasio recien aca define la duracion) ----------

    function openAcceptModal(handleId: string, nombre: string): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>Aceptar a ${escapeHtml(nombre)} como handle</h2>
            <p class="subtitle">Elegí por cuánto tiempo va a ser handle de tu gimnasio.</p>
            ${durationFormMarkup("accept")}
            <div class="modal-actions">
              <button class="btn btn-primary" id="confirmAcceptHandle" type="button">Aceptar</button>
              <button class="btn btn-outline" id="cancelAcceptHandle" type="button">Cancelar</button>
            </div>
          </div>
        </div>
      `;
      document.getElementById("cancelAcceptHandle")?.addEventListener("click", closeOverlay);
      wireDurationForm("accept");

      document.getElementById("confirmAcceptHandle")?.addEventListener("click", async () => {
        const confirmBtn = document.getElementById("confirmAcceptHandle") as HTMLButtonElement;
        const picked = readDurationForm("accept");
        if (!picked) {
          alert("Ingresá una cantidad de meses válida.");
          return;
        }
        confirmBtn.disabled = true;
        const { error } = await acceptGymTrainerRequest(handleId, picked.type, picked.months);
        if (error) {
          alert(error);
          closeOverlay();
          return;
        }
        showSuccessAndRefresh(`${nombre} ya es handle de tu gimnasio.`);
      });
    }

    function confirmRejectHandle(trainerId: string, nombre: string): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>Rechazar / cancelar</h2>
            <p class="subtitle">Se cancela la solicitud o invitación de handle con ${escapeHtml(nombre)}.</p>
            <div class="modal-actions">
              <button class="btn btn-danger" id="confirmRejectHandle" type="button">Confirmar</button>
              <button class="btn btn-outline" id="cancelRejectHandle" type="button">Volver</button>
            </div>
          </div>
        </div>
      `;
      document.getElementById("cancelRejectHandle")?.addEventListener("click", closeOverlay);
      document.getElementById("confirmRejectHandle")?.addEventListener("click", async () => {
        const confirmBtn = document.getElementById("confirmRejectHandle") as HTMLButtonElement;
        confirmBtn.disabled = true;
        const { error } = await removeTrainerFromGym(myId, trainerId);
        if (error) {
          alert(error);
          closeOverlay();
          return;
        }
        showSuccessAndRefresh("Listo.");
      });
    }

    function confirmRemoveHandle(trainerId: string, nombre: string): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>Desvincular a ${escapeHtml(nombre)}</h2>
            <p class="subtitle">Deja de ser handle de tu gimnasio. Va a pasar a Históricos y va a poder volver a vincularse más adelante.</p>
            <div class="modal-actions">
              <button class="btn btn-danger" id="confirmRemoveHandle" type="button">Desvincular</button>
              <button class="btn btn-outline" id="cancelRemoveHandle" type="button">Volver</button>
            </div>
          </div>
        </div>
      `;
      document.getElementById("cancelRemoveHandle")?.addEventListener("click", closeOverlay);
      document.getElementById("confirmRemoveHandle")?.addEventListener("click", async () => {
        const confirmBtn = document.getElementById("confirmRemoveHandle") as HTMLButtonElement;
        confirmBtn.disabled = true;
        const { error } = await removeTrainerFromGym(myId, trainerId);
        if (error) {
          alert(error);
          closeOverlay();
          return;
        }
        showSuccessAndRefresh("Entrenador desvinculado. Pasó a Históricos.");
      });
    }

    function confirmDeleteHistoricHandle(trainerId: string, nombre: string): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>Eliminar del historial</h2>
            <p class="subtitle">Se borra el registro de ${escapeHtml(nombre)} como ex handle. Si vuelve a vincularse más adelante, va a quedar como una relación nueva, sin la fecha de alta original.</p>
            <div class="modal-actions">
              <button class="btn btn-danger" id="confirmDeleteHistoricHandle" type="button">Eliminar</button>
              <button class="btn btn-outline" id="cancelDeleteHistoricHandle" type="button">Volver</button>
            </div>
          </div>
        </div>
      `;
      document.getElementById("cancelDeleteHistoricHandle")?.addEventListener("click", closeOverlay);
      document.getElementById("confirmDeleteHistoricHandle")?.addEventListener("click", async () => {
        const { error } = await deleteHistoricGymTrainer(myId, trainerId);
        if (error) {
          alert(error);
          closeOverlay();
          return;
        }
        closeOverlay();
        void runSearch(searchInput.value.trim());
      });
    }

    // ---------- Invitar entrenador: buscar por nombre/usuario, elegir duracion, enviar ----------

    function openInviteModal(): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card modal-card-lg">
            <h2>Invitar entrenador</h2>
            <p class="subtitle">Buscá por nombre o usuario. Vos elegís la duración; el entrenador solo tiene que aceptar.</p>
            <div class="field"><label for="inviteTrainerSearch">Buscar</label><input type="search" id="inviteTrainerSearch" placeholder="nombre o @usuario"></div>
            <div id="inviteTrainerResults" class="modal-list"></div>
            <div class="modal-actions">
              <button type="button" class="btn btn-outline" id="inviteTrainerCancel">Cerrar</button>
            </div>
          </div>
        </div>
      `;
      document.getElementById("inviteTrainerCancel")?.addEventListener("click", closeOverlay);

      const input = document.getElementById("inviteTrainerSearch") as HTMLInputElement;
      const resultsEl = document.getElementById("inviteTrainerResults") as HTMLElement;

      async function runInviteSearch(query: string): Promise<void> {
        if (query.trim().length < 2) {
          resultsEl.innerHTML = `<p class="chart-sub">Escribí al menos 2 letras.</p>`;
          return;
        }
        const results = (await searchProfiles(query, 20).catch(() => [])).filter((p) => p.user_type === "entrenador");
        resultsEl.innerHTML = results.length
          ? results
              .map(
                (p) => `
          <div class="follow-request-item" data-id="${p.id}">
            <span class="follow-request-user">
              <img src="${escapeHtml(p.avatar_url || "/images/avatars/default.svg")}" alt="" class="search-result-avatar">
              <span class="search-result-body">
                <span class="search-result-name">${escapeHtml(`${p.nombre} ${p.apellido}`.trim())}${renderVerifiedBadge(p.user_type, p.is_verified)}</span>
                <span class="search-result-username">@${escapeHtml(p.username)}</span>
              </span>
            </span>
            <div class="follow-request-actions">
              <button class="btn btn-primary btn-sm pickInviteTrainerBtn" data-id="${p.id}" data-nombre="${escapeHtml(`${p.nombre} ${p.apellido}`.trim())}" type="button">Invitar</button>
            </div>
          </div>
        `
              )
              .join("")
          : `<p class="chart-sub">Sin resultados.</p>`;

        resultsEl.querySelectorAll<HTMLButtonElement>(".pickInviteTrainerBtn").forEach((btn) => {
          btn.addEventListener("click", () => openInviteDurationStep(btn.dataset.id!, btn.dataset.nombre!));
        });
      }

      input.addEventListener("input", () => {
        clearTimeout(inviteDebounceTimer);
        inviteDebounceTimer = setTimeout(() => void runInviteSearch(input.value), DEBOUNCE_MS);
      });
    }

    function openInviteDurationStep(trainerId: string, nombre: string): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>Invitar a ${escapeHtml(nombre)}</h2>
            <p class="subtitle">Elegí por cuánto tiempo va a ser handle de tu gimnasio si acepta.</p>
            ${durationFormMarkup("invite")}
            <div class="modal-actions">
              <button class="btn btn-primary" id="confirmInviteHandle" type="button">Enviar invitación</button>
              <button class="btn btn-outline" id="cancelInviteHandle" type="button">Cancelar</button>
            </div>
          </div>
        </div>
      `;
      document.getElementById("cancelInviteHandle")?.addEventListener("click", closeOverlay);
      wireDurationForm("invite");

      document.getElementById("confirmInviteHandle")?.addEventListener("click", async () => {
        const confirmBtn = document.getElementById("confirmInviteHandle") as HTMLButtonElement;
        const picked = readDurationForm("invite");
        if (!picked) {
          alert("Ingresá una cantidad de meses válida.");
          return;
        }
        confirmBtn.disabled = true;
        const { error } = await inviteGymTrainer(trainerId, picked.type, picked.months);
        if (error) {
          alert(error);
          closeOverlay();
          return;
        }
        showSuccessAndRefresh(`Invitación enviada a ${nombre}.`);
      });
    }

    inviteBtn.addEventListener("click", openInviteModal, { signal: ctx.signal });

    function renderList(rows: GymTrainerRow[], query: string): void {
      const emptyMessages: Record<ManageTab, { withQuery: string; empty: string }> = {
        pending: { withQuery: `Sin resultados para "${query}".`, empty: "No tenés solicitudes ni invitaciones pendientes." },
        active: { withQuery: `Sin resultados para "${query}".`, empty: "Todavía no tenés entrenadores. Aceptá una solicitud o invitá a uno." },
        ended: { withQuery: `Sin resultados para "${query}".`, empty: "Todavía no tenés handles históricos." },
      };
      const msgs = emptyMessages[activeTab];
      summaryEl.textContent = rows.length === 0 ? (query ? msgs.withQuery : msgs.empty) : `${rows.length} resultado${rows.length === 1 ? "" : "s"}.`;

      const markup = activeTab === "pending" ? pendingCardMarkup : activeTab === "active" ? activeCardMarkup : endedCardMarkup;
      listEl.innerHTML = rows.map(markup).join("");

      if (activeTab === "pending") {
        listEl.querySelectorAll<HTMLButtonElement>(".acceptHandleBtn").forEach((btn) => {
          btn.addEventListener("click", () => openAcceptModal(btn.dataset.id!, btn.dataset.nombre!));
        });
        listEl.querySelectorAll<HTMLButtonElement>(".rejectHandleBtn").forEach((btn) => {
          btn.addEventListener("click", () => confirmRejectHandle(btn.dataset.trainer!, btn.dataset.nombre!));
        });
      } else {
        wireHandleMenus(listEl as HTMLElement);
        listEl.querySelectorAll<HTMLButtonElement>(".removeHandleBtn").forEach((btn) => {
          btn.addEventListener("click", () => confirmRemoveHandle(btn.dataset.trainer!, btn.dataset.nombre!));
        });
        listEl.querySelectorAll<HTMLButtonElement>(".deleteHistoricHandleBtn").forEach((btn) => {
          btn.addEventListener("click", () => confirmDeleteHistoricHandle(btn.dataset.trainer!, btn.dataset.nombre!));
        });
      }
    }

    async function runSearch(query: string): Promise<void> {
      const myRequestId = ++requestId;
      summaryEl.textContent = "Cargando...";
      const statusFilter: TrainerStatusFilter = activeTab === "pending" ? "pending" : activeTab === "ended" ? "ended" : activeFilter;
      try {
        const rows = await listGymTrainers(myId, { search: query, statusFilter, sort: currentSort });
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
          const filter = btn.dataset.filter as TrainerStatusFilter;
          if (filter === activeFilter) return;
          activeFilter = filter;
          syncTabUi();
          void runSearch(searchInput.value.trim());
        },
        { signal: ctx.signal }
      );
    });

    wireCustomDropdown(
      "entrenadoresSortBtn",
      "entrenadoresSortPanel",
      [
        { value: "recent", label: "Más recientes primero" },
        { value: "oldest", label: "Más antiguos primero" },
      ],
      currentSort,
      (value) => {
        currentSort = value as TrainerSort;
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
