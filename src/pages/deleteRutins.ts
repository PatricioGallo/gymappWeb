import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { getRoutineDetail, deleteRoutine } from "../services/routine.service";
import { getProfileBasicById } from "../services/profile.service";

setupNavToggle();
setupRevealObserver();
const myId = await requireAuth();

const params = new URLSearchParams(window.location.search);
const routineId = params.get("rid");
const container = document.getElementById("container") as HTMLElement;

async function init() {
  const routine = routineId ? await getRoutineDetail(routineId) : null;

  if (!routine) {
    container.innerHTML = `
      <div class="auth-card reveal">
        <span class="eyebrow">Eliminar rutina</span>
        <h1>No se encontró esta rutina</h1>
        <a href="profile.html" class="btn btn-outline btn-block">Volver al perfil</a>
      </div>
    `;
    return;
  }

  // Una rutina asignada y privada es del que la asigno: quien la recibe no la
  // puede eliminar (ver migracion student_routine_permission_lockdown).
  const isOwner = routine.user_id === myId;
  const isAssigner = routine.assigned_by === myId;
  const canDelete = isAssigner || (isOwner && (!routine.assigned_by || routine.is_public)) || (await getProfileBasicById(myId).catch(() => null))?.user_type === "admin";
  if (!canDelete) {
    container.innerHTML = `
      <div class="auth-card reveal">
        <span class="eyebrow">Eliminar rutina</span>
        <h1>No podés eliminar "${escapeHtml(routine.nombre)}"</h1>
        <p class="subtitle">Esta rutina te la asignó tu entrenador y es privada: solo el o ella puede eliminarla.</p>
        <a href="profile.html" class="btn btn-outline btn-block">Volver al perfil</a>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="auth-card reveal">
      <span class="eyebrow">Eliminar rutina</span>
      <h1>¿Eliminar "${escapeHtml(routine.nombre)}"?</h1>
      <p class="subtitle">Esta acción no se puede deshacer: vas a perder las semanas, días y pesos cargados en esta rutina.</p>
      <div class="alert_message" id="alert_message"></div>
      <div class="modal-actions">
        <a href="profile.html" class="btn btn-outline">Cancelar</a>
        <button class="btn btn-danger" id="confirmDelete" type="button">Eliminar rutina</button>
      </div>
    </div>
  `;

  document.getElementById("confirmDelete")?.addEventListener("click", async () => {
    const loaderBody = document.getElementById("loaderBody")!;
    loaderBody.innerHTML = `<div class="loader-container"><div class="modern-spinner"></div><p>Eliminando rutina...</p></div>`;

    try {
      await deleteRoutine(routine.id);
      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="success-icon"><svg viewBox="0 0 52 52" class="success-svg"><circle cx="26" cy="26" r="25" fill="none" class="success-circle" /><path fill="none" d="M14 27l7 7 16-16" class="success-check" /></svg></div>
          <p>¡Rutina eliminada con éxito! Espere, será redirigido.</p>
        </div>
      `;
      setTimeout(() => {
        window.location.href = "profile.html";
      }, 2000);
    } catch {
      loaderBody.innerHTML = "";
      const alertMessage = document.getElementById("alert_message");
      if (alertMessage) alertMessage.innerHTML = "<p>ERROR! No se pudo eliminar la rutina.</p>";
    }
  });
}

init();
