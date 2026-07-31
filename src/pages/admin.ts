import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { formatFechaCorta } from "../lib/dias";
import { COUNTRIES } from "../lib/countries";
import {
  isCurrentUserAdmin,
  getAdminSiteStats,
  getAdminDailyVisits,
  listAllUsersAdmin,
  updateUserAsAdmin,
  USER_TYPE_OPTIONS,
  USER_TYPE_LABELS,
  type AdminUserRow,
  type AdminDailyVisit,
} from "../services/admin.service";
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

declare const Chart: any;

setupNavToggle();
setupRevealObserver();
const adminId = await requireAuth();

if (!(await isCurrentUserAdmin())) {
  window.location.href = "profile.html";
  throw new Error("not admin");
}

let users: AdminUserRow[] = [];
let statsLoaded = false;
let usersLoaded = false;

let exercises: AdminExerciseRow[] = [];
let exercisesLoaded = false;
let excAdminSubTab: "builtin" | "custom" = "builtin";

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
  if (!tabsWrap) return;

  tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((btn) => {
    btn.addEventListener("click", async () => {
      tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((b) => b.classList.toggle("active", b === btn));
      const tab = btn.dataset.tab;
      statsTab.hidden = tab !== "stats";
      usersTab.hidden = tab !== "users";
      exercisesTab.hidden = tab !== "exercises";
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
        <div class="admin-table-row" data-id="${u.id}">
          <span class="admin-user-cell">
            <strong>${escapeHtml(u.nombre)} ${escapeHtml(u.apellido)}</strong>
            <small>@${escapeHtml(u.username)} · ${escapeHtml(u.email)}</small>
          </span>
          <span class="profile-badge">${USER_TYPE_LABELS[u.user_type]}</span>
          <span>${u.routines_count}</span>
          <span>${formatDate(u.created_at)}</span>
          <span>${formatDateTime(u.last_sign_in_at)}</span>
          <button class="btn btn-outline btn-sm admin-edit-btn" type="button" data-id="${u.id}">Editar</button>
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
    btn.addEventListener("click", () => openEditUserModal(btn.dataset.id!));
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

        <div class="alert_message" id="editUserAlert"></div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="saveUserBtn" type="button">Guardar</button>
          <button class="btn btn-outline" id="closeEditUser" type="button">Cerrar</button>
        </div>
      </div>
    </div>
  `;

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
    });

    if (error) {
      alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
      return;
    }

    Object.assign(user, { nombre, apellido, username, fecha_nacimiento: fechaNacimiento, nacionalidad, user_type: userType });
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

// ---------- Init ----------

setupTabs();
statsLoaded = true;
await renderStatsTab();
