import { escapeHtml } from "./dom";
import {
  listBuiltinFoods,
  listMyFoods,
  searchFoods,
  cacheOffFood,
  foodMacrosForGrams,
  suggestedGrams,
  toGrams,
  macroFitScore,
  mealTagsForName,
  getFoodPopularity,
  type FoodItem,
  type FoodMacros,
  type DisplayUnit,
} from "../services/nutrition.service";
import type { MacroSet } from "./macroCalculator";
import { searchOpenFoodFacts, getOpenFoodFactsByBarcode, type OffCandidate } from "./openFoodFacts";
import { openCreateFoodModal } from "./createFoodModal";
import type { ViewContext } from "../shell/viewContext";

// Buscador de alimentos -- mismo CSS y estructura que openExercisePicker (armar rutina):
// pestañas Catálogo / Mis alimentos / Buscar (Open Food Facts), tarjeta de resultado, y
// "+ Crear alimento". Al elegir un alimento se abre el paso de cantidad (g / lb / porción)
// con una cantidad sugerida para acercarse a las kcal que le faltan a esa comida.

export interface PickedFood {
  foodId: string;
  foodName: string;
  brand: string | null;
  grams: number;
  displayQty: number;
  displayUnit: DisplayUnit;
  macros: FoodMacros;
}

type Tab = "catalogo" | "mios" | "buscar";
const TAB_LABELS: Record<Tab, string> = { catalogo: "Catálogo", mios: "Mis alimentos", buscar: "Buscar" };
const TAB_ORDER: Tab[] = ["catalogo", "mios", "buscar"];

const BACK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;

interface PickerOpts {
  mealName: string;
  /** kcal que le faltan a la comida para llegar a su objetivo (para la cantidad sugerida). */
  remainingKcal: number;
  /** Lo que le falta a la comida por macro -- si viene, el Catálogo ordena "recomendados primero". */
  remaining?: MacroSet;
}

