import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { formatFechaCorta, dayDisplayLabel } from "../lib/dias";
import { formatRepe } from "../lib/reps";
import { getProfile, listWeightLogsWithContext, listRoutines, type WeightLogEntry } from "../services/profile.service";
import { getRoutineDetail, type RoutineDetail, type RoutineExerciseWithAuthor } from "../services/routine.service";
import { getLatestWeights, type LatestWeightsMap, type LatestWeightEntry } from "../services/weightLog.service";
import { listCommentsForExercises } from "../services/comment.service";
import type { Tables } from "../types/database";

type ExerciseComment = Tables<"exercise_comments">;

declare const Chart: any;

setupNavToggle();
setupRevealObserver();
const myId = await requireAuth();

const params = new URLSearchParams(window.location.search);
const targetUserId = params.get("uid") ?? myId;

// El unico flujo que trae ?uid= de otro usuario es "Tus alumnos" (entrenador viendo el
// progreso de un suscriptor aceptado); la propia tarjeta "Progreso completo" del perfil
// nunca pasa el uid de otra persona.
if (targetUserId !== myId) document.getElementById("backToAlumnos")?.removeAttribute("hidden");

const RECENT_WINDOW = 5;
const PROJECTION_DAYS = 28;

let lineChartInstance: any = null;
let sessionChartInstance: any = null;
let volumeChartInstance: any = null;
let topMaxChartInstance: any = null;
let topProgressChartInstance: any = null;

interface ExerciseGroup {
  id: string;
  name: string;
  authorName: string;
  entries: (WeightLogEntry & { date: Date })[];
}

function parseFechaISO(fecha: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function groupByExercise(logs: WeightLogEntry[]): ExerciseGroup[] {
  const map = new Map<string, ExerciseGroup>();
  logs.forEach((log) => {
    const group = map.get(log.exerciseId) ?? { id: log.exerciseId, name: log.exerciseName, authorName: log.authorName, entries: [] };
    group.entries.push({ ...log, date: parseFechaISO(log.fecha) });
    map.set(log.exerciseId, group);
  });
  // El orden de "primera vez visto" ya viene de listWeightLogsWithContext (fecha ascendente)
  return Array.from(map.values());
}

function sesionesLabel(n: number): string {
  return `${n} ${n === 1 ? "sesión" : "sesiones"}`;
}
function ultimasSesionesLabel(n: number): string {
  return n === 1 ? "Última sesión registrada" : `Últimas ${n} sesiones registradas`;
}
function oneRepMax(peso: number, repe: number): number {
  if (!repe || repe <= 1) return peso;
  return Math.round(peso * (1 + repe / 30));
}
function bestOneRepMax(points: ExerciseGroup["entries"]): { rm: number } | null {
  const withReps = points.filter((p) => p.repe);
  if (withReps.length === 0) return null;
  let best: { rm: number } | null = null;
  withReps.forEach((p) => {
    const rm = oneRepMax(p.peso, p.repe!);
    if (!best || rm > best.rm) best = { rm };
  });
  return best;
}
function projectWeight(points: ExerciseGroup["entries"], daysAhead: number): number | null {
  if (points.length < 2) return null;
  const x0 = points[0].date.getTime();
  const xs = points.map((p) => (p.date.getTime() - x0) / 86400000);
  const ys = points.map((p) => p.peso);
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const projX = xs[xs.length - 1] + daysAhead;
  return Math.round(slope * projX + intercept);
}

function barChart(canvasId: string, labels: string[], data: number[], color: string) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return null;
  return new Chart(canvas, {
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: color, borderRadius: 6, maxBarThickness: 28 }] },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { color: "#9aa1ac" }, grid: { color: "#262b33" } },
        y: { ticks: { color: "#9aa1ac" }, grid: { display: false } },
      },
    },
  });
}

