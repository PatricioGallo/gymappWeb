import type { ViewModule } from "../shell/router";
import {
  listMyExercises,
  deleteExercise,
  getMyExercisesUsageCounts,
  listExerciseUsers,
  EXERCISE_CATEGORIES,
  CATEGORY_LABELS,
  type Exercise,
} from "../services/exercise.service";
import { escapeHtml } from "../lib/dom";
import { formatFechaCorta } from "../lib/dias";
import { openCreateExerciseModal } from "../lib/createExerciseModal";
import { openExerciseModal } from "../lib/exerciseModal";
import { exerciseThumbMediaHtml } from "../lib/imageDropzone";

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
    let usageCounts: Record<string, number> = {};

    async function load(): Promise<void> {
      resultsEl.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando tus ejercicios...</p></div>`;
      const [exc, counts] = await Promise.all([listMyExercises(userId), getMyExercisesUsageCounts().catch(() => ({}))]);
      exercises = exc;
      usageCounts = counts;
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
                .map((exc) => {
                  const count = usageCounts[exc.id] ?? 0;
                  return `
                <div class="exc-admin-card" data-id="${exc.id}">
                  <span class="exc-pick-thumb">${exerciseThumbMediaHtml(exc.media_urls, DUMBBELL_ICON)}</span>
                  <span class="exc-admin-name">${escapeHtml(exc.name)}</span>
                  <div class="exc-admin-info">
                    <span class="exc-admin-meta">Creado el ${escapeHtml(formatFechaCorta(exc.created_at))}</span>
                    <button type="button" class="exc-admin-usage" data-id="${exc.id}" ${count === 0 ? "disabled" : ""}>${count} persona${count === 1 ? "" : "s"} lo usa${count === 1 ? "" : "n"}</button>
                  </div>
                  <div class="exc-admin-actions">
                    <button type="button" class="exc-admin-edit" data-id="${exc.id}">Editar</button>
                    <button type="button" class="exc-admin-delete" data-id="${exc.id}">Eliminar</button>
                  </div>
                </div>
              `;
                })
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
            if (exc) openExerciseModal(exc.name, exc.info, null, "Vos", exc.category, exc.media_urls, userId, exc.id);
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

      resultsEl.querySelectorAll<HTMLButtonElement>(".exc-admin-usage").forEach((btn) => {
        btn.addEventListener(
          "click",
          () => {
            if (btn.disabled) return;
            const exc = exercises.find((e) => e.id === btn.dataset.id);
            if (exc) openUsersModal(exc);
          },
          { signal: ctx.signal }
        );
      });
    }

    function openUsersModal(exc: Exercise): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>Quiénes usan "${escapeHtml(exc.name)}"</h2>
            <p class="subtitle">Personas que tienen este ejercicio en una rutina activa ahora mismo.</p>
            <div id="myExcUsersModalBody" class="modal-list"><p class="chart-sub">Cargando...</p></div>
            <div class="modal-actions">
              <button type="button" class="btn btn-outline" id="myExcUsersClose">Cerrar</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById("myExcUsersClose")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });

      const bodyEl = document.getElementById("myExcUsersModalBody");
      if (!bodyEl) return;

      void (async () => {
        const users = await listExerciseUsers(exc.id).catch(() => []);
        bodyEl.innerHTML =
          users.length === 0
            ? `<p class="chart-sub">Nadie está usando este ejercicio ahora mismo.</p>`
            : users
                .map(
                  (u) => `
              <a class="follow-request-user" href="profile.html?u=${encodeURIComponent(u.username)}">
                <img src="${escapeHtml(u.avatar_url || "/images/avatars/default.svg")}" alt="" class="search-result-avatar">
                <span class="search-result-body">
                  <span class="search-result-name">${escapeHtml(`${u.nombre} ${u.apellido}`.trim())}</span>
                  <span class="search-result-username">@${escapeHtml(u.username)}</span>
                </span>
              </a>
            `
                )
                .join("");
      })();
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
        const confirmBtn = document.getElementById("myExcDeleteConfirm") as HTMLButtonElement;
        const alertBox = document.getElementById("myExcDeleteAlert")!;
        confirmBtn.disabled = true;
        const { error } = await deleteExercise(exc.id);
        if (error) {
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          confirmBtn.disabled = false;
          return;
        }
        exercises = exercises.filter((e) => e.id !== exc.id);
        loaderBody.innerHTML = `
          <div class="success-check-container">
            <div class="success-icon">
              <svg viewBox="0 0 52 52" class="success-svg">
                <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
                <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
              </svg>
            </div>
            <p>Ejercicio eliminado.</p>
          </div>
        `;
        const t = setTimeout(() => {
          loaderBody.innerHTML = "";
          render();
        }, 1400);
        ctx.addCleanup(() => clearTimeout(t));
      });
    }

    container.querySelector("#myExcAddBtn")?.addEventListener("click", () => openCreateExerciseModal(userId, null, ctx, load), { signal: ctx.signal });

    await load();
  },
};
