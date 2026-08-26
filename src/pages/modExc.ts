import type { ViewModule } from "../shell/router";
import { navigate } from "../shell/router";
import { escapeHtml } from "../lib/dom";
import { dayDisplayLabel } from "../lib/dias";
import { listExercises, type Exercise } from "../services/exercise.service";
import { openExercisePicker } from "../lib/exercisePicker";
import {
  getRoutineDetail,
  updateRoutineExercise,
  deleteRoutineExercise,
  addRoutineExercise,
  type RoutineDetail,
  type RoutineExerciseWithAuthor,
} from "../services/routine.service";
import { getProfileBasicById, getProfilesBasicByIds } from "../services/profile.service";
import { routineOwnerLineMarkup } from "../lib/routineOwner";

const VIEW_MARKUP = `
  <section class="page-hero">
    <div class="container">
      <span class="eyebrow">Modificar rutina</span>
      <h1 id="routineTitle">Cargando...</h1>
      <div id="routineOwnerBanner"></div>
      <p id="routineSubtitle"></p>
    </div>
  </section>

  <section class="features">
    <div class="container">
      <div class="field field-narrow" id="weekPicker">
        <label for="weekSelect">Semana</label>
        <select id="weekSelect"></select>
      </div>

      <div id="weekContent"></div>

      <div class="alert_message alert_message-center" id="alert_message"></div>
      <div class="auth-trust" id="saveWrap">
        <button class="btn btn-primary" id="saveChanges" type="button">Guardar cambios</button>
      </div>
    </div>
  </section>
`;

function excBlockMarkup(exc?: RoutineExerciseWithAuthor): string {
  const isNoWeight = exc ? !exc.es_medible : false;
  const selectedLabel = exc ? escapeHtml(exc.nombre_snapshot) : "Elegir ejercicio";
  return `
    <div class="exc-block exc-block-create" data-existing-id="${exc?.id ?? ""}">
      <div class="exc-top-row">
        <div class="exc-reorder">
          <button type="button" class="exc-move-up" title="Subir">▲</button>
          <button type="button" class="exc-move-down" title="Bajar">▼</button>
        </div>
        <button type="button" class="exc-picker-btn">${selectedLabel}</button>
        <input type="hidden" class="excSelectInput" value="${exc?.exercise_id ?? ""}">
        <button class="exc-remove" type="button" title="Quitar ejercicio">×</button>
      </div>
      <div class="exc-fields-row">
        <label class="exc-field exc-field-series">
          <span class="exc-field-label">Series</span>
          <input type="number" class="mini-input serieInput" value="${exc?.serie ?? ""}" placeholder="Ej: 3" min="1" max="10">
        </label>
        <span class="exc-field-sep" aria-hidden="true">x</span>
        <label class="exc-field exc-field-repe">
          <span class="exc-field-label">Repeticiones</span>
          <input type="number" class="mini-input repeInput" value="${exc?.repe ?? ""}" placeholder="Ej: 10" min="1" max="30">
        </label>
        <span class="exc-field-sep" aria-hidden="true">-</span>
        <label class="exc-field exc-field-hasta">
          <span class="exc-field-label">Hasta <em>(opcional)</em></span>
          <input type="number" class="mini-input repeMaxInput" value="${exc?.repe_max ?? ""}" placeholder="Rango" min="1" max="30" title="Completá esto solo si querés un rango de repeticiones (ej: 5 a 7)">
        </label>
      </div>
      <div class="exc-extra">
        <label><input type="checkbox" class="noWeightCheck" ${isNoWeight ? "checked" : ""}> Sin peso</label>
        <label><input type="checkbox" class="mismoPesoCheck" ${exc?.mismo_peso ? "checked" : ""}> Mismo peso en todas las series</label>
        <input type="text" class="notaInput" placeholder="Nota para este ejercicio (opcional)" maxlength="140" value="${escapeHtml(exc?.nota ?? "")}">
      </div>
    </div>
  `;
}

function updateMoveButtons(list: Element): void {
  const blocks = list.querySelectorAll(".exc-block");
  blocks.forEach((block, i) => {
    block.querySelector<HTMLButtonElement>(".exc-move-up")!.disabled = i === 0;
    block.querySelector<HTMLButtonElement>(".exc-move-down")!.disabled = i === blocks.length - 1;
  });
}