function statsEmptyMarkup(): string {
  return `
    <div class="empty-state reveal">
      <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M7 15l4-4 3 3 5-6"/></svg></div>
      <h3>Todavía no tenés estadísticas</h3>
      <p>Cuando cargues el peso de un ejercicio en "Pesos semanales", tu progreso va a aparecer acá.</p>
      <a href="profile.html" class="btn btn-primary btn-sm">Volver al perfil</a>
    </div>
  `;
}

// Caso de borde (uid invalido/perfil no encontrado): saca las pestañas, no tiene
// sentido navegar entre secciones vacias.
function showProfileNotFound() {
  document.getElementById("progressTabs")?.remove();
  document.getElementById("tabPanelOverview")?.remove();
  document.getElementById("tabPanelDetail")?.remove();
  const panel = document.getElementById("tabPanelActive");
  if (panel) panel.innerHTML = statsEmptyMarkup();
}

function renderOverviewTab(groups: ExerciseGroup[]) {
  if (groups.length === 0) {
    document.getElementById("overviewContent")!.innerHTML = statsEmptyMarkup();
    return;
  }
  renderOverview(groups);
}

function renderOverview(groups: ExerciseGroup[]) {
  const overviewContent = document.getElementById("overviewContent")!;
  const data = groups.map((g) => {
    const weights = g.entries.map((p) => p.peso);
    const max = Math.max(...weights);
    const delta = g.entries[g.entries.length - 1].peso - g.entries[0].peso;
    return { name: g.name, max, delta, entries: g.entries.length };
  });

  const topByMax = [...data].sort((a, b) => b.max - a.max).slice(0, 5);
  const topByProgress = data
    .filter((d) => d.entries >= 2 && d.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);

  overviewContent.innerHTML = `
    <div class="section-head reveal">
      <span class="eyebrow">Resumen</span>
      <h2>Tus mejores ejercicios</h2>
      <p>En cuáles levantás más peso y en cuáles progresaste más desde tu primer registro.</p>
    </div>
    <div class="chart-grid">
      <div class="chart-card reveal">
        <h3>Mejores ejercicios</h3>
        <p class="chart-sub">Por peso máximo levantado.</p>
        <div class="chart-wrap"><canvas id="topMaxChart"></canvas></div>
      </div>
      <div class="chart-card reveal">
        <h3>Mayor progreso</h3>
        ${
          topByProgress.length === 0
            ? `<p class="chart-sub">Todavía no hay suficientes registros para comparar progreso.</p>`
            : `<p class="chart-sub">Kilos ganados desde tu primer registro.</p><div class="chart-wrap"><canvas id="topProgressChart"></canvas></div>`
        }
      </div>
    </div>
  `;

  topMaxChartInstance?.destroy();
  topProgressChartInstance?.destroy();
  topMaxChartInstance = barChart(
    "topMaxChart",
    topByMax.map((d) => d.name),
    topByMax.map((d) => d.max),
    "#ff8a3d"
  );
  if (topByProgress.length > 0) {
    topProgressChartInstance = barChart(
      "topProgressChart",
      topByProgress.map((d) => d.name),
      topByProgress.map((d) => d.delta),
      "#2fd971"
    );
  }
}

function renderDetailTab(groups: ExerciseGroup[]) {
  const detailHead = document.getElementById("detailHead");
  const excPicker = document.getElementById("excPicker");
  const progressContent = document.getElementById("progressContent")!;

  if (groups.length === 0) {
    detailHead?.remove();
    excPicker?.remove();
    progressContent.innerHTML = statsEmptyMarkup();
    return;
  }

  const select = document.getElementById("excSelect") as HTMLSelectElement;
  select.innerHTML = groups.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join("");
  select.addEventListener("change", () => {
    const chosen = groups.find((g) => g.id === select.value);
    if (chosen) renderExercise(chosen);
  });

  renderExercise(groups[0]);
}

