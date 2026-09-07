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
  updateNutritionLogQuantity,
  deleteNutritionLog,
  type NutritionTarget,
  type NutritionCalcInputs,
  type NutritionLog,
  type FoodMacros,
} from "../services/nutrition.service";
import { openFoodPicker, type PickedFood } from "../lib/foodPicker";
import { todayLocalISO, formatFechaCorta } from "../lib/dias";
import {
  calcMacros,
  bmrMifflinStJeor,
  tdee,
  macrosFromPercentages,
  percentagesFromMacros,
  defaultMeals,
  mealMacros,
  mealsPctTotal,
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
let updateHandler: (() => void) | null = null;

const VIEW_MARKUP = `
  <section class="page-hero">
    <div class="container">
      <a href="profile.html" class="back-link" id="backToProfile">${BACK_ICON}Volver al perfil</a>
      <span class="eyebrow">Alimentación</span>
      <h1>Tus macros del día</h1>
      <p>Definí un objetivo de calorías y macros, repartilo en comidas y cargá lo que comés.</p>
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

function dayViewMarkup(target: NutritionTarget, logs: NutritionLog[]): string {
  const daily = targetMacros(target);
  const consumed = sumMacros(logs);
  const status = dayStatus(consumed, daily);

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
          <span><strong>${fmt(mealTarget.protein_g)}</strong> P</span>
          <span><strong>${fmt(mealTarget.carbs_g)}</strong> C</span>
          <span><strong>${fmt(mealTarget.fat_g)}</strong> G</span>
        </div>
        ${foodRows ? `<div class="nutri-log-list">${foodRows}</div>` : ""}
        <button type="button" class="btn btn-outline btn-sm nutri-add-food" data-meal="${i}">+ Agregar alimento</button>
      </div>`;
    })
    .join("");

  return `
    <div class="chart-card reveal nutri-target-card">
      <div class="nutri-target-head">
        <div>
          <h3>Hoy · ${escapeHtml(formatFechaCorta(todayLocalISO()))}</h3>
          <p class="chart-sub nutri-status nutri-status-${status.tone}">${escapeHtml(status.text)}</p>
        </div>
        <button class="btn btn-outline btn-sm" id="editTargetBtn" type="button">Editar objetivo</button>
      </div>
      <div class="nutri-bars">
        ${macroBar("Calorías", consumed.kcal, daily.kcal, "nutri-bar-kcal")}
        ${macroBar("Proteína", consumed.protein_g, daily.protein_g, "nutri-bar-p")}
        ${macroBar("Carbos", consumed.carbs_g, daily.carbs_g, "nutri-bar-c")}
        ${macroBar("Grasa", consumed.fat_g, daily.fat_g, "nutri-bar-f")}
      </div>
    </div>
    <div class="nutri-meal-list">${meals}</div>
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
  mealCount: number;
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
      mealCount: existing.meals.length,
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
    mealCount: 4,
    meals: defaultMeals(4),
  };
}

export const nutricionView: ViewModule = {
  async mount(container, _params, ctx, authUserId) {
    const myId = authUserId!; // ruta registrada con auth "required"

    let prefs = await getNutritionPrefs(myId);
    if (!prefs.enabled) {
      // Fase 7 sumará el mini tutorial de descubrimiento para ?intro=1. Por ahora,
      // si no está activada, se vuelve al perfil.
      const bounce = () => navigate("profile.html");
      updateHandler = () => {
        void (async () => {
          if ((await getNutritionPrefs(myId)).enabled) void reloadActiveView();
          else bounce();
        })();
      };
      ctx.addCleanup(() => {
        updateHandler = null;
      });
      bounce();
      return;
    }

    const today = todayLocalISO();
    let target = await getActiveNutritionTarget(myId);
    let logs: NutritionLog[] = [];

    async function render(): Promise<void> {
      const content = container.querySelector("#nutriContent");
      if (!content) return;
      if (!target) {
        content.innerHTML = emptyMarkup();
        content.querySelector("#defineTargetBtn")?.addEventListener("click", () => void openTargetWizard(null));
        return;
      }
      try {
        logs = await listNutritionLogs(myId, today);
      } catch {
        content.innerHTML = `<p class="chart-sub">No se pudo cargar lo que registraste hoy. Probá recargar la página.</p>`;
        return;
      }
      content.innerHTML = dayViewMarkup(target, logs);
      wireDayView(content);
    }

    function wireDayView(content: Element): void {
      content.querySelector("#editTargetBtn")?.addEventListener("click", () => void openTargetWizard(target));

      content.querySelectorAll<HTMLButtonElement>(".nutri-add-food").forEach((btn) => {
        btn.addEventListener("click", () => {
          const mealIndex = Number(btn.dataset.meal);
          const meal = target?.meals[mealIndex];
          if (!meal || !target) return;
          const mealTarget = mealMacros(targetMacros(target), meal.pct);
          const mealConsumed = sumMacros(logs.filter((l) => l.mealIndex === mealIndex));
          const remainingKcal = Math.max(0, mealTarget.kcal - mealConsumed.kcal);
          openFoodPicker((picked) => void addPicked(mealIndex, meal.name, picked), myId, { mealName: meal.name, remainingKcal }, ctx);
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
        logDate: today,
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
        const macros: FoodMacros = {
          kcal: Math.round(log.kcal * f),
          protein_g: Math.round(log.protein_g * f),
          carbs_g: Math.round(log.carbs_g * f),
          fat_g: Math.round(log.fat_g * f),
          fiber_g: log.fiber_g != null ? Math.round(log.fiber_g * f * 10) / 10 : null,
        };
        const { error } = await updateNutritionLogQuantity(log.id, {
          grams: Math.round(qty * gramsPerUnit * 10) / 10,
          displayQty: Math.round(qty * 100) / 100,
          displayUnit: log.displayUnit,
          macros,
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

      // Sexo efectivo para el cálculo: el del perfil, o el elegido a mano en el asistente.
      const effectiveSex = (): Sex | null => (calcInputs?.sex ?? (state.sexOverride || null)) as Sex | null;

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
        const sexKnown = calcInputs?.sex != null;
        return `
          ${
            sexKnown
              ? ""
              : `<div class="field">
                  <label for="wizSex">Sexo (para el cálculo)</label>
                  <select id="wizSex">
                    <option value="" ${state.sexOverride === "" ? "selected" : ""}>Elegí una opción</option>
                    <option value="hombre" ${state.sexOverride === "hombre" ? "selected" : ""}>Hombre</option>
                    <option value="mujer" ${state.sexOverride === "mujer" ? "selected" : ""}>Mujer</option>
                  </select>
                </div>`
          }
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

      function mealsSectionMarkup(): string {
        return `
          <div class="field">
            <label for="wizMealCount">Cantidad de comidas</label>
            <select id="wizMealCount">
              ${Array.from({ length: MAX_MEALS - MIN_MEALS + 1 }, (_, i) => i + MIN_MEALS)
                .map((n) => `<option value="${n}" ${state.mealCount === n ? "selected" : ""}>${n} comidas</option>`)
                .join("")}
            </select>
          </div>
          <div class="nutri-meal-editor" id="wizMealEditor">
            ${state.meals
              .map(
                (meal, i) => `
              <div class="nutri-meal-edit-row">
                <input type="text" class="nutri-meal-name" data-i="${i}" maxlength="40" value="${escapeHtml(meal.name)}" placeholder="Nombre">
                <label class="nutri-meal-pct-field"><input type="text" class="nutri-meal-pct" data-i="${i}" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(String(meal.pct))}"><span>%</span></label>
                <span class="nutri-meal-kcal" data-i="${i}"></span>
              </div>`
              )
              .join("")}
            <p class="nutri-pct-sum" id="wizMealSum"></p>
          </div>
        `;
      }

      function renderWizard(): void {
        loaderBody.innerHTML = `
          <div class="success-check-container">
            <div class="modal-card modal-card-lg">
              <h2>${existing ? "Editar objetivo" : "Definir mis macros"}</h2>
              <p class="subtitle">Elegí cómo querés fijar tus calorías y macros, y repartilos en comidas.</p>

              <div class="nutri-mode-toggle" id="wizModeToggle">
                <button type="button" class="exc-pick-tab${state.mode === "manual" ? " active" : ""}" data-mode="manual">A mano</button>
                <button type="button" class="exc-pick-tab${state.mode === "calculated" ? " active" : ""}" data-mode="calculated">Calculado</button>
              </div>

              <div class="nutri-wiz-section">${modeSectionMarkup()}</div>

              <div class="nutri-wiz-preview" id="wizPreview"></div>

              <h3 class="nutri-wiz-subhead">Reparto en comidas</h3>
              <div class="nutri-wiz-section">${mealsSectionMarkup()}</div>

              <div class="alert_message" id="wizAlert"></div>
              <div class="modal-actions">
                <button class="btn btn-primary" id="wizSave" type="button">${existing ? "Guardar cambios" : "Guardar objetivo"}</button>
                <button class="btn btn-outline" id="wizCancel" type="button">Cancelar</button>
              </div>
            </div>
          </div>
        `;
        wireWizard();
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
          el.textContent = daily ? `≈ ${fmt(mealMacros(daily, meal.pct).kcal)} kcal` : "";
        });
        const mealSum = document.getElementById("wizMealSum");
        if (mealSum) {
          const total = Math.round(mealsPctTotal(state.meals));
          mealSum.textContent = `Las comidas suman ${total}% (tiene que ser 100%).`;
          mealSum.classList.toggle("nutri-pct-sum-bad", total !== 100);
        }
      }

      function wireWizard(): void {
        document.getElementById("wizCancel")?.addEventListener("click", () => {
          loaderBody.innerHTML = "";
        });

        document.getElementById("wizModeToggle")?.addEventListener("click", (e) => {
          const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-mode]");
          if (!btn) return;
          state.mode = btn.dataset.mode as WizardMode;
          renderWizard();
        });

        // Manual
        document.getElementById("wizKcal")?.addEventListener("input", (e) => {
          state.manualKcal = (e.target as HTMLInputElement).value;
          updatePreview();
        });
        const bindPct = (id: string, key: keyof WizardState["manualPct"]) => {
          document.getElementById(id)?.addEventListener("input", (e) => {
            state.manualPct[key] = (e.target as HTMLInputElement).value;
            updatePreview();
          });
        };
        bindPct("wizPctP", "protein");
        bindPct("wizPctC", "carbs");
        bindPct("wizPctF", "fat");

        // Calculado
        document.getElementById("wizSex")?.addEventListener("change", (e) => {
          state.sexOverride = (e.target as HTMLSelectElement).value as Sex | "";
          updatePreview();
        });
        document.getElementById("wizActivity")?.addEventListener("change", (e) => {
          state.activity = (e.target as HTMLSelectElement).value as ActivityLevel;
          updatePreview();
        });
        document.getElementById("wizGoalGrid")?.addEventListener("click", (e) => {
          const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-goal]");
          if (!btn) return;
          state.goal = btn.dataset.goal as Goal;
          document.querySelectorAll("#wizGoalGrid .nutri-goal-card").forEach((c) => c.classList.toggle("active", (c as HTMLElement).dataset.goal === state.goal));
          updatePreview();
        });

        // Comidas
        document.getElementById("wizMealCount")?.addEventListener("change", (e) => {
          state.mealCount = Number((e.target as HTMLSelectElement).value);
          state.meals = defaultMeals(state.mealCount);
          renderWizard();
        });
        document.querySelectorAll<HTMLInputElement>(".nutri-meal-name").forEach((input) => {
          input.addEventListener("input", () => {
            const i = Number(input.dataset.i);
            if (state.meals[i]) state.meals[i].name = input.value;
          });
        });
        document.querySelectorAll<HTMLInputElement>(".nutri-meal-pct").forEach((input) => {
          input.addEventListener("input", () => {
            const i = Number(input.dataset.i);
            if (state.meals[i]) state.meals[i].pct = Number(input.value.replace(",", ".")) || 0;
            updatePreview();
          });
        });

        document.getElementById("wizSave")?.addEventListener("click", () => void saveWizard());
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

      renderWizard();
    }

    container.innerHTML = VIEW_MARKUP;
    void render();

    updateHandler = () => {
      void (async () => {
        prefs = await getNutritionPrefs(myId);
        if (!prefs.enabled) {
          navigate("profile.html");
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
  update() {
    updateHandler?.();
  },
};