// mount() define render() (arma el DOM entero desde cero para cada ?rid= -- no hay estado fino
// que preservar entre rutinas distintas) y la deja referenciada aca para que update() la reuse.
let updateHandler: ((params: URLSearchParams) => void) | null = null;

export const modExcView: ViewModule = {
  async mount(container, params, ctx, authUserId) {
    const myId = authUserId!; // la ruta se registra con requiresAuth:true

    async function render(p: URLSearchParams): Promise<void> {
      container.innerHTML = VIEW_MARKUP;

      const routineId = p.get("rid");
      let excCatalog: Exercise[] = await listExercises();
      excCatalog.sort((a, b) => a.name.localeCompare(b.name));

      const routine: RoutineDetail | null = routineId ? await getRoutineDetail(routineId) : null;

      if (!routine) {
        const title = container.querySelector("#routineTitle");
        if (title) title.textContent = "No se encontró esta rutina.";
        container.querySelector("#weekPicker")?.remove();
        container.querySelector("#saveWrap")?.remove();
        return;
      }

      // Una rutina asignada y privada es del que la asigno: quien la recibe no la
      // puede modificar (ver migracion student_routine_permission_lockdown). Se
      // corta aca con un mensaje claro en vez de dejar completar el formulario y
      // que despues falle en silencio contra la RLS al guardar.
      const isOwner = routine.user_id === myId;
      const isAssigner = routine.assigned_by === myId;
      const canEdit = isAssigner || (isOwner && (!routine.assigned_by || routine.is_public)) || (await getProfileBasicById(myId).catch(() => null))?.user_type === "admin";
      if (!canEdit) {
        const title = container.querySelector("#routineTitle");
        const subtitle = container.querySelector("#routineSubtitle");
        if (title) title.textContent = routine.nombre;
        if (subtitle) subtitle.textContent = "Esta rutina te la asignó tu entrenador y es privada: no la podés modificar, solo entrenarla y mirarla.";
        container.querySelector("#weekPicker")?.remove();
        container.querySelector("#saveWrap")?.remove();
        container.querySelector("#weekContent")?.remove();
        return;
      }

      const title = container.querySelector("#routineTitle");
      const subtitle = container.querySelector("#routineSubtitle");
      const ownerBanner = container.querySelector("#routineOwnerBanner");
      if (title) title.textContent = routine.nombre;
      if (subtitle)
        subtitle.textContent =
          routine.semanas.length > 1
            ? "Agregá o quitá ejercicios y editá series, repeticiones o notas de cada día. Por defecto el cambio se aplica a todas las semanas -- elegí una semana puntual si querés modificar solo esa."
            : "Agregá o quitá ejercicios y editá series, repeticiones o notas de cada día.";
      if (ownerBanner) {
        const profiles = await getProfilesBasicByIds([routine.user_id, routine.assigned_by]);
        ownerBanner.innerHTML = routineOwnerLineMarkup(profiles.get(routine.user_id), routine.assigned_by ? profiles.get(routine.assigned_by) : null);
      }

      function renderWeek(weekIndex: number): void {
        const semana = routine!.semanas[weekIndex];
        const weekContent = container.querySelector("#weekContent") as HTMLElement;
        weekContent.dataset.week = String(weekIndex);

        weekContent.innerHTML = semana.dias
          .map(
            (dia) => `
          <div class="day-card reveal" data-day-id="${dia.id}">
            <h3>${escapeHtml(dayDisplayLabel(dia.dia_semana, dia.nombre))}</h3>
            <div class="exc-list">${dia.ejercicios.map((exc) => excBlockMarkup(exc)).join("")}</div>
            <button class="day-add-btn" type="button">+ Agregar ejercicio</button>
          </div>
        `
          )
          .join("");

        weekContent.querySelectorAll(".exc-list").forEach((list) => updateMoveButtons(list));
      }

      async function saveChanges(): Promise<void> {
        const alertMessage = container.querySelector("#alert_message")!;
        const weekContent = container.querySelector("#weekContent") as HTMLElement;
        const weekIndex = Number(weekContent.dataset.week);
        const semana = routine!.semanas[weekIndex];
        const dayCards = weekContent.querySelectorAll<HTMLElement>(".day-card");
        let error = "";

        interface PendingRow {
          exercise_id: string;
          nombre_snapshot: string;
          info_snapshot: string;
          serie: number;
          repe: number;
          repe_max: number | null;
          nota: string;
          es_medible: boolean;
          mismo_peso: boolean;
          orden: number;
        }
        interface PendingDay {
          dayId: string;
          keepIds: Set<string>;
          updates: (PendingRow & { id: string })[];
          inserts: PendingRow[];
        }
        const pending: PendingDay[] = [];
        const weekSelect = container.querySelector("#weekSelect") as HTMLSelectElement;
        const applyToAllWeeks = weekSelect.value === "all";

        dayCards.forEach((dayCard) => {
          const dayId = dayCard.dataset.dayId!;
          const keepIds = new Set<string>();
          const updates: PendingDay["updates"] = [];
          const inserts: PendingDay["inserts"] = [];

          const diaLabelText = dayCard.querySelector("h3")?.textContent ?? "este día";

          dayCard.querySelectorAll<HTMLElement>(".exc-block").forEach((block, orden) => {
            if (error) return;
            const excId = (block.querySelector(".excSelectInput") as HTMLInputElement).value;
            const serie = parseInt((block.querySelector(".serieInput") as HTMLInputElement).value, 10);
            const repe = parseInt((block.querySelector(".repeInput") as HTMLInputElement).value, 10);
            const repeMaxRaw = (block.querySelector(".repeMaxInput") as HTMLInputElement).value;
            const repeMax = repeMaxRaw ? parseInt(repeMaxRaw, 10) : null;
            const noWeight = (block.querySelector(".noWeightCheck") as HTMLInputElement).checked;
            const mismoPeso = (block.querySelector(".mismoPesoCheck") as HTMLInputElement).checked;
            const nota = (block.querySelector(".notaInput") as HTMLInputElement).value.trim();
            const existingId = block.dataset.existingId;
            const ubicacion = `${diaLabelText}, ejercicio ${orden + 1}`;

            if (!excId) {
              error = `Te falta elegir un ejercicio (${ubicacion}). Tocá "Elegir ejercicio" para buscarlo en el catálogo.`;
              return;
            }
            if (!serie || serie < 1 || serie > 10) {
              error = `Revisá las series en ${ubicacion}: tienen que ser un número entre 1 y 10.`;
              return;
            }
            if (!repe || repe < 1 || repe > 30) {
              error = `Revisá las repeticiones en ${ubicacion}: tienen que ser un número entre 1 y 30.`;
              return;
            }
            if (repeMax !== null && (repeMax < 1 || repeMax > 30 || repeMax < repe)) {
              error = `Revisá el "hasta" en ${ubicacion}: tiene que ser mayor o igual a las repeticiones y como máximo 30.`;
              return;
            }
            if (nota.length > 140) {
              error = `La nota en ${ubicacion} es muy larga: dejala en 140 caracteres o menos.`;
              return;
            }

            const excDef = excCatalog.find((e) => e.id === excId)!;
            const row: PendingRow = {
              exercise_id: excDef.id,
              nombre_snapshot: excDef.name,
              info_snapshot: excDef.info,
              serie,
              repe,
              repe_max: repeMax,
              nota,
              es_medible: !noWeight,
              mismo_peso: mismoPeso,
              orden,
            };

            if (existingId) {
              keepIds.add(existingId);
              updates.push({ id: existingId, ...row });
            } else {
              inserts.push(row);
            }
          });

          if (!error && dayCard.querySelectorAll(".exc-block").length === 0) error = `Agregá al menos un ejercicio en ${diaLabelText}.`;
          pending.push({ dayId, keepIds, updates, inserts });
        });

        if (error) {
          alertMessage.innerHTML = `<p>${escapeHtml(error)}</p>`;
          alertMessage.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }

        alertMessage.innerHTML = "";
        const loaderBody = document.getElementById("loaderBody")!;
        loaderBody.innerHTML = `<div class="loader-container"><div class="modern-spinner"></div><p>Actualizando rutina...</p></div>`;

        try {
          for (let i = 0; i < pending.length; i++) {
            const { dayId, keepIds, updates, inserts } = pending[i];
            const original = semana.dias[i];
            const toDelete = original.ejercicios.filter((e) => !keepIds.has(e.id));

            await Promise.all([
              ...updates.map((u) => updateRoutineExercise(u.id, u)),
              ...inserts.map((row) => addRoutineExercise(dayId, row)),
              ...toDelete.map((e) => deleteRoutineExercise(e.id)),
            ]);
          }

          // "Todas las semanas" (default cuando la rutina tiene mas de una): en vez de una casilla
          // por ejercicio, ahora es una sola decision a nivel semana -- se lleva la lista final de
          // cada dia (ya armada arriba para la semana editada) tal cual a todas las demas semanas,
          // borrando lo que tenian antes en ese dia e insertando de cero. Simple y predecible: lo
          // que quedo en pantalla para ese dia es lo que va a haber en TODAS las semanas para ese
          // dia, no solo un ajuste de numeros sobre lo que ya habia (tambien cubre agregar/sacar
          // ejercicios, no solo tocar series/repe de uno que ya matcheaba).
          if (applyToAllWeeks) {
            const finalRowsByDay = pending.map(({ updates, inserts }) =>
              [...updates.map(({ id: _id, ...row }) => row), ...inserts].sort((a, b) => a.orden - b.orden)
            );

            await Promise.all(
              routine!.semanas
                .filter((_, wIdx) => wIdx !== weekIndex)
                .flatMap((otherSemana) =>
                  otherSemana.dias.flatMap((dia, diaIndex) => {
                    const finalRows = finalRowsByDay[diaIndex];
                    if (!finalRows) return [];
                    return [
                      ...dia.ejercicios.map((e) => deleteRoutineExercise(e.id)),
                      ...finalRows.map((row) => addRoutineExercise(dia.id, row)),
                    ];
                  })
                )
            );
          }

          loaderBody.innerHTML = `
            <div class="success-check-container">
              <div class="success-icon"><svg viewBox="0 0 52 52" class="success-svg"><circle cx="26" cy="26" r="25" fill="none" class="success-circle" /><path fill="none" d="M14 27l7 7 16-16" class="success-check" /></svg></div>
              <p>¡Rutina actualizada con éxito! Espere, será redirigido.</p>
            </div>
          `;
          const t = setTimeout(() => navigate("profile.html"), 2000);
          ctx.addCleanup(() => clearTimeout(t));
        } catch {
          loaderBody.innerHTML = "";
          alertMessage.innerHTML = "<p>ERROR! No se pudo actualizar la rutina.</p>";
        }
      }

      const weekSelect = container.querySelector("#weekSelect") as HTMLSelectElement;
      weekSelect.innerHTML =
        (routine.semanas.length > 1 ? `<option value="all" selected>Todas las semanas</option>` : "") +
        routine.semanas.map((semana, index) => `<option value="${index}">Semana ${semana.numero}</option>`).join("");
      weekSelect.addEventListener("change", () => renderWeek(weekSelect.value === "all" ? 0 : Number(weekSelect.value)), { signal: ctx.signal });
      renderWeek(0);

      container.querySelector("#weekContent")?.addEventListener(
        "click",
        (event) => {
          const target = event.target as HTMLElement;
          if (target.classList.contains("day-add-btn")) {
            const list = target.previousElementSibling;
            list?.insertAdjacentHTML("beforeend", excBlockMarkup());
            if (list) updateMoveButtons(list);
          }
          if (target.classList.contains("exc-remove")) {
            const block = target.closest(".exc-block");
            const list = block?.parentElement;
            if (list && list.children.length > 1) {
              block?.remove();
              updateMoveButtons(list);
            }
          }
          if (target.classList.contains("exc-move-up")) {
            const block = target.closest(".exc-block");
            const prev = block?.previousElementSibling;
            if (block && prev) {
              block.parentElement!.insertBefore(block, prev);
              updateMoveButtons(block.parentElement!);
            }
          }
          if (target.classList.contains("exc-move-down")) {
            const block = target.closest(".exc-block");
            const next = block?.nextElementSibling;
            if (block && next) {
              block.parentElement!.insertBefore(next, block);
              updateMoveButtons(block.parentElement!);
            }
          }
          if (target.classList.contains("exc-picker-btn")) {
            const block = target.closest<HTMLElement>(".exc-block")!;
            openExercisePicker(
              (exc) => {
                if (!excCatalog.some((e) => e.id === exc.id)) excCatalog.push(exc);
                target.textContent = exc.name;
                block.querySelector<HTMLInputElement>(".excSelectInput")!.value = exc.id;
              },
              myId,
              ctx
            );
          }
        },
        { signal: ctx.signal }
      );

      container.querySelector("#saveChanges")?.addEventListener("click", () => void saveChanges(), { signal: ctx.signal });
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
