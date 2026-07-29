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

declare const Chart: any;

setupNavToggle();
setupRevealObserver();
await requireAuth();

if (!(await isCurrentUserAdmin())) {
  window.location.href = "profile.html";
  throw new Error("not admin");
}

let users: AdminUserRow[] = [];
let statsLoaded = false;
let usersLoaded = false;

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
  if (!tabsWrap) return;

  tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((btn) => {
    btn.addEventListener("click", async () => {
      tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((b) => b.classList.toggle("active", b === btn));
      const tab = btn.dataset.tab;
      statsTab.hidden = tab !== "stats";
      usersTab.hidden = tab !== "users";
      if (tab === "stats" && !statsLoaded) {
        statsLoaded = true;
        await renderStatsTab();
      }
      if (tab === "users" && !usersLoaded) {
        usersLoaded = true;
        await loadUsers();
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
    <input type="search" id="userSearch" class="exc-picker-search" placeholder="Buscar por nombre, usuario o mail..." value="${escapeHtml(filter)}">
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

// ---------- Init ----------

setupTabs();
statsLoaded = true;
await renderStatsTab();
