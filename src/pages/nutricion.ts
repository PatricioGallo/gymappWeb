import type { ViewModule } from "../shell/router";
import { navigate, reloadActiveView } from "../shell/router";
import { escapeHtml } from "../lib/dom";
import {
  getNutritionPrefs,
  getActiveNutritionTarget,
  saveNutritionTarget,
  getNutritionCalcInputs,
  listNutritionLogs,
  addNutritionLog,
  addNutritionLogs,
  updateNutritionLogQuantity,
  deleteNutritionLog,
  type NutritionTarget,
  type NutritionCalcInputs,
  type NutritionLog,
  type FoodMacros,
} from "../services/nutrition.service";
import { openFoodPicker, type PickedFood } from "../lib/foodPicker";
import { openMealSuggestions } from "../lib/mealSuggestionsModal";
import { openNutritionIntroModal } from "../lib/nutritionIntroModal";
import { openDatePickerModal } from "../lib/datePickerModal";
import { todayLocalISO, dateToLocalISO } from "../lib/dias";
import { settleReveal } from "../lib/nav";
import { loadChart } from "../lib/chartLoader";
import type { Chart as ChartInstance } from "chart.js";
import {
  calcMacros,
  bmrMifflinStJeor,
  tdee,
  macrosFromPercentages,
  percentagesFromMacros,
  defaultMeals,
  mealMacros,
  mealsPctTotal,
  rescaleMealsTo100,
  ACTIVITY_FACTORS,
  ACTIVITY_LABELS,
  GOAL_LABELS,
  GOAL_HINTS,
  MIN_MEALS,
  MAX_MEALS,
  type Goal,
  type ActivityLevel,
  type Sex,
  type MacroSet,
  type Meal,
} from "../lib/macroCalculator";

const BACK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;

// El shell mantiene la instancia de la vista viva al navegar afuera y llama update() (no
// mount()) al volver -- este handler, seteado en mount(), reevalúa prefs/objetivo. Ver medidas.ts.
let updateHandler: ((params?: URLSearchParams) => void) | null = null;

const VIEW_MARKUP = `
  <section class="page-hero-slim">
    <div class="container">
      <a href="profile.html" class="back-link" id="backToProfile">${BACK_ICON}Volver al perfil</a>
      <span class="eyebrow">Alimentación</span>
    </div>
  </section>

  <section class="features">
    <div class="container">
      <div id="nutriContent"></div>
    </div>
  </section>
`;

// ---------------------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return String(Math.round(n));
}

const WEEKDAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** Suma (o resta) días a una fecha "YYYY-MM-DD" respetando el calendario local. */
function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dateToLocalISO(dt);
}

/** "7/9" -- día y mes sin año, para la tira de fechas. */
function dayMonth(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${m}`;
}

/** Encabezado del día visto: "Hoy · 7/9" / "Ayer · 6/9" / "sáb 30/8". */
function dateHeading(viewDate: string, today: string): string {
  if (viewDate === today) return `Hoy · ${dayMonth(viewDate)}`;
  if (viewDate === shiftISO(today, -1)) return `Ayer · ${dayMonth(viewDate)}`;
  const [y, m, d] = viewDate.split("-").map(Number);
  return `${WEEKDAY_SHORT[new Date(y, m - 1, d).getDay()]} ${d}/${m}`;
}

const MACRO_META: Array<{ key: keyof MacroSet; label: string; unit: string }> = [
  { key: "kcal", label: "Calorías", unit: "kcal" },
  { key: "protein_g", label: "Proteína", unit: "g" },
  { key: "carbs_g", label: "Carbos", unit: "g" },
  { key: "fat_g", label: "Grasa", unit: "g" },
];

function macroChipsMarkup(macros: MacroSet): string {
  return `
    <div class="nutri-macro-grid">
      ${MACRO_META.map(
        (m) => `
        <div class="nutri-macro-chip nutri-macro-${m.key}">
          <span class="nutri-macro-value">${fmt(macros[m.key])}<small>${m.unit}</small></span>
          <span class="nutri-macro-label">${m.label}</span>
        </div>`
      ).join("")}
    </div>
  `;
}

function targetMacros(target: NutritionTarget): MacroSet {
  return { kcal: target.kcal, protein_g: target.protein_g, carbs_g: target.carbs_g, fat_g: target.fat_g };
}

// ---------------------------------------------------------------------------
// Estado vacío / resumen del objetivo (Fase 3 reemplaza el resumen por la vista
// del día completa con carga de alimentos).
// ---------------------------------------------------------------------------

function emptyMarkup(): string {
  return `
    <div class="empty-state reveal">
      <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h16M6 3v6a6 6 0 0 0 12 0V3M12 15v6M8 21h8"/></svg></div>
      <h3>Todavía no definiste tu objetivo</h3>
      <p>Elegí cuántas calorías y macros querés por día -- a mano o con un cálculo a partir de tu peso y altura. Después lo repartís en comidas.</p>
      <button class="btn btn-primary" id="defineTargetBtn" type="button">Definir mis macros</button>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Vista del día
// ---------------------------------------------------------------------------

const EMPTY_MACROS: FoodMacros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };

function sumMacros(logs: NutritionLog[]): FoodMacros {
  return logs.reduce<FoodMacros>(
    (acc, l) => ({
      kcal: acc.kcal + l.kcal,
      protein_g: acc.protein_g + l.protein_g,
      carbs_g: acc.carbs_g + l.carbs_g,
      fat_g: acc.fat_g + l.fat_g,
      fiber_g: (acc.fiber_g ?? 0) + (l.fiber_g ?? 0),
    }),
    { ...EMPTY_MACROS }
  );
}

const UNIT_SHORT: Record<NutritionLog["displayUnit"], string> = { g: "g", lb: "lb", porcion: "porción" };

/** Reescala los macros de un log por un factor (cambio de cantidad, o al repetir una comida). */
function scaleLogMacros(log: NutritionLog, f: number): FoodMacros {
  return {
    kcal: Math.round(log.kcal * f),
    protein_g: Math.round(log.protein_g * f),
    carbs_g: Math.round(log.carbs_g * f),
    fat_g: Math.round(log.fat_g * f),
    fiber_g: log.fiber_g != null ? Math.round(log.fiber_g * f * 10) / 10 : null,
  };
}

function qtyLabel(log: NutritionLog): string {
  const n = Math.round(log.displayQty * 100) / 100;
  const unit = log.displayUnit === "porcion" && n !== 1 ? "porciones" : UNIT_SHORT[log.displayUnit];
  return `${n} ${unit}`;
}

