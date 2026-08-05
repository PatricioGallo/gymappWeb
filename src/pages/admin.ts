import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
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
  listContactMessages,
  markContactMessageRead,
  deleteContactMessage,
  getUnreadContactMessageCount,
  type ContactMessage,
} from "../services/contact.service";

declare const Chart: any;

setupNavToggle();
setupRevealObserver();
const adminId = await requireAuth();

if (!(await isCurrentUserStaff())) {
  window.location.href = "profile.html";
  throw new Error("not staff");
}

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

let contactMessages: ContactMessage[] = [];
let messagesLoaded = false;

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ---------- Tabs ----------

function setupTabs() {
  const tabsWrap = document.getElementById("adminTabs");
  const statsTab = document.getElementById("statsTab")!;
  const usersTab = document.getElementById("usersTab")!;
  const exercisesTab = document.getElementById("exercisesTab")!;
  const roadmapTab = document.getElementById("roadmapTab")!;
  const issuesTab = document.getElementById("issuesTab")!;
  const messagesTab = document.getElementById("messagesTab")!;
  const notifsTab = document.getElementById("notifsTab")!;
  if (!tabsWrap) return;

  tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((btn) => {
    btn.addEventListener("click", async () => {
      tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((b) => b.classList.toggle("active", b === btn));
      const tab = btn.dataset.tab;
      statsTab.hidden = tab !== "stats";
      usersTab.hidden = tab !== "users";
      exercisesTab.hidden = tab !== "exercises";
      roadmapTab.hidden = tab !== "roadmap";
      issuesTab.hidden = tab !== "issues";
      messagesTab.hidden = tab !== "messages";
      notifsTab.hidden = tab !== "notifs";
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
      if (tab === "messages" && !messagesLoaded) {
        messagesLoaded = true;
        await loadContactMessages();
      }
      if (tab === "notifs") {
        if (!usersLoaded) {
          usersLoaded = true;
          await loadUsers();
        }
        renderNotifsTab();
      }
    });
  });
}

// ---------- Estadisticas ----------

async function renderStatsTab() {
  const statsTab = document.getElementById("statsTab")!;
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

  renderVisitsChart(daily);
}

function renderVisitsChart(daily: AdminDailyVisit[]) {
  const canvas = document.getElementById("visitsChart");
  if (!canvas || typeof Chart === "undefined") return;
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

async function loadUsers() {
  const usersTab = document.getElementById("usersTab")!;
  usersTab.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando usuarios...</p></div>`;
  users = await listAllUsersAdmin();
  renderUsersTab("");
}

function renderUsersTab(filter: string) {
  const usersTab = document.getElementById("usersTab")!;
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

  document.getElementById("userSearch")?.addEventListener("input", (e) => {
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
      if (user) window.location.href = `/${user.username}`;
    });
  });
}

function openEditUserModal(userId: string) {
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

  function renderVerifiedField(userType: UserType, checked: boolean) {
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
      userType === "entrenador" ? "Tilde verde: presentó la papelería que certifica su actividad." : "Tilde azul: cuenta reconocida/famosa.";
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
    renderUsersTab((document.getElementById("userSearch") as HTMLInputElement | null)?.value ?? "");
  });
}

function openDeleteUserModal(user: AdminUserRow) {
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
    renderUsersTab((document.getElementById("userSearch") as HTMLInputElement | null)?.value ?? "");
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

async function loadExercises() {
  const exercisesTab = document.getElementById("exercisesTab")!;
  exercisesTab.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando ejercicios...</p></div>`;
  exercises = await listExercisesAdmin();
  renderExercisesTab();
}

function renderExercisesTab() {
  const exercisesTab = document.getElementById("exercisesTab")!;

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

  document.getElementById("excAdminSubTabs")?.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".exc-pick-chip");
    if (!btn) return;
    excAdminSubTab = btn.dataset.sub as "builtin" | "custom";
    renderExercisesTab();
  });

  document.getElementById("excAdminSearch")?.addEventListener("input", (event) => {
    excSearchTerm = (event.target as HTMLInputElement).value;
    renderExerciseResults();
  });

  document.getElementById("excAdminAddBtn")?.addEventListener("click", () => openExerciseFormModal(null));
}