function renderExercise(group: ExerciseGroup) {
  const points = group.entries;
  const weights = points.map((p) => p.peso);

  const max = Math.max(...weights);
  const maxEntry = points.find((p) => p.peso === max)!;
  const min = Math.min(...weights);

  const recent = points.slice(-RECENT_WINDOW);
  const recentAvg = Math.round(recent.reduce((a, p) => a + p.peso, 0) / recent.length);

  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.peso - first.peso;
  const deltaPct = first.peso > 0 ? Math.round((delta / first.peso) * 100) : 0;

  const rm = bestOneRepMax(points);
  const projected = projectWeight(points, PROJECTION_DAYS);

  const volumePoints = points.filter((p) => p.serie && p.repe).map((p) => ({ fecha: p.fecha, volumen: p.serie! * p.repe! * p.peso }));

  const progressContent = document.getElementById("progressContent")!;
  progressContent.innerHTML = `
    <div class="card-grid">
      <div class="stat-card reveal"><div class="label">Peso máximo</div><div class="value">${max} kg<small>${escapeHtml(formatFechaCorta(maxEntry.fecha))}</small></div></div>
      <div class="stat-card reveal"><div class="label">1RM estimado</div><div class="value">${rm ? `${rm.rm} kg` : "—"}<small>${rm ? "Fórmula de Epley" : "Cargá repeticiones para calcularlo"}</small></div></div>
      <div class="stat-card reveal"><div class="label">Promedio últimas ${sesionesLabel(recent.length)}</div><div class="value">${recentAvg} kg</div></div>
      <div class="stat-card reveal"><div class="label">Peso proyectado (4 semanas)</div><div class="value">${projected !== null ? `${projected} kg` : "—"}<small>${projected !== null ? "Según tu ritmo de progreso" : "Necesitás más registros"}</small></div></div>
      <div class="stat-card reveal"><div class="label">Progreso total</div><div class="value">${points.length >= 2 ? `${delta >= 0 ? "+" : ""}${delta} kg<small>${deltaPct >= 0 ? "+" : ""}${deltaPct}% desde el primer registro</small>` : `—<small>Necesitás al menos 2 registros</small>`}</div></div>
      <div class="stat-card reveal"><div class="label">Veces entrenado</div><div class="value">${points.length}<small>Mínimo registrado: ${min} kg</small></div></div>
    </div>

    <div class="chart-card reveal">
      <h3>${escapeHtml(group.name)}</h3>
      <p class="chart-sub">Ejercicio de ${escapeHtml(group.authorName)} · evolución del peso a lo largo del tiempo</p>
      <div class="chart-wrap"><canvas id="progressChart"></canvas></div>
    </div>

    <div class="chart-card reveal">
      <h3>Peso por sesión</h3>
      <p class="chart-sub">${ultimasSesionesLabel(Math.min(points.length, 10))}.</p>
      <div class="chart-wrap"><canvas id="sessionChart"></canvas></div>
    </div>

    ${
      volumePoints.length >= 2
        ? `<div class="chart-card reveal"><h3>Volumen por sesión</h3><p class="chart-sub">Series × repeticiones × peso, últimas ${sesionesLabel(Math.min(volumePoints.length, 10))}.</p><div class="chart-wrap"><canvas id="volumeChart"></canvas></div></div>`
        : ""
    }
  `;

  lineChartInstance?.destroy();
  sessionChartInstance?.destroy();
  volumeChartInstance?.destroy();

  const lineCanvas = document.getElementById("progressChart");
  if (lineCanvas && typeof Chart !== "undefined") {
    lineChartInstance = new Chart(lineCanvas, {
      type: "line",
      data: {
        labels: points.map((p) => formatFechaCorta(p.fecha)),
        datasets: [{ label: "Peso (kg)", data: weights, borderColor: "#ff8a3d", backgroundColor: "rgba(255, 138, 61, 0.18)", borderWidth: 2, tension: 0.3, fill: true, pointBackgroundColor: "#ff8a3d" }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { color: "#9aa1ac" }, grid: { color: "#262b33" } }, x: { ticks: { color: "#9aa1ac" }, grid: { display: false } } },
      },
    });
  }

  const recentSessions = points.slice(-10);
  const sessionCanvas = document.getElementById("sessionChart");
  if (sessionCanvas && typeof Chart !== "undefined") {
    sessionChartInstance = new Chart(sessionCanvas, {
      type: "bar",
      data: { labels: recentSessions.map((p) => formatFechaCorta(p.fecha)), datasets: [{ data: recentSessions.map((p) => p.peso), backgroundColor: "#ff4d4d", borderRadius: 6, maxBarThickness: 34 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { color: "#9aa1ac" }, grid: { color: "#262b33" } }, x: { ticks: { color: "#9aa1ac" }, grid: { display: false } } },
      },
    });
  }

  if (volumePoints.length >= 2) {
    const recentVolume = volumePoints.slice(-10);
    const volumeCanvas = document.getElementById("volumeChart");
    if (volumeCanvas && typeof Chart !== "undefined") {
      volumeChartInstance = new Chart(volumeCanvas, {
        type: "bar",
        data: { labels: recentVolume.map((p) => formatFechaCorta(p.fecha)), datasets: [{ data: recentVolume.map((p) => p.volumen), backgroundColor: "#2fd971", borderRadius: 6, maxBarThickness: 34 }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { color: "#9aa1ac" }, grid: { color: "#262b33" } }, x: { ticks: { color: "#9aa1ac" }, grid: { display: false } } },
        },
      });
    }
  }
}

