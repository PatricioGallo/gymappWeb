import type { ViewModule } from "../shell/router";
import { escapeHtml } from "../lib/dom";
import { dayDisplayLabel } from "../lib/dias";
import { getRoutineDetail, getSharedRoutine, type RoutineDetail } from "../services/routine.service";
import { getProfilesBasicByIds } from "../services/profile.service";
import { getSharedExerciseById, CATEGORY_LABELS } from "../services/exercise.service";
import { isVideoUrl } from "../lib/imageDropzone";
import { routineOwnerLineMarkup } from "../lib/routineOwner";
import { formatRepe } from "../lib/reps";
import { openExerciseModal } from "../lib/exerciseModal";
import { openShareRoutineModal, type ShareableRoutine } from "../lib/routineShareModal";
import { openShareExerciseModal } from "../lib/exerciseShareModal";

const VIEW_MARKUP = `
  <section class="page-hero">
    <div class="container">
      <span class="eyebrow">Rutina</span>
      <h1 id="routineTitle">Cargando...</h1>
      <div id="routineOwnerBanner"></div>
      <p id="routineSubtitle"></p>

      <div class="profile-actions" id="routineActions">
        <button class="btn btn-outline" id="shareBtn" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5 15.4 6.5M8.6 13.5 15.4 17.5"/></svg>
          Compartir rutina
        </button>
      </div>
    </div>
  </section>

  <section class="features">
    <div class="container">
      <div class="week-status" id="weekStatus"></div>

      <div id="weekContent"></div>
    </div>
  </section>
`;

// mount() define render() (arma el DOM entero desde cero para cada ?rid=/?token= -- no hay
// estado fino que preservar entre rutinas distintas) y la deja referenciada aca para que
// update() la reuse sin desmontar toda la vista.
let updateHandler: ((params: URLSearchParams) => void) | null = null;

