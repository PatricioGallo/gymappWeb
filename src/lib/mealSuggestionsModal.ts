import { escapeHtml } from "./dom";
import { getMealSuggestions, type FoodSuggestion } from "../services/nutrition.service";
import type { MacroSet } from "./macroCalculator";
import type { ViewContext } from "../shell/viewContext";

// Panel de "💡 Sugerencias" de una comida: alimentos típicos para ese tipo de comida
// (pollo/carne/fideos para almuerzo-cena, tostadas/yogur/fruta para merienda...), con una
// cantidad ya calculada para acercarse a lo que le falta a la comida. Un tap agrega.
// Comparte #loaderBody con la vista del día; al cerrar, el caller re-renderiza.

interface Args {
  mealName: string;
  remaining: MacroSet;
  mealTargetKcal: number;
}

export function openMealSuggestions(
  onAdd: (s: FoodSuggestion) => Promise<void>,
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

  const remainingLabel =
    args.remaining.kcal > 60
      ? `Te faltan ~${Math.round(args.remaining.kcal)} kcal en ${escapeHtml(args.mealName)}.`
      : `${escapeHtml(args.mealName)} ya está cubierta -- estas son porciones chicas por si querés sumar algo.`;

  host.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card modal-card-lg">
        <h2>Sugerencias para ${escapeHtml(args.mealName)}</h2>
        <p class="subtitle">${remainingLabel}</p>
        <div id="msList"><div class="inline-loader"><div class="modern-spinner"></div><p>Buscando ideas...</p></div></div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="msClose" type="button">Listo</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("msClose")?.addEventListener("click", close);

  void (async () => {
    let suggestions: FoodSuggestion[];
    try {
      suggestions = await getMealSuggestions(args.mealName, args.remaining, args.mealTargetKcal);
    } catch {
      suggestions = [];
    }
    if (closed) return;
    const list = document.getElementById("msList");
    if (!list) return;

    if (suggestions.length === 0) {
      list.innerHTML = `<p class="exc-pick-empty">No encontramos sugerencias para esta comida. Probá "Agregar alimento".</p>`;
      return;
    }

    list.innerHTML = suggestions
      .map(
        (s, i) => `
      <div class="ms-row" data-i="${i}">
        <div class="ms-row-main">
          <span class="ms-row-name">${escapeHtml(s.food.name)}${s.food.brand ? ` <span class="ms-row-brand">${escapeHtml(s.food.brand)}</span>` : ""}</span>
          <span class="ms-row-sub">${Math.round(s.grams)} g · ${s.macros.kcal} kcal · ${s.macros.protein_g}P ${s.macros.carbs_g}C ${s.macros.fat_g}G</span>
        </div>
        <button type="button" class="btn btn-primary btn-sm ms-add" data-i="${i}">Agregar</button>
      </div>`
      )
      .join("");

    list.querySelectorAll<HTMLButtonElement>(".ms-add").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const s = suggestions[Number(btn.dataset.i)];
        if (!s) return;
        btn.disabled = true;
        btn.textContent = "...";
        await onAdd(s);
        const row = btn.closest<HTMLElement>(".ms-row");
        if (row) {
          row.classList.add("ms-row-done");
          btn.textContent = "✓ Agregado";
        }
      });
    });
  })();
}