function renderExerciseResults() {
  const resultsEl = document.getElementById("excAdminResults");
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

function openExerciseFormModal(existing: AdminExerciseRow | null) {
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

function openDeleteExerciseModal(exc: AdminExerciseRow) {
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

async function loadRoadmap() {
  const roadmapTab = document.getElementById("roadmapTab")!;
  roadmapTab.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando roadmap...</p></div>`;
  roadmapTasks = await listRoadmapTasks();
  renderRoadmapTab();
}

function renderRoadmapTab() {
  const roadmapTab = document.getElementById("roadmapTab")!;

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

function openRoadmapFormModal(existing: RoadmapTask | null, defaultCategory: RoadmapCategory) {
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

function openDeleteRoadmapModal(task: RoadmapTask) {
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

async function loadIssues() {
  const issuesTab = document.getElementById("issuesTab")!;
  issuesTab.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando issues...</p></div>`;
  issueReports = await listIssueReports();
  renderIssuesTab();
}

function renderIssuesTab() {
  const issuesTab = document.getElementById("issuesTab")!;
  const openCount = issueReports.filter((i) => i.status !== "resolved").length;

  issuesTab.innerHTML = `
    <div class="exc-admin-toolbar">
      <div>
        <h3>Issues reportados</h3>
        <p class="chart-sub">${openCount} sin resolver de ${issueReports.length} en total.</p>
      </div>
      <button class="btn btn-primary btn-sm" id="issueAddBtn" type="button">+ Reportar issue</button>
    </div>
    <div class="roadmap-tasks">
      ${
        issueReports
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
          .join("") || `<p class="exc-pick-empty">Todavía no reportaste ningún issue. ¡Buena señal!</p>`
      }
    </div>
  `;

  document.getElementById("issueAddBtn")?.addEventListener("click", () => openIssueFormModal(null));

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

function openIssueFormModal(existing: IssueReport | null) {
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

    if (existing) {
      const { error } = await updateIssueReport(existing.id, { title, page: page || null, description: description || null, severity });
      if (error) {
        alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
        return;
      }
      Object.assign(existing, { title, page: page || null, description: description || null, severity });
    } else {
      const { error } = await addIssueReport(adminId, title, description, page, severity);
      if (error) {
        alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
        return;
      }
      issueReports = await listIssueReports();
    }

    loaderBody.innerHTML = "";
    renderIssuesTab();
  });
}

function openDeleteIssueModal(issue: IssueReport) {
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

// ---------- Mensajes de contacto ----------

function setMessagesDot(hasUnread: boolean) {
  const tabDot = document.getElementById("messagesTabDot");
  if (tabDot) tabDot.hidden = !hasUnread;
  const navDot = document.getElementById("adminLinkDot");
  if (navDot) navDot.hidden = !hasUnread;
}

async function refreshMessagesDot() {
  try {
    const unread = await getUnreadContactMessageCount();
    setMessagesDot(unread > 0);
  } catch {
    // silencioso: el punto simplemente no se actualiza en este ciclo
  }
}

async function loadContactMessages() {
  const messagesTab = document.getElementById("messagesTab")!;
  messagesTab.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando mensajes...</p></div>`;
  contactMessages = await listContactMessages();
  renderMessagesTab();
}

function renderMessagesTab() {
  const messagesTab = document.getElementById("messagesTab")!;
  const unreadCount = contactMessages.filter((m) => !m.is_read).length;
  setMessagesDot(unreadCount > 0);

  messagesTab.innerHTML = `
    <div class="exc-admin-toolbar">
      <div>
        <h3>Mensajes de contacto</h3>
        <p class="chart-sub">${unreadCount} sin leer de ${contactMessages.length} en total.</p>
      </div>
    </div>
    <div class="roadmap-tasks">
      ${
        contactMessages
          .map(
            (m) => `
        <div class="roadmap-task roadmap-status-${m.is_read ? "done" : "pending"}" data-id="${m.id}">
          <div class="roadmap-task-body">
            <span class="roadmap-task-title">${escapeHtml(m.name)} · ${escapeHtml(m.email)}</span>
            <p class="roadmap-task-desc">${escapeHtml(m.message)}</p>
            <p class="roadmap-task-desc"><strong>Recibido:</strong> ${formatDateTime(m.created_at)}</p>
          </div>
          <div class="roadmap-task-actions">
            <button type="button" class="message-toggle-read" data-id="${m.id}">${m.is_read ? "Marcar no leído" : "Marcar leído"}</button>
            <button type="button" class="message-delete" data-id="${m.id}">Eliminar</button>
          </div>
        </div>
      `
          )
          .join("") || `<p class="exc-pick-empty">Todavía no llegó ningún mensaje.</p>`
      }
    </div>
  `;

  messagesTab.querySelectorAll<HTMLButtonElement>(".message-toggle-read").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const msg = contactMessages.find((m) => m.id === btn.dataset.id);
      if (!msg) return;
      const newRead = !msg.is_read;
      btn.disabled = true;
      const { error } = await markContactMessageRead(msg.id, newRead);
      btn.disabled = false;
      if (error) return;
      msg.is_read = newRead;
      renderMessagesTab();
    });
  });

  messagesTab.querySelectorAll<HTMLButtonElement>(".message-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      const msg = contactMessages.find((m) => m.id === btn.dataset.id);
      if (msg) openDeleteMessageModal(msg);
    });
  });
}

function openDeleteMessageModal(msg: ContactMessage) {
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
    renderMessagesTab();
  });
}

// ---------- Notificaciones ----------

function renderNotifsTab() {
  const notifsTab = document.getElementById("notifsTab")!;

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

  document.getElementById("notifSendBtn")?.addEventListener("click", async () => {
    const alertBox = document.getElementById("notifSendAlert")!;
    const successBox = document.getElementById("notifSendSuccess")!;
    alertBox.innerHTML = "";
    successBox.textContent = "";

    const target = (document.getElementById("notifTarget") as HTMLSelectElement).value;
    const title = (document.getElementById("notifTitle") as HTMLInputElement).value.trim();
    const body = (document.getElementById("notifBody") as HTMLTextAreaElement).value.trim();
    const link = (document.getElementById("notifLink") as HTMLInputElement).value.trim();

    if (title.length < 1 || title.length > 200) {
      alertBox.innerHTML = `<p>El título tiene que tener entre 1 y 200 caracteres.</p>`;
      return;
    }

    const sendBtn = document.getElementById("notifSendBtn") as HTMLButtonElement;
    sendBtn.disabled = true;
    const { error, count } = await adminSendNotification(target || null, title, body, link);
    sendBtn.disabled = false;

    if (error) {
      alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
      return;
    }

    successBox.textContent = `Notificación enviada a ${count} usuario${count === 1 ? "" : "s"}.`;
    (document.getElementById("notifTitle") as HTMLInputElement).value = "";
    (document.getElementById("notifBody") as HTMLTextAreaElement).value = "";
    (document.getElementById("notifLink") as HTMLInputElement).value = "";
  });
}

// ---------- Init ----------

setupTabs();
statsLoaded = true;
await renderStatsTab();
void refreshMessagesDot();