// ---------- Rutina activa: detalle completo semana por semana ----------
// Misma logica de "ejercicio completo" que pesos.ts (todas las series con carga cuentan,
// una sola serie con mismo_peso cuenta como todas) -- duplicada aca a proposito, no
// compartida, siguiendo la convencion del resto del codebase.

function isExerciseDone(e: RoutineExerciseWithAuthor, latestWeights: LatestWeightsMap): boolean {
  const bySerie = latestWeights.get(e.id);
  if (!bySerie) return false;
  const requiredSeries = e.mismo_peso ? 1 : e.serie;
  for (let i = 1; i <= requiredSeries; i++) {
    if (!bySerie.get(i)?.length) return false;
  }
  return true;
}

function lastLoggedEntry(exerciseId: string, latestWeights: LatestWeightsMap): LatestWeightEntry | null {
  const bySerie = latestWeights.get(exerciseId);
  if (!bySerie) return null;
  let best: LatestWeightEntry | null = null;
  bySerie.forEach((entries) => {
    const top = entries[0];
    if (top && (!best || top.fecha > best.fecha)) best = top;
  });
  return best;
}

function progressStats(exs: RoutineExerciseWithAuthor[], latestWeights: LatestWeightsMap): { done: number; total: number; pct: number } {
  const trackable = exs.filter((e) => e.es_medible);
  if (trackable.length === 0) return { done: 0, total: 0, pct: 100 };
  const done = trackable.filter((e) => isExerciseDone(e, latestWeights)).length;
  return { done, total: trackable.length, pct: Math.round((done / trackable.length) * 100) };
}

function activeRingMarkup(pct: number): string {
  const r = 16;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct / 100);
  return `
    <div class="day-ring">
      <svg viewBox="0 0 40 40">
        <circle class="ring-bg" cx="20" cy="20" r="${r}"></circle>
        <circle class="ring-fg" cx="20" cy="20" r="${r}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
      </svg>
      <span class="day-ring-pct">${pct}%</span>
    </div>
  `;
}

