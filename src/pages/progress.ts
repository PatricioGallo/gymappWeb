import type { ViewModule } from "../shell/router";
import { escapeHtml } from "../lib/dom";
import { formatFechaCorta, dayDisplayLabel } from "../lib/dias";
import { formatRepe } from "../lib/reps";
import { getProfile, listWeightLogsWithContext, listRoutines, type WeightLogEntry } from "../services/profile.service";
import { getRoutineDetail, type RoutineDetail, type RoutineExerciseWithAuthor } from "../services/routine.service";
import { getLatestWeights, type LatestWeightsMap, type LatestWeightEntry, type WeightUnit } from "../services/weightLog.service";
import { listCommentsForExercises } from "../services/comment.service";
import type { Tables } from "../types/database";
import type { Chart as ChartInstance } from "chart.js";
import { loadChart } from "../lib/chartLoader";

type ExerciseComment = Tables<"exercise_comments">;

const RECENT_WINDOW = 5;
const PROJECTION_DAYS = 28;

interface ExerciseGroup {
  id: string;
  name: string;
  authorName: string;
  entries: (WeightLogEntry & { date: Date })[];
}

const VIEW_MARKUP = `
  <section class="page-hero">
    <div class="container">
      <a href="profile.html" class="back-link" id="backToProfile"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Volver al perfil</a>
      <a href="alumnos.html" class="back-link" id="backToAlumnos" hidden><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Volver a tus alumnos</a>
      <span class="eyebrow">Progreso</span>
      <h1 id="pageTitle">Tu progreso</h1>
      <p id="pageSubtitle">Un resumen de tus mejores marcas y el detalle de cómo evolucionó cada ejercicio.</p>
    </div>
  </section>

  <section class="features">
    <div class="container">
      <div class="routine-tabs" id="progressTabs">
        <button class="routine-tab active" data-tab="active" type="button">Rutina activa</button>
        <button class="routine-tab" data-tab="overview" type="button">Resumen</button>
        <button class="routine-tab" data-tab="detail" type="button">Detalle por ejercicio</button>
      </div>

      <div id="tabPanelActive">
        <div id="activeRoutineContent"></div>
      </div>

      <div id="tabPanelOverview" hidden>
        <div id="overviewContent"></div>
      </div>

      <div id="tabPanelDetail" hidden>
        <div class="section-head reveal" id="detailHead">
          <span class="eyebrow">Detalle</span>
          <h2>Progreso por ejercicio</h2>
          <p>Elegí un ejercicio para ver su evolución en detalle.</p>
        </div>

        <div class="field field-narrow" id="excPicker">
          <label for="excSelect">Ejercicio</label>
          <select id="excSelect"></select>
        </div>

        <div id="progressContent"></div>
      </div>
    </div>
  </section>
`;

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

