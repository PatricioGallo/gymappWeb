import type { ViewModule } from "../shell/router";
import { listMyExercises, deleteExercise, EXERCISE_CATEGORIES, CATEGORY_LABELS, type Exercise } from "../services/exercise.service";
import { escapeHtml } from "../lib/dom";
import { openCreateExerciseModal } from "../lib/createExerciseModal";
import { openExerciseModal } from "../lib/exerciseModal";

const DUMBBELL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7v10M18 7v10M2 9v6M22 9v6M6 12h12"/></svg>`;
const BACK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;

const VIEW_MARKUP = `
  <section class="auth-section">
    <div class="container">
      <a href="profile.html" class="back-link">${BACK_ICON}Volver</a>
      <div class="section-head reveal">
        <span class="eyebrow">Catálogo de ejercicios</span>
        <h1>Mis ejercicios</h1>
        <p>Los ejercicios que vos creaste. Podés editarlos, eliminarlos o agregar uno nuevo.</p>
      </div>
      <button class="btn btn-primary btn-sm" id="myExcAddBtn" type="button">+ Agregar ejercicio</button>
      <div id="myExcResults"></div>
    </div>
  </section>
`;

export const misEjerciciosView: ViewModule = {
  async mount(container, _params, ctx, authUserId) {
    const userId = authUserId!; // la ruta se registra con requiresAuth:true
    container.innerHTML = VIEW_MARKUP;

    const resultsEl = container.querySelector("#myExcResults")!;
    let exercises: Exercise[] = [];

    async function load(): Promise<void> {
      resultsEl.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando tus ejercicios...</p></div>`;
      exercises = await listMyExercises(userId);
      render();
    }

    function render(): void {
      if (exercises.length === 0) {
        resultsEl.innerHTML = `<p class="exc-pick-empty">Todavía no creaste ningún ejercicio.</p>`;
        return;
      }

      const sections = EXERCISE_CATEGORIES.map((cat) => {
        const items = exercises.filter((e) => e.category === cat);
        if (items.length === 0) return "";
        return `
          <div class="exc-pick-section">
            <h4>${escapeHtml(CATEGORY_LABELS[cat])}</h4>
            <div class="exc-pick-grid">
              ${items
                .map(
                  (exc) => `
                <div class="exc-admin-card" data-id="${exc.id}">
                  <span class="exc-pick-thumb">${exc.image_start_url || exc.image_execution_url ? `<img src="${escapeHtml(exc.image_start_url || exc.image_execution_url!)}" alt="" loading="lazy">` : DUMBBELL_ICON}</span>
                  <span class="exc-admin-name">${escapeHtml(exc.name)}</span>
                  <div class="exc-admin-actions">
                    <button type="button" class="exc-admin-edit" data-id="${exc.id}">Editar</button>
                    <button type="button" class="exc-admin-delete" data-id="${exc.id}">Eliminar</button>
                  </div>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        `;
      })
        .filter(Boolean)
        .join("");

      resultsEl.innerHTML = sections;

      resultsEl.querySelectorAll<HTMLElement>(".exc-pick-thumb").forEach((thumb) => {
        thumb.addEventListener(
          "click",
          () => {
            const card = thumb.closest<HTMLElement>(".exc-admin-card")!;
            const exc = exercises.find((e) => e.id === card.dataset.id);
            if (exc) openExerciseModal(exc.name, exc.info, null, "Vos", exc.category, exc.image_start_url, exc.image_execution_url, userId, exc.id);
          },
          { signal: ctx.signal }
        );
      });

      resultsEl.querySelectorAll<HTMLButtonElement>(".exc-admin-edit").forEach((btn) => {
        btn.addEventListener(
          "click",
          () => {
            const exc = exercises.find((e) => e.id === btn.dataset.id);
            if (exc) openCreateExerciseModal(userId, exc, ctx, load);
          },
          { signal: ctx.signal }
        );
      });

      resultsEl.querySelectorAll<HTMLButtonElement>(".exc-admin-delete").forEach((btn) => {
        btn.addEventListener(
          "click",
          () => {
            const exc = exercises.find((e) => e.id === btn.dataset.id);
            if (exc) openDeleteModal(exc);
          },
          { signal: ctx.signal }
        );
      });
    }

    function openDeleteModal(exc: Exercise): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>¿Eliminar "${escapeHtml(exc.name)}"?</h2>
            <p class="subtitle">Esta acción no se puede deshacer. Si alguna rutina usa este ejercicio, no se va a poder eliminar hasta quitarlo de esa rutina.</p>
            <div class="alert_message" id="myExcDeleteAlert"></div>
            <div class="modal-actions">
              <button class="btn btn-outline" id="myExcDeleteCancel" type="button">Cancelar</button>
              <button class="btn btn-danger" id="myExcDeleteConfirm" type="button">Eliminar</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById("myExcDeleteCancel")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });

      document.getElementById("myExcDeleteConfirm")?.addEventListener("click", async () => {
        const alertBox = document.getElementById("myExcDeleteAlert")!;
        const { error } = await deleteExercise(exc.id);
        if (error) {
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }
        exercises = exercises.filter((e) => e.id !== exc.id);
        loaderBody.innerHTML = "";
        render();
      });
    }

    container.querySelector("#myExcAddBtn")?.addEventListener("click", () => openCreateExerciseModal(userId, null, ctx, load), { signal: ctx.signal });

    await load();
  },
};