export function openFoodPicker(onPick: (picked: PickedFood) => void, userId: string, opts: PickerOpts, ctx?: ViewContext): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  const host: HTMLElement = loaderBody;

  const mealTags = mealTagsForName(opts.mealName);
  let popularity: Map<string, number> | null = null;

  const cache: Partial<Record<"catalogo" | "mios", FoodItem[]>> = {};
  let activeTab: Tab = "catalogo";
  let search = "";
  let searchTimer: number | undefined;
  let offAbort: AbortController | null = null;
  // Resultados de la pestaña "Buscar": cacheados localmente + candidatos de OFF.
  let cachedHits: FoodItem[] = [];
  let offHits: OffCandidate[] = [];
  let offLoading = false;

  function close(): void {
    if (searchTimer) window.clearTimeout(searchTimer);
    offAbort?.abort();
    host.innerHTML = "";
  }
  ctx?.addCleanup(close);

  // ---------------------------------------------------------------- paso lista
  function listShell(): void {
    host.innerHTML = `
      <div class="success-check-container exc-pick-overlay">
        <div class="modal-card modal-card-lg exc-pick-modal-card">
          <h2>Agregar a ${escapeHtml(opts.mealName)}</h2>
          <p class="subtitle">Buscá un alimento del catálogo, de los tuyos, o en Open Food Facts.</p>
          <div class="exc-pick-tabs" id="fpTabs">
            ${TAB_ORDER.map((t) => `<button type="button" class="exc-pick-tab${t === activeTab ? " active" : ""}" data-tab="${t}">${escapeHtml(TAB_LABELS[t])}</button>`).join("")}
          </div>
          <div class="exc-pick-search-row">
            <input type="search" id="fpSearch" class="exc-picker-search" placeholder="Buscar alimento..." value="${escapeHtml(search)}">
          </div>
          <div id="fpBarcodeRow" class="nutri-fp-barcode-row" ${activeTab === "buscar" ? "" : "hidden"}>
            <input type="text" id="fpBarcode" inputmode="numeric" pattern="[0-9]*" placeholder="… o pegá un código de barras">
            <button type="button" class="btn btn-outline btn-sm" id="fpBarcodeBtn">Buscar</button>
          </div>
          <div class="exc-pick-results" id="fpResults"></div>
          <p class="nutri-fp-attribution" id="fpAttribution" ${activeTab === "buscar" ? "" : "hidden"}>Datos de Open Food Facts · ODbL</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" id="fpCreate">+ Crear alimento</button>
            <button type="button" class="btn btn-outline" id="fpClose">Cerrar</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById("fpClose")?.addEventListener("click", close);
    document.getElementById("fpCreate")?.addEventListener("click", () => {
      openCreateFoodModal(userId, search.trim(), ctx, (food) => {
        delete cache.mios;
        activeTab = "mios";
        listShell();
        void loadTab();
        // El alimento recién creado -> directo al paso de cantidad.
        selectFood(food);
      });
    });

    document.getElementById("fpTabs")?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".exc-pick-tab");
      if (!btn) return;
      activeTab = btn.dataset.tab as Tab;
      listShell();
      void loadTab();
    });

    const searchInput = document.getElementById("fpSearch") as HTMLInputElement;
    searchInput.addEventListener("input", () => {
      search = searchInput.value;
      if (activeTab === "buscar") {
        if (searchTimer) window.clearTimeout(searchTimer);
        if (search.trim().length >= 2) {
          // Mostrar "cargando" ya mismo -- si no, renderResults pintaría "Sin resultados"
          // en el hueco entre la tecla y que arranque runSearch (debounce).
          offLoading = true;
          searchTimer = window.setTimeout(() => void runSearch(), 350);
        } else {
          offLoading = false;
          cachedHits = [];
          offHits = [];
        }
      }
      renderResults();
    });

    document.getElementById("fpBarcodeBtn")?.addEventListener("click", () => void runBarcode());
    document.getElementById("fpBarcode")?.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") void runBarcode();
    });

    document.getElementById("fpResults")?.addEventListener("click", (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>(".exc-pick-card");
      if (!card) return;
      const { kind, id } = card.dataset;
      if (kind === "food") {
        const all = [...(cache[activeTab as "catalogo" | "mios"] ?? []), ...cachedHits];
        const food = all.find((f) => f.id === id);
        if (food) selectFood(food);
      } else if (kind === "off") {
        const off = offHits.find((o) => o.barcode === id);
        if (off) void selectOff(off);
      }
    });
  }

  async function loadTab(): Promise<void> {
    const results = document.getElementById("fpResults");
    if (activeTab === "buscar") {
      renderResults();
      if (search.trim().length >= 2) void runSearch();
      return;
    }
    if (!cache[activeTab]) {
      if (results) results.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando...</p></div>`;
      const [items] = await Promise.all([
        activeTab === "catalogo" ? listBuiltinFoods() : listMyFoods(userId),
        // Popularidad global -- solo hace falta si vamos a ordenar "recomendados primero".
        opts.remaining && !popularity ? getFoodPopularity().then((p) => (popularity = p)) : Promise.resolve(),
      ]);
      cache[activeTab] = items;
    }
    renderResults();
  }

  /** true si el alimento es del tipo de esta comida (curados con meal_tag que matchea). */
  function isRecommended(f: FoodItem): boolean {
    if (!opts.remaining) return false;
    return f.mealTags.some((t) => (mealTags as string[]).includes(t));
  }

  /** Orden "recomendados primero": tipo de comida / encaje de macros / popularidad / nombre. */
  function sortForMeal(items: FoodItem[]): FoodItem[] {
    if (!opts.remaining) return items;
    const rem = opts.remaining;
    return [...items].sort((a, b) => {
      const ra = isRecommended(a) ? 0 : 1;
      const rb = isRecommended(b) ? 0 : 1;
      if (ra !== rb) return ra - rb;
      const fa = macroFitScore(a, rem) + Math.log1p(popularity?.get(a.id) ?? 0) * 0.1;
      const fb = macroFitScore(b, rem) + Math.log1p(popularity?.get(b.id) ?? 0) * 0.1;
      if (Math.abs(fa - fb) > 0.001) return fb - fa;
      return a.name.localeCompare(b.name);
    });
  }

  async function runSearch(): Promise<void> {
    const term = search.trim();
    if (term.length < 2) {
      cachedHits = [];
      offHits = [];
      renderResults();
      return;
    }
    offAbort?.abort();
    offAbort = new AbortController();
    offLoading = true;
    const localHits = await searchFoods(term).catch(() => []);
    if (search.trim() !== term) return; // se tipeó otra cosa mientras tanto
    cachedHits = localHits;
    renderResults();
    const results = await searchOpenFoodFacts(term, offAbort.signal);
    if (search.trim() !== term) return;
    // Sacar los que ya están en la caché local (mismo barcode).
    const cachedBarcodes = new Set(cachedHits.map((f) => f.offBarcode).filter(Boolean));
    offHits = results.filter((o) => !cachedBarcodes.has(o.barcode));
    offLoading = false;
    renderResults();
  }

  async function runBarcode(): Promise<void> {
    const input = document.getElementById("fpBarcode") as HTMLInputElement | null;
    const code = input?.value.replace(/\D/g, "") ?? "";
    if (code.length < 6) return;
    const results = document.getElementById("fpResults");
    if (results) results.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Buscando el código...</p></div>`;
    const off = await getOpenFoodFactsByBarcode(code);
    if (!off) {
      if (results) results.innerHTML = `<p class="exc-pick-empty">No encontramos ese código en Open Food Facts. Podés crear el alimento a mano.</p>`;
      return;
    }
    void selectOff(off);
  }

  function foodCardMarkup(f: FoodItem, recommended = false): string {
    const meta = [f.brand, `${Math.round(f.kcal100)} kcal/100 g`].filter(Boolean).join(" · ");
    return `
      <button type="button" class="exc-pick-card nutri-food-card${recommended ? " nutri-food-reco" : ""}" data-kind="food" data-id="${f.id}">
        <span class="nutri-food-name">${escapeHtml(f.name)}</span>
        <span class="nutri-food-meta">${escapeHtml(meta)}</span>
      </button>`;
  }

  function offCardMarkup(o: OffCandidate): string {
    const meta = [o.brand, `${o.kcal100} kcal/100 g`].filter(Boolean).join(" · ");
    return `
      <button type="button" class="exc-pick-card nutri-food-card" data-kind="off" data-id="${o.barcode}">
        <span class="nutri-food-name">${escapeHtml(o.name)}</span>
        <span class="nutri-food-meta">${escapeHtml(meta)} · <span class="nutri-off-tag">Open Food Facts</span></span>
      </button>`;
  }

  function renderResults(): void {
    const results = document.getElementById("fpResults");
    if (!results) return;
    const term = search.trim().toLowerCase();

    if (activeTab !== "buscar") {
      const filtered = (cache[activeTab] ?? []).filter(
        (f) => f.name.toLowerCase().includes(term) || (f.brand ?? "").toLowerCase().includes(term)
      );
      if (!filtered.length) {
        results.innerHTML = `<p class="exc-pick-empty">${activeTab === "mios" ? "Todavía no creaste alimentos propios." : "No hay alimentos del catálogo con ese criterio."}</p>`;
        return;
      }
      const items = sortForMeal(filtered);
      // Sin filtro de texto y con contexto de comida: separar "Recomendados" arriba.
      if (opts.remaining && term === "") {
        const reco = items.filter(isRecommended);
        const rest = items.filter((f) => !isRecommended(f));
        results.innerHTML =
          (reco.length ? `<h4 class="nutri-fp-section">Recomendados para ${escapeHtml(opts.mealName)}</h4><div class="exc-pick-grid nutri-food-grid">${reco.map((f) => foodCardMarkup(f, true)).join("")}</div>` : "") +
          (rest.length ? `<h4 class="nutri-fp-section">Todos</h4><div class="exc-pick-grid nutri-food-grid">${rest.map((f) => foodCardMarkup(f)).join("")}</div>` : "");
        return;
      }
      results.innerHTML = `<div class="exc-pick-grid nutri-food-grid">${items.map((f) => foodCardMarkup(f, isRecommended(f))).join("")}</div>`;
      return;
    }

    if (term.length < 2) {
      results.innerHTML = `<p class="exc-pick-empty">Escribí al menos 2 letras para buscar.</p>`;
      return;
    }
    const parts: string[] = [];
    if (cachedHits.length) parts.push(`<div class="exc-pick-grid nutri-food-grid">${cachedHits.map((f) => foodCardMarkup(f, isRecommended(f))).join("")}</div>`);
    if (offHits.length) parts.push(`<div class="exc-pick-grid nutri-food-grid">${offHits.map(offCardMarkup).join("")}</div>`);
    if (offLoading) parts.push(`<div class="inline-loader"><div class="modern-spinner"></div><p>Buscando en Open Food Facts...</p></div>`);
    if (!parts.length) parts.push(`<p class="exc-pick-empty">Sin resultados${offLoading ? "" : " -- probá otro nombre o creá el alimento"}.</p>`);
    results.innerHTML = parts.join("");
  }

  // ---------------------------------------------------------------- paso cantidad
  async function selectOff(off: OffCandidate): Promise<void> {
    const results = document.getElementById("fpResults");
    if (results) results.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Guardando alimento...</p></div>`;
    const { food, error } = await cacheOffFood({
      barcode: off.barcode,
      name: off.name,
      brand: off.brand,
      servingGrams: off.servingGrams,
      kcal100: off.kcal100,
      protein100: off.protein100,
      carbs100: off.carbs100,
      fat100: off.fat100,
      fiber100: off.fiber100,
      imageUrl: off.imageUrl,
      raw: off.raw,
    });
    if (error || !food) {
      if (results) results.innerHTML = `<p class="exc-pick-empty">${escapeHtml(error ?? "No se pudo guardar el alimento.")}</p>`;
      return;
    }
    selectFood(food);
  }

  function selectFood(food: FoodItem): void {
    const hasServing = food.servingGrams != null && food.servingGrams > 0;
    const initialUnit: DisplayUnit = hasServing ? "porcion" : "g";
    const suggestedG = suggestedGrams(food.kcal100, opts.remainingKcal);
    const initialQty = initialUnit === "porcion" ? Math.max(1, Math.round((suggestedG / food.servingGrams!) * 2) / 2) : suggestedG;

    host.innerHTML = `
      <div class="success-check-container exc-pick-overlay">
        <div class="modal-card exc-pick-modal-card nutri-qty-card">
          <button type="button" class="nutri-qty-back" id="fpQtyBack">${BACK_ICON} Volver</button>
          <h2>${escapeHtml(food.name)}</h2>
          ${food.brand ? `<p class="subtitle">${escapeHtml(food.brand)}</p>` : ""}

          <div class="nutri-qty-row">
            <div class="field">
              <label for="fpQty">Cantidad</label>
              <input type="text" id="fpQty" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" autocomplete="off" value="${initialQty}">
            </div>
            <div class="field">
              <label for="fpUnit">Unidad</label>
              <select id="fpUnit">
                <option value="g" ${initialUnit === "g" ? "selected" : ""}>gramos</option>
                <option value="lb">libras</option>
                <option value="porcion" ${hasServing ? "" : "disabled"} ${initialUnit === "porcion" ? "selected" : ""}>porción${hasServing ? ` (${Math.round(food.servingGrams!)} g)` : ""}</option>
              </select>
            </div>
          </div>

          ${opts.remainingKcal > 0 ? `<button type="button" class="btn btn-outline btn-sm nutri-qty-suggest" id="fpSuggest">Sugerido: ${suggestedG} g (para ~${Math.round(opts.remainingKcal)} kcal que faltan)</button>` : ""}

          <div class="nutri-qty-preview" id="fpQtyPreview"></div>

          <div class="alert_message" id="fpQtyAlert"></div>
          <div class="modal-actions">
            <button class="btn btn-primary" id="fpQtyConfirm" type="button">Agregar</button>
            <button class="btn btn-outline" id="fpQtyCancel" type="button">Cancelar</button>
          </div>
        </div>
      </div>
    `;

    const qtyInput = document.getElementById("fpQty") as HTMLInputElement;
    const unitSelect = document.getElementById("fpUnit") as HTMLSelectElement;
    const previewEl = document.getElementById("fpQtyPreview")!;

    function currentGrams(): number {
      const qty = Number(qtyInput.value.replace(",", ".")) || 0;
      return toGrams(qty, unitSelect.value as DisplayUnit, food.servingGrams);
    }
    function refresh(): void {
      const grams = currentGrams();
      if (grams <= 0) {
        previewEl.innerHTML = `<p class="chart-sub">Ingresá una cantidad.</p>`;
        return;
      }
      const m = foodMacrosForGrams(food, grams);
      previewEl.innerHTML = `
        <div class="nutri-qty-grams">${Math.round(grams)} g</div>
        <div class="nutri-macro-grid">
          <div class="nutri-macro-chip nutri-macro-kcal"><span class="nutri-macro-value">${m.kcal}<small>kcal</small></span><span class="nutri-macro-label">Calorías</span></div>
          <div class="nutri-macro-chip nutri-macro-protein_g"><span class="nutri-macro-value">${m.protein_g}<small>g</small></span><span class="nutri-macro-label">Proteína</span></div>
          <div class="nutri-macro-chip nutri-macro-carbs_g"><span class="nutri-macro-value">${m.carbs_g}<small>g</small></span><span class="nutri-macro-label">Carbos</span></div>
          <div class="nutri-macro-chip nutri-macro-fat_g"><span class="nutri-macro-value">${m.fat_g}<small>g</small></span><span class="nutri-macro-label">Grasa</span></div>
        </div>
      `;
    }

    qtyInput.addEventListener("input", refresh);
    unitSelect.addEventListener("change", refresh);
    refresh();

    document.getElementById("fpSuggest")?.addEventListener("click", () => {
      if (unitSelect.value === "porcion" && food.servingGrams) {
        qtyInput.value = String(Math.max(0.5, Math.round((suggestedG / food.servingGrams) * 2) / 2));
      } else if (unitSelect.value === "lb") {
        qtyInput.value = String(Math.round((suggestedG / 453.59237) * 100) / 100);
      } else {
        qtyInput.value = String(suggestedG);
      }
      refresh();
    });

    document.getElementById("fpQtyBack")?.addEventListener("click", () => {
      listShell();
      void loadTab();
    });
    document.getElementById("fpQtyCancel")?.addEventListener("click", close);

    document.getElementById("fpQtyConfirm")?.addEventListener("click", () => {
      const alertEl = document.getElementById("fpQtyAlert")!;
      const qty = Number(qtyInput.value.replace(",", "."));
      const grams = currentGrams();
      if (!Number.isFinite(qty) || qty <= 0 || grams <= 0) {
        alertEl.innerHTML = "<p>Ingresá una cantidad válida.</p>";
        return;
      }
      onPick({
        foodId: food.id,
        foodName: food.name,
        brand: food.brand,
        grams: Math.round(grams * 10) / 10,
        displayQty: Math.round(qty * 100) / 100,
        displayUnit: unitSelect.value as DisplayUnit,
        macros: foodMacrosForGrams(food, grams),
      });
      close();
    });
  }

  listShell();
  void loadTab();
}
