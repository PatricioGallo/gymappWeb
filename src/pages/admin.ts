import type { ViewModule } from "../shell/router";
import { navigate } from "../shell/router";
import { escapeHtml } from "../lib/dom";
import { formatFechaCorta } from "../lib/dias";
import { COUNTRIES } from "../lib/countries";
import {
  isCurrentUserAdmin,
  isCurrentUserStaff,
  getAdminSiteStats,
  getAdminDailyVisits,
  listAllUsersAdmin,
  updateUserAsAdmin,
  deleteUserAsAdmin,
  USER_TYPE_OPTIONS,
  USER_TYPE_LABELS,
  CONFIGURABLE_VERIFIED_TYPES,
  type AdminUserRow,
  type AdminDailyVisit,
  type UserType,
} from "../services/admin.service";
import { renderVerifiedBadge, getVerifiedBadgeColor } from "../lib/verifiedBadge";
import {
  listExercisesAdmin,
  addExercise,
  addBuiltinExercise,
  updateExercise,
  deleteExercise,
  uploadExerciseImage,
  validateNewExercise,
  EXERCISE_CATEGORIES,
  CATEGORY_LABELS,
  type AdminExerciseRow,
  type ExerciseCategory,
} from "../services/exercise.service";
import {
  listRoadmapTasks,
  addRoadmapTask,
  updateRoadmapTask,
  deleteRoadmapTask,
  validateRoadmapTask,
  ROADMAP_CATEGORIES,
  ROADMAP_CATEGORY_LABELS,
  ROADMAP_STATUS_OPTIONS,
  ROADMAP_STATUS_LABELS,
  type RoadmapTask,
  type RoadmapCategory,
  type RoadmapStatus,
} from "../services/roadmap.service";
import {
  listIssueReports,
  addIssueReport,
  updateIssueReport,
  deleteIssueReport,
  validateIssueReport,
  ISSUE_SEVERITY_OPTIONS,
  ISSUE_SEVERITY_LABELS,
  ISSUE_STATUS_OPTIONS,
  ISSUE_STATUS_LABELS,
  type IssueReport,
  type IssueReportWithReporter,
  type IssueSeverity,
  type IssueStatus,
} from "../services/issue.service";
import { adminSendNotification } from "../services/notification.service";
import {
  listVerificationRequestsAdmin,
  reviewVerificationRequest,
  getVerificationDocumentUrl,
  getPendingVerificationRequestCount,
  CREDENTIAL_TYPE_LABELS,
  CREDENTIAL_SPECIALTY_LABELS,
  CREDENTIAL_COMPLETION_STATUS_LABELS,
  type AdminVerificationRequestRow,
  type ApplicantType,
} from "../services/verification.service";
import {
  listContactMessages,
  markContactMessageRead,
  deleteContactMessage,
  getUnreadContactMessageCount,
  type ContactMessageWithReader,
} from "../services/contact.service";
import {
  listErrorReports,
  markErrorReportRead,
  deleteErrorReport,
  getUnreadErrorReportCount,
  type ErrorReportWithReporter,
} from "../services/errorReport.service";
import {
  listUserReports,
  markUserReportRead,
  deleteUserReport,
  getUnreadUserReportCount,
  type UserReportWithNames,
} from "../services/userReport.service";
import { loadChart } from "../lib/chartLoader";

const VIEW_MARKUP = `
  <section class="page-hero">
    <div class="container">
      <span class="eyebrow">Panel de administración</span>
      <h1>Administrar</h1>
      <p>Estadísticas generales de Gym Social y control total sobre los usuarios registrados.</p>
    </div>
  </section>

  <section class="features">
    <div class="container">
      <div class="routine-tabs" id="adminTabs">
        <button class="routine-tab active" data-tab="stats" type="button">Estadísticas</button>
        <button class="routine-tab" data-tab="users" type="button">Usuarios</button>
        <button class="routine-tab" data-tab="exercises" type="button">Ejercicios</button>
        <button class="routine-tab" data-tab="roadmap" type="button">Roadmap</button>
        <button class="routine-tab" data-tab="issues" type="button">Issues</button>
        <button class="routine-tab" data-tab="messages" type="button">Mensajes<span class="tab-dot" id="messagesTabDot" hidden></span></button>
        <button class="routine-tab" data-tab="validation" type="button">Validación<span class="tab-dot" id="validationTabDot" hidden></span></button>
        <button class="routine-tab" data-tab="notifs" type="button">Notificaciones</button>
      </div>

      <div id="statsTab"></div>
      <div id="usersTab" hidden></div>
      <div id="exercisesTab" hidden></div>
      <div id="roadmapTab" hidden></div>
      <div id="issuesTab" hidden></div>
      <div id="messagesTab" hidden></div>
      <div id="validationTab" hidden></div>
      <div id="notifsTab" hidden></div>
    </div>
  </section>
`;

