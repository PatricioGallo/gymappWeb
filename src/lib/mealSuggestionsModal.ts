import { escapeHtml } from "./dom";
import { getMealSuggestions, type MealCombo } from "../services/nutrition.service";
import type { MacroSet } from "./macroCalculator";
import type { ViewContext } from "../shell/viewContext";

// Panel de "💡 Sugerencias" de una comida: comidas COMPLETAS (combos de 2-6 alimentos) armadas
// para acercarse a las kcal y al reparto de macros que le faltan a esa comida. Un tap agrega
// todos los alimentos del combo de una. Comparte #loaderBody con la vista del día; al cerrar,
// el caller re-renderiza.

interface Args {
  mealName: string;
  /** Lo que le falta a la comida para llegar a su objetivo. */
  remaining: MacroSet;
  /** El objetivo completo de la comida (P/C/G en gramos) -- para el reparto cuando ya está cubierta. */
  mealTarget: MacroSet;
}

export function openMealSuggestions(
  onAdd: (combo: MealCombo) => Promise<void>,
  args: Args,
  ctx: ViewContext | undefined,
  onClose: () => void
): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  const host: HTMLElement = loaderBody;

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    host.innerHTML = "";
    onClose();
  }
  ctx?.addCleanup(() => {
    host.innerHTML = "";
  });

  const faltaKcal = Math.round(args.remaining.kcal);
  const header =
    faltaKcal > 120
      ? `Comidas completas para cubrir lo que te falta en ${escapeHtml(args.mealName)}: ~${faltaKcal} kcal · ${Math.max(0, Math.round(args.remaining.protein_g))} P / ${Math.max(0, Math.round(args.remaining.carbs_g))} C / ${Math.max(0, Math.round(args.remaining.fat_g))} G.`
      : `${escapeHtml(args.mealName)} ya está casi cubierta -- estas son versiones livianas por si querés cambiar algo.`;

  host.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card modal-card-lg">
        <h2>Ideas para ${escapeHtml(args.mealName)}</h2>
        <p class="subtitle">${header}</p>
        <div id="msList"><div class="inline-loader"><div class="modern-spinner"></div><p>Armando combinaciones...</p></div></div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="msClose" type="button">Listo</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("msClose")?.addEventListener("click", close);

  void (async () => {
    let combos: MealCombo[];
    try {
      combos = await getMealSuggestions(args.mealName, args.remaining, args.mealTarget);
    } catch {
      combos = [];
    }
    if (closed) return;
    const list = document.getElementById("msList");
    if (!list) return;

    if (combos.length === 0) {
      list.innerHTML = `<p class="exc-pick-empty">No encontramos combinaciones para esta comida. Probá "Agregar alimento".</p>`;
      return;
    }

    list.innerHTML = combos
      .map((c, i) => {
        const t = c.totals;
        return `
      <div class="ms-combo" data-i="${i}">
        <div class="ms-combo-head">
          <div class="ms-combo-head-main">
            <span class="ms-combo-title">${escapeHtml(c.title)}</span>
            <span class="ms-combo-macros">${Math.round(t.kcal)} kcal · <b class="nutri-mt-p">${Math.round(t.protein_g)}</b> P · <b class="nutri-mt-c">${Math.round(t.carbs_g)}</b> C · <b class="nutri-mt-f">${Math.round(t.fat_g)}</b> G</span>
          </div>
          <button type="button" class="btn btn-outline btn-sm ms-add" data-i="${i}">Agregar</button>
        </div>
        <ul class="ms-combo-items">
          ${c.items
            .map((it) => `<li><span>${escapeHtml(it.food.name)}</span><span>${it.grams} g</span></li>`)
            .join("")}
        </ul>
      </div>`;
      })
      .join("");

    list.querySelectorAll<HTMLButtonElement>(".ms-add").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const combo = combos[Number(btn.dataset.i)];
        if (!combo) return;
        btn.disabled = true;
        btn.textContent = "...";
        await onAdd(combo);
        btn.textContent = "✓ Agregado";
        btn.closest(".ms-combo")?.classList.add("ms-combo-done");
      });
    });
  })();
}