/** Mensaje de cómo va el día respecto al objetivo de calorías (+ aviso de proteína si falta mucha). */
function dayStatus(consumed: FoodMacros, daily: MacroSet): { text: string; tone: "ok" | "under" | "over" } {
  const diff = Math.round(consumed.kcal - daily.kcal);
  const lowProtein = consumed.protein_g < daily.protein_g - 15;
  const proteinNote = lowProtein ? ` · te faltan ${Math.round(daily.protein_g - consumed.protein_g)} g de proteína` : "";
  if (diff > 50) return { text: `Te pasaste ${diff} kcal${proteinNote}`, tone: "over" };
  if (diff >= -120) return { text: `Vas bien: quedan ${Math.max(0, -diff)} kcal${proteinNote}`, tone: "ok" };
  return { text: `Te faltan ${-diff} kcal para tu objetivo${proteinNote}`, tone: "under" };
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

// Línea de estado por macro: "vas bien" / "te faltan X" / "te pasaste X". El margen de
// tolerancia es el 8% del objetivo (mínimo 8 unidades) para no marcar "te pasaste" por 3 g.
function macroStatusLine(label: string, consumed: number, target: number, unit: string): string {
  const tol = Math.max(8, target * 0.08);
  const diff = Math.round(consumed - target);
  let cls: "ok" | "under" | "over";
  let text: string;
  if (Math.abs(diff) <= tol) {
    cls = "ok";
    text = "vas bien";
  } else if (diff < 0) {
    cls = "under";
    text = `te faltan ${-diff} ${unit}`;
  } else {
    cls = "over";
    text = `te pasaste ${diff} ${unit}`;
  }
  return `<li class="nutri-mstat nutri-mstat-${cls}"><span>${label}</span><span>${text}</span></li>`;
}

function daySummaryMarkup(target: NutritionTarget, logs: NutritionLog[], isToday: boolean): string {
  const daily = targetMacros(target);
  const consumed = sumMacros(logs);
  const overallDiff = Math.round(consumed.kcal - daily.kcal);
  const headline =
    logs.length === 0
      ? isToday
        ? "Todavía no cargaste nada hoy."
        : "No cargaste nada ese día."
      : overallDiff > 60
        ? `Te pasaste ${overallDiff} kcal. Cuidá las porciones el resto del día.`
        : overallDiff >= -120
          ? "Estás en el objetivo. Bien ahí."
          : `Podés sumar ~${-overallDiff} kcal más para llegar a tu objetivo.`;

  return `
    <div class="chart-card reveal" id="nutriDaySummary">
      <h3>Resumen del día</h3>
      <p class="chart-sub nutri-summary-headline">${escapeHtml(headline)}</p>
      <div class="nutri-summary-grid">
        <div class="nutri-donut-wrap">
          <div class="chart-wrap nutri-donut"><canvas id="nutriMacroChart"></canvas></div>
          <div class="nutri-donut-center">
            <strong>${fmt(consumed.kcal)}</strong>
            <span>de ${fmt(daily.kcal)} kcal</span>
          </div>
        </div>
        <div class="nutri-bars nutri-summary-bars">
          ${macroBar("Calorías", consumed.kcal, daily.kcal, "nutri-bar-kcal")}
          ${macroBar("Proteína", consumed.protein_g, daily.protein_g, "nutri-bar-p")}
          ${macroBar("Carbos", consumed.carbs_g, daily.carbs_g, "nutri-bar-c")}
          ${macroBar("Grasa", consumed.fat_g, daily.fat_g, "nutri-bar-f")}
        </div>
      </div>
      <ul class="nutri-macro-status">
        ${macroStatusLine("Calorías", consumed.kcal, daily.kcal, "kcal")}
        ${macroStatusLine("Proteína", consumed.protein_g, daily.protein_g, "g")}
        ${macroStatusLine("Carbos", consumed.carbs_g, daily.carbs_g, "g")}
        ${macroStatusLine("Grasa", consumed.fat_g, daily.fat_g, "g")}
      </ul>
    </div>
  `;
}

function dayViewMarkup(target: NutritionTarget, logs: NutritionLog[], viewDate: string, today: string): string {
  const daily = targetMacros(target);
  const consumed = sumMacros(logs);
  const status = dayStatus(consumed, daily);
  const isToday = viewDate === today;

  const meals = target.meals
    .map((meal, i) => {
      const mealLogs = logs.filter((l) => l.mealIndex === i);
      const mealTarget = mealMacros(daily, meal.pct);
      const mealConsumed = sumMacros(mealLogs);
      const foodRows = mealLogs
        .map(
          (l) => `
        <div class="nutri-log-row" data-log="${l.id}">
          <div class="nutri-log-main">
            <span class="nutri-log-name">${escapeHtml(l.foodName)}${l.brand ? ` <span class="nutri-log-brand">${escapeHtml(l.brand)}</span>` : ""}</span>
            <span class="nutri-log-sub">${escapeHtml(qtyLabel(l))} · ${fmt(l.kcal)} kcal · ${fmt(l.protein_g)}P ${fmt(l.carbs_g)}C ${fmt(l.fat_g)}G</span>
          </div>
          <button type="button" class="nutri-log-edit" data-log-edit="${l.id}" aria-label="Cambiar cantidad">✎</button>
          <button type="button" class="nutri-log-del" data-log-del="${l.id}" aria-label="Quitar">×</button>
        </div>`
        )
        .join("");

      return `
      <div class="nutri-meal-card">
        <div class="nutri-meal-head">
          <h4>${escapeHtml(meal.name)}</h4>
          <span class="nutri-meal-pct">${fmt(mealConsumed.kcal)} / ${fmt(mealTarget.kcal)} kcal</span>
        </div>
        <div class="nutri-meal-targets">
          <span>Objetivo</span>
          <span class="nutri-mt nutri-mt-p"><strong>${fmt(mealTarget.protein_g)}</strong> P</span>
          <span class="nutri-mt nutri-mt-c"><strong>${fmt(mealTarget.carbs_g)}</strong> C</span>
          <span class="nutri-mt nutri-mt-f"><strong>${fmt(mealTarget.fat_g)}</strong> G</span>
        </div>
        ${foodRows ? `<div class="nutri-log-list">${foodRows}</div>` : ""}
        <div class="nutri-meal-actions">
          <button type="button" class="btn btn-outline btn-sm nutri-add-food" data-meal="${i}">+ Agregar alimento</button>
          <div class="nutri-meal-actions-sub">
            <button type="button" class="nutri-meal-mini nutri-meal-suggest" data-meal="${i}">💡 Sugerencias</button>
            <button type="button" class="nutri-meal-mini nutri-meal-repeat" data-meal="${i}">⟳ Repetir</button>
          </div>
        </div>
      </div>`;
    })
    .join("");

  return `
    <div class="chart-card reveal nutri-target-card">
      <div class="nutri-target-head">
        <div class="nutri-target-head-main">
          <div class="nutri-date-nav">
            <button type="button" class="nutri-date-arrow" id="nutriPrevDay" aria-label="Día anterior">‹</button>
            <button type="button" class="nutri-date-current" id="nutriDateBtn" aria-label="Elegir fecha">
              <strong>${escapeHtml(dateHeading(viewDate, today))}</strong>
              <svg class="nutri-date-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <button type="button" class="nutri-date-arrow" id="nutriNextDay" aria-label="Día siguiente"${isToday ? " disabled" : ""}>›</button>
            ${isToday ? "" : `<button type="button" class="btn btn-outline btn-sm" id="nutriToday">Hoy</button>`}
          </div>
          <p class="chart-sub nutri-status nutri-status-${status.tone}">${escapeHtml(status.text)}</p>
        </div>
        <div class="nutri-target-head-actions">
          <button class="btn btn-outline btn-sm" id="repeatDayBtn" type="button">⟳ Repetir día</button>
          <button class="btn btn-outline btn-sm" id="editTargetBtn" type="button">Editar objetivo</button>
        </div>
      </div>
    </div>
    <div class="nutri-meal-list">${meals}</div>
    ${daySummaryMarkup(target, logs, isToday)}
  `;
}

// ---------------------------------------------------------------------------
// Asistente para definir / editar el objetivo
// ---------------------------------------------------------------------------

type WizardMode = "manual" | "calculated";

interface WizardState {
  mode: WizardMode;
  manualKcal: string;
  manualPct: { protein: string; carbs: string; fat: string };
  activity: ActivityLevel;
  goal: Goal;
  sexOverride: Sex | "";
  meals: Meal[];
}

/** Factor de actividad -> nivel (para precargar el asistente al editar un objetivo calculado). */
function activityFromFactor(factor: number | null): ActivityLevel {
  if (factor == null) return "moderado";
  let best: ActivityLevel = "moderado";
  let bestDiff = Infinity;
  (Object.keys(ACTIVITY_FACTORS) as ActivityLevel[]).forEach((level) => {
    const diff = Math.abs(ACTIVITY_FACTORS[level] - factor);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = level;
    }
  });
  return best;
}

