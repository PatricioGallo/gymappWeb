import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { diaLabel } from "../lib/dias";
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

setupNavToggle();
setupRevealObserver();
await requireAuth();

const params = new URLSearchParams(window.location.search);
const routineId = params.get("rid");

let excCatalog: Exercise[] = [];
let routine: RoutineDetail | null = null;

function excBlockMarkup(exc?: RoutineExerciseWithAuthor): string {
  const isNoWeight = exc ? !exc.es_medible : false;
  const selectedLabel = exc ? escapeHtml(exc.nombre_snapshot) : "Elegir ejercicio";
  return `
    <div class="exc-block" data-existing-id="${exc?.id ?? ""}">
      <div class="exc-edit-row">
        <div class="exc-reorder">
          <button type="button" class="exc-move-up" title="Subir">▲</button>
          <button type="button" class="exc-move-down" title="Bajar">▼</button>
        </div>
        <button type="button" class="exc-picker-btn">${selectedLabel}</button>
        <input type="hidden" class="excSelectInput" value="${exc?.exercise_id ?? ""}">
        <input type="number" class="mini-input serieInput" value="${exc?.serie ?? ""}" placeholder="Series" min="1" max="10">
        <input type="number" class="mini-input repeInput" value="${exc?.repe ?? ""}" placeholder="Repes" min="1" max="30">
        <span class="exc-repe-sep">a</span>
        <input type="number" class="mini-input repeMaxInput" value="${exc?.repe_max ?? ""}" placeholder="opcional" min="1" max="30" title="Completá esto solo si querés un rango de repeticiones (ej: 5 a 7)">
        <button class="exc-remove" type="button" title="Quitar ejercicio">×</button>
      </div>
      <div class="exc-extra">
        <label><input type="checkbox" class="noWeightCheck" ${isNoWeight ? "checked" : ""}> Sin peso</label>
        <label><input type="checkbox" class="mismoPesoCheck" ${exc ? (exc.mismo_peso ? "checked" : "") : "checked"}> Mismo peso en todas las series</label>
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

function renderWeek(weekIndex: number) {
  const semana = routine!.semanas[weekIndex];
  const weekContent = document.getElementById("weekContent")!;
  weekContent.dataset.week = String(weekIndex);

  weekContent.innerHTML = semana.dias
    .map(
      (dia) => `
    <div class="day-card reveal" data-day-id="${dia.id}">
      <h3>${escapeHtml(diaLabel(dia.dia_semana))}</h3>
      <div class="exc-edit-header"><span class="exc-edit-header-spacer"></span><span class="exc-edit-header-name">Ejercicio</span><span>Series</span><span>Repes</span><span class="exc-repe-sep" aria-hidden="true">a</span><span>Hasta</span><span class="exc-edit-header-spacer exc-edit-header-spacer-remove"></span></div>
      <div class="exc-list">${dia.ejercicios.map((exc) => excBlockMarkup(exc)).join("")}</div>
      <button class="day-add-btn" type="button">+ Agregar ejercicio</button>
    </div>
  `
    )
    .join("");

  weekContent.querySelectorAll(".exc-list").forEach((list) => updateMoveButtons(list));
}

async function saveChanges() {
  const alertMessage = document.getElementById("alert_message")!;
  const weekContent = document.getElementById("weekContent")!;
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

  dayCards.forEach((dayCard, diaIndex) => {
    const dayId = dayCard.dataset.dayId!;
    const keepIds = new Set<string>();
    const updates: PendingDay["updates"] = [];
    const inserts: PendingDay["inserts"] = [];

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

      if (!excId) {
        error = "Elegí un ejercicio en cada fila.";
        return;
      }
      if (!serie || serie < 1 || serie > 10) {
        error = "Las series tienen que ser entre 1 y 10.";
        return;
      }
      if (!repe || repe < 1 || repe > 30) {
        error = "Las repeticiones tienen que ser entre 1 y 30.";
        return;
      }
      if (repeMax !== null && (repeMax < 1 || repeMax > 30 || repeMax < repe)) {
        error = "El 'hasta' del rango tiene que ser mayor o igual a las repeticiones y como máximo 30.";
        return;
      }
      if (nota.length > 140) {
        error = "Las notas tienen un máximo de 140 caracteres.";
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

    if (!error && dayCard.querySelectorAll(".exc-block").length === 0) error = "Agregá al menos un ejercicio en cada día.";
    pending.push({ dayId, keepIds, updates, inserts });
    void diaIndex;
  });

  if (error) {
    alertMessage.innerHTML = `<p>${escapeHtml(error)}</p>`;
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

    loaderBody.innerHTML = `
      <div class="success-check-container">
        <div class="success-icon"><svg viewBox="0 0 52 52" class="success-svg"><circle cx="26" cy="26" r="25" fill="none" class="success-circle" /><path fill="none" d="M14 27l7 7 16-16" class="success-check" /></svg></div>
        <p>¡Rutina actualizada con éxito! Espere, será redirigido.</p>
      </div>
    `;
    setTimeout(() => {
      window.location.href = "profile.html";
    }, 2000);
  } catch {
    loaderBody.innerHTML = "";
    alertMessage.innerHTML = "<p>ERROR! No se pudo actualizar la rutina.</p>";
  }
}

async function init() {
  excCatalog = await listExercises();
  excCatalog.sort((a, b) => a.name.localeCompare(b.name));

  routine = routineId ? await getRoutineDetail(routineId) : null;

  if (!routine) {
    const title = document.getElementById("routineTitle");
    if (title) title.textContent = "No se encontró esta rutina.";
    document.getElementById("weekPicker")?.remove();
    document.getElementById("saveWrap")?.remove();
    return;
  }

  const title = document.getElementById("routineTitle");
  const subtitle = document.getElementById("routineSubtitle");
  if (title) title.textContent = routine.nombre;
  if (subtitle) subtitle.textContent = "Elegí la semana, agregá o quitá ejercicios y editá series, repeticiones o notas de cada día.";

  const weekSelect = document.getElementById("weekSelect") as HTMLSelectElement;
  weekSelect.innerHTML = routine.semanas.map((semana, index) => `<option value="${index}">Semana ${semana.numero}</option>`).join("");
  weekSelect.addEventListener("change", () => renderWeek(Number(weekSelect.value)));
  renderWeek(0);

  document.getElementById("weekContent")?.addEventListener("click", (event) => {
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
      openExercisePicker(excCatalog, (exc) => {
        if (!excCatalog.some((e) => e.id === exc.id)) excCatalog.push(exc);
        target.textContent = exc.name;
        block.querySelector<HTMLInputElement>(".excSelectInput")!.value = exc.id;
      });
    }
  });

  document.getElementById("saveChanges")?.addEventListener("click", saveChanges);
}

init();