function exerciseRowMarkup(e: RoutineExerciseWithAuthor, latestWeights: LatestWeightsMap, comments: Map<string, ExerciseComment>): string {
  const done = e.es_medible ? isExerciseDone(e, latestWeights) : null;
  const last = lastLoggedEntry(e.id, latestWeights);
  const comment = comments.get(e.id);

  const statusMarkup =
    done === null
      ? `<span class="day-row-status pending">No medible</span>`
      : `<span class="day-row-status ${done ? "done" : "pending"}">${done ? "Hecho" : "Pendiente"}</span>`;

  const subtitle = `${e.serie} series x ${formatRepe(e.repe, e.repe_max)}${
    last ? ` · Último: ${last.peso} ${last.unidad}${last.repe ? ` x ${last.repe}` : ""} (${formatFechaCorta(last.fecha)})` : e.es_medible ? " · Sin cargas registradas" : ""
  }`;

  return `
    <div class="active-exc-item">
      <div class="active-exc-item-head">
        <span class="exc-name">${escapeHtml(e.nombre_snapshot)}</span>
        ${statusMarkup}
      </div>
      <p class="chart-sub active-exc-item-sub">${subtitle}</p>
      ${
        comment
          ? `<div class="student-comment-item active-exc-note">
               <div class="student-comment-meta">Nota del alumno · ${escapeHtml(formatFechaCorta(comment.fecha))}</div>
               <p>${escapeHtml(comment.comment)}</p>
             </div>`
          : ""
      }
    </div>
  `;
}

function dayMarkup(dia: RoutineDetail["semanas"][number]["dias"][number], latestWeights: LatestWeightsMap, comments: Map<string, ExerciseComment>): string {
  const stats = progressStats(dia.ejercicios, latestWeights);
  const subtitle = stats.total === 0 ? `${dia.ejercicios.length} ejercicio${dia.ejercicios.length === 1 ? "" : "s"}` : `${stats.done} de ${stats.total} ejercicios con carga`;

  return `
    <div class="day-accordion reveal">
      <button class="day-row" type="button">
        ${activeRingMarkup(stats.pct)}
        <div class="day-row-info"><h3>${escapeHtml(dayDisplayLabel(dia.dia_semana, dia.nombre))}</h3><p>${subtitle}</p></div>
        <span class="day-row-status ${stats.pct >= 100 ? "done" : "pending"}">${stats.pct}%</span>
        <svg class="day-row-chevron" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <div class="day-detail" hidden>
        ${dia.ejercicios.map((e) => exerciseRowMarkup(e, latestWeights, comments)).join("")}
      </div>
    </div>
  `;
}

function weekMarkup(semana: RoutineDetail["semanas"][number], latestWeights: LatestWeightsMap, comments: Map<string, ExerciseComment>): string {
  const exs = semana.dias.flatMap((d) => d.ejercicios);
  const stats = progressStats(exs, latestWeights);

  return `
    <div class="chart-card reveal">
      <div class="routine-progress-head"><span>Semana ${semana.numero}</span><strong>${stats.pct}%</strong></div>
      <div class="routine-progress-bar"><span style="width:${stats.pct}%"></span></div>
      <div class="week-days">${semana.dias.map((d) => dayMarkup(d, latestWeights, comments)).join("")}</div>
    </div>
  `;
}

function activeRoutineMarkup(routine: RoutineDetail, latestWeights: LatestWeightsMap, comments: Map<string, ExerciseComment>): string {
  const allExs = routine.semanas.flatMap((w) => w.dias.flatMap((d) => d.ejercicios));
  const overall = progressStats(allExs, latestWeights);

  return `
    <div class="section-head reveal">
      <span class="eyebrow">Rutina activa</span>
      <h2>${escapeHtml(routine.nombre)}</h2>
      <p>${routine.semanas.length} semana${routine.semanas.length === 1 ? "" : "s"}${routine.fecha_inicio ? ` · Empezada el ${formatFechaCorta(routine.fecha_inicio)}` : ""}</p>
    </div>
    <div class="chart-card reveal">
      <div class="routine-progress-head"><span>Progreso general de la rutina</span><strong>${overall.pct}%</strong></div>
      <div class="routine-progress-bar"><span style="width:${overall.pct}%"></span></div>
      <p class="chart-sub">${overall.done} de ${overall.total} ejercicios con carga registrada.</p>
    </div>
    ${routine.semanas.map((s) => weekMarkup(s, latestWeights, comments)).join("")}
  `;
}