function initialWizardState(existing: NutritionTarget | null): WizardState {
  if (existing) {
    const pct = percentagesFromMacros(targetMacros(existing));
    return {
      mode: existing.mode,
      manualKcal: String(existing.kcal),
      manualPct: { protein: String(pct.proteinPct), carbs: String(pct.carbsPct), fat: String(pct.fatPct) },
      activity: activityFromFactor(existing.activityFactor),
      goal: existing.goal ?? "mantenimiento",
      sexOverride: "",
      meals: existing.meals.map((m) => ({ ...m })),
    };
  }
  return {
    mode: "manual",
    manualKcal: "",
    manualPct: { protein: "30", carbs: "40", fat: "30" },
    activity: "moderado",
    goal: "mantenimiento",
    sexOverride: "",
    meals: defaultMeals(4),
  };
}

export const nutricionView: ViewModule = {
  async mount(container, params, ctx, authUserId) {
    const myId = authUserId!; // ruta registrada con auth "required"

    // ?intro=1 = llegó tocando la notificación mensual "Seguí tu alimentación"
    // (ver notify_nutrition_reminder). Si todavía no activó la feature, en vez de rebotar seco
    // le abrimos el mini tutorial arriba de su propio perfil (mismo patrón que medidas.ts).
    const bounce = (p?: URLSearchParams) => {
      if (p?.get("intro") === "1") {
        openNutritionIntroModal();
        navigate("profile.html", { replace: true });
      } else {
        navigate("profile.html");
      }
    };

    let prefs = await getNutritionPrefs(myId);
    if (!prefs.enabled) {
      updateHandler = (p?: URLSearchParams) => {
        void (async () => {
          if ((await getNutritionPrefs(myId)).enabled) void reloadActiveView();
          else bounce(p);
        })();
      };
      ctx.addCleanup(() => {
        updateHandler = null;
      });
      bounce(params);
      return;
    }

    const today = todayLocalISO();
    let viewDate = today;
    let target = await getActiveNutritionTarget(myId);
    let logs: NutritionLog[] = [];
    let dayChart: ChartInstance | null = null;
    ctx.addCleanup(() => dayChart?.destroy());

    async function render(): Promise<void> {
      const content = container.querySelector("#nutriContent");
      if (!content) return;
      dayChart?.destroy();
      dayChart = null;
      if (!target) {
        content.innerHTML = emptyMarkup();
        content.querySelector("#defineTargetBtn")?.addEventListener("click", () => void openTargetWizard(null));
        return;
      }
      try {
        logs = await listNutritionLogs(myId, viewDate);
      } catch {
        content.innerHTML = `<p class="chart-sub">No se pudo cargar lo que registraste ese día. Probá recargar la página.</p>`;
        return;
      }
      content.innerHTML = dayViewMarkup(target, logs, viewDate, today);
      // La vista se re-renderiza entera en cada mutación / cambio de día -- sin esto la
      // "Resumen del día" (.chart-card.reveal) queda en opacity:0 si está bajo el fold, y
      // navegar días replica el fade-in cada vez. Ver settleReveal / gotcha en la memoria.
      settleReveal(content);
      wireDayView(content);
      void drawDayChart();
    }

    async function drawDayChart(): Promise<void> {
      const canvas = container.querySelector("#nutriMacroChart") as HTMLCanvasElement | null;
      if (!canvas || !target) return;
      const daily = targetMacros(target);
      const c = sumMacros(logs);
      const pKcal = Math.round(c.protein_g * 4);
      const cKcal = Math.round(c.carbs_g * 4);
      const fKcal = Math.round(c.fat_g * 9);
      const remaining = Math.max(0, Math.round(daily.kcal) - pKcal - cKcal - fKcal);

      const Chart = await loadChart();
      dayChart?.destroy();
      dayChart = new Chart(canvas, {
        type: "doughnut",
        data: {
          labels: ["Proteína", "Carbos", "Grasa", "Te falta"],
          datasets: [
            {
              data: [pKcal, cKcal, fKcal, remaining],
              backgroundColor: ["#6fb0e0", "#e0a63c", "#c58fe0", "#262b33"],
              borderColor: "#14171c",
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "68%",
          plugins: {
            legend: { position: "bottom", labels: { color: "#9aa1ac", boxWidth: 12, padding: 12 } },
            tooltip: { callbacks: { label: (item) => `${item.label}: ${Math.round(Number(item.parsed))} kcal` } },
          },
        },
      });
      ctx.addCleanup(() => dayChart?.destroy());
    }

    function wireDayView(content: Element): void {
      content.querySelector("#editTargetBtn")?.addEventListener("click", () => void openTargetWizard(target));
      content.querySelector("#repeatDayBtn")?.addEventListener("click", () => openRepeatModal({ kind: "day" }));

      // Navegación de días (cualquier día es editable; no se puede ir al futuro).
      content.querySelector("#nutriPrevDay")?.addEventListener("click", () => {
        viewDate = shiftISO(viewDate, -1);
        void render();
      });
      content.querySelector("#nutriNextDay")?.addEventListener("click", () => {
        if (viewDate >= today) return;
        viewDate = shiftISO(viewDate, 1);
        void render();
      });
      content.querySelector("#nutriToday")?.addEventListener("click", () => {
        viewDate = today;
        void render();
      });
      content.querySelector("#nutriDateBtn")?.addEventListener("click", () => {
        openDatePickerModal({
          value: viewDate,
          max: today,
          onPick: (v) => {
            viewDate = v > today ? today : v;
            void render();
          },
        });
      });

      function mealCtx(mealIndex: number): { meal: Meal; mealTarget: MacroSet; remaining: FoodMacros } | null {
        const meal = target?.meals[mealIndex];
        if (!meal || !target) return null;
        const mealTarget = mealMacros(targetMacros(target), meal.pct);
        const c = sumMacros(logs.filter((l) => l.mealIndex === mealIndex));
        return {
          meal,
          mealTarget,
          remaining: {
            kcal: mealTarget.kcal - c.kcal,
            protein_g: mealTarget.protein_g - c.protein_g,
            carbs_g: mealTarget.carbs_g - c.carbs_g,
            fat_g: mealTarget.fat_g - c.fat_g,
            fiber_g: null,
          },
        };
      }

      content.querySelectorAll<HTMLButtonElement>(".nutri-add-food").forEach((btn) => {
        btn.addEventListener("click", () => {
          const mi = Number(btn.dataset.meal);
          const mc = mealCtx(mi);
          if (!mc) return;
          openFoodPicker(
            (picked) => void addPicked(mi, mc.meal.name, picked),
            myId,
            { mealName: mc.meal.name, remainingKcal: Math.max(0, mc.remaining.kcal), remaining: mc.remaining },
            ctx
          );
        });
      });

      content.querySelectorAll<HTMLButtonElement>(".nutri-meal-suggest").forEach((btn) => {
        btn.addEventListener("click", () => {
          const mi = Number(btn.dataset.meal);
          const mc = mealCtx(mi);
          if (!mc) return;
          openMealSuggestions(
            async (combo) => {
              await addNutritionLogs(
                myId,
                combo.items.map((it) => ({
                  logDate: viewDate,
                  mealIndex: mi,
                  mealName: mc.meal.name,
                  foodId: it.food.id,
                  foodName: it.food.name,
                  brand: it.food.brand,
                  grams: it.grams,
                  displayQty: it.displayQty,
                  displayUnit: it.displayUnit,
                  macros: it.macros,
                }))
              );
            },
            { mealName: mc.meal.name, remaining: mc.remaining, mealTarget: mc.mealTarget },
            ctx,
            () => void render()
          );
        });
      });

      content.querySelectorAll<HTMLButtonElement>(".nutri-meal-repeat").forEach((btn) => {
        btn.addEventListener("click", () => {
          const mi = Number(btn.dataset.meal);
          const meal = target?.meals[mi];
          if (!meal) return;
          openRepeatModal({ kind: "meal", mealIndex: mi, mealName: meal.name });
        });
      });

      content.querySelectorAll<HTMLButtonElement>("[data-log-del]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const log = logs.find((l) => l.id === btn.dataset.logDel);
          if (log) confirmDeleteLog(log);
        });
      });
      content.querySelectorAll<HTMLButtonElement>("[data-log-edit]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const log = logs.find((l) => l.id === btn.dataset.logEdit);
          if (log) openEditLogModal(log);
        });
      });
    }

    async function addPicked(mealIndex: number, mealName: string, picked: PickedFood): Promise<void> {
      const { error } = await addNutritionLog(myId, {
        logDate: viewDate,
        mealIndex,
        mealName,
        foodId: picked.foodId,
        foodName: picked.foodName,
        brand: picked.brand,
        grams: picked.grams,
        displayQty: picked.displayQty,
        displayUnit: picked.displayUnit,
        macros: picked.macros,
      });
      if (error) {
        alert(error);
        return;
      }
      await render();
    }

    // -------------------------------------------------------------------------
    // Repetir una comida (o un día entero): se copian filas de un día origen a un
    // día destino (el que estás viendo, o -- si estás parado en un día pasado --
    // también podés mandarlas a hoy). Cantidades precargadas y editables. Ver Fase 6.
    // -------------------------------------------------------------------------

    type RepeatScope = { kind: "meal"; mealIndex: number; mealName: string } | { kind: "day" };

    function openRepeatModal(scope: RepeatScope): void {
      const host = document.getElementById("loaderBody");
      if (!host || !target) return;
      const loaderBody: HTMLElement = host;
      const activeTarget = target;

      let sourceDate = shiftISO(viewDate, -1);
      let destDate = viewDate;
      let sourceLogs: NutritionLog[] = [];

      const canPickDest = viewDate !== today; // en un día pasado se puede mandar a hoy
      const titleWord = scope.kind === "meal" ? scope.mealName : "el día";

      function repeatRow(l: NutritionLog): string {
        const n = Math.round(l.displayQty * 100) / 100;
        return `
          <div class="nutri-repeat-row" data-log="${l.id}">
            <input type="checkbox" class="nutri-repeat-check" checked aria-label="Incluir ${escapeHtml(l.foodName)}">
            <span class="nutri-repeat-name">${escapeHtml(l.foodName)}${l.brand ? ` <span class="nutri-log-brand">${escapeHtml(l.brand)}</span>` : ""}</span>
            <span class="nutri-repeat-qty">
              <input type="text" class="nutri-repeat-input" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" autocomplete="off" value="${n}">
              <small>${escapeHtml(UNIT_SHORT[l.displayUnit])}</small>
            </span>
          </div>`;
      }

      async function loadPreview(): Promise<void> {
        const box = loaderBody.querySelector("#repeatPreview");
        if (!box) return;
        box.innerHTML = `<p class="chart-sub">Cargando…</p>`;
        let all: NutritionLog[];
        try {
          all = await listNutritionLogs(myId, sourceDate);
        } catch {
          box.innerHTML = `<p class="chart-sub">No se pudo cargar ese día.</p>`;
          return;
        }
        sourceLogs = scope.kind === "meal" ? all.filter((l) => l.mealIndex === scope.mealIndex) : all;
        if (sourceDate === destDate) {
          box.innerHTML = `<p class="chart-sub">Elegí un día de origen distinto al de destino.</p>`;
          return;
        }
        if (sourceLogs.length === 0) {
          box.innerHTML = `<p class="chart-sub">No registraste ${scope.kind === "meal" ? "esa comida" : "nada"} ese día.</p>`;
          return;
        }
        if (scope.kind === "meal") {
          box.innerHTML = sourceLogs.map(repeatRow).join("");
          return;
        }
        const groups = new Map<number, NutritionLog[]>();
        for (const l of sourceLogs) {
          const arr = groups.get(l.mealIndex);
          if (arr) arr.push(l);
          else groups.set(l.mealIndex, [l]);
        }
        box.innerHTML = [...groups.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([mi, ls]) => {
            const name = activeTarget.meals[mi]?.name ?? ls[0].mealName;
            return `<div class="nutri-repeat-group"><h4>${escapeHtml(name)}</h4>${ls.map(repeatRow).join("")}</div>`;
          })
          .join("");
      }

      async function doCopy(): Promise<void> {
        const alertEl = loaderBody.querySelector("#repeatAlert")!;
        alertEl.innerHTML = "";
        const picked = [...loaderBody.querySelectorAll<HTMLElement>(".nutri-repeat-row")]
          .map((row) => {
            const log = sourceLogs.find((l) => l.id === row.dataset.log);
            const checked = (row.querySelector(".nutri-repeat-check") as HTMLInputElement).checked;
            const qty = Number((row.querySelector(".nutri-repeat-input") as HTMLInputElement).value.replace(",", "."));
            return { log, checked, qty };
          })
          .filter((r): r is { log: NutritionLog; checked: boolean; qty: number } => !!r.log && r.checked && Number.isFinite(r.qty) && r.qty > 0);
        if (picked.length === 0) {
          alertEl.innerHTML = "<p>Elegí al menos un alimento con una cantidad válida.</p>";
          return;
        }
        const btn = loaderBody.querySelector("#repeatConfirm") as HTMLButtonElement;
        btn.disabled = true;
        for (const { log, qty } of picked) {
          const f = log.displayQty > 0 ? qty / log.displayQty : 1;
          const gramsPerUnit = log.displayQty > 0 ? log.grams / log.displayQty : log.grams;
          const destMeal = scope.kind === "meal" ? scope.mealIndex : Math.min(log.mealIndex, activeTarget.meals.length - 1);
          const { error } = await addNutritionLog(myId, {
            logDate: destDate,
            mealIndex: destMeal,
            mealName: activeTarget.meals[destMeal]?.name ?? log.mealName,
            foodId: log.foodId,
            foodName: log.foodName,
            brand: log.brand,
            grams: Math.round(qty * gramsPerUnit * 10) / 10,
            displayQty: Math.round(qty * 100) / 100,
            displayUnit: log.displayUnit,
            macros: scaleLogMacros(log, f),
          });
          if (error) {
            btn.disabled = false;
            alertEl.innerHTML = `<p>${escapeHtml(error)}</p>`;
            return;
          }
        }
        const whereLabel = destDate === viewDate ? "" : destDate === today ? " a hoy" : ` al ${dayMonth(destDate)}`;
        loaderBody.innerHTML = `
          <div class="success-check-container">
            <div class="success-icon"><svg viewBox="0 0 52 52" class="success-svg"><circle cx="26" cy="26" r="25" fill="none" class="success-circle" /><path fill="none" d="M14 27l7 7 16-16" class="success-check" /></svg></div>
            <p>Copiamos ${picked.length} ${picked.length === 1 ? "alimento" : "alimentos"}${whereLabel}.</p>
          </div>`;
        await render();
        const t = setTimeout(() => {
          loaderBody.innerHTML = "";
        }, 1300);
        ctx.addCleanup(() => clearTimeout(t));
      }

      const destFieldMarkup = canPickDest
        ? `<div class="field">
              <label for="repeatDestDate">Copiar a</label>
              <select id="repeatDestDate">
                <option value="${viewDate}">Este día (${dayMonth(viewDate)})</option>
                <option value="${today}">Hoy (${dayMonth(today)})</option>
              </select>
            </div>`
        : "";

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card modal-card-lg">
            <h2>Repetir ${escapeHtml(titleWord)}</h2>
            <p class="subtitle">Copiá lo que comiste otro día. Ajustá las cantidades y confirmá.</p>
            <div class="field">
              <label for="repeatSourceDate">Copiar del día</label>
              <input type="date" id="repeatSourceDate" value="${sourceDate}" max="${today}">
            </div>
            ${destFieldMarkup}
            <div id="repeatPreview" class="nutri-repeat-preview"></div>
            <div class="alert_message" id="repeatAlert"></div>
            <div class="modal-actions">
              <button class="btn btn-primary" id="repeatConfirm" type="button">Confirmar</button>
              <button class="btn btn-outline" id="repeatCancel" type="button">Cancelar</button>
            </div>
          </div>
        </div>`;
      loaderBody.querySelector("#repeatCancel")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });
      loaderBody.querySelector("#repeatSourceDate")?.addEventListener("change", (e) => {
        sourceDate = (e.target as HTMLInputElement).value || sourceDate;
        void loadPreview();
      });
      loaderBody.querySelector("#repeatDestDate")?.addEventListener("change", (e) => {
        destDate = (e.target as HTMLSelectElement).value;
        void loadPreview();
      });
      loaderBody.querySelector("#repeatConfirm")?.addEventListener("click", () => void doCopy());
      void loadPreview();
    }

    function confirmDeleteLog(log: NutritionLog): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      const host: HTMLElement = loaderBody;
      host.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>Quitar alimento</h2>
            <p class="subtitle">Se va a quitar "${escapeHtml(log.foodName)}" de ${escapeHtml(log.mealName)}.</p>
            <div class="modal-actions">
              <button class="btn btn-danger" id="delLogYes" type="button">Quitar</button>
              <button class="btn btn-outline" id="delLogNo" type="button">Cancelar</button>
            </div>
          </div>
        </div>`;
      host.querySelector("#delLogNo")?.addEventListener("click", () => {
        host.innerHTML = "";
      });
      host.querySelector("#delLogYes")?.addEventListener("click", async () => {
        const { error } = await deleteNutritionLog(log.id);
        host.innerHTML = "";
        if (error) {
          alert(error);
          return;
        }
        await render();
      });
    }

    function openEditLogModal(log: NutritionLog): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      const host: HTMLElement = loaderBody;
      const gramsPerUnit = log.displayQty > 0 ? log.grams / log.displayQty : log.grams;
      host.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>${escapeHtml(log.foodName)}</h2>
            <p class="subtitle">Cambiá la cantidad (${escapeHtml(UNIT_SHORT[log.displayUnit])}).</p>
            <div class="field">
              <label for="editLogQty">Cantidad</label>
              <input type="text" id="editLogQty" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" autocomplete="off" value="${Math.round(log.displayQty * 100) / 100}">
            </div>
            <div class="nutri-qty-preview" id="editLogPreview"></div>
            <div class="alert_message" id="editLogAlert"></div>
            <div class="modal-actions">
              <button class="btn btn-primary" id="editLogSave" type="button">Guardar</button>
              <button class="btn btn-outline" id="editLogCancel" type="button">Cancelar</button>
            </div>
          </div>
        </div>`;
      const input = host.querySelector("#editLogQty") as HTMLInputElement;
      const preview = host.querySelector("#editLogPreview")!;
      function refresh(): void {
        const qty = Number(input.value.replace(",", ".")) || 0;
        const f = log.displayQty > 0 ? qty / log.displayQty : 0;
        if (f <= 0) {
          preview.innerHTML = `<p class="chart-sub">Ingresá una cantidad.</p>`;
          return;
        }
        preview.innerHTML = `<div class="nutri-qty-grams">${Math.round(qty * gramsPerUnit)} g</div>
          <p class="chart-sub">${fmt(log.kcal * f)} kcal · ${fmt(log.protein_g * f)} P · ${fmt(log.carbs_g * f)} C · ${fmt(log.fat_g * f)} G</p>`;
      }
      input.addEventListener("input", refresh);
      refresh();
      host.querySelector("#editLogCancel")?.addEventListener("click", () => {
        host.innerHTML = "";
      });
      host.querySelector("#editLogSave")?.addEventListener("click", async () => {
        const qty = Number(input.value.replace(",", "."));
        if (!Number.isFinite(qty) || qty <= 0) {
          host.querySelector("#editLogAlert")!.innerHTML = "<p>Cantidad inválida.</p>";
          return;
        }
        const f = qty / log.displayQty;
        const { error } = await updateNutritionLogQuantity(log.id, {
          grams: Math.round(qty * gramsPerUnit * 10) / 10,
          displayQty: Math.round(qty * 100) / 100,
          displayUnit: log.displayUnit,
          macros: scaleLogMacros(log, f),
        });
        host.innerHTML = "";
        if (error) {
          alert(error);
          return;
        }
        await render();
      });
    }

    // -------------------------------------------------------------------------
    // Asistente
    // -------------------------------------------------------------------------

    async function openTargetWizard(existing: NutritionTarget | null): Promise<void> {
      const host = document.getElementById("loaderBody");
      if (!host) return;
      const loaderBody: HTMLElement = host; // narrow para las closures de abajo

      const state = initialWizardState(existing);
      let calcInputs: NutritionCalcInputs | null = null;
      try {
        calcInputs = await getNutritionCalcInputs(myId);
      } catch {
        calcInputs = null;
      }

      // El selector de sexo arranca en el género del perfil (hombre/mujer). Si es "otro" o no
      // está cargado, queda en "Elegí una opción" y el usuario lo elige a mano.
      const profileSex = calcInputs?.sex;
      if (!state.sexOverride && (profileSex === "hombre" || profileSex === "mujer")) {
        state.sexOverride = profileSex;
      }

      // Sexo efectivo para el cálculo: lo que muestra el selector del asistente.
      const effectiveSex = (): Sex | null => (state.sexOverride || null) as Sex | null;

      // Qué falta para poder calcular (peso, altura, edad). El sexo se resuelve con
      // el selector del asistente, así que no cuenta como "faltante" acá.
      function missingCalcData(): string[] {
        const missing: string[] = [];
        if (!calcInputs) return ["tus datos de perfil"];
        if (!calcInputs.measurementsEnabled || calcInputs.weightKg == null) missing.push("tu peso (en Medidas corporales)");
        if (calcInputs.heightCm == null) missing.push("tu altura (en Configuración)");
        if (calcInputs.age == null) missing.push("tu fecha de nacimiento (en Configuración)");
        return missing;
      }

      function computedMacros(): { macros: MacroSet; note: string } | null {
        if (state.mode === "manual") {
          const kcal = Number(state.manualKcal.replace(",", "."));
          const p = Number(state.manualPct.protein.replace(",", "."));
          const c = Number(state.manualPct.carbs.replace(",", "."));
          const f = Number(state.manualPct.fat.replace(",", "."));
          if (!Number.isFinite(kcal) || kcal <= 0) return null;
          if (![p, c, f].every((x) => Number.isFinite(x) && x >= 0)) return null;
          if (Math.round(p + c + f) !== 100) return null;
          return { macros: macrosFromPercentages(kcal, p, c, f), note: "" };
        }
        const sex = effectiveSex();
        if (!calcInputs || calcInputs.weightKg == null || calcInputs.heightCm == null || calcInputs.age == null || !sex) {
          return null;
        }
        const macros = calcMacros({
          weightKg: calcInputs.weightKg,
          heightCm: calcInputs.heightCm,
          age: calcInputs.age,
          sex,
          activity: state.activity,
          goal: state.goal,
        });
        const bmr = bmrMifflinStJeor(calcInputs.weightKg, calcInputs.heightCm, calcInputs.age, sex);
        const maint = Math.round(tdee(bmr, state.activity) / 10) * 10;
        return {
          macros,
          note: `Mantenimiento estimado: ~${maint} kcal · ${GOAL_LABELS[state.goal]} → ${macros.kcal} kcal`,
        };
      }

      function modeSectionMarkup(): string {
        if (state.mode === "manual") {
          return `
            <div class="field">
              <label for="wizKcal">Calorías por día</label>
              <input type="text" id="wizKcal" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="Ej: 2200" value="${escapeHtml(state.manualKcal)}">
            </div>
            <div class="field">
              <label>Reparto de macros (%)</label>
              <div class="nutri-pct-row">
                <label class="nutri-pct-field"><span>Proteína</span><input type="text" id="wizPctP" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(state.manualPct.protein)}"></label>
                <label class="nutri-pct-field"><span>Carbos</span><input type="text" id="wizPctC" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(state.manualPct.carbs)}"></label>
                <label class="nutri-pct-field"><span>Grasa</span><input type="text" id="wizPctF" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(state.manualPct.fat)}"></label>
              </div>
              <p class="nutri-pct-sum" id="wizPctSum"></p>
            </div>
          `;
        }
        const missing = missingCalcData();
        if (missing.length > 0) {
          return `
            <div class="nutri-calc-missing">
              <p>Para calcular tus macros necesitás cargar ${escapeHtml(missing.join(", "))}.</p>
              <p class="chart-sub">Podés hacerlo y volver, o definir tus macros a mano con la opción de arriba.</p>
            </div>
          `;
        }
        return `
          <div class="field">
            <label for="wizSex">Sexo (para el cálculo)</label>
            <select id="wizSex">
              <option value="" ${state.sexOverride === "" ? "selected" : ""}>Elegí una opción</option>
              <option value="hombre" ${state.sexOverride === "hombre" ? "selected" : ""}>Hombre</option>
              <option value="mujer" ${state.sexOverride === "mujer" ? "selected" : ""}>Mujer</option>
            </select>
          </div>
          <div class="field">
            <label for="wizActivity">Nivel de actividad</label>
            <select id="wizActivity">
              ${(Object.keys(ACTIVITY_LABELS) as ActivityLevel[])
                .map((lvl) => `<option value="${lvl}" ${state.activity === lvl ? "selected" : ""}>${escapeHtml(ACTIVITY_LABELS[lvl])}</option>`)
                .join("")}
            </select>
          </div>
          <div class="field">
            <label>Objetivo</label>
            <div class="nutri-goal-grid" id="wizGoalGrid">
              ${(Object.keys(GOAL_LABELS) as Goal[])
                .map(
                  (g) => `
                <button type="button" class="nutri-goal-card${state.goal === g ? " active" : ""}" data-goal="${g}">
                  <strong>${escapeHtml(GOAL_LABELS[g])}</strong>
                  <span>${escapeHtml(GOAL_HINTS[g])}</span>
                </button>`
                )
                .join("")}
            </div>
          </div>
        `;
      }

      function mealRowMarkup(meal: Meal, i: number): string {
        return `
          <div class="nutri-meal-edit-row">
            <input type="text" class="nutri-meal-name" data-i="${i}" maxlength="40" value="${escapeHtml(meal.name)}" placeholder="Nombre">
            <label class="nutri-meal-pct-field"><input type="text" class="nutri-meal-pct" data-i="${i}" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(String(meal.pct))}"><span>%</span></label>
            <span class="nutri-meal-kcal" data-i="${i}"></span>
            <button type="button" class="nutri-meal-del" data-i="${i}" aria-label="Quitar comida"${state.meals.length <= MIN_MEALS ? " disabled" : ""}>×</button>
          </div>`;
      }

      // El shell del modal se monta UNA vez; después sólo se repintan #wizModeSection y
      // #wizMealEditor (cambiar de pestaña o de comidas no re-dispara la animación del overlay).
      function buildShell(): void {
        loaderBody.innerHTML = `
          <div class="success-check-container">
            <div class="modal-card modal-card-lg">
              <h2>${existing ? "Editar objetivo" : "Definir mis macros"}</h2>
              <p class="subtitle">Elegí cómo querés fijar tus calorías y macros, y repartilos en comidas.</p>

              <div class="nutri-mode-toggle" id="wizModeToggle">
                <button type="button" class="exc-pick-tab" data-mode="manual">A mano</button>
                <button type="button" class="exc-pick-tab" data-mode="calculated">Calculado</button>
              </div>

              <div class="nutri-wiz-section" id="wizModeSection"></div>

              <div class="nutri-wiz-preview" id="wizPreview"></div>

              <h3 class="nutri-wiz-subhead">Reparto en comidas</h3>
              <div class="nutri-wiz-section">
                <div class="nutri-meal-editor" id="wizMealEditor"></div>
                <div class="nutri-meal-editor-foot">
                  <button type="button" class="btn btn-outline btn-sm" id="wizAddMeal">+ Agregar comida</button>
                  <p class="nutri-pct-sum" id="wizMealSum"></p>
                </div>
              </div>

              <div class="alert_message" id="wizAlert"></div>
              <div class="modal-actions">
                <button class="btn btn-primary" id="wizSave" type="button">${existing ? "Guardar cambios" : "Guardar objetivo"}</button>
                <button class="btn btn-outline" id="wizCancel" type="button">Cancelar</button>
              </div>
            </div>
          </div>
        `;

        loaderBody.querySelector("#wizCancel")?.addEventListener("click", () => {
          loaderBody.innerHTML = "";
        });
        loaderBody.querySelector("#wizSave")?.addEventListener("click", () => void saveWizard());
        loaderBody.querySelector("#wizModeToggle")?.addEventListener("click", (e) => {
          const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-mode]");
          if (!btn) return;
          state.mode = btn.dataset.mode as WizardMode;
          paintModeSection();
        });
        loaderBody.querySelector("#wizAddMeal")?.addEventListener("click", () => {
          if (state.meals.length >= MAX_MEALS) return;
          const share = Math.round(100 / (state.meals.length + 1));
          state.meals.push({ name: `Comida ${state.meals.length + 1}`, pct: share });
          state.meals = rescaleMealsTo100(state.meals);
          paintMeals();
        });
      }

      function paintModeSection(): void {
        const section = loaderBody.querySelector("#wizModeSection");
        if (!section) return;
        loaderBody.querySelectorAll<HTMLButtonElement>("#wizModeToggle [data-mode]").forEach((b) => {
          b.classList.toggle("active", b.dataset.mode === state.mode);
        });
        section.innerHTML = modeSectionMarkup();

        // Manual
        section.querySelector("#wizKcal")?.addEventListener("input", (e) => {
          state.manualKcal = (e.target as HTMLInputElement).value;
          updatePreview();
        });
        const bindPct = (id: string, key: keyof WizardState["manualPct"]) => {
          section.querySelector(`#${id}`)?.addEventListener("input", (e) => {
            state.manualPct[key] = (e.target as HTMLInputElement).value;
            updatePreview();
          });
        };
        bindPct("wizPctP", "protein");
        bindPct("wizPctC", "carbs");
        bindPct("wizPctF", "fat");

        // Calculado
        section.querySelector("#wizSex")?.addEventListener("change", (e) => {
          state.sexOverride = (e.target as HTMLSelectElement).value as Sex | "";
          updatePreview();
        });
        section.querySelector("#wizActivity")?.addEventListener("change", (e) => {
          state.activity = (e.target as HTMLSelectElement).value as ActivityLevel;
          updatePreview();
        });
        section.querySelector("#wizGoalGrid")?.addEventListener("click", (e) => {
          const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-goal]");
          if (!btn) return;
          state.goal = btn.dataset.goal as Goal;
          section.querySelectorAll("#wizGoalGrid .nutri-goal-card").forEach((c) => c.classList.toggle("active", (c as HTMLElement).dataset.goal === state.goal));
          updatePreview();
        });

        updatePreview();
      }

      function paintMeals(): void {
        const editor = loaderBody.querySelector("#wizMealEditor");
        if (!editor) return;
        editor.innerHTML = state.meals.map((m, i) => mealRowMarkup(m, i)).join("");

        editor.querySelectorAll<HTMLInputElement>(".nutri-meal-name").forEach((input) => {
          input.addEventListener("input", () => {
            const i = Number(input.dataset.i);
            if (state.meals[i]) state.meals[i].name = input.value;
          });
        });
        editor.querySelectorAll<HTMLInputElement>(".nutri-meal-pct").forEach((input) => {
          input.addEventListener("input", () => {
            const i = Number(input.dataset.i);
            if (state.meals[i]) state.meals[i].pct = Number(input.value.replace(",", ".")) || 0;
            updatePreview();
          });
        });
        editor.querySelectorAll<HTMLButtonElement>(".nutri-meal-del").forEach((btn) => {
          btn.addEventListener("click", () => {
            if (state.meals.length <= MIN_MEALS) return;
            state.meals.splice(Number(btn.dataset.i), 1);
            state.meals = rescaleMealsTo100(state.meals);
            paintMeals();
          });
        });

        const addBtn = loaderBody.querySelector("#wizAddMeal") as HTMLButtonElement | null;
        if (addBtn) addBtn.disabled = state.meals.length >= MAX_MEALS;

        updatePreview();
      }

      function updatePreview(): void {
        const previewEl = document.getElementById("wizPreview");
        const result = computedMacros();

        if (previewEl) {
          previewEl.innerHTML = result
            ? `${macroChipsMarkup(result.macros)}${result.note ? `<p class="nutri-calc-note">${escapeHtml(result.note)}</p>` : ""}`
            : `<p class="chart-sub">Completá los datos de arriba para ver tus macros.</p>`;
        }

        // Suma de porcentajes (manual).
        const pctSum = document.getElementById("wizPctSum");
        if (pctSum) {
          const p = Number(state.manualPct.protein.replace(",", ".")) || 0;
          const c = Number(state.manualPct.carbs.replace(",", ".")) || 0;
          const f = Number(state.manualPct.fat.replace(",", ".")) || 0;
          const total = Math.round(p + c + f);
          pctSum.textContent = `Los porcentajes suman ${total}% (tiene que ser 100%).`;
          pctSum.classList.toggle("nutri-pct-sum-bad", total !== 100);
        }

        // kcal por comida + suma de porcentajes de comidas.
        const daily = result?.macros ?? null;
        document.querySelectorAll<HTMLElement>(".nutri-meal-kcal").forEach((el) => {
          const i = Number(el.dataset.i);
          const meal = state.meals[i];
          if (!meal) return;
          el.textContent = daily ? `${fmt(mealMacros(daily, meal.pct).kcal)} kcal` : "";
        });
        const mealSum = document.getElementById("wizMealSum");
        if (mealSum) {
          const total = Math.round(mealsPctTotal(state.meals));
          mealSum.textContent = `Las comidas suman ${total}% (tiene que ser 100%).`;
          mealSum.classList.toggle("nutri-pct-sum-bad", total !== 100);
        }
      }

      async function saveWizard(): Promise<void> {
        const alertEl = document.getElementById("wizAlert")!;
        alertEl.innerHTML = "";
        const result = computedMacros();
        if (!result) {
          alertEl.innerHTML =
            state.mode === "manual"
              ? "<p>Revisá las calorías y que los porcentajes de macros sumen 100%.</p>"
              : "<p>Faltan datos para el cálculo. Completá el sexo, o cargá peso/altura/edad y volvé.</p>";
          return;
        }
        const cleanedMeals: Meal[] = state.meals.map((m, i) => ({
          name: m.name.trim() || `Comida ${i + 1}`,
          pct: Math.round((Number(m.pct) || 0) * 100) / 100,
        }));
        if (Math.round(mealsPctTotal(cleanedMeals)) !== 100) {
          alertEl.innerHTML = "<p>Los porcentajes de las comidas tienen que sumar 100%.</p>";
          return;
        }

        const saveBtn = document.getElementById("wizSave") as HTMLButtonElement;
        saveBtn.disabled = true;

        const sex = effectiveSex();
        const { error } = await saveNutritionTarget(myId, {
          mode: state.mode,
          goal: state.mode === "calculated" ? state.goal : null,
          activityFactor: state.mode === "calculated" ? ACTIVITY_FACTORS[state.activity] : null,
          macros: result.macros,
          meals: cleanedMeals,
          snapshot:
            state.mode === "calculated" && calcInputs
              ? { weightKg: calcInputs.weightKg, heightCm: calcInputs.heightCm, age: calcInputs.age, sex }
              : null,
        });
        if (error) {
          saveBtn.disabled = false;
          alertEl.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }

        target = await getActiveNutritionTarget(myId);
        loaderBody.innerHTML = `
          <div class="success-check-container">
            <div class="success-icon"><svg viewBox="0 0 52 52" class="success-svg"><circle cx="26" cy="26" r="25" fill="none" class="success-circle" /><path fill="none" d="M14 27l7 7 16-16" class="success-check" /></svg></div>
            <p>¡Objetivo guardado!</p>
          </div>
        `;
        await render();
        const t = setTimeout(() => {
          loaderBody.innerHTML = "";
        }, 1300);
        ctx.addCleanup(() => clearTimeout(t));
      }

      buildShell();
      paintModeSection();
      paintMeals();
    }

    container.innerHTML = VIEW_MARKUP;
    void render();

    updateHandler = (p?: URLSearchParams) => {
      void (async () => {
        prefs = await getNutritionPrefs(myId);
        if (!prefs.enabled) {
          bounce(p);
          return;
        }
        target = await getActiveNutritionTarget(myId);
        await render();
      })();
    };
    ctx.addCleanup(() => {
      updateHandler = null;
    });
  },
  update(params) {
    updateHandler?.(params);
  },
};