// Los pesos se pueden cargar en distintas unidades (kg/lb/bloques) y no son convertibles
// entre si -- mismo criterio que getExerciseStats en weightLog.service.ts: se usa la mas
// repetida en el historial para no mezclar cargas de distinta unidad en un mismo calculo.
function dominantUnit(entries: { unidad: WeightUnit }[]): WeightUnit {
  const counts = new Map<WeightUnit, number>();
  entries.forEach((e) => counts.set(e.unidad, (counts.get(e.unidad) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// Un dia puede tener varias series a distinto peso (piramidal, series de calentamiento,
// etc.); el progreso real de esa sesion es la carga mas pesada que se levanto ese dia, no
// cada serie suelta -- si hay empate de peso, se queda con la de mas repeticiones.
function sessionMaxEntries<T extends { fecha: string; peso: number; repe: number | null; date: Date }>(entries: T[]): T[] {
  const byFecha = new Map<string, T>();
  entries.forEach((e) => {
    const current = byFecha.get(e.fecha);
    if (!current || e.peso > current.peso || (e.peso === current.peso && (e.repe ?? 0) > (current.repe ?? 0))) {
      byFecha.set(e.fecha, e);
    }
  });
  return [...byFecha.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
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

// ---------- Rutina activa: detalle completo semana por semana ----------
// Misma logica de "ejercicio completo" que pesos.ts (todas las series con carga cuentan,
// una sola serie con mismo_peso cuenta como todas) -- duplicada aca a proposito, no
// compartida, siguiendo la convencion del resto del codebase.

// Cuantas series de este ejercicio tienen peso cargado. Con mismo_peso todas las series
// comparten una unica carga, asi que cuentan todas-o-nada.
function exerciseDoneSeries(e: RoutineExerciseWithAuthor, latestWeights: LatestWeightsMap): number {
  const bySerie = latestWeights.get(e.id);
  if (!bySerie) return 0;
  if (e.mismo_peso) return bySerie.get(1)?.length ? e.serie : 0;
  let done = 0;
  for (let i = 1; i <= e.serie; i++) {
    if (bySerie.get(i)?.length) done++;
  }
  return done;
}

function isExerciseDone(e: RoutineExerciseWithAuthor, latestWeights: LatestWeightsMap): boolean {
  return exerciseDoneSeries(e, latestWeights) >= e.serie;
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

// El progreso se pesa por cantidad de series, no por cantidad de ejercicios: un ejercicio
// de 5 series pesa mas que uno de 2 series, en vez de contar ambos como "un ejercicio".
function progressStats(exs: RoutineExerciseWithAuthor[], latestWeights: LatestWeightsMap): { done: number; total: number; pct: number } {
  const trackable = exs.filter((e) => e.es_medible);
  const total = trackable.reduce((sum, e) => sum + e.serie, 0);
  if (total === 0) return { done: 0, total: 0, pct: 100 };
  const done = trackable.reduce((sum, e) => sum + exerciseDoneSeries(e, latestWeights), 0);
  return { done, total, pct: Math.round((done / total) * 100) };
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
  const subtitle = stats.total === 0 ? `${dia.ejercicios.length} ejercicio${dia.ejercicios.length === 1 ? "" : "s"}` : `${stats.done} de ${stats.total} series con carga`;

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
      <p class="chart-sub">${overall.done} de ${overall.total} series con carga registrada.</p>
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

type ProgressTab = "active" | "overview" | "detail";
const TAB_PANELS: Record<ProgressTab, string> = { active: "tabPanelActive", overview: "tabPanelOverview", detail: "tabPanelDetail" };

// mount() define render() (arma el DOM entero desde cero para cada ?uid= -- no hay estado fino
// que preservar entre perfiles distintos) y la deja referenciada aca para que update() la reuse.
let updateHandler: ((params: URLSearchParams) => void) | null = null;

export const progressView: ViewModule = {
  async mount(container, params, ctx, authUserId) {
    const myId = authUserId!; // la ruta se registra con requiresAuth:true

    async function render(p: URLSearchParams): Promise<void> {
      container.innerHTML = VIEW_MARKUP;

      const targetUserId = p.get("uid") ?? myId;

      // El unico flujo que trae ?uid= de otro usuario es "Tus alumnos" (entrenador viendo el
      // progreso de un suscriptor aceptado); la propia tarjeta "Progreso completo" del perfil
      // nunca pasa el uid de otra persona. Viendo el progreso propio (o el "?uid=" de uno
      // mismo) el link vuelve al perfil en vez de a la lista de alumnos.
      if (targetUserId !== myId) {
        container.querySelector("#backToAlumnos")?.removeAttribute("hidden");
        container.querySelector("#backToProfile")?.setAttribute("hidden", "");
      }

      let lineChartInstance: ChartInstance | null = null;
      let sessionChartInstance: ChartInstance | null = null;
      let volumeChartInstance: ChartInstance | null = null;
      let topMaxChartInstance: ChartInstance | null = null;
      let topProgressChartInstance: ChartInstance | null = null;
      ctx.addCleanup(() => {
        lineChartInstance?.destroy();
        sessionChartInstance?.destroy();
        volumeChartInstance?.destroy();
        topMaxChartInstance?.destroy();
        topProgressChartInstance?.destroy();
      });

      async function barChart(canvasId: string, labels: string[], data: number[], color: string): Promise<ChartInstance | null> {
        const canvas = container.querySelector(`#${canvasId}`) as HTMLCanvasElement | null;
        if (!canvas) return null;
        const Chart = await loadChart();
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

      // Caso de borde (uid invalido/perfil no encontrado): saca las pestañas, no tiene
      // sentido navegar entre secciones vacias.
      function showProfileNotFound(): void {
        container.querySelector("#progressTabs")?.remove();
        container.querySelector("#tabPanelOverview")?.remove();
        container.querySelector("#tabPanelDetail")?.remove();
        const panel = container.querySelector("#tabPanelActive");
        if (panel) panel.innerHTML = statsEmptyMarkup();
      }

      async function renderOverviewTab(groups: ExerciseGroup[]): Promise<void> {
        if (groups.length === 0) {
          container.querySelector("#overviewContent")!.innerHTML = statsEmptyMarkup();
          return;
        }
        await renderOverview(groups);
      }

      async function renderOverview(groups: ExerciseGroup[]): Promise<void> {
        const overviewContent = container.querySelector("#overviewContent")!;
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
        topMaxChartInstance = await barChart(
          "topMaxChart",
          topByMax.map((d) => d.name),
          topByMax.map((d) => d.max),
          "#ff8a3d"
        );
        if (topByProgress.length > 0) {
          topProgressChartInstance = await barChart(
            "topProgressChart",
            topByProgress.map((d) => d.name),
            topByProgress.map((d) => d.delta),
            "#2fd971"
          );
        }
      }

      async function renderDetailTab(groups: ExerciseGroup[]): Promise<void> {
        const detailHead = container.querySelector("#detailHead");
        const excPicker = container.querySelector("#excPicker");
        const progressContent = container.querySelector("#progressContent")!;

        if (groups.length === 0) {
          detailHead?.remove();
          excPicker?.remove();
          progressContent.innerHTML = statsEmptyMarkup();
          return;
        }

        const select = container.querySelector("#excSelect") as HTMLSelectElement;
        select.innerHTML = groups.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join("");
        select.addEventListener(
          "change",
          () => {
            const chosen = groups.find((g) => g.id === select.value);
            if (chosen) void renderExercise(chosen);
          },
          { signal: ctx.signal }
        );

        await renderExercise(groups[0]);
      }

      async function renderExercise(group: ExerciseGroup): Promise<void> {
        // Se identifica primero en que unidad esta cargado este ejercicio (kg/lb/bloques no
        // son convertibles entre si) y se trabaja solo con esa unidad de aca en adelante.
        const unidad = dominantUnit(group.entries);
        const rawEntries = group.entries.filter((p) => p.unidad === unidad);
        // Una sesion puede tener varias series a distinto peso -- el grafico y las metricas
        // reflejan la carga maxima levantada por sesion, no cada serie suelta.
        const points = sessionMaxEntries(rawEntries);
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

        // RM: formula de Epley sobre el maximo peso levantado y las repeticiones que se
        // hicieron con ese peso (no el mayor RM calculado entre todas las series sueltas).
        const rm = oneRepMax(maxEntry.peso, maxEntry.repe ?? 1);
        const rmIsEstimate = !!maxEntry.repe && maxEntry.repe > 1;
        // Peso proyectado: misma logica -- se proyecta la serie de maximos por sesion, no
        // cada serie suelta (evita que un calentamiento liviano distorsione la tendencia).
        const projected = projectWeight(points, PROJECTION_DAYS);

        const volumePoints = rawEntries.filter((p) => p.serie && p.repe).map((p) => ({ fecha: p.fecha, volumen: p.serie! * p.repe! * p.peso }));

        const progressContent = container.querySelector("#progressContent")!;
        progressContent.innerHTML = `
          <div class="card-grid">
            <div class="stat-card reveal"><div class="label">Peso máximo</div><div class="value">${max} ${unidad}<small>${escapeHtml(formatFechaCorta(maxEntry.fecha))}</small></div></div>
            <div class="stat-card reveal"><div class="label">1RM estimado</div><div class="value">${rm} ${unidad}<small>${rmIsEstimate ? "Fórmula de Epley sobre tu máximo" : "Tu marca máxima registrada"}</small></div></div>
            <div class="stat-card reveal"><div class="label">Promedio últimas ${sesionesLabel(recent.length)}</div><div class="value">${recentAvg} ${unidad}</div></div>
            <div class="stat-card reveal"><div class="label">Peso proyectado (4 semanas)</div><div class="value">${projected !== null ? `${projected} ${unidad}` : "—"}<small>${projected !== null ? "Según tu ritmo de progreso" : "Necesitás más registros"}</small></div></div>
            <div class="stat-card reveal"><div class="label">Progreso total</div><div class="value">${points.length >= 2 ? `${delta >= 0 ? "+" : ""}${delta} ${unidad}<small>${deltaPct >= 0 ? "+" : ""}${deltaPct}% desde el primer registro</small>` : `—<small>Necesitás al menos 2 registros</small>`}</div></div>
            <div class="stat-card reveal"><div class="label">Veces entrenado</div><div class="value">${points.length}<small>Mínimo registrado: ${min} ${unidad}</small></div></div>
          </div>

          <div class="chart-card reveal">
            <h3>${escapeHtml(group.name)}</h3>
            <p class="chart-sub">Ejercicio de ${escapeHtml(group.authorName)} · evolución del peso máximo levantado por sesión</p>
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

        const Chart = await loadChart();

        const lineCanvas = container.querySelector("#progressChart") as HTMLCanvasElement | null;
        if (lineCanvas) {
          lineChartInstance = new Chart(lineCanvas, {
            type: "line",
            data: {
              labels: points.map((p) => formatFechaCorta(p.fecha)),
              datasets: [{ label: `Peso (${unidad})`, data: weights, borderColor: "#ff8a3d", backgroundColor: "rgba(255, 138, 61, 0.18)", borderWidth: 2, tension: 0.3, fill: true, pointBackgroundColor: "#ff8a3d" }],
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
        const sessionCanvas = container.querySelector("#sessionChart") as HTMLCanvasElement | null;
        if (sessionCanvas) {
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
          const volumeCanvas = container.querySelector("#volumeChart") as HTMLCanvasElement | null;
          if (volumeCanvas) {
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

      function wireActiveRoutineAccordion(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>(".day-row").forEach((btn) => {
          btn.addEventListener("click", () => {
            const accordion = btn.closest(".day-accordion");
            const detail = accordion?.querySelector<HTMLElement>(".day-detail");
            if (!accordion || !detail) return;
            const isOpen = accordion.classList.toggle("open");
            detail.hidden = !isOpen;
          });
        });
      }

      async function renderActiveRoutineSection(userId: string): Promise<void> {
        const activeContainer = container.querySelector("#activeRoutineContent");
        if (!activeContainer) return;
        try {
          const [activeRoutine] = await listRoutines(userId, "active");
          const routine = activeRoutine ? await getRoutineDetail(activeRoutine.id) : null;
          if (!routine) {
            activeContainer.innerHTML = activeRoutineEmptyMarkup();
            return;
          }

          const exerciseIds = routine.semanas.flatMap((w) => w.dias.flatMap((d) => d.ejercicios.map((e) => e.id)));
          const [latestWeights, comments] = await Promise.all([getLatestWeights(exerciseIds), listCommentsForExercises(exerciseIds)]);

          activeContainer.innerHTML = activeRoutineMarkup(routine, latestWeights, comments);
          wireActiveRoutineAccordion(activeContainer as HTMLElement);
        } catch {
          activeContainer.innerHTML = `<p class="chart-sub">No se pudo cargar el detalle de la rutina activa.</p>`;
        }
      }

      // ---------- Pestañas: Rutina activa / Resumen / Detalle por ejercicio ----------
      // Cada pestaña se carga (y sus graficos de Chart.js se instancian) recien la primera
      // vez que se abre, con el panel ya visible en el DOM -- crear un Chart sobre un canvas
      // oculto (display:none) lo deja con tamaño 0 y rompe el render.

      let currentTab: ProgressTab = "active";
      const loadedTabs = new Set<ProgressTab>();
      let groupsPromise: Promise<ExerciseGroup[]> | null = null;

      function ensureGroups(): Promise<ExerciseGroup[]> {
        if (!groupsPromise) groupsPromise = listWeightLogsWithContext(targetUserId).then(groupByExercise);
        return groupsPromise;
      }

      async function loadTab(tab: ProgressTab): Promise<void> {
        if (loadedTabs.has(tab)) return;
        loadedTabs.add(tab);
        if (tab === "active") {
          await renderActiveRoutineSection(targetUserId);
        } else {
          const groups = await ensureGroups();
          if (tab === "overview") await renderOverviewTab(groups);
          else await renderDetailTab(groups);
        }
      }

      function switchTab(tab: ProgressTab): void {
        currentTab = tab;
        (Object.keys(TAB_PANELS) as ProgressTab[]).forEach((t) => {
          const panel = container.querySelector(`#${TAB_PANELS[t]}`) as HTMLElement | null;
          if (panel) panel.hidden = t !== tab;
        });
        container.querySelectorAll<HTMLButtonElement>("#progressTabs .routine-tab").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.tab === tab);
        });
        void loadTab(tab);
      }

      function wireTabs(): void {
        container.querySelectorAll<HTMLButtonElement>("#progressTabs .routine-tab").forEach((btn) => {
          btn.addEventListener(
            "click",
            () => {
              const tab = btn.dataset.tab as ProgressTab;
              if (tab !== currentTab) switchTab(tab);
            },
            { signal: ctx.signal }
          );
        });
      }

      const profile = await getProfile(targetUserId);
      if (!profile) {
        showProfileNotFound();
        return;
      }

      const title = container.querySelector("#pageTitle");
      if (title) title.textContent = `Progreso de ${escapeHtml(profile.nombre)}`;

      wireTabs();
      void loadTab(currentTab);
    }

    await render(params);

    updateHandler = (nextParams) => void render(nextParams);
    ctx.addCleanup(() => {
      updateHandler = null;
    });
  },
  update(params) {
    updateHandler?.(params);
  },
};