export const adminView: ViewModule = {
  async mount(container, _params, ctx, authUserId) {
    const adminId = authUserId!; // la ruta se registra con requiresAuth:true

    if (!(await isCurrentUserStaff())) {
      navigate("profile.html");
      return;
    }

    container.innerHTML = VIEW_MARKUP;

    // Colaborador: mismo panel que admin, pero usuarios y roadmap son de solo lectura.
    const isAdmin = await isCurrentUserAdmin();

    let users: AdminUserRow[] = [];
    let statsLoaded = false;
    let usersLoaded = false;

    let exercises: AdminExerciseRow[] = [];
    let exercisesLoaded = false;
    let excAdminSubTab: "builtin" | "custom" = "builtin";

    let roadmapTasks: RoadmapTask[] = [];
    let roadmapLoaded = false;

    let issueReports: IssueReportWithReporter[] = [];
    let issuesLoaded = false;
    let issuesSubTab: "open" | "in_progress" | "blocked" | "closed" = "open";

    let contactMessages: ContactMessageWithReader[] = [];
    let contactMessagesLoaded = false;
    let errorReports: ErrorReportWithReporter[] = [];
    let errorReportsLoaded = false;
    let userReports: UserReportWithNames[] = [];
    let userReportsLoaded = false;
    let messagesSubTab: "contact" | "errors" | "users" = "contact";
    let messagesTabInitialized = false;
    let messagesSearchTerm = "";

    let verificationRequests: Record<ApplicantType, AdminVerificationRequestRow[]> = { entrenador: [], gimnasio: [] };
    let verificationLoadedFor: Record<ApplicantType, boolean> = { entrenador: false, gimnasio: false };
    let validationSubTab: ApplicantType = "entrenador";
    let validationTabInitialized = false;

    function formatDateTime(iso: string | null): string {
      if (!iso) return "—";
      return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }

    function formatDate(iso: string | null): string {
      if (!iso) return "—";
      return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    }

    // ---------- Tabs ----------

    function setupTabs(): void {
      const tabsWrap = container.querySelector("#adminTabs");
      const statsTab = container.querySelector("#statsTab")!;
      const usersTab = container.querySelector("#usersTab")!;
      const exercisesTab = container.querySelector("#exercisesTab")!;
      const roadmapTab = container.querySelector("#roadmapTab")!;
      const issuesTab = container.querySelector("#issuesTab")!;
      const messagesTab = container.querySelector("#messagesTab")!;
      const validationTab = container.querySelector("#validationTab")!;
      const notifsTab = container.querySelector("#notifsTab")!;
      if (!tabsWrap) return;

      tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((btn) => {
        btn.addEventListener(
          "click",
          async () => {
            tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((b) => b.classList.toggle("active", b === btn));
            btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
            const tab = btn.dataset.tab;
            (statsTab as HTMLElement).hidden = tab !== "stats";
            (usersTab as HTMLElement).hidden = tab !== "users";
            (exercisesTab as HTMLElement).hidden = tab !== "exercises";
            (roadmapTab as HTMLElement).hidden = tab !== "roadmap";
            (issuesTab as HTMLElement).hidden = tab !== "issues";
            (messagesTab as HTMLElement).hidden = tab !== "messages";
            (validationTab as HTMLElement).hidden = tab !== "validation";
            (notifsTab as HTMLElement).hidden = tab !== "notifs";
            if (tab === "stats" && !statsLoaded) {
              statsLoaded = true;
              await renderStatsTab();
            }
            if (tab === "users" && !usersLoaded) {
              usersLoaded = true;
              await loadUsers();
            }
            if (tab === "exercises" && !exercisesLoaded) {
              exercisesLoaded = true;
              await loadExercises();
            }
            if (tab === "roadmap" && !roadmapLoaded) {
              roadmapLoaded = true;
              await loadRoadmap();
            }
            if (tab === "issues" && !issuesLoaded) {
              issuesLoaded = true;
              await loadIssues();
            }
            if (tab === "messages" && !messagesTabInitialized) {
              messagesTabInitialized = true;
              await renderMessagesTab();
            }
            if (tab === "validation" && !validationTabInitialized) {
              validationTabInitialized = true;
              await renderValidationTab();
            }
            if (tab === "notifs") {
              if (!usersLoaded) {
                usersLoaded = true;
                await loadUsers();
              }
              renderNotifsTab();
            }
          },
          { signal: ctx.signal }
        );
      });
    }

    // ---------- Estadisticas ----------

    async function renderStatsTab(): Promise<void> {
      const statsTab = container.querySelector("#statsTab")!;
      statsTab.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando estadísticas...</p></div>`;

      const [stats, daily] = await Promise.all([getAdminSiteStats(), getAdminDailyVisits(14)]);
      if (!stats) {
        statsTab.innerHTML = `<p class="chart-sub">No se pudieron cargar las estadísticas.</p>`;
        return;
      }

      const byType = stats.users_by_type ?? {};
      statsTab.innerHTML = `
        <div class="card-grid">
          <div class="stat-card reveal"><div class="label">Usuarios registrados</div><div class="value">${stats.total_users}</div></div>
          <div class="stat-card reveal"><div class="label">Nuevos (30 días)</div><div class="value">${stats.new_users_last_30_days}</div></div>
          <div class="stat-card reveal"><div class="label">Rutinas creadas</div><div class="value">${stats.total_routines}</div></div>
          <div class="stat-card reveal"><div class="label">Rutinas activas</div><div class="value">${stats.active_routines}</div></div>
          <div class="stat-card reveal"><div class="label">Ejercicios en catálogo</div><div class="value">${stats.total_exercises}</div></div>
          <div class="stat-card reveal"><div class="label">Ejercicios de usuarios</div><div class="value">${stats.custom_exercises}</div></div>
          <div class="stat-card reveal"><div class="label">Pesos registrados</div><div class="value">${stats.total_weight_logs}</div></div>
          <div class="stat-card reveal"><div class="label">Visitas totales</div><div class="value">${stats.total_visits}</div></div>
          <div class="stat-card reveal"><div class="label">Visitas hoy</div><div class="value">${stats.visits_today}</div></div>
          <div class="stat-card reveal"><div class="label">Visitas (7 días)</div><div class="value">${stats.visits_last_7_days}</div></div>
          <div class="stat-card reveal"><div class="label">Última visita</div><div class="value" style="font-size:15px;">${formatDateTime(stats.last_visit_at)}</div></div>
        </div>

        <div class="chart-card reveal">
          <h3>Usuarios por rol</h3>
          <p class="chart-sub">Distribución de roles en toda la plataforma.</p>
          <div class="profile-badges">
            ${USER_TYPE_OPTIONS.map((t) => `<span class="profile-badge">${USER_TYPE_LABELS[t]}: ${byType[t] ?? 0}</span>`).join("")}
          </div>
        </div>

        <div class="chart-card reveal">
          <h3>Visitas por día</h3>
          <p class="chart-sub">Últimos 14 días.</p>
          <div class="chart-wrap"><canvas id="visitsChart"></canvas></div>
        </div>
      `;

      await renderVisitsChart(daily);
    }

    async function renderVisitsChart(daily: AdminDailyVisit[]): Promise<void> {
      const canvas = container.querySelector("#visitsChart") as HTMLCanvasElement | null;
      if (!canvas) return;
      const Chart = await loadChart();
      new Chart(canvas, {
        type: "bar",
        data: {
          labels: daily.map((d) => formatFechaCorta(d.day)),
          datasets: [{ label: "Visitas", data: daily.map((d) => d.count), backgroundColor: "#ff8a3d", borderRadius: 6, maxBarThickness: 34 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0, color: "#9aa1ac" }, grid: { color: "#262b33" } },
            x: { ticks: { color: "#9aa1ac" }, grid: { display: false } },
          },
        },
      });
    }

    // ---------- Usuarios ----------

    async function loadUsers(): Promise<void> {
      const usersTab = container.querySelector("#usersTab")!;
      usersTab.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando usuarios...</p></div>`;
      users = await listAllUsersAdmin();
      renderUsersTab("");
    }

    function renderUsersTab(filter: string): void {
      const usersTab = container.querySelector("#usersTab")!;
      const term = filter.trim().toLowerCase();
      const filtered = term
        ? users.filter((u) =>
            [u.username, u.nombre, u.apellido, u.email].some((field) => field.toLowerCase().includes(term))
          )
        : users;

      usersTab.innerHTML = `
        <input type="search" id="userSearch" class="exc-picker-search admin-search" placeholder="Buscar por nombre, usuario o mail..." value="${escapeHtml(filter)}">
        <div class="exc-table-scroll">
          <div class="admin-table-head">
            <span>Usuario</span><span>Rol</span><span>Rutinas</span><span>Registrado</span><span>Última conexión</span><span></span>
          </div>
          ${filtered
            .map(
              (u) => `
            <div class="admin-table-row admin-table-row-clickable" data-id="${u.id}" title="Ver perfil de @${escapeHtml(u.username)}">
              <span class="admin-user-cell">
                <strong>${escapeHtml(u.nombre)} ${escapeHtml(u.apellido)}${renderVerifiedBadge(u.user_type, u.is_verified)}</strong>
                <small>@${escapeHtml(u.username)} · ${escapeHtml(u.email)}</small>
              </span>
              <span class="profile-badge">${USER_TYPE_LABELS[u.user_type]}</span>
              <span>${u.routines_count}</span>
              <span>${formatDate(u.created_at)}</span>
              <span>${formatDateTime(u.last_sign_in_at)}</span>
              <span class="admin-row-actions">
                ${isAdmin ? `<button class="btn btn-outline btn-sm admin-edit-btn" type="button" data-id="${u.id}">Editar</button>` : ""}
                ${isAdmin && !["admin", "colaborador"].includes(u.user_type) ? `<button class="btn btn-danger btn-sm admin-delete-btn" type="button" data-id="${u.id}">Eliminar</button>` : ""}
              </span>
            </div>
          `
            )
            .join("") || `<p class="exc-pick-empty">No encontramos usuarios con ese criterio.</p>`}
        </div>
      `;

      container.querySelector("#userSearch")?.addEventListener("input", (e) => {
        renderUsersTab((e.target as HTMLInputElement).value);
      });

      usersTab.querySelectorAll<HTMLButtonElement>(".admin-edit-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          openEditUserModal(btn.dataset.id!);
        });
      });

      usersTab.querySelectorAll<HTMLButtonElement>(".admin-delete-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const user = users.find((u) => u.id === btn.dataset.id);
          if (user) openDeleteUserModal(user);
        });
      });

      usersTab.querySelectorAll<HTMLDivElement>(".admin-table-row-clickable").forEach((row) => {
        row.addEventListener("click", () => {
          const user = users.find((u) => u.id === row.dataset.id);
          if (user) navigate(`/${user.username}`);
        });
      });
    }

    function openEditUserModal(userId: string): void {
      const user = users.find((u) => u.id === userId);
      const loaderBody = document.getElementById("loaderBody");
      if (!user || !loaderBody) return;

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card modal-card-lg">
            <h2>Editar usuario</h2>
            <p class="subtitle">@${escapeHtml(user.username)} · ${escapeHtml(user.email)}</p>

            <div class="field-row">
              <div class="field"><label for="editNombre">Nombre</label><input type="text" id="editNombre" value="${escapeHtml(user.nombre)}"></div>
              <div class="field"><label for="editApellido">Apellido</label><input type="text" id="editApellido" value="${escapeHtml(user.apellido)}"></div>
            </div>
            <div class="field"><label for="editUsername">Nombre de usuario</label><input type="text" id="editUsername" value="${escapeHtml(user.username)}"></div>
            <div class="field-row">
              <div class="field"><label for="editBirthdate">Fecha de nacimiento</label><input type="date" id="editBirthdate" value="${user.fecha_nacimiento}"></div>
              <div class="field">
                <label for="editNationality">Nacionalidad</label>
                <select id="editNationality">
                  ${COUNTRIES.map((c) => `<option value="${escapeHtml(c)}" ${c === user.nacionalidad ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="field">
              <label for="editRole">Rol</label>
              <select id="editRole">
                ${USER_TYPE_OPTIONS.map((t) => `<option value="${t}" ${t === user.user_type ? "selected" : ""}>${USER_TYPE_LABELS[t]}</option>`).join("")}
              </select>
            </div>
            <div class="field" id="editVerifiedField"></div>

            <div class="alert_message" id="editUserAlert"></div>
            <div class="modal-actions">
              <button class="btn btn-primary" id="saveUserBtn" type="button">Guardar</button>
              <button class="btn btn-outline" id="closeEditUser" type="button">Cerrar</button>
            </div>
          </div>
        </div>
      `;

      function renderVerifiedField(userType: UserType, checked: boolean): void {
        const field = document.getElementById("editVerifiedField");
        if (!field) return;
        if (!CONFIGURABLE_VERIFIED_TYPES.includes(userType)) {
          const mandatoryColor = getVerifiedBadgeColor(userType, false);
          field.innerHTML = mandatoryColor
            ? `<p class="field-hint">Este rol tiene tilde ${mandatoryColor === "blue" ? "azul" : "verde"} obligatoria, no configurable.</p>`
            : `<p class="field-hint">Este rol no tiene tilde de verificación.</p>`;
          return;
        }
        const label =
          userType === "entrenador"
            ? "Tilde verde: presentó la papelería que certifica su actividad."
            : userType === "gimnasio"
              ? "Tilde verde: se validó la documentación del gimnasio."
              : "Tilde azul: cuenta reconocida/famosa.";
        field.innerHTML = `
          <div class="field-check">
            <input type="checkbox" id="editVerified" ${checked ? "checked" : ""}>
            <label for="editVerified">${escapeHtml(label)}</label>
          </div>
        `;
      }

      renderVerifiedField(user.user_type, user.is_verified);

      document.getElementById("editRole")?.addEventListener("change", (e) => {
        const userType = (e.target as HTMLSelectElement).value as UserType;
        const currentChecked = (document.getElementById("editVerified") as HTMLInputElement | null)?.checked ?? user.is_verified;
        renderVerifiedField(userType, currentChecked);
      });

      document.getElementById("closeEditUser")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });

      document.getElementById("saveUserBtn")?.addEventListener("click", async () => {
        const alertBox = document.getElementById("editUserAlert")!;
        alertBox.innerHTML = "";

        const nombre = (document.getElementById("editNombre") as HTMLInputElement).value.trim();
        const apellido = (document.getElementById("editApellido") as HTMLInputElement).value.trim();
        const username = (document.getElementById("editUsername") as HTMLInputElement).value.trim().toLowerCase();
        const fechaNacimiento = (document.getElementById("editBirthdate") as HTMLInputElement).value;
        const nacionalidad = (document.getElementById("editNationality") as HTMLSelectElement).value;
        const userType = (document.getElementById("editRole") as HTMLSelectElement).value as AdminUserRow["user_type"];
        const isVerified = CONFIGURABLE_VERIFIED_TYPES.includes(userType)
          ? ((document.getElementById("editVerified") as HTMLInputElement | null)?.checked ?? false)
          : user.is_verified;

        if (nombre.length < 2 || apellido.length < 2) {
          alertBox.innerHTML = "<p>Nombre o apellido inválidos.</p>";
          return;
        }
        if (!/^[a-z0-9_]{3,30}$/.test(username)) {
          alertBox.innerHTML = "<p>El nombre de usuario debe tener 3-30 caracteres: minúsculas, números o guion bajo.</p>";
          return;
        }

        const { error } = await updateUserAsAdmin(user.id, {
          nombre,
          apellido,
          username,
          fecha_nacimiento: fechaNacimiento,
          nacionalidad,
          user_type: userType,
          is_verified: isVerified,
        });

        if (error) {
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }

        Object.assign(user, { nombre, apellido, username, fecha_nacimiento: fechaNacimiento, nacionalidad, user_type: userType, is_verified: isVerified });
        loaderBody.innerHTML = "";
        renderUsersTab((container.querySelector("#userSearch") as HTMLInputElement | null)?.value ?? "");
      });
    }

    function openDeleteUserModal(user: AdminUserRow): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>¿Eliminar a @${escapeHtml(user.username)}?</h2>
            <p class="subtitle">Esta acción no se puede deshacer. Se van a borrar también sus rutinas, pesos registrados, notificaciones y relaciones de seguimiento.</p>
            <div class="alert_message" id="userDeleteAlert"></div>
            <div class="modal-actions">
              <button class="btn btn-outline" id="userDeleteCancel" type="button">Cancelar</button>
              <button class="btn btn-danger" id="userDeleteConfirm" type="button">Eliminar</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById("userDeleteCancel")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });

      document.getElementById("userDeleteConfirm")?.addEventListener("click", async () => {
        const alertBox = document.getElementById("userDeleteAlert")!;
        const confirmBtn = document.getElementById("userDeleteConfirm") as HTMLButtonElement;
        confirmBtn.disabled = true;

        const { error } = await deleteUserAsAdmin(user.id);
        if (error) {
          confirmBtn.disabled = false;
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }

        users = users.filter((u) => u.id !== user.id);
        loaderBody.innerHTML = "";
        renderUsersTab((container.querySelector("#userSearch") as HTMLInputElement | null)?.value ?? "");
      });
    }

    // ---------- Ejercicios ----------

    const DUMBBELL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7v10M18 7v10M2 9v6M22 9v6M6 12h12"/></svg>`;

    const EXC_ERROR_LABELS: Record<string, string> = {
      name_short: "Nombre del ejercicio muy corto.",
      name_long: "Nombre del ejercicio muy largo.",
      info_short: "Descripción del ejercicio muy corta (mínimo 100 caracteres).",
      info_long: "Descripción del ejercicio muy larga (máximo 600 caracteres).",
      category_missing: "Elegí una categoría para el ejercicio.",
    };

    let excSearchTerm = "";

    async function loadExercises(): Promise<void> {
      const exercisesTab = container.querySelector("#exercisesTab")!;
      exercisesTab.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando ejercicios...</p></div>`;
      exercises = await listExercisesAdmin();
      renderExercisesTab();
    }

    function renderExercisesTab(): void {
      const exercisesTab = container.querySelector("#exercisesTab")!;

      exercisesTab.innerHTML = `
        <div class="exc-admin-toolbar">
          <div class="exc-pick-chips" id="excAdminSubTabs">
            <button type="button" class="exc-pick-chip ${excAdminSubTab === "builtin" ? "active" : ""}" data-sub="builtin">Gym Social</button>
            <button type="button" class="exc-pick-chip ${excAdminSubTab === "custom" ? "active" : ""}" data-sub="custom">Creados por usuarios</button>
          </div>
          <button class="btn btn-primary btn-sm" id="excAdminAddBtn" type="button">+ Agregar ejercicio</button>
        </div>
        <input type="search" id="excAdminSearch" class="exc-picker-search admin-search" placeholder="Buscar ejercicio..." value="${escapeHtml(excSearchTerm)}">
        <div id="excAdminResults"></div>
      `;

      renderExerciseResults();

      container.querySelector("#excAdminSubTabs")?.addEventListener("click", (event) => {
        const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".exc-pick-chip");
        if (!btn) return;
        excAdminSubTab = btn.dataset.sub as "builtin" | "custom";
        renderExercisesTab();
      });

      container.querySelector("#excAdminSearch")?.addEventListener("input", (event) => {
        excSearchTerm = (event.target as HTMLInputElement).value;
        renderExerciseResults();
      });

      container.querySelector("#excAdminAddBtn")?.addEventListener("click", () => openExerciseFormModal(null));
    }

    function renderExerciseResults(): void {
      const resultsEl = container.querySelector("#excAdminResults");
      if (!resultsEl) return;

      const term = excSearchTerm.trim().toLowerCase();
      const scoped = exercises.filter((e) => (excAdminSubTab === "builtin" ? e.is_builtin : !e.is_builtin));
      const filtered = term ? scoped.filter((e) => e.name.toLowerCase().includes(term)) : scoped;

      const sections = EXERCISE_CATEGORIES.map((cat) => {
        const items = filtered.filter((e) => e.category === cat);
        if (items.length === 0) return "";
        return `
          <div class="exc-pick-section">
            <h4>${escapeHtml(CATEGORY_LABELS[cat])}</h4>
            <div class="exc-pick-grid">
              ${items
                .map(
                  (exc) => `
                <div class="exc-admin-card" data-id="${exc.id}">
                  <span class="exc-pick-thumb">${exc.image_url ? `<img src="${escapeHtml(exc.image_url)}" alt="" loading="lazy">` : DUMBBELL_ICON}</span>
                  <span class="exc-admin-name">${escapeHtml(exc.name)}</span>
                  ${exc.authorName ? `<span class="exc-admin-author">${escapeHtml(exc.authorName)}</span>` : ""}
                  <div class="exc-admin-actions">
                    <button type="button" class="exc-admin-edit" data-id="${exc.id}">Editar</button>
                    <button type="button" class="exc-admin-delete" data-id="${exc.id}">Eliminar</button>
                  </div>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        `;
      })
        .filter(Boolean)
        .join("");

      resultsEl.innerHTML = sections || `<p class="exc-pick-empty">No encontramos ejercicios con ese criterio.</p>`;

      resultsEl.querySelectorAll<HTMLButtonElement>(".exc-admin-edit").forEach((btn) => {
        btn.addEventListener("click", () => {
          const exc = exercises.find((e) => e.id === btn.dataset.id);
          if (exc) openExerciseFormModal(exc);
        });
      });
      resultsEl.querySelectorAll<HTMLButtonElement>(".exc-admin-delete").forEach((btn) => {
        btn.addEventListener("click", () => {
          const exc = exercises.find((e) => e.id === btn.dataset.id);
          if (exc) openDeleteExerciseModal(exc);
        });
      });
    }

    function openExerciseFormModal(existing: AdminExerciseRow | null): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;

      const isBuiltin = existing ? existing.is_builtin : excAdminSubTab === "builtin";
      const currentImageUrl = existing?.image_url ?? null;

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card modal-card-lg">
            <h2>${existing ? "Editar ejercicio" : "Agregar ejercicio"}</h2>
            <p class="subtitle">${isBuiltin ? "Ejercicio del catálogo de Gym Social." : "Ejercicio creado por un usuario."}</p>

            <div class="field"><label for="excFormName">Nombre</label><input type="text" id="excFormName" value="${escapeHtml(existing?.name ?? "")}"></div>
            <div class="field"><label for="excFormInfo">Descripción</label><textarea id="excFormInfo" rows="5">${escapeHtml(existing?.info ?? "")}</textarea></div>
            <div class="field">
              <label for="excFormCategory">Categoría</label>
              <select id="excFormCategory">
                ${EXERCISE_CATEGORIES.map((c) => `<option value="${c}" ${existing?.category === c ? "selected" : ""}>${escapeHtml(CATEGORY_LABELS[c])}</option>`).join("")}
              </select>
            </div>

            <div class="field">
              <label for="excFormImage">Imagen ilustrativa (opcional)</label>
              <div class="dropzone ${currentImageUrl ? "has-file" : ""}" id="excFormDropzone">
                <input type="file" id="excFormImage" accept="image/*" class="dropzone-input" aria-label="Imagen ilustrativa del ejercicio">
                <div class="dropzone-empty" id="excFormDropzoneEmpty" ${currentImageUrl ? "hidden" : ""}>
                  <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
                  <p><strong>Hacé clic para subir</strong> o arrastrá una imagen acá</p>
                  <span class="field-hint">JPG, PNG o WEBP · hasta 2MB</span>
                </div>
                <div class="dropzone-preview" id="excFormDropzonePreview" ${currentImageUrl ? "" : "hidden"}>
                  <img id="excFormDropzonePreviewImg" alt="" src="${currentImageUrl ? escapeHtml(currentImageUrl) : ""}">
                  <span class="dropzone-filename" id="excFormDropzoneFileName">${currentImageUrl ? "Imagen actual" : ""}</span>
                  <button type="button" class="dropzone-remove" id="excFormDropzoneRemove" title="Quitar imagen">×</button>
                </div>
              </div>
            </div>

            ${
              !isBuiltin
                ? `
            <div class="field">
              <label for="excFormPublic">Visibilidad</label>
              <select id="excFormPublic">
                <option value="true" ${existing?.is_public !== false ? "selected" : ""}>Público (cualquiera lo puede agregar a sus rutinas)</option>
                <option value="false" ${existing?.is_public === false ? "selected" : ""}>Privado (solo el autor)</option>
              </select>
            </div>`
                : ""
            }

            <div class="alert_message" id="excFormAlert"></div>
            <div class="modal-actions">
              <button class="btn btn-primary" id="excFormSave" type="button">Guardar</button>
              <button class="btn btn-outline" id="excFormClose" type="button">Cerrar</button>
            </div>
          </div>
        </div>
      `;

      let selectedFile: File | null = null;
      let imageRemoved = false;
      let objectUrl: string | null = null;

      const dropzone = document.getElementById("excFormDropzone");
      const imageInput = document.getElementById("excFormImage") as HTMLInputElement | null;
      const dzEmpty = document.getElementById("excFormDropzoneEmpty");
      const dzPreview = document.getElementById("excFormDropzonePreview");
      const dzPreviewImg = document.getElementById("excFormDropzonePreviewImg") as HTMLImageElement | null;
      const dzFileName = document.getElementById("excFormDropzoneFileName");

      function showPreview(file: File): void {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(file);
        if (dzPreviewImg) dzPreviewImg.src = objectUrl;
        if (dzFileName) dzFileName.textContent = file.name;
        dropzone?.classList.add("has-file");
        dzEmpty?.setAttribute("hidden", "");
        dzPreview?.removeAttribute("hidden");
        selectedFile = file;
        imageRemoved = false;
      }

      function clearPreview(): void {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
        if (imageInput) imageInput.value = "";
        dropzone?.classList.remove("has-file");
        dzPreview?.setAttribute("hidden", "");
        dzEmpty?.removeAttribute("hidden");
        selectedFile = null;
        imageRemoved = true;
      }

      imageInput?.addEventListener("change", () => {
        const file = imageInput.files?.[0];
        if (file) showPreview(file);
      });
      document.getElementById("excFormDropzoneRemove")?.addEventListener("click", clearPreview);
      dropzone?.addEventListener("dragover", (event) => {
        event.preventDefault();
        dropzone.classList.add("dragover");
      });
      dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
      dropzone?.addEventListener("drop", (event) => {
        event.preventDefault();
        dropzone.classList.remove("dragover");
        const file = event.dataTransfer?.files?.[0];
        if (file && imageInput) {
          imageInput.files = event.dataTransfer!.files;
          showPreview(file);
        }
      });

      document.getElementById("excFormClose")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });

      document.getElementById("excFormSave")?.addEventListener("click", async () => {
        const alertBox = document.getElementById("excFormAlert")!;
        alertBox.innerHTML = "";

        const name = (document.getElementById("excFormName") as HTMLInputElement).value.trim();
        const info = (document.getElementById("excFormInfo") as HTMLTextAreaElement).value.trim();
        const category = (document.getElementById("excFormCategory") as HTMLSelectElement).value;
        const isPublic = !isBuiltin ? (document.getElementById("excFormPublic") as HTMLSelectElement).value === "true" : false;

        const validationError = validateNewExercise(name, info, category);
        if (validationError) {
          alertBox.innerHTML = `<p>${escapeHtml(EXC_ERROR_LABELS[validationError])}</p>`;
          return;
        }

        let imageUrl: string | null = currentImageUrl;
        if (selectedFile) {
          const { url, error: uploadError } = await uploadExerciseImage(adminId, selectedFile);
          if (uploadError) {
            alertBox.innerHTML = `<p>${escapeHtml(uploadError)}</p>`;
            return;
          }
          imageUrl = url ?? null;
        } else if (imageRemoved) {
          imageUrl = null;
        }

        if (existing) {
          const { error } = await updateExercise(existing.id, {
            name,
            info,
            category: category as ExerciseCategory,
            image_url: imageUrl,
            ...(isBuiltin ? {} : { is_public: isPublic }),
          });
          if (error) {
            alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
            return;
          }
          Object.assign(existing, { name, info, category, image_url: imageUrl, ...(isBuiltin ? {} : { is_public: isPublic }) });
        } else {
          const { error } = isBuiltin
            ? await addBuiltinExercise(name, info, category as ExerciseCategory, imageUrl ?? undefined)
            : await addExercise(adminId, name, info, category as ExerciseCategory, isPublic, imageUrl ?? undefined);
          if (error) {
            alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
            return;
          }
          exercises = await listExercisesAdmin();
        }

        loaderBody.innerHTML = "";
        renderExerciseResults();
      });
    }

    function openDeleteExerciseModal(exc: AdminExerciseRow): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>¿Eliminar "${escapeHtml(exc.name)}"?</h2>
            <p class="subtitle">Esta acción no se puede deshacer. Si alguna rutina usa este ejercicio, no se va a poder eliminar hasta quitarlo de esa rutina.</p>
            <div class="alert_message" id="excDeleteAlert"></div>
            <div class="modal-actions">
              <button class="btn btn-outline" id="excDeleteCancel" type="button">Cancelar</button>
              <button class="btn btn-danger" id="excDeleteConfirm" type="button">Eliminar</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById("excDeleteCancel")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });

      document.getElementById("excDeleteConfirm")?.addEventListener("click", async () => {
        const alertBox = document.getElementById("excDeleteAlert")!;
        const { error } = await deleteExercise(exc.id);
        if (error) {
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }
        exercises = exercises.filter((e) => e.id !== exc.id);
        loaderBody.innerHTML = "";
        renderExerciseResults();
      });
    }

    // ---------- Roadmap ----------

    async function loadRoadmap(): Promise<void> {
      const roadmapTab = container.querySelector("#roadmapTab")!;
      roadmapTab.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando roadmap...</p></div>`;
      roadmapTasks = await listRoadmapTasks();
      renderRoadmapTab();
    }

    function renderRoadmapTab(): void {
      const roadmapTab = container.querySelector("#roadmapTab")!;

      const sections = ROADMAP_CATEGORIES.map((cat) => {
        const items = roadmapTasks.filter((t) => t.category === cat);
        const doneCount = items.filter((t) => t.status === "done").length;
        const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;

        return `
          <div class="roadmap-section reveal">
            <div class="roadmap-section-head">
              <div>
                <h3>${escapeHtml(ROADMAP_CATEGORY_LABELS[cat])}</h3>
                <p class="chart-sub">${doneCount}/${items.length} tareas hechas</p>
              </div>
              ${isAdmin ? `<button class="btn btn-outline btn-sm roadmap-add-btn" type="button" data-category="${cat}">+ Agregar tarea</button>` : ""}
            </div>
            <div class="roadmap-progress-bar"><div class="roadmap-progress-fill" style="width:${pct}%"></div></div>
            <div class="roadmap-tasks">
              ${
                items
                  .map(
                    (t) => `
                <div class="roadmap-task roadmap-status-${t.status}" data-id="${t.id}">
                  <input type="checkbox" class="roadmap-task-check" data-id="${t.id}" ${t.status === "done" ? "checked" : ""} ${isAdmin ? "" : "disabled"} aria-label="Marcar como hecha">
                  <div class="roadmap-task-body">
                    <span class="roadmap-task-title">${escapeHtml(t.title)}</span>
                    ${t.description ? `<p class="roadmap-task-desc">${escapeHtml(t.description)}</p>` : ""}
                  </div>
                  <select class="roadmap-task-status" data-id="${t.id}" aria-label="Estado de la tarea" ${isAdmin ? "" : "disabled"}>
                    ${ROADMAP_STATUS_OPTIONS.map((s) => `<option value="${s}" ${s === t.status ? "selected" : ""}>${ROADMAP_STATUS_LABELS[s]}</option>`).join("")}
                  </select>
                  ${
                    isAdmin
                      ? `<div class="roadmap-task-actions">
                    <button type="button" class="roadmap-task-edit" data-id="${t.id}">Editar</button>
                    <button type="button" class="roadmap-task-delete" data-id="${t.id}">Eliminar</button>
                  </div>`
                      : ""
                  }
                </div>
              `
                  )
                  .join("") || `<p class="exc-pick-empty">Todavía no hay tareas en esta categoría.</p>`
              }
            </div>
          </div>
        `;
      }).join("");

      roadmapTab.innerHTML = sections;

      roadmapTab.querySelectorAll<HTMLButtonElement>(".roadmap-add-btn").forEach((btn) => {
        btn.addEventListener("click", () => openRoadmapFormModal(null, btn.dataset.category as RoadmapCategory));
      });

      roadmapTab.querySelectorAll<HTMLInputElement>(".roadmap-task-check").forEach((cb) => {
        cb.addEventListener("change", async () => {
          const task = roadmapTasks.find((t) => t.id === cb.dataset.id);
          if (!task) return;
          const newStatus: RoadmapStatus = cb.checked ? "done" : "pending";
          cb.disabled = true;
          const { error } = await updateRoadmapTask(task.id, { status: newStatus });
          cb.disabled = false;
          if (error) {
            cb.checked = task.status === "done";
            return;
          }
          task.status = newStatus;
          renderRoadmapTab();
        });
      });

      roadmapTab.querySelectorAll<HTMLSelectElement>(".roadmap-task-status").forEach((sel) => {
        sel.addEventListener("change", async () => {
          const task = roadmapTasks.find((t) => t.id === sel.dataset.id);
          if (!task) return;
          const newStatus = sel.value as RoadmapStatus;
          sel.disabled = true;
          const { error } = await updateRoadmapTask(task.id, { status: newStatus });
          sel.disabled = false;
          if (error) {
            sel.value = task.status;
            return;
          }
          task.status = newStatus;
          renderRoadmapTab();
        });
      });

      roadmapTab.querySelectorAll<HTMLButtonElement>(".roadmap-task-edit").forEach((btn) => {
        btn.addEventListener("click", () => {
          const task = roadmapTasks.find((t) => t.id === btn.dataset.id);
          if (task) openRoadmapFormModal(task, task.category as RoadmapCategory);
        });
      });

      roadmapTab.querySelectorAll<HTMLButtonElement>(".roadmap-task-delete").forEach((btn) => {
        btn.addEventListener("click", () => {
          const task = roadmapTasks.find((t) => t.id === btn.dataset.id);
          if (task) openDeleteRoadmapModal(task);
        });
      });
    }

    function openRoadmapFormModal(existing: RoadmapTask | null, defaultCategory: RoadmapCategory): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card modal-card-lg">
            <h2>${existing ? "Editar tarea" : "Agregar tarea"}</h2>

            <div class="field">
              <label for="roadmapFormCategory">Categoría</label>
              <select id="roadmapFormCategory">
                ${ROADMAP_CATEGORIES.map((c) => `<option value="${c}" ${(existing?.category ?? defaultCategory) === c ? "selected" : ""}>${escapeHtml(ROADMAP_CATEGORY_LABELS[c])}</option>`).join("")}
              </select>
            </div>
            <div class="field"><label for="roadmapFormTitle">Título</label><input type="text" id="roadmapFormTitle" value="${escapeHtml(existing?.title ?? "")}"></div>
            <div class="field"><label for="roadmapFormDesc">Descripción (opcional)</label><textarea id="roadmapFormDesc" rows="4">${escapeHtml(existing?.description ?? "")}</textarea></div>
            <div class="field">
              <label for="roadmapFormStatus">Estado</label>
              <select id="roadmapFormStatus">
                ${ROADMAP_STATUS_OPTIONS.map((s) => `<option value="${s}" ${(existing?.status ?? "pending") === s ? "selected" : ""}>${ROADMAP_STATUS_LABELS[s]}</option>`).join("")}
              </select>
            </div>

            <div class="alert_message" id="roadmapFormAlert"></div>
            <div class="modal-actions">
              <button class="btn btn-primary" id="roadmapFormSave" type="button">Guardar</button>
              <button class="btn btn-outline" id="roadmapFormClose" type="button">Cerrar</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById("roadmapFormClose")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });

      document.getElementById("roadmapFormSave")?.addEventListener("click", async () => {
        const alertBox = document.getElementById("roadmapFormAlert")!;
        alertBox.innerHTML = "";

        const category = (document.getElementById("roadmapFormCategory") as HTMLSelectElement).value as RoadmapCategory;
        const title = (document.getElementById("roadmapFormTitle") as HTMLInputElement).value.trim();
        const description = (document.getElementById("roadmapFormDesc") as HTMLTextAreaElement).value.trim();
        const status = (document.getElementById("roadmapFormStatus") as HTMLSelectElement).value as RoadmapStatus;

        const validationError = validateRoadmapTask(title);
        if (validationError) {
          alertBox.innerHTML = `<p>${validationError === "title_short" ? "El título es muy corto." : "El título es muy largo."}</p>`;
          return;
        }

        if (existing) {
          const { error } = await updateRoadmapTask(existing.id, { category, title, description: description || null, status });
          if (error) {
            alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
            return;
          }
          Object.assign(existing, { category, title, description: description || null, status });
        } else {
          const { error } = await addRoadmapTask(adminId, category, title, description, status);
          if (error) {
            alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
            return;
          }
          roadmapTasks = await listRoadmapTasks();
        }

        loaderBody.innerHTML = "";
        renderRoadmapTab();
      });
    }

    function openDeleteRoadmapModal(task: RoadmapTask): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>¿Eliminar "${escapeHtml(task.title)}"?</h2>
            <p class="subtitle">Esta acción no se puede deshacer.</p>
            <div class="alert_message" id="roadmapDeleteAlert"></div>
            <div class="modal-actions">
              <button class="btn btn-outline" id="roadmapDeleteCancel" type="button">Cancelar</button>
              <button class="btn btn-danger" id="roadmapDeleteConfirm" type="button">Eliminar</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById("roadmapDeleteCancel")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });

      document.getElementById("roadmapDeleteConfirm")?.addEventListener("click", async () => {
        const alertBox = document.getElementById("roadmapDeleteAlert")!;
        const { error } = await deleteRoadmapTask(task.id);
        if (error) {
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }
        roadmapTasks = roadmapTasks.filter((t) => t.id !== task.id);
        loaderBody.innerHTML = "";
        renderRoadmapTab();
      });
    }

    // ---------- Issues ----------

    async function loadIssues(): Promise<void> {
      const issuesTab = container.querySelector("#issuesTab")!;
      issuesTab.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando issues...</p></div>`;
      issueReports = await listIssueReports();
      renderIssuesTab();
    }

    const ISSUE_SEVERITY_RANK: Record<IssueSeverity, number> = { high: 3, medium: 2, low: 1 };

    function sortIssuesByPriority(list: IssueReportWithReporter[]): IssueReportWithReporter[] {
      return [...list].sort((a, b) => {
        const rankDiff = ISSUE_SEVERITY_RANK[b.severity as IssueSeverity] - ISSUE_SEVERITY_RANK[a.severity as IssueSeverity];
        if (rankDiff !== 0) return rankDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }

    function renderIssuesTab(): void {
      const issuesTab = container.querySelector("#issuesTab")!;
      const openIssues = sortIssuesByPriority(issueReports.filter((i) => i.status === "open"));
      const inProgressIssues = sortIssuesByPriority(issueReports.filter((i) => i.status === "in_progress"));
      const blockedIssues = sortIssuesByPriority(issueReports.filter((i) => i.status === "blocked"));
      const closedIssues = sortIssuesByPriority(issueReports.filter((i) => i.status === "resolved"));
      const activeList =
        issuesSubTab === "open"
          ? openIssues
          : issuesSubTab === "in_progress"
            ? inProgressIssues
            : issuesSubTab === "blocked"
              ? blockedIssues
              : closedIssues;

      issuesTab.innerHTML = `
        <div class="exc-admin-toolbar">
          <div>
            <h3>Issues reportados</h3>
            <p class="chart-sub">${openIssues.length + inProgressIssues.length + blockedIssues.length} sin resolver de ${issueReports.length} en total.</p>
          </div>
          <button class="btn btn-primary btn-sm" id="issueAddBtn" type="button">+ Reportar issue</button>
        </div>
        <div class="exc-pick-chips" id="issuesSubTabs">
          <button type="button" class="exc-pick-chip ${issuesSubTab === "open" ? "active" : ""}" data-sub="open">Abiertas (${openIssues.length})</button>
          <button type="button" class="exc-pick-chip ${issuesSubTab === "in_progress" ? "active" : ""}" data-sub="in_progress">En progreso (${inProgressIssues.length})</button>
          <button type="button" class="exc-pick-chip ${issuesSubTab === "blocked" ? "active" : ""}" data-sub="blocked">Bloqueadas (${blockedIssues.length})</button>
          <button type="button" class="exc-pick-chip ${issuesSubTab === "closed" ? "active" : ""}" data-sub="closed">Cerradas (${closedIssues.length})</button>
        </div>
        <div class="roadmap-tasks">
          ${
            activeList
              .map(
                (i) => `
            <div class="roadmap-task issue-severity-${i.severity} roadmap-status-${i.status === "resolved" ? "done" : i.status}" data-id="${i.id}">
              <span class="issue-severity-badge issue-severity-badge-${i.severity}">${ISSUE_SEVERITY_LABELS[i.severity as IssueSeverity]}</span>
              <div class="roadmap-task-body">
                <span class="roadmap-task-title">${escapeHtml(i.title)}</span>
                ${i.reporterName ? `<p class="roadmap-task-desc"><strong>Reportado por:</strong> ${escapeHtml(i.reporterName)}</p>` : ""}
                ${i.page ? `<p class="roadmap-task-desc"><strong>Pantalla:</strong> ${escapeHtml(i.page)}</p>` : ""}
                ${i.description ? `<p class="roadmap-task-desc">${escapeHtml(i.description)}</p>` : ""}
              </div>
              <select class="roadmap-task-status issue-status-select" data-id="${i.id}" aria-label="Estado del issue">
                ${ISSUE_STATUS_OPTIONS.map((s) => `<option value="${s}" ${s === i.status ? "selected" : ""}>${ISSUE_STATUS_LABELS[s]}</option>`).join("")}
              </select>
              <div class="roadmap-task-actions">
                <button type="button" class="issue-edit" data-id="${i.id}">Editar</button>
                <button type="button" class="issue-delete" data-id="${i.id}">Eliminar</button>
              </div>
            </div>
          `
              )
              .join("") ||
            `<p class="exc-pick-empty">${
              issuesSubTab === "open"
                ? "No hay issues abiertos. ¡Buena señal!"
                : issuesSubTab === "in_progress"
                  ? "No hay issues en progreso."
                  : issuesSubTab === "blocked"
                    ? "No hay issues bloqueados."
                    : "Todavía no hay issues cerrados."
            }</p>`
          }
        </div>
      `;

      container.querySelector("#issueAddBtn")?.addEventListener("click", () => openIssueFormModal(null));

      container.querySelector("#issuesSubTabs")?.addEventListener("click", (event) => {
        const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".exc-pick-chip");
        if (!btn) return;
        issuesSubTab = btn.dataset.sub as "open" | "in_progress" | "blocked" | "closed";
        renderIssuesTab();
      });

      issuesTab.querySelectorAll<HTMLSelectElement>(".issue-status-select").forEach((sel) => {
        sel.addEventListener("change", async () => {
          const issue = issueReports.find((i) => i.id === sel.dataset.id);
          if (!issue) return;
          const newStatus = sel.value as IssueStatus;
          sel.disabled = true;
          const { error } = await updateIssueReport(issue.id, { status: newStatus });
          sel.disabled = false;
          if (error) {
            sel.value = issue.status;
            return;
          }
          issue.status = newStatus;
          renderIssuesTab();
        });
      });

      issuesTab.querySelectorAll<HTMLButtonElement>(".issue-edit").forEach((btn) => {
        btn.addEventListener("click", () => {
          const issue = issueReports.find((i) => i.id === btn.dataset.id);
          if (issue) openIssueFormModal(issue);
        });
      });

      issuesTab.querySelectorAll<HTMLButtonElement>(".issue-delete").forEach((btn) => {
        btn.addEventListener("click", () => {
          const issue = issueReports.find((i) => i.id === btn.dataset.id);
          if (issue) openDeleteIssueModal(issue);
        });
      });
    }

    function openIssueFormModal(existing: IssueReport | null): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card modal-card-lg">
            <h2>${existing ? "Editar issue" : "Reportar issue"}</h2>

            <div class="field"><label for="issueFormTitle">Título</label><input type="text" id="issueFormTitle" value="${escapeHtml(existing?.title ?? "")}" placeholder="Ej: El botón de guardar no responde"></div>
            <div class="field"><label for="issueFormPage">Pantalla / sección (opcional)</label><input type="text" id="issueFormPage" value="${escapeHtml(existing?.page ?? "")}" placeholder="Ej: Pantalla de rutinas"></div>
            <div class="field"><label for="issueFormDesc">Descripción (opcional)</label><textarea id="issueFormDesc" rows="4">${escapeHtml(existing?.description ?? "")}</textarea></div>
            <div class="field">
              <label for="issueFormSeverity">Severidad</label>
              <select id="issueFormSeverity">
                ${ISSUE_SEVERITY_OPTIONS.map((s) => `<option value="${s}" ${(existing?.severity ?? "medium") === s ? "selected" : ""}>${ISSUE_SEVERITY_LABELS[s]}</option>`).join("")}
              </select>
            </div>

            <div class="alert_message" id="issueFormAlert"></div>
            <div class="modal-actions">
              <button class="btn btn-primary" id="issueFormSave" type="button">Guardar</button>
              <button class="btn btn-outline" id="issueFormClose" type="button">Cerrar</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById("issueFormClose")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });

      document.getElementById("issueFormSave")?.addEventListener("click", async () => {
        const alertBox = document.getElementById("issueFormAlert")!;
        alertBox.innerHTML = "";

        const title = (document.getElementById("issueFormTitle") as HTMLInputElement).value.trim();
        const page = (document.getElementById("issueFormPage") as HTMLInputElement).value.trim();
        const description = (document.getElementById("issueFormDesc") as HTMLTextAreaElement).value.trim();
        const severity = (document.getElementById("issueFormSeverity") as HTMLSelectElement).value as IssueSeverity;

        const validationError = validateIssueReport(title);
        if (validationError) {
          alertBox.innerHTML = `<p>${validationError === "title_short" ? "El título es muy corto." : "El título es muy largo."}</p>`;
          return;
        }

        const saveBtn = document.getElementById("issueFormSave") as HTMLButtonElement;
        const closeBtn = document.getElementById("issueFormClose") as HTMLButtonElement;
        const originalLabel = saveBtn.innerHTML;
        saveBtn.disabled = true;
        closeBtn.disabled = true;
        saveBtn.innerHTML = `<span class="btn-spinner"></span> Guardando...`;

        if (existing) {
          const { error } = await updateIssueReport(existing.id, { title, page: page || null, description: description || null, severity });
          if (error) {
            saveBtn.disabled = false;
            closeBtn.disabled = false;
            saveBtn.innerHTML = originalLabel;
            alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
            return;
          }
          Object.assign(existing, { title, page: page || null, description: description || null, severity });
        } else {
          const { error } = await addIssueReport(adminId, title, description, page, severity);
          if (error) {
            saveBtn.disabled = false;
            closeBtn.disabled = false;
            saveBtn.innerHTML = originalLabel;
            alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
            return;
          }
          issueReports = await listIssueReports();
        }

        loaderBody.innerHTML = "";
        renderIssuesTab();
      });
    }

    function openDeleteIssueModal(issue: IssueReport): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>¿Eliminar "${escapeHtml(issue.title)}"?</h2>
            <p class="subtitle">Esta acción no se puede deshacer.</p>
            <div class="alert_message" id="issueDeleteAlert"></div>
            <div class="modal-actions">
              <button class="btn btn-outline" id="issueDeleteCancel" type="button">Cancelar</button>
              <button class="btn btn-danger" id="issueDeleteConfirm" type="button">Eliminar</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById("issueDeleteCancel")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });

      document.getElementById("issueDeleteConfirm")?.addEventListener("click", async () => {
        const alertBox = document.getElementById("issueDeleteAlert")!;
        const { error } = await deleteIssueReport(issue.id);
        if (error) {
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }
        issueReports = issueReports.filter((i) => i.id !== issue.id);
        loaderBody.innerHTML = "";
        renderIssuesTab();
      });
    }

    // ---------- Mensajes (contacto / reporte de errores / reporte de usuarios) ----------

    function setMessagesDot(hasUnread: boolean): void {
      const tabDot = container.querySelector("#messagesTabDot") as HTMLElement | null;
      if (tabDot) tabDot.hidden = !hasUnread;
      void refreshAdminLinkDot();
    }

    function setChipDot(id: string, hasUnread: boolean): void {
      const dot = container.querySelector(`#${id}`) as HTMLElement | null;
      if (dot) dot.hidden = !hasUnread;
    }

    /** Punto naranja junto a "Administrar" en el nav: es la union de mensajes sin leer y validaciones pendientes, asi que no lo puede pisar un solo refresh parcial. Vive en el chrome persistente del shell, fuera del container de esta vista. */
    async function refreshAdminLinkDot(): Promise<void> {
      const navDot = document.getElementById("adminLinkDot");
      if (!navDot) return;
      try {
        const [contactUnread, errorUnread, userUnread, pendingVerifications] = await Promise.all([
          getUnreadContactMessageCount(),
          getUnreadErrorReportCount(),
          getUnreadUserReportCount(),
          getPendingVerificationRequestCount(),
        ]);
        navDot.hidden = contactUnread + errorUnread + userUnread + pendingVerifications <= 0;
      } catch {
        // silencioso: el punto simplemente no se actualiza en este ciclo
      }
    }

    async function refreshMessagesDot(): Promise<void> {
      try {
        const [contactUnread, errorUnread, userUnread] = await Promise.all([
          getUnreadContactMessageCount(),
          getUnreadErrorReportCount(),
          getUnreadUserReportCount(),
        ]);
        setMessagesDot(contactUnread + errorUnread + userUnread > 0);
        setChipDot("msgDotContact", contactUnread > 0);
        setChipDot("msgDotErrors", errorUnread > 0);
        setChipDot("msgDotUsers", userUnread > 0);
      } catch {
        // silencioso: el punto simplemente no se actualiza en este ciclo
      }
    }

    const MESSAGES_SEARCH_PLACEHOLDER: Record<"contact" | "errors" | "users", string> = {
      contact: "Buscar por nombre, mail o mensaje...",
      errors: "Buscar por usuario, asunto o mensaje...",
      users: "Buscar por usuario o motivo...",
    };

    async function renderMessagesTab(): Promise<void> {
      const messagesTab = container.querySelector("#messagesTab")!;

      messagesTab.innerHTML = `
        <div class="exc-pick-chips" id="messagesSubTabs">
          <button type="button" class="exc-pick-chip ${messagesSubTab === "contact" ? "active" : ""}" data-sub="contact">Contacto<span class="nav-dot" id="msgDotContact" hidden></span></button>
          <button type="button" class="exc-pick-chip ${messagesSubTab === "errors" ? "active" : ""}" data-sub="errors">Reporte de errores<span class="nav-dot" id="msgDotErrors" hidden></span></button>
          <button type="button" class="exc-pick-chip ${messagesSubTab === "users" ? "active" : ""}" data-sub="users">Reporte de usuarios<span class="nav-dot" id="msgDotUsers" hidden></span></button>
        </div>
        <input type="search" id="messagesSearch" class="exc-picker-search admin-search" placeholder="${MESSAGES_SEARCH_PLACEHOLDER[messagesSubTab]}" value="${escapeHtml(messagesSearchTerm)}">
        <div id="messagesResults"></div>
      `;

      container.querySelector("#messagesSubTabs")?.addEventListener("click", (event) => {
        const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".exc-pick-chip");
        if (!btn) return;
        messagesSubTab = btn.dataset.sub as "contact" | "errors" | "users";
        messagesSearchTerm = "";
        void renderMessagesTab();
      });

      container.querySelector("#messagesSearch")?.addEventListener("input", (event) => {
        messagesSearchTerm = (event.target as HTMLInputElement).value;
        void renderMessagesResults();
      });

      await renderMessagesResults();
    }

    async function renderMessagesResults(): Promise<void> {
      const resultsEl = container.querySelector("#messagesResults") as HTMLElement | null;
      if (!resultsEl) return;

      if (messagesSubTab === "contact") {
        if (!contactMessagesLoaded) {
          resultsEl.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando mensajes...</p></div>`;
          contactMessages = await listContactMessages();
          contactMessagesLoaded = true;
        }
        renderContactList(resultsEl);
      } else if (messagesSubTab === "errors") {
        if (!errorReportsLoaded) {
          resultsEl.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando reportes...</p></div>`;
          errorReports = await listErrorReports();
          errorReportsLoaded = true;
        }
        renderErrorReportsList(resultsEl);
      } else {
        if (!userReportsLoaded) {
          resultsEl.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando reportes...</p></div>`;
          userReports = await listUserReports();
          userReportsLoaded = true;
        }
        renderUserReportsList(resultsEl);
      }

      void refreshMessagesDot();
    }

    function renderContactList(resultsEl: HTMLElement): void {
      const unreadCount = contactMessages.filter((m) => !m.is_read).length;
      const term = messagesSearchTerm.trim().toLowerCase();
      const filtered = term ? contactMessages.filter((m) => [m.name, m.email, m.message].some((f) => f.toLowerCase().includes(term))) : contactMessages;

      resultsEl.innerHTML = `
        <div class="exc-admin-toolbar">
          <div>
            <h3>Mensajes de contacto</h3>
            <p class="chart-sub">${unreadCount} sin leer de ${contactMessages.length} en total.</p>
          </div>
        </div>
        <div class="roadmap-tasks">
          ${
            filtered
              .map(
                (m) => `
            <div class="roadmap-task roadmap-status-${m.is_read ? "done" : "pending"}" data-id="${m.id}">
              <div class="roadmap-task-body">
                <span class="roadmap-task-title">${escapeHtml(m.name)} · ${escapeHtml(m.email)}</span>
                <p class="roadmap-task-desc">${escapeHtml(m.message)}</p>
                <p class="roadmap-task-desc"><strong>Recibido:</strong> ${formatDateTime(m.created_at)}</p>
                ${m.is_read && m.readByName ? `<p class="roadmap-task-desc"><strong>Leído por:</strong> @${escapeHtml(m.readByName)}</p>` : ""}
              </div>
              <div class="roadmap-task-actions">
                <button type="button" class="message-toggle-read" data-id="${m.id}">${m.is_read ? "Marcar no leído" : "Marcar leído"}</button>
                <button type="button" class="message-delete" data-id="${m.id}">Eliminar</button>
              </div>
            </div>
          `
              )
              .join("") || `<p class="exc-pick-empty">${term ? "No encontramos mensajes con ese criterio." : "Todavía no llegó ningún mensaje."}</p>`
          }
        </div>
      `;

      resultsEl.querySelectorAll<HTMLButtonElement>(".message-toggle-read").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const msg = contactMessages.find((m) => m.id === btn.dataset.id);
          if (!msg) return;
          const newRead = !msg.is_read;
          btn.disabled = true;
          const { error } = await markContactMessageRead(msg.id, newRead, newRead ? adminId : null);
          btn.disabled = false;
          if (error) return;
          contactMessages = await listContactMessages();
          renderContactList(resultsEl);
          void refreshMessagesDot();
        });
      });

      resultsEl.querySelectorAll<HTMLButtonElement>(".message-delete").forEach((btn) => {
        btn.addEventListener("click", () => {
          const msg = contactMessages.find((m) => m.id === btn.dataset.id);
          if (msg) openDeleteMessageModal(msg);
        });
      });
    }

    function openDeleteMessageModal(msg: ContactMessageWithReader): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>¿Eliminar este mensaje?</h2>
            <p class="subtitle">De ${escapeHtml(msg.name)} (${escapeHtml(msg.email)}). Esta acción no se puede deshacer.</p>
            <div class="alert_message" id="messageDeleteAlert"></div>
            <div class="modal-actions">
              <button class="btn btn-outline" id="messageDeleteCancel" type="button">Cancelar</button>
              <button class="btn btn-danger" id="messageDeleteConfirm" type="button">Eliminar</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById("messageDeleteCancel")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });

      document.getElementById("messageDeleteConfirm")?.addEventListener("click", async () => {
        const alertBox = document.getElementById("messageDeleteAlert")!;
        const { error } = await deleteContactMessage(msg.id);
        if (error) {
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }
        contactMessages = contactMessages.filter((m) => m.id !== msg.id);
        loaderBody.innerHTML = "";
        void renderMessagesResults();
      });
    }

    function renderErrorReportsList(resultsEl: HTMLElement): void {
      const unreadCount = errorReports.filter((r) => !r.is_read).length;
      const term = messagesSearchTerm.trim().toLowerCase();
      const filtered = term
        ? errorReports.filter((r) => [r.subject, r.message ?? "", r.reporterName ?? "", r.page ?? ""].some((f) => f.toLowerCase().includes(term)))
        : errorReports;

      resultsEl.innerHTML = `
        <div class="exc-admin-toolbar">
          <div>
            <h3>Reportes de error</h3>
            <p class="chart-sub">${unreadCount} sin leer de ${errorReports.length} en total.</p>
          </div>
        </div>
        <div class="roadmap-tasks">
          ${
            filtered
              .map(
                (r) => `
            <div class="roadmap-task roadmap-status-${r.is_read ? "done" : "pending"}" data-id="${r.id}">
              <div class="roadmap-task-body">
                <span class="roadmap-task-title">${escapeHtml(r.subject)}</span>
                ${r.reporterName ? `<p class="roadmap-task-desc"><strong>Reportado por:</strong> @${escapeHtml(r.reporterName)}</p>` : ""}
                ${r.page ? `<p class="roadmap-task-desc"><strong>Pantalla:</strong> ${escapeHtml(r.page)}</p>` : ""}
                ${r.message ? `<p class="roadmap-task-desc">${escapeHtml(r.message)}</p>` : ""}
                <p class="roadmap-task-desc"><strong>Recibido:</strong> ${formatDateTime(r.created_at)}</p>
                ${r.is_read && r.readByName ? `<p class="roadmap-task-desc"><strong>Leído por:</strong> @${escapeHtml(r.readByName)}</p>` : ""}
              </div>
              <div class="roadmap-task-actions">
                <button type="button" class="error-toggle-read" data-id="${r.id}">${r.is_read ? "Marcar no leído" : "Marcar leído"}</button>
                <button type="button" class="error-delete" data-id="${r.id}">Eliminar</button>
              </div>
            </div>
          `
              )
              .join("") || `<p class="exc-pick-empty">${term ? "No encontramos reportes con ese criterio." : "Todavía no llegó ningún reporte de error."}</p>`
          }
        </div>
      `;

      resultsEl.querySelectorAll<HTMLButtonElement>(".error-toggle-read").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const report = errorReports.find((r) => r.id === btn.dataset.id);
          if (!report) return;
          const newRead = !report.is_read;
          btn.disabled = true;
          const { error } = await markErrorReportRead(report.id, newRead, newRead ? adminId : null);
          btn.disabled = false;
          if (error) return;
          errorReports = await listErrorReports();
          renderErrorReportsList(resultsEl);
          void refreshMessagesDot();
        });
      });

      resultsEl.querySelectorAll<HTMLButtonElement>(".error-delete").forEach((btn) => {
        btn.addEventListener("click", () => {
          const report = errorReports.find((r) => r.id === btn.dataset.id);
          if (report) openDeleteErrorReportModal(report);
        });
      });
    }

    function openDeleteErrorReportModal(report: ErrorReportWithReporter): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>¿Eliminar "${escapeHtml(report.subject)}"?</h2>
            <p class="subtitle">Esta acción no se puede deshacer.</p>
            <div class="alert_message" id="errorDeleteAlert"></div>
            <div class="modal-actions">
              <button class="btn btn-outline" id="errorDeleteCancel" type="button">Cancelar</button>
              <button class="btn btn-danger" id="errorDeleteConfirm" type="button">Eliminar</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById("errorDeleteCancel")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });

      document.getElementById("errorDeleteConfirm")?.addEventListener("click", async () => {
        const alertBox = document.getElementById("errorDeleteAlert")!;
        const { error } = await deleteErrorReport(report.id);
        if (error) {
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }
        errorReports = errorReports.filter((r) => r.id !== report.id);
        loaderBody.innerHTML = "";
        void renderMessagesResults();
      });
    }

    function renderUserReportsList(resultsEl: HTMLElement): void {
      const unreadCount = userReports.filter((r) => !r.is_read).length;
      const term = messagesSearchTerm.trim().toLowerCase();
      const filtered = term
        ? userReports.filter((r) => [r.reporterName ?? "", r.reportedName ?? "", r.reason].some((f) => f.toLowerCase().includes(term)))
        : userReports;

      resultsEl.innerHTML = `
        <div class="exc-admin-toolbar">
          <div>
            <h3>Reportes de usuarios</h3>
            <p class="chart-sub">${unreadCount} sin leer de ${userReports.length} en total.</p>
          </div>
        </div>
        <div class="roadmap-tasks">
          ${
            filtered
              .map(
                (r) => `
            <div class="roadmap-task roadmap-status-${r.is_read ? "done" : "pending"}" data-id="${r.id}">
              <div class="roadmap-task-body">
                <span class="roadmap-task-title">@${escapeHtml(r.reporterName ?? "usuario eliminado")} reportó a @${escapeHtml(r.reportedName ?? "usuario eliminado")}</span>
                <p class="roadmap-task-desc">${escapeHtml(r.reason)}</p>
                <p class="roadmap-task-desc"><strong>Recibido:</strong> ${formatDateTime(r.created_at)}</p>
                ${r.is_read && r.readByName ? `<p class="roadmap-task-desc"><strong>Leído por:</strong> @${escapeHtml(r.readByName)}</p>` : ""}
              </div>
              <div class="roadmap-task-actions">
                <button type="button" class="user-report-toggle-read" data-id="${r.id}">${r.is_read ? "Marcar no leído" : "Marcar leído"}</button>
                <button type="button" class="user-report-delete" data-id="${r.id}">Eliminar</button>
              </div>
            </div>
          `
              )
              .join("") || `<p class="exc-pick-empty">${term ? "No encontramos reportes con ese criterio." : "Todavía no llegó ningún reporte de usuario."}</p>`
          }
        </div>
      `;

      resultsEl.querySelectorAll<HTMLButtonElement>(".user-report-toggle-read").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const report = userReports.find((r) => r.id === btn.dataset.id);
          if (!report) return;
          const newRead = !report.is_read;
          btn.disabled = true;
          const { error } = await markUserReportRead(report.id, newRead, newRead ? adminId : null);
          btn.disabled = false;
          if (error) return;
          userReports = await listUserReports();
          renderUserReportsList(resultsEl);
          void refreshMessagesDot();
        });
      });

      resultsEl.querySelectorAll<HTMLButtonElement>(".user-report-delete").forEach((btn) => {
        btn.addEventListener("click", () => {
          const report = userReports.find((r) => r.id === btn.dataset.id);
          if (report) openDeleteUserReportModal(report);
        });
      });
    }

    function openDeleteUserReportModal(report: UserReportWithNames): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>¿Eliminar este reporte?</h2>
            <p class="subtitle">De @${escapeHtml(report.reporterName ?? "usuario eliminado")} sobre @${escapeHtml(report.reportedName ?? "usuario eliminado")}. Esta acción no se puede deshacer.</p>
            <div class="alert_message" id="userReportDeleteAlert"></div>
            <div class="modal-actions">
              <button class="btn btn-outline" id="userReportDeleteCancel" type="button">Cancelar</button>
              <button class="btn btn-danger" id="userReportDeleteConfirm" type="button">Eliminar</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById("userReportDeleteCancel")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });

      document.getElementById("userReportDeleteConfirm")?.addEventListener("click", async () => {
        const alertBox = document.getElementById("userReportDeleteAlert")!;
        const { error } = await deleteUserReport(report.id);
        if (error) {
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }
        userReports = userReports.filter((r) => r.id !== report.id);
        loaderBody.innerHTML = "";
        void renderMessagesResults();
      });
    }

    // ---------- Validación (entrenadores / gimnasios) ----------

    const VALIDATION_APPLICANT_LABELS: Record<ApplicantType, string> = { entrenador: "Entrenadores", gimnasio: "Gimnasios" };
    const VALIDATION_STATUS_LABELS: Record<string, string> = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" };

    function formatCredentialLabel(c: AdminVerificationRequestRow["credentials"][number]): string {
      const typeLabel = c.type === "otro" ? c.otherTypeText || "Otro" : CREDENTIAL_TYPE_LABELS[c.type];
      const specialtyLabel = c.specialty === "otro" ? c.otherSpecialtyText || "Otro" : CREDENTIAL_SPECIALTY_LABELS[c.specialty];
      const statusLabel = CREDENTIAL_COMPLETION_STATUS_LABELS[c.completionStatus];
      const parts = [specialtyLabel, typeLabel, c.institution, statusLabel].filter(Boolean);
      return parts.join(" · ");
    }

    async function refreshValidationDot(): Promise<void> {
      try {
        const [entrenadorRows, gimnasioRows] = await Promise.all([
          verificationLoadedFor.entrenador ? verificationRequests.entrenador : listVerificationRequestsAdmin("entrenador"),
          verificationLoadedFor.gimnasio ? verificationRequests.gimnasio : listVerificationRequestsAdmin("gimnasio"),
        ]);
        const hasPending = [...entrenadorRows, ...gimnasioRows].some((r) => r.status === "pending");
        const tabDot = container.querySelector("#validationTabDot") as HTMLElement | null;
        if (tabDot) tabDot.hidden = !hasPending;
      } catch {
        // silencioso: el punto simplemente no se actualiza en este ciclo
      }
      void refreshAdminLinkDot();
    }

    async function renderValidationTab(): Promise<void> {
      const validationTab = container.querySelector("#validationTab")!;

      validationTab.innerHTML = `
        <div class="exc-pick-chips" id="validationSubTabs">
          ${(["entrenador", "gimnasio"] as ApplicantType[])
            .map((t) => `<button type="button" class="exc-pick-chip ${validationSubTab === t ? "active" : ""}" data-sub="${t}">${VALIDATION_APPLICANT_LABELS[t]}</button>`)
            .join("")}
        </div>
        <div id="validationResults"></div>
      `;

      container.querySelector("#validationSubTabs")?.addEventListener("click", (event) => {
        const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".exc-pick-chip");
        if (!btn) return;
        validationSubTab = btn.dataset.sub as ApplicantType;
        void renderValidationTab();
      });

      await renderValidationResults();
    }

    async function renderValidationResults(): Promise<void> {
      const resultsEl = container.querySelector("#validationResults");
      if (!resultsEl) return;

      if (!verificationLoadedFor[validationSubTab]) {
        resultsEl.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando solicitudes...</p></div>`;
        verificationRequests[validationSubTab] = await listVerificationRequestsAdmin(validationSubTab);
        verificationLoadedFor[validationSubTab] = true;
      }

      const rows = verificationRequests[validationSubTab];
      const pendingCount = rows.filter((r) => r.status === "pending").length;

      resultsEl.innerHTML = `
        <div class="exc-admin-toolbar">
          <div>
            <h3>Solicitudes de ${VALIDATION_APPLICANT_LABELS[validationSubTab].toLowerCase()}</h3>
            <p class="chart-sub">${pendingCount} pendiente${pendingCount === 1 ? "" : "s"} de ${rows.length} en total.</p>
          </div>
        </div>
        <div class="roadmap-tasks">
          ${
            rows
              .map(
                (r) => `
            <div class="roadmap-task roadmap-status-${r.status === "approved" ? "done" : r.status === "pending" ? "pending" : "in_progress"}" data-id="${r.id}">
              <div class="roadmap-task-body">
                <span class="roadmap-task-title">${escapeHtml(r.applicantName)} <small>@${escapeHtml(r.applicantUsername)}</small></span>
                ${
                  r.credentials.length
                    ? `<p class="roadmap-task-desc"><strong>Títulos:</strong> ${r.credentials.map((c) => escapeHtml(formatCredentialLabel(c))).join(" · ")}</p>`
                    : ""
                }
                <p class="roadmap-task-desc"><strong>Fotos:</strong> ${(r.documents as string[]).length}</p>
                <p class="roadmap-task-desc"><strong>Estado:</strong> ${VALIDATION_STATUS_LABELS[r.status] ?? r.status}</p>
                <p class="roadmap-task-desc"><strong>Enviada:</strong> ${formatDateTime(r.created_at)}</p>
              </div>
              <div class="roadmap-task-actions">
                <button type="button" class="validation-review" data-id="${r.id}">Revisar</button>
              </div>
            </div>
          `
              )
              .join("") || `<p class="exc-pick-empty">Todavía no hay solicitudes de ${VALIDATION_APPLICANT_LABELS[validationSubTab].toLowerCase()}.</p>`
          }
        </div>
      `;

      resultsEl.querySelectorAll<HTMLButtonElement>(".validation-review").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = rows.find((r) => r.id === btn.dataset.id);
          if (row) void openValidationReviewModal(row);
        });
      });

      void refreshValidationDot();
    }

    async function openValidationReviewModal(row: AdminVerificationRequestRow): Promise<void> {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card modal-card-lg">
            <h2>${escapeHtml(row.applicantName)}</h2>
            <p class="subtitle">@${escapeHtml(row.applicantUsername)} · ${escapeHtml(row.applicantEmail)}</p>
            ${
              row.credentials.length
                ? `<div class="help-list">${row.credentials.map((c) => `<div class="help-item"><strong>${escapeHtml(formatCredentialLabel(c))}</strong></div>`).join("")}</div>`
                : `<p class="chart-sub">No cargó ningún título.</p>`
            }
            <div class="verify-doc-grid" id="validationReviewDocs"><div class="inline-loader"><div class="modern-spinner"></div></div></div>

            <div class="field"><label for="validationAdminNote">Nota para el usuario (opcional, se ve solo si rechazás)</label><textarea id="validationAdminNote" rows="3">${escapeHtml(row.admin_note ?? "")}</textarea></div>

            <div class="alert_message" id="validationReviewAlert"></div>
            <div class="modal-actions">
              <button class="btn btn-danger" id="validationRejectBtn" type="button">Rechazar</button>
              <button class="btn btn-primary" id="validationApproveBtn" type="button">Aprobar (tick verde)</button>
              <button class="btn btn-outline" id="validationReviewClose" type="button">Cerrar</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById("validationReviewClose")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });

      async function review(status: "approved" | "rejected"): Promise<void> {
        const alertBox = document.getElementById("validationReviewAlert")!;
        alertBox.innerHTML = "";
        const note = (document.getElementById("validationAdminNote") as HTMLTextAreaElement).value;

        const approveBtn = document.getElementById("validationApproveBtn") as HTMLButtonElement | null;
        const rejectBtn = document.getElementById("validationRejectBtn") as HTMLButtonElement | null;
        if (approveBtn) approveBtn.disabled = true;
        if (rejectBtn) rejectBtn.disabled = true;

        const { error } = await reviewVerificationRequest(row.id, status, note);
        if (error) {
          if (approveBtn) approveBtn.disabled = false;
          if (rejectBtn) rejectBtn.disabled = false;
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }

        verificationLoadedFor[validationSubTab] = false;

        loaderBody!.innerHTML = `
          <div class="success-check-container">
            <div class="success-icon">
              <svg viewBox="0 0 52 52" class="success-svg">
                <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
                <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
              </svg>
            </div>
            <p>${status === "approved" ? `Solicitud aprobada. @${escapeHtml(row.applicantUsername)} ya tiene el tick verde.` : `Solicitud rechazada.`}</p>
          </div>
        `;

        const t = setTimeout(async () => {
          loaderBody!.innerHTML = "";
          await renderValidationResults();
        }, 1800);
        ctx.addCleanup(() => clearTimeout(t));
      }

      document.getElementById("validationApproveBtn")?.addEventListener("click", () => void review("approved"));
      document.getElementById("validationRejectBtn")?.addEventListener("click", () => void review("rejected"));

      const docsEl = document.getElementById("validationReviewDocs")!;
      const paths = (row.documents as string[]) ?? [];
      if (paths.length === 0) {
        docsEl.innerHTML = `<p class="exc-pick-empty">No subió ninguna foto.</p>`;
      } else {
        const urls = await Promise.all(paths.map((p) => getVerificationDocumentUrl(p)));
        docsEl.innerHTML = urls
          .map((url) => (url ? `<a class="verify-doc-item" href="${escapeHtml(url)}" target="_blank" rel="noopener"><img src="${escapeHtml(url)}" alt=""></a>` : ""))
          .join("");
      }
    }

    // ---------- Notificaciones ----------

    function renderNotifsTab(): void {
      const notifsTab = container.querySelector("#notifsTab")!;

      notifsTab.innerHTML = `
        <div class="exc-admin-toolbar">
          <div>
            <h3>Enviar notificación</h3>
            <p class="chart-sub">Se muestra en la campana del header del destinatario (o de todos, si elegís broadcast).</p>
          </div>
        </div>
        <div class="field">
          <label for="notifTarget">Destinatario</label>
          <select id="notifTarget">
            <option value="">Todos los usuarios (broadcast)</option>
            ${users
              .map((u) => `<option value="${u.id}">@${escapeHtml(u.username)} · ${escapeHtml(u.nombre)} ${escapeHtml(u.apellido)}</option>`)
              .join("")}
          </select>
        </div>
        <div class="field"><label for="notifTitle">Título</label><input type="text" id="notifTitle" maxlength="200"></div>
        <div class="field"><label for="notifBody">Mensaje (opcional)</label><textarea id="notifBody" rows="4" maxlength="2000"></textarea></div>
        <div class="field"><label for="notifLink">Link al hacer clic (opcional)</label><input type="text" id="notifLink" placeholder="ej: showExc.html?rid=..."></div>
        <div class="alert_message" id="notifSendAlert"></div>
        <p class="chart-sub" id="notifSendSuccess"></p>
        <div class="modal-actions">
          <button class="btn btn-primary" id="notifSendBtn" type="button">Enviar notificación</button>
        </div>
      `;

      container.querySelector("#notifSendBtn")?.addEventListener("click", async () => {
        const alertBox = container.querySelector("#notifSendAlert")!;
        const successBox = container.querySelector("#notifSendSuccess")!;
        alertBox.innerHTML = "";
        successBox.textContent = "";

        const target = (container.querySelector("#notifTarget") as HTMLSelectElement).value;
        const title = (container.querySelector("#notifTitle") as HTMLInputElement).value.trim();
        const body = (container.querySelector("#notifBody") as HTMLTextAreaElement).value.trim();
        const link = (container.querySelector("#notifLink") as HTMLInputElement).value.trim();

        if (title.length < 1 || title.length > 200) {
          alertBox.innerHTML = `<p>El título tiene que tener entre 1 y 200 caracteres.</p>`;
          return;
        }

        const sendBtn = container.querySelector("#notifSendBtn") as HTMLButtonElement;
        sendBtn.disabled = true;
        const { error, count } = await adminSendNotification(target || null, title, body, link);
        sendBtn.disabled = false;

        if (error) {
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }

        successBox.textContent = `Notificación enviada a ${count} usuario${count === 1 ? "" : "s"}.`;
        (container.querySelector("#notifTitle") as HTMLInputElement).value = "";
        (container.querySelector("#notifBody") as HTMLTextAreaElement).value = "";
        (container.querySelector("#notifLink") as HTMLInputElement).value = "";
      });
    }

    // ---------- Init ----------

    setupTabs();
    statsLoaded = true;
    await renderStatsTab();
    void refreshMessagesDot();
    void refreshValidationDot();
  },
};