export const showExcView: ViewModule = {
  async mount(container, params, ctx, authUserId) {
    const isLoggedIn = authUserId !== null;

    function showNotFound(message: string): void {
      const title = container.querySelector("#routineTitle");
      if (title) title.textContent = message;
      container.querySelector("#routineActions")?.remove();
      container.querySelector("#weekStatus")?.remove();
    }

    function renderWeekStatus(weekCount: number): void {
      const weekStatus = container.querySelector("#weekStatus");
      if (!weekStatus) return;
      weekStatus.innerHTML = `<span class="hero-badge">Rutina de ${weekCount} semana${weekCount === 1 ? "" : "s"}</span>`;
    }

    function initShare(getShareUrl: () => Promise<string>, routineName: string, ownerName: string): void {
      const shareBtn = container.querySelector("#shareBtn") as HTMLButtonElement | null;
      if (!shareBtn) return;
      const originalHTML = shareBtn.innerHTML;

      shareBtn.addEventListener(
        "click",
        async () => {
          try {
            const url = await getShareUrl();
            if (navigator.share) {
              await navigator.share({ title: `Rutina de ${ownerName} - Gym Social`, text: `Mirá la rutina "${routineName}" en Gym Social`, url });
              return;
            }
            await navigator.clipboard.writeText(url);
            shareBtn.textContent = "¡Copiado!";
            const t = setTimeout(() => {
              shareBtn.innerHTML = originalHTML;
            }, 2000);
            ctx.addCleanup(() => clearTimeout(t));
          } catch {
            // cancelado por el usuario, no es un error real
          }
        },
        { signal: ctx.signal }
      );
    }

    function toggleDay(diaIndex: number): void {
      const accordion = container.querySelector(`.day-accordion[data-dia="${diaIndex}"]`);
      const detail = container.querySelector(`#dayDetail-${diaIndex}`);
      if (!accordion || !detail) return;
      const isOpen = accordion.classList.toggle("open");
      (detail as HTMLElement).hidden = !isOpen;
    }

    // ---------- Modo autenticado (?rid=) ----------

    async function renderAuthenticated(id: string): Promise<void> {
      // El listener se engancha ya (antes del await) para que un click apurado sobre
      // "Compartir rutina" no caiga en el vacío mientras carga la rutina.
      let shareData: ShareableRoutine | null = null;
      const shareBtn = container.querySelector("#shareBtn") as HTMLButtonElement | null;
      shareBtn?.addEventListener(
        "click",
        () => {
          if (shareData) void openShareRoutineModal(shareData, authUserId!);
        },
        { signal: ctx.signal }
      );

      const routine = await getRoutineDetail(id);
      if (!routine) {
        showNotFound("No se encontró esta rutina.");
        return;
      }

      const title = container.querySelector("#routineTitle");
      const ownerBanner = container.querySelector("#routineOwnerBanner");
      if (title) title.textContent = routine.nombre;
      if (ownerBanner) {
        const profiles = await getProfilesBasicByIds([routine.user_id, routine.assigned_by]);
        ownerBanner.innerHTML = routineOwnerLineMarkup(profiles.get(routine.user_id), routine.assigned_by ? profiles.get(routine.assigned_by) : null);
      }

      renderWeekStatus(routine.semanas.length);

      const diasBase = routine.semanas[0]?.dias ?? [];
      renderWeekContent(diasBase, routine.semanas.length);

      // Dueño autenticado: el botón abre el modal completo (chat / Rep / link externo).
      shareData = {
        id: routine.id,
        nombre: routine.nombre,
        is_shareable: routine.is_shareable,
        share_token: routine.share_token,
        semanasCount: routine.semanas.length,
        diasPorSemana: diasBase.length,
        ejerciciosCount: diasBase.reduce((n, d) => n + d.ejercicios.length, 0),
      };
    }

    function renderWeekContent(diasBase: RoutineDetail["semanas"][number]["dias"], weekCount: number): void {
      const weekContent = container.querySelector("#weekContent");
      if (!weekContent) return;

      weekContent.innerHTML = diasBase
        .map(
          (dia, diaIndex) => `
        <div class="day-accordion reveal" data-dia="${diaIndex}">
          <button class="day-row" type="button" data-dia="${diaIndex}">
            <div class="day-row-info"><h3>${escapeHtml(dayDisplayLabel(dia.dia_semana, dia.nombre))}</h3><p>${dia.ejercicios.length} ejercicio${dia.ejercicios.length === 1 ? "" : "s"}</p></div>
            <svg class="day-row-chevron" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
          </button>
          <div class="day-detail" id="dayDetail-${diaIndex}" hidden>
            <div class="exc-table-scroll">
              <div class="exc-table-head"><span>Ejercicio</span><span>Series</span><span>Repeticiones</span><span>Semanas</span></div>
              ${dia.ejercicios
                .map(
                  (exc, excIndex) => `
                <div class="exc-table-row">
                  <button class="exc-name" type="button" data-dia="${diaIndex}" data-exc="${excIndex}">
                    ${escapeHtml(exc.nombre_snapshot)}
                    ${exc.nota ? '<span class="exc-note-dot" title="Tiene nota del entrenador"></span>' : ""}
                  </button>
                  <span>${exc.serie}</span>
                  <span>${formatRepe(exc.repe, exc.repe_max)}</span>
                  <span>${weekCount}</span>
                </div>`
                )
                .join("")}
            </div>
          </div>
        </div>`
        )
        .join("");

      weekContent.querySelectorAll<HTMLButtonElement>(".day-row").forEach((row) => {
        row.addEventListener("click", () => toggleDay(Number(row.dataset.dia)), { signal: ctx.signal });
      });
      weekContent.querySelectorAll<HTMLButtonElement>(".exc-name").forEach((button) => {
        button.addEventListener(
          "click",
          (event) => {
            event.stopPropagation();
            const dia = diasBase[Number(button.dataset.dia)];
            const exc = dia.ejercicios[Number(button.dataset.exc)];
            openExerciseModal(exc.nombre_snapshot, exc.info_snapshot, exc.nota, exc.authorName ?? "Gym Social", exc.category, exc.media_urls);
          },
          { signal: ctx.signal }
        );
      });
    }

    // ---------- Modo publico (?token=) ----------

    async function renderShared(token: string): Promise<void> {
      const routine = await getSharedRoutine(token);
      if (!routine) {
        showNotFound("No se encontró esta rutina o el link ya no es válido.");
        return;
      }

      const title = container.querySelector("#routineTitle");
      const ownerBanner = container.querySelector("#routineOwnerBanner");
      const ownerName = routine.owner ? `${routine.owner.nombre} ${routine.owner.apellido}` : "un usuario";
      if (title) title.textContent = routine.nombre;
      if (ownerBanner) ownerBanner.innerHTML = routine.owner ? routineOwnerLineMarkup(routine.owner) : "";

      renderWeekStatus(routine.semanas.length);

      const diasBase = routine.semanas[0]?.dias ?? [];
      const weekContent = container.querySelector("#weekContent");
      if (weekContent) {
        weekContent.innerHTML = diasBase
          .map(
            (dia: any, diaIndex: number) => `
          <div class="day-accordion reveal" data-dia="${diaIndex}">
            <button class="day-row" type="button" data-dia="${diaIndex}">
              <div class="day-row-info"><h3>${escapeHtml(dayDisplayLabel(dia.dia_semana, dia.nombre))}</h3><p>${dia.ejercicios.length} ejercicio${dia.ejercicios.length === 1 ? "" : "s"}</p></div>
              <svg class="day-row-chevron" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
            </button>
            <div class="day-detail" id="dayDetail-${diaIndex}" hidden>
              <div class="exc-table-scroll">
                <div class="exc-table-head"><span>Ejercicio</span><span>Series</span><span>Repeticiones</span><span>Semanas</span></div>
                ${dia.ejercicios
                  .map(
                    (exc: any, excIndex: number) => `
                  <div class="exc-table-row">
                    <button class="exc-name" type="button" data-dia="${diaIndex}" data-exc="${excIndex}">
                      ${escapeHtml(exc.nombre)}${exc.nota ? '<span class="exc-note-dot" title="Tiene nota del entrenador"></span>' : ""}
                    </button>
                    <span>${exc.serie}</span><span>${formatRepe(exc.repe, exc.repe_max)}</span><span>${routine.semanas.length}</span>
                  </div>`
                  )
                  .join("")}
              </div>
            </div>
          </div>`
          )
          .join("");

        weekContent.querySelectorAll<HTMLButtonElement>(".day-row").forEach((row) => {
          row.addEventListener("click", () => toggleDay(Number(row.dataset.dia)), { signal: ctx.signal });
        });
        weekContent.querySelectorAll<HTMLButtonElement>(".exc-name").forEach((button) => {
          button.addEventListener(
            "click",
            (event) => {
              event.stopPropagation();
              const dia = diasBase[Number(button.dataset.dia)];
              const exc = dia.ejercicios[Number(button.dataset.exc)];
              openExerciseModal(exc.nombre, exc.info, exc.nota, "Gym Social", exc.category, exc.media_urls);
            },
            { signal: ctx.signal }
          );
        });
      }

      initShare(async () => window.location.href, routine.nombre, ownerName);
    }

    // ---------- Visor de un ejercicio compartido (?exId=) ----------

    async function renderExercise(exId: string): Promise<void> {
      const DEFAULT_IMG = "/images/icon-512.png";
      const exc = await getSharedExerciseById(exId);
      if (!exc) {
        showNotFound("No se encontró este ejercicio o el link ya no es válido.");
        return;
      }

      const urls = exc.mediaUrls.length > 0 ? exc.mediaUrls : [DEFAULT_IMG];
      const mediaHtml = urls
        .map((url) =>
          url !== DEFAULT_IMG && isVideoUrl(url)
            ? `<div class="exc-modal-image-item"><video class="exc-modal-image" src="${escapeHtml(url)}" controls playsinline loop></video></div>`
            : `<div class="exc-modal-image-item"><img class="exc-modal-image${url === DEFAULT_IMG ? " exc-modal-image-default" : ""}" src="${escapeHtml(url)}" alt="${escapeHtml(exc.name)}" loading="lazy"></div>`
        )
        .join("");

      const isAuthor = isLoggedIn && exc.authorId === authUserId;
      const authorLine = exc.authorUsername
        ? `Ejercicio de <a href="profile.html?u=${encodeURIComponent(exc.authorUsername)}">@${escapeHtml(exc.authorUsername)}</a>`
        : "Ejercicio de Gym Social";

      container.innerHTML = `
        <section class="page-hero">
          <div class="container">
            <span class="eyebrow">Ejercicio</span>
            <h1>${escapeHtml(exc.name)}</h1>
            <div class="exc-share-hero-meta">
              <span class="hero-badge">${escapeHtml(CATEGORY_LABELS[exc.category])}</span>
              ${isAuthor ? `<button class="btn btn-outline" id="shareExcBtn" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5 15.4 6.5M8.6 13.5 15.4 17.5"/></svg>
                Compartir ejercicio
              </button>` : ""}
            </div>
          </div>
        </section>
        <section class="features">
          <div class="container">
            <div class="exc-modal-images">${mediaHtml}</div>
            <p class="subtitle">${escapeHtml(exc.info || "Sin descripción cargada.")}</p>
            <p class="auth-foot" style="text-align:left;margin-top:16px;">${authorLine}</p>
          </div>
        </section>
      `;

      if (isAuthor) {
        container.querySelector("#shareExcBtn")?.addEventListener(
          "click",
          () => void openShareExerciseModal({ id: exc.id, name: exc.name, category: exc.category, is_public: true }, authUserId!),
          { signal: ctx.signal }
        );
      }
    }

    async function render(p: URLSearchParams): Promise<void> {
      container.innerHTML = VIEW_MARKUP;

      const routineId = p.get("rid");
      const shareToken = p.get("token");
      const exId = p.get("exId");

      if (exId) {
        await renderExercise(exId);
        return;
      }
      if (shareToken) {
        await renderShared(shareToken);
        return;
      }
      if (routineId) {
        if (!isLoggedIn) {
          window.location.href = "login.html";
          return;
        }
        await renderAuthenticated(routineId);
        return;
      }
      showNotFound("No se encontró esta rutina.");
    }

    await render(params);

    updateHandler = (nextParams) => void render(nextParams);
    ctx.addCleanup(() => {
      updateHandler = null;
    });
  },
  update(params) {
    updateHandler?.(params);
  },
};