function activeRoutineEmptyMarkup(): string {
  return `
    <div class="section-head reveal">
      <span class="eyebrow">Rutina activa</span>
      <h2>Sin rutina activa</h2>
      <p>Todavía no hay una rutina en curso para mostrar el detalle.</p>
    </div>
  `;
}

function wireActiveRoutineAccordion(container: HTMLElement) {
  container.querySelectorAll<HTMLButtonElement>(".day-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      const accordion = btn.closest(".day-accordion");
      const detail = accordion?.querySelector<HTMLElement>(".day-detail");
      if (!accordion || !detail) return;
      const isOpen = accordion.classList.toggle("open");
      detail.hidden = !isOpen;
    });
  });
}

async function renderActiveRoutineSection(userId: string) {
  const container = document.getElementById("activeRoutineContent");
  if (!container) return;
  try {
    const [activeRoutine] = await listRoutines(userId, "active");
    const routine = activeRoutine ? await getRoutineDetail(activeRoutine.id) : null;
    if (!routine) {
      container.innerHTML = activeRoutineEmptyMarkup();
      return;
    }

    const exerciseIds = routine.semanas.flatMap((w) => w.dias.flatMap((d) => d.ejercicios.map((e) => e.id)));
    const [latestWeights, comments] = await Promise.all([getLatestWeights(exerciseIds), listCommentsForExercises(exerciseIds)]);

    container.innerHTML = activeRoutineMarkup(routine, latestWeights, comments);
    wireActiveRoutineAccordion(container);
  } catch {
    container.innerHTML = `<p class="chart-sub">No se pudo cargar el detalle de la rutina activa.</p>`;
  }
}

// ---------- Pestañas: Rutina activa / Resumen / Detalle por ejercicio ----------
// Cada pestaña se carga (y sus graficos de Chart.js se instancian) recien la primera
// vez que se abre, con el panel ya visible en el DOM -- crear un Chart sobre un canvas
// oculto (display:none) lo deja con tamaño 0 y rompe el render.

type ProgressTab = "active" | "overview" | "detail";
const TAB_PANELS: Record<ProgressTab, string> = { active: "tabPanelActive", overview: "tabPanelOverview", detail: "tabPanelDetail" };

let currentTab: ProgressTab = "active";
const loadedTabs = new Set<ProgressTab>();
let groupsPromise: Promise<ExerciseGroup[]> | null = null;

function ensureGroups(): Promise<ExerciseGroup[]> {
  if (!groupsPromise) groupsPromise = listWeightLogsWithContext(targetUserId).then(groupByExercise);
  return groupsPromise;
}

async function loadTab(tab: ProgressTab) {
  if (loadedTabs.has(tab)) return;
  loadedTabs.add(tab);
  if (tab === "active") {
    await renderActiveRoutineSection(targetUserId);
  } else {
    const groups = await ensureGroups();
    if (tab === "overview") renderOverviewTab(groups);
    else renderDetailTab(groups);
  }
}

function switchTab(tab: ProgressTab) {
  currentTab = tab;
  (Object.keys(TAB_PANELS) as ProgressTab[]).forEach((t) => {
    const panel = document.getElementById(TAB_PANELS[t]);
    if (panel) panel.hidden = t !== tab;
  });
  document.querySelectorAll<HTMLButtonElement>("#progressTabs .routine-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  void loadTab(tab);
}

function wireTabs() {
  document.querySelectorAll<HTMLButtonElement>("#progressTabs .routine-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab as ProgressTab;
      if (tab !== currentTab) switchTab(tab);
    });
  });
}

async function init() {
  const profile = await getProfile(targetUserId);
  if (!profile) {
    showProfileNotFound();
    return;
  }

  const title = document.getElementById("pageTitle");
  if (title) title.textContent = `Progreso de ${escapeHtml(profile.nombre)}`;

  wireTabs();
  void loadTab(currentTab);
}

init();
