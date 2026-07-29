import { escapeHtml } from "./dom";
import { CATEGORY_LABELS, EXERCISE_CATEGORIES, type Exercise, type ExerciseCategory } from "../services/exercise.service";

const DUMBBELL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7v10M18 7v10M2 9v6M22 9v6M6 12h12"/></svg>`;

export function openExercisePicker(catalog: Exercise[], onSelect: (exc: Exercise) => void): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;

  let search = "";
  let activeCategory: ExerciseCategory | "" = "";

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card modal-card-lg">
        <h2>Elegir ejercicio</h2>
        <p class="subtitle">Buscá por nombre o filtrá por categoría.</p>
        <input type="search" id="excPickerSearch" class="exc-picker-search" placeholder="Buscar ejercicio...">
        <div class="exc-pick-chips" id="excPickerChips">
          <button type="button" class="exc-pick-chip active" data-cat="">Todos</button>
          ${EXERCISE_CATEGORIES.map((cat) => `<button type="button" class="exc-pick-chip" data-cat="${cat}">${escapeHtml(CATEGORY_LABELS[cat])}</button>`).join("")}
        </div>
        <div class="exc-pick-results" id="excPickerResults"></div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="excPickerClose" type="button">Cerrar</button>
        </div>
      </div>
    </div>
  `;

  const resultsEl = document.getElementById("excPickerResults")!;

  function render(): void {
    const term = search.trim().toLowerCase();
    const categories = activeCategory ? [activeCategory] : EXERCISE_CATEGORIES;

    const sections = categories
      .map((cat) => {
        const items = catalog.filter((exc) => exc.category === cat && exc.name.toLowerCase().includes(term));
        if (items.length === 0) return "";
        return `
          <div class="exc-pick-section">
            <h4>${escapeHtml(CATEGORY_LABELS[cat])}</h4>
            <div class="exc-pick-grid">
              ${items
                .map(
                  (exc) => `
                <button type="button" class="exc-pick-card" data-id="${exc.id}">
                  <span class="exc-pick-thumb">${exc.image_url ? `<img src="${escapeHtml(exc.image_url)}" alt="" loading="lazy">` : DUMBBELL_ICON}</span>
                  <span class="exc-pick-name">${escapeHtml(exc.name)}</span>
                </button>
              `
                )
                .join("")}
            </div>
          </div>
        `;
      })
      .filter(Boolean)
      .join("");

    resultsEl.innerHTML = sections || `<p class="exc-pick-empty">No encontramos ejercicios con ese nombre.</p>`;
  }

  render();

  document.getElementById("excPickerSearch")?.addEventListener("input", (event) => {
    search = (event.target as HTMLInputElement).value;
    render();
  });

  document.getElementById("excPickerChips")?.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".exc-pick-chip");
    if (!btn) return;
    activeCategory = (btn.dataset.cat as ExerciseCategory) || "";
    document.querySelectorAll("#excPickerChips .exc-pick-chip").forEach((chip) => chip.classList.remove("active"));
    btn.classList.add("active");
    render();
  });

  resultsEl.addEventListener("click", (event) => {
    const card = (event.target as HTMLElement).closest<HTMLButtonElement>(".exc-pick-card");
    if (!card) return;
    const exc = catalog.find((item) => item.id === card.dataset.id);
    if (!exc) return;
    onSelect(exc);
    loaderBody.innerHTML = "";
  });

  document.getElementById("excPickerClose")?.addEventListener("click", () => {
    loaderBody.innerHTML = "";
  });
}
