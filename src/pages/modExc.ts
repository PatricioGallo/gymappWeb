import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { diaLabel } from "../lib/dias";
import { listExercises, type Exercise } from "../services/exercise.service";
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

function excOptions(selectedId?: string): string {
  return excCatalog.map((exc) => `<option value="${exc.id}" ${exc.id === selectedId ? "selected" : ""}>${escapeHtml(exc.name)}</option>`).join("");
}

function excBlockMarkup(exc?: RoutineExerciseWithAuthor): string {
  const isNoWeight = exc ? !exc.es_medible : false;
  return `
    <div class="exc-block" data-existing-id="${exc?.id ?? ""}">
      <div class="exc-edit-row">
        <select class="excSelectInput">
          <option value="">Elegir ejercicio</option>
          ${excOptions(exc?.exercise_id)}
        </select>
        <input type="number" class="mini-input serieInput" value="${exc?.serie ?? ""}" placeholder="Series" min="1" max="10">
        <input type="number" class="mini-input repeInput" value="${exc?.repe ?? ""}" placeholder="Repes" min="1" max="30">
        <button class="exc-remove" type="button" title="Quitar ejercicio">×</button>
      </div>
      <div class="exc-extra">
        <label><input type="checkbox" class="noWeightCheck" ${isNoWeight ? "checked" : ""}> Sin peso</label>
        <input type="text" class="notaInput" placeholder="Nota para este ejercicio (opcional)" maxlength="140" value="${escapeHtml(exc?.nota ?? "")}">
      </div>
    </div>
  `;
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
      <div class="exc-edit-header"><span>Ejercicio</span><span>Series</span><span>Repes</span></div>
      <div class="exc-list">${dia.ejercicios.map((exc) => excBlockMarkup(exc)).join("")}</div>
      <button class="day-add-btn" type="button">+ Agregar ejercicio</button>
    </div>
  `
    )
    .join("");
}

async function saveChanges() {
  const alertMessage = document.getElementById("alert_message")!;
  const weekContent = document.getElementById("weekContent")!;
  const weekIndex = Number(weekContent.dataset.week);
  const semana = routine!.semanas[weekIndex];
  const dayCards = weekContent.querySelectorAll<HTMLElement>(".day-card");
  let error = "";

  interface PendingDay {
    dayId: string;
    keepIds: Set<string>;
    updates: { id: string; exercise_id: string; nombre_snapshot: string; info_snapshot: string; serie: number; repe: number; nota: string; es_medible: boolean; orden: number }[];
    inserts: { exercise_id: string; nombre_snapshot: string; info_snapshot: string; serie: number; repe: number; nota: string; es_medible: boolean; orden: number }[];
  }
  const pending: PendingDay[] = [];

  dayCards.forEach((dayCard, diaIndex) => {
    const dayId = dayCard.dataset.dayId!;
    const keepIds = new Set<string>();
    const updates: PendingDay["updates"] = [];
    const inserts: PendingDay["inserts"] = [];

    dayCard.querySelectorAll<HTMLElement>(".exc-block").forEach((block, orden) => {
      if (error) return;
      const excId = (block.querySelector(".excSelectInput") as HTMLSelectElement).value;
      const serie = parseInt((block.querySelector(".serieInput") as HTMLInputElement).value, 10);
      const repe = parseInt((block.querySelector(".repeInput") as HTMLInputElement).value, 10);
      const noWeight = (block.querySelector(".noWeightCheck") as HTMLInputElement).checked;
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
      if (nota.length > 140) {
        error = "Las notas tienen un máximo de 140 caracteres.";
        return;
      }

      const excDef = excCatalog.find((e) => e.id === excId)!;
      const row = {
        exercise_id: excDef.id,
        nombre_snapshot: excDef.name,
        info_snapshot: excDef.info,
        serie,
        repe,
        nota,
        es_medible: !noWeight,
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
      target.previousElementSibling?.insertAdjacentHTML("beforeend", excBlockMarkup());
    }
    if (target.classList.contains("exc-remove")) {
      const block = target.closest(".exc-block");
      const list = block?.parentElement;
      if (list && list.children.length > 1) block?.remove();
    }
  });

  document.getElementById("saveChanges")?.addEventListener("click", saveChanges);
}

init();
