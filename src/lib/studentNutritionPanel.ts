import { escapeHtml } from "./dom";
import { todayLocalISO } from "./dias";
import { loadChart } from "./chartLoader";
import { settleReveal } from "./nav";
import { openDatePickerModal } from "./datePickerModal";
import type { Chart as ChartInstance } from "chart.js";
import {
  getActiveNutritionTarget,
  listNutritionLogs,
  listNutritionLogsRange,
  type NutritionTarget,
  type NutritionLog,
} from "../services/nutrition.service";
import { mealMacros, type MacroSet } from "./macroCalculator";

// ---------------------------------------------------------------------------
// Panel SOLO LECTURA de la alimentación de un alumno, para la pestaña "Alimentación" de
// progress.ts (entrenador viendo a un alumno vía ?uid=). El alumno controla la visibilidad
// desde Configuración (nutrition_prefs.shareWithTrainer); RLS (trainer_can_see_nutrition) es
// la barrera real. Versión reducida de nutricion.ts sin edición: objetivo + vista del día
// navegable + gráfico de kcal de los últimos 7 días. Reusa las clases CSS `nutri-*`.
// ---------------------------------------------------------------------------

interface PanelCtx {
  addCleanup: (fn: () => void) => void;
  signal: AbortSignal;
}

function fmt(n: number): string {
  return String(Math.round(n));
}

const WEEKDAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
function dayMonth(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${m}`;
}
function dateHeading(viewDate: string, today: string): string {
  if (viewDate === today) return `Hoy · ${dayMonth(viewDate)}`;
  if (viewDate === shiftISO(today, -1)) return `Ayer · ${dayMonth(viewDate)}`;
  const [y, m, d] = viewDate.split("-").map(Number);
  return `${WEEKDAY_SHORT[new Date(y, m - 1, d).getDay()]} ${d}/${m}`;
}

interface DayMacros {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}
const EMPTY_DAY: DayMacros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

function sumMacros(logs: NutritionLog[]): DayMacros {
  return logs.reduce<DayMacros>(
    (a, l) => ({ kcal: a.kcal + l.kcal, protein_g: a.protein_g + l.protein_g, carbs_g: a.carbs_g + l.carbs_g, fat_g: a.fat_g + l.fat_g }),
    { ...EMPTY_DAY }
  );
}

const UNIT_SHORT: Record<NutritionLog["displayUnit"], string> = { g: "g", lb: "lb", porcion: "porción" };
function qtyLabel(log: NutritionLog): string {
  const n = Math.round(log.displayQty * 100) / 100;
  const unit = log.displayUnit === "porcion" && n !== 1 ? "porciones" : UNIT_SHORT[log.displayUnit];
  return `${n} ${unit}`;
}

function macroBar(label: string, consumed: number, target: number, cls: string): string {
  const pct = target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0;
  const over = consumed > target * 1.02;
  return `
    <div class="nutri-bar">
      <div class="nutri-bar-head"><span>${label}</span><span>${fmt(consumed)} / ${fmt(target)}</span></div>
      <div class="nutri-bar-track"><div class="nutri-bar-fill ${cls}${over ? " nutri-bar-over" : ""}" style="width:${pct}%"></div></div>
    </div>`;
}

function targetMacros(target: NutritionTarget): MacroSet {
  return { kcal: target.kcal, protein_g: target.protein_g, carbs_g: target.carbs_g, fat_g: target.fat_g };
}

function targetCardMarkup(target: NutritionTarget): string {
  const meals = target.meals
    .map((meal) => {
      const mm = mealMacros(targetMacros(target), meal.pct);
      return `<li><span>${escapeHtml(meal.name)} <small>(${meal.pct}%)</small></span><span>${fmt(mm.kcal)} kcal · ${fmt(mm.protein_g)}P ${fmt(mm.carbs_g)}C ${fmt(mm.fat_g)}G</span></li>`;
    })
    .join("");
  return `
    <div class="chart-card reveal">
      <h3>Objetivo diario</h3>
      <div class="nutri-macro-grid">
        <div class="nutri-macro-chip nutri-macro-kcal"><span class="nutri-macro-value">${fmt(target.kcal)}<small>kcal</small></span><span class="nutri-macro-label">Calorías</span></div>
        <div class="nutri-macro-chip nutri-macro-protein_g"><span class="nutri-macro-value">${fmt(target.protein_g)}<small>g</small></span><span class="nutri-macro-label">Proteína</span></div>
        <div class="nutri-macro-chip nutri-macro-carbs_g"><span class="nutri-macro-value">${fmt(target.carbs_g)}<small>g</small></span><span class="nutri-macro-label">Carbos</span></div>
        <div class="nutri-macro-chip nutri-macro-fat_g"><span class="nutri-macro-value">${fmt(target.fat_g)}<small>g</small></span><span class="nutri-macro-label">Grasa</span></div>
      </div>
      <p class="chart-sub" style="margin:14px 0 6px;">Reparto en ${target.meals.length} comida${target.meals.length === 1 ? "" : "s"}:</p>
      <ul class="nutri-meal-split">${meals}</ul>
    </div>
  `;
}

function dayViewMarkup(target: NutritionTarget, logs: NutritionLog[], viewDate: string, today: string): string {
  const daily = targetMacros(target);
  const consumed = sumMacros(logs);
  const isToday = viewDate === today;
  const overallDiff = Math.round(consumed.kcal - daily.kcal);
  const headline =
    logs.length === 0
      ? isToday
        ? "El alumno todavía no cargó nada hoy."
        : "El alumno no cargó nada ese día."
      : overallDiff > 60
        ? `Se pasó ${overallDiff} kcal del objetivo.`
        : overallDiff >= -120
          ? "Estuvo en el objetivo."
          : `Le faltaron ${-overallDiff} kcal para el objetivo.`;

  const meals = target.meals
    .map((meal, i) => {
      const mealLogs = logs.filter((l) => l.mealIndex === i);
      const mealTarget = mealMacros(daily, meal.pct);
      const mealConsumed = sumMacros(mealLogs);
      const foodRows = mealLogs
        .map(
          (l) => `
        <div class="nutri-log-row">
          <div class="nutri-log-main">
            <span class="nutri-log-name">${escapeHtml(l.foodName)}${l.brand ? ` <span class="nutri-log-brand">${escapeHtml(l.brand)}</span>` : ""}</span>
            <span class="nutri-log-sub">${escapeHtml(qtyLabel(l))} · ${fmt(l.kcal)} kcal · ${fmt(l.protein_g)}P ${fmt(l.carbs_g)}C ${fmt(l.fat_g)}G</span>
          </div>
        </div>`
        )
        .join("");
      return `
      <div class="nutri-meal-card">
        <div class="nutri-meal-head">
          <h4>${escapeHtml(meal.name)}</h4>
          <span class="nutri-meal-pct">${fmt(mealConsumed.kcal)} / ${fmt(mealTarget.kcal)} kcal</span>
        </div>
        ${foodRows ? `<div class="nutri-log-list">${foodRows}</div>` : `<p class="chart-sub" style="margin:6px 0 0;">Sin registros en esta comida.</p>`}
      </div>`;
    })
    .join("");

  return `
    <div class="chart-card reveal nutri-target-card">
      <div class="nutri-date-nav">
        <button type="button" class="nutri-date-arrow" data-nav="prev" aria-label="Día anterior">‹</button>
        <button type="button" class="nutri-date-current" data-nav="pick" aria-label="Elegir fecha">
          <strong>${escapeHtml(dateHeading(viewDate, today))}</strong>
          <svg class="nutri-date-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <button type="button" class="nutri-date-arrow" data-nav="next" aria-label="Día siguiente"${isToday ? " disabled" : ""}>›</button>
        ${isToday ? "" : `<button type="button" class="btn btn-outline btn-sm" data-nav="today">Hoy</button>`}
      </div>
      <p class="chart-sub nutri-summary-headline">${escapeHtml(headline)}</p>
      <div class="nutri-bars nutri-summary-bars">
        ${macroBar("Calorías", consumed.kcal, daily.kcal, "nutri-bar-kcal")}
        ${macroBar("Proteína", consumed.protein_g, daily.protein_g, "nutri-bar-p")}
        ${macroBar("Carbos", consumed.carbs_g, daily.carbs_g, "nutri-bar-c")}
        ${macroBar("Grasa", consumed.fat_g, daily.fat_g, "nutri-bar-f")}
      </div>
    </div>
    <div class="nutri-meal-list">${meals}</div>
  `;
}

function emptyMarkup(text: string): string {
  return `
    <div class="empty-state in-view">
      <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h16M6 3v6a6 6 0 0 0 12 0V3M12 15v6M8 21h8"/></svg></div>
      <h3>Sin datos para mostrar</h3>
      <p>${escapeHtml(text)}</p>
    </div>
  `;
}

export async function renderStudentNutritionPanel(host: HTMLElement, opts: { studentId: string }, ctx: PanelCtx): Promise<void> {
  host.innerHTML = `<p class="chart-sub">Cargando alimentación del alumno...</p>`;
  const { studentId } = opts;
  const today = todayLocalISO();

  let target: NutritionTarget | null;
  let rangeLogs: NutritionLog[];
  try {
    [target, rangeLogs] = await Promise.all([
      getActiveNutritionTarget(studentId),
      listNutritionLogsRange(studentId, shiftISO(today, -6), today).catch(() => [] as NutritionLog[]),
    ]);
  } catch {
    host.innerHTML = emptyMarkup("No se pudo cargar la alimentación. Probá de nuevo.");
    return;
  }
  if (ctx.signal.aborted) return;

  if (!target) {
    host.innerHTML = emptyMarkup("El alumno todavía no definió un objetivo de calorías y macros.");
    return;
  }
  const activeTarget = target;

  let chart: ChartInstance | null = null;
  ctx.addCleanup(() => chart?.destroy());

  host.innerHTML = `
    ${targetCardMarkup(activeTarget)}
    <div id="stNutriDay"></div>
    <div class="chart-card reveal">
      <h3>Últimos 7 días</h3>
      <p class="chart-sub">Calorías por día contra el objetivo de ${fmt(activeTarget.kcal)} kcal.</p>
      <div class="chart-wrap"><canvas id="stNutriWeekChart"></canvas></div>
    </div>
  `;

  settleReveal(host);

  const dayHost = host.querySelector<HTMLElement>("#stNutriDay")!;
  let viewDate = today;

  async function renderDay(): Promise<void> {
    dayHost.innerHTML = `<p class="chart-sub">Cargando ${escapeHtml(dateHeading(viewDate, today))}...</p>`;
    const logs = viewDate === today ? rangeLogs.filter((l) => l.logDate === today) : await listNutritionLogs(studentId, viewDate).catch(() => [] as NutritionLog[]);
    if (ctx.signal.aborted) return;
    dayHost.innerHTML = dayViewMarkup(activeTarget, logs, viewDate, today);
    settleReveal(dayHost);
    dayHost.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach((btn) => {
      btn.addEventListener(
        "click",
        () => {
          const nav = btn.dataset.nav;
          if (nav === "prev") viewDate = shiftISO(viewDate, -1);
          else if (nav === "next" && viewDate < today) viewDate = shiftISO(viewDate, 1);
          else if (nav === "today") viewDate = today;
          else if (nav === "pick") {
            openDatePickerModal({ value: viewDate, max: today, onPick: (iso) => { viewDate = iso; void renderDay(); } });
            return;
          } else return;
          void renderDay();
        },
        { signal: ctx.signal }
      );
    });
  }
  await renderDay();

  // Gráfico de 7 días (kcal/día).
  const days = Array.from({ length: 7 }, (_, i) => shiftISO(today, -6 + i));
  const kcalByDay = days.map((d) => Math.round(sumMacros(rangeLogs.filter((l) => l.logDate === d)).kcal));
  const canvas = host.querySelector<HTMLCanvasElement>("#stNutriWeekChart");
  if (canvas) {
    const Chart = await loadChart();
    if (ctx.signal.aborted) return;
    chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: days.map((d) => dayMonth(d)),
        datasets: [
          { label: "kcal", data: kcalByDay, backgroundColor: "#ff8a3d", borderRadius: 6, maxBarThickness: 34 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { afterLabel: () => `Objetivo: ${fmt(activeTarget.kcal)} kcal` } },
        },
        scales: {
          y: { beginAtZero: true, ticks: { color: "#9aa1ac" }, grid: { color: "#262b33" } },
          x: { ticks: { color: "#9aa1ac" }, grid: { display: false } },
        },
      },
    });
  }
}
