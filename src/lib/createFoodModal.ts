import { escapeHtml } from "./dom";
import { createUserFood, type FoodItem } from "../services/nutrition.service";
import type { ViewContext } from "../shell/viewContext";

// Modal para crear un alimento propio (food_items source='user') sin salir de la pantalla --
// mismo patrón que createExerciseModal.ts. Comparte #loaderBody con el buscador que lo abre;
// al guardar con éxito llama onCreated con la fila nueva (el buscador la mete en su caché).

const NUM_INPUT = `inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" autocomplete="off"`;

/** null = vacío · NaN = escrito pero inválido · number = ok. */
function parseNum(id: string): number | null {
  const raw = (document.getElementById(id) as HTMLInputElement).value.trim().replace(",", ".");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

export function openCreateFoodModal(userId: string, prefillName: string, ctx: ViewContext | undefined, onCreated: (food: FoodItem) => void): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  const host: HTMLElement = loaderBody;

  host.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card modal-card-lg">
        <h2>Crear alimento</h2>
        <p class="subtitle">Cargá los valores como figuran en la etiqueta, por 100 g. Si querés, lo compartís para que lo usen otros.</p>

        <div class="field"><label for="cfName">Nombre</label><input type="text" id="cfName" maxlength="120" placeholder="Ej: Yogur bebible frutilla" value="${escapeHtml(prefillName)}"></div>
        <div class="field"><label for="cfBrand">Marca (opcional)</label><input type="text" id="cfBrand" maxlength="80" placeholder="Ej: La Serenísima"></div>

        <div class="nutri-cf-grid">
          <div class="field"><label for="cfKcal">Calorías / 100 g</label><input type="text" id="cfKcal" ${NUM_INPUT} placeholder="Ej: 61"></div>
          <div class="field"><label for="cfProtein">Proteína / 100 g</label><input type="text" id="cfProtein" ${NUM_INPUT} placeholder="g"></div>
          <div class="field"><label for="cfCarbs">Carbos / 100 g</label><input type="text" id="cfCarbs" ${NUM_INPUT} placeholder="g"></div>
          <div class="field"><label for="cfFat">Grasa / 100 g</label><input type="text" id="cfFat" ${NUM_INPUT} placeholder="g"></div>
          <div class="field"><label for="cfFiber">Fibra / 100 g (opcional)</label><input type="text" id="cfFiber" ${NUM_INPUT} placeholder="g"></div>
          <div class="field"><label for="cfServing">Gramos por porción (opcional)</label><input type="text" id="cfServing" ${NUM_INPUT} placeholder="Ej: 190"></div>
        </div>

        <label class="nutri-cf-check"><input type="checkbox" id="cfPublic"> <span>Compartir con otros usuarios</span></label>

        <div class="alert_message" id="cfAlert"></div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="cfSave" type="button">Crear alimento</button>
          <button class="btn btn-outline" id="cfCancel" type="button">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("cfCancel")?.addEventListener("click", () => {
    host.innerHTML = "";
  });

  document.getElementById("cfSave")?.addEventListener("click", async () => {
    const alertEl = document.getElementById("cfAlert")!;
    alertEl.innerHTML = "";

    const name = (document.getElementById("cfName") as HTMLInputElement).value.trim();
    if (name.length < 2) {
      alertEl.innerHTML = "<p>Poné un nombre.</p>";
      return;
    }
    const kcal = parseNum("cfKcal");
    const protein = parseNum("cfProtein");
    const carbs = parseNum("cfCarbs");
    const fat = parseNum("cfFat");
    const fiber = parseNum("cfFiber");
    const serving = parseNum("cfServing");

    for (const [label, v] of [["Calorías", kcal], ["Proteína", protein], ["Carbos", carbs], ["Grasa", fat]] as const) {
      if (v == null || Number.isNaN(v)) {
        alertEl.innerHTML = `<p>Completá ${label} por 100 g con un número válido.</p>`;
        return;
      }
    }
    if (fiber != null && Number.isNaN(fiber)) {
      alertEl.innerHTML = "<p>La fibra tiene que ser un número.</p>";
      return;
    }
    if (serving != null && (Number.isNaN(serving) || serving <= 0)) {
      alertEl.innerHTML = "<p>Los gramos por porción tienen que ser un número mayor a 0.</p>";
      return;
    }

    const saveBtn = document.getElementById("cfSave") as HTMLButtonElement;
    saveBtn.disabled = true;

    const brandVal = (document.getElementById("cfBrand") as HTMLInputElement).value.trim();
    const { food, error } = await createUserFood(userId, {
      name,
      brand: brandVal || null,
      servingGrams: serving,
      kcal100: kcal!,
      protein100: protein!,
      carbs100: carbs!,
      fat100: fat!,
      fiber100: fiber,
      isPublic: (document.getElementById("cfPublic") as HTMLInputElement).checked,
    });
    if (error || !food) {
      saveBtn.disabled = false;
      alertEl.innerHTML = `<p>${escapeHtml(error ?? "No se pudo crear el alimento.")}</p>`;
      return;
    }
    onCreated(food);
  });

  ctx?.addCleanup(() => {
    if (document.getElementById("cfSave")) host.innerHTML = "";
  });
}
