import { setupNavToggle, setupRevealObserver } from "../lib/nav";
import { supabase } from "../lib/supabaseClient";
import { escapeHtml } from "../lib/dom";
import { diaLabel } from "../lib/dias";
import { getRoutineDetail, getSharedRoutine, setRoutineShareable, type RoutineDetail } from "../services/routine.service";
import { CATEGORY_LABELS, type ExerciseCategory } from "../services/exercise.service";

setupNavToggle();
setupRevealObserver();

const params = new URLSearchParams(window.location.search);
const routineId = params.get("rid");
const shareToken = params.get("token");

const { data: sessionData } = await supabase.auth.getSession();
const isLoggedIn = Boolean(sessionData.session);
const myId = sessionData.session?.user.id ?? null;

function renderNav() {
  const nav = document.getElementById("siteNav");
  if (!nav) return;
  nav.innerHTML = isLoggedIn
    ? `<a href="profile.html">Perfil</a><a href="exit.html">Salir</a>`
    : `<a href="../index.html">Inicio</a><a href="register.html" class="btn btn-primary nav-cta">Registrate gratis</a>`;
}

function showNotFound(message: string) {
  const title = document.getElementById("routineTitle");
  if (title) title.textContent = message;
  document.getElementById("routineActions")?.remove();
  document.getElementById("weekStatus")?.remove();
}

function renderWeekStatus(weekCount: number) {
  const weekStatus = document.getElementById("weekStatus");
  if (!weekStatus) return;
  weekStatus.innerHTML = `<span class="hero-badge">Rutina de ${weekCount} semana${weekCount === 1 ? "" : "s"}</span>`;
}

function initShare(getShareUrl: () => Promise<string>, routineName: string, ownerName: string) {
  const shareBtn = document.getElementById("shareBtn") as HTMLButtonElement | null;
  if (!shareBtn) return;
  const originalHTML = shareBtn.innerHTML;

  shareBtn.addEventListener("click", async () => {
    try {
      const url = await getShareUrl();
      if (navigator.share) {
        await navigator.share({ title: `Rutina de ${ownerName} - Gym Social`, text: `Mirá la rutina "${routineName}" en Gym Social`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      shareBtn.textContent = "¡Copiado!";
      setTimeout(() => {
        shareBtn.innerHTML = originalHTML;
      }, 2000);
    } catch {
      // cancelado por el usuario, no es un error real
    }
  });
}

function openExerciseModal(
  nombre: string,
  info: string,
  nota: string | null,
  authorLabel: string,
  category?: string | null,
  imageUrl?: string | null
) {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  const categoryLabel = category ? CATEGORY_LABELS[category as ExerciseCategory] : null;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>${escapeHtml(nombre)}</h2>
        ${categoryLabel ? `<span class="hero-badge">${escapeHtml(categoryLabel)}</span>` : ""}
        ${imageUrl ? `<img class="exc-modal-image" src="${escapeHtml(imageUrl)}" alt="Ejecución de ${escapeHtml(nombre)}" loading="lazy">` : ""}
        <p class="subtitle">${escapeHtml(info || "Sin descripción cargada.")}</p>
        ${
          nota
            ? `<div class="notice"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></div><div><strong>Nota del entrenador</strong><p>${escapeHtml(nota)}</p></div></div>`
            : ""
        }
        <p class="auth-foot" style="text-align:left;margin-top:16px;">Ejercicio de ${escapeHtml(authorLabel)}</p>
        <div class="modal-actions"><button class="btn btn-outline" id="closeExcModal">Cerrar</button></div>
      </div>
    </div>
  `;
  document.getElementById("closeExcModal")?.addEventListener("click", () => {
    loaderBody.innerHTML = "";
  });
}

// ---------- Modo autenticado (?rid=) ----------

async function renderAuthenticated(id: string) {
  const routine = await getRoutineDetail(id);
  if (!routine) {
    showNotFound("No se encontró esta rutina.");
    return;
  }

  const title = document.getElementById("routineTitle");
  const subtitle = document.getElementById("routineSubtitle");
  if (title) title.textContent = routine.nombre;
  if (subtitle) subtitle.textContent = myId === routine.user_id ? "Tu rutina" : "Rutina de un usuario que entrenás";

  renderWeekStatus(routine.semanas.length);

  const diasBase = routine.semanas[0]?.dias ?? [];
  renderWeekContent(diasBase, routine.semanas.length);

  initShare(
    async () => {
      const token = routine.is_shareable ? routine.share_token : await setRoutineShareable(routine.id, true);
      return `${window.location.origin}${window.location.pathname}?token=${token}`;
    },
    routine.nombre,
    "vos"
  );
}

function renderWeekContent(diasBase: RoutineDetail["semanas"][number]["dias"], weekCount: number) {
  const weekContent = document.getElementById("weekContent");
  if (!weekContent) return;

  weekContent.innerHTML = diasBase
    .map(
      (dia, diaIndex) => `
    <div class="day-accordion reveal" data-dia="${diaIndex}">
      <button class="day-row" type="button" data-dia="${diaIndex}">
        <div class="day-row-info"><h3>${escapeHtml(diaLabel(dia.dia_semana))}</h3><p>${dia.ejercicios.length} ejercicio${dia.ejercicios.length === 1 ? "" : "s"}</p></div>
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
              <span>${exc.repe}</span>
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
    row.addEventListener("click", () => toggleDay(Number(row.dataset.dia)));
  });
  weekContent.querySelectorAll<HTMLButtonElement>(".exc-name").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const dia = diasBase[Number(button.dataset.dia)];
      const exc = dia.ejercicios[Number(button.dataset.exc)];
      openExerciseModal(exc.nombre_snapshot, exc.info_snapshot, exc.nota, exc.authorName ?? "Gym Social", exc.category, exc.image_url);
    });
  });
}

function toggleDay(diaIndex: number) {
  const accordion = document.querySelector(`.day-accordion[data-dia="${diaIndex}"]`);
  const detail = document.getElementById(`dayDetail-${diaIndex}`);
  if (!accordion || !detail) return;
  const isOpen = accordion.classList.toggle("open");
  (detail as HTMLElement).hidden = !isOpen;
}

// ---------- Modo publico (?token=) ----------

async function renderShared(token: string) {
  const routine = await getSharedRoutine(token);
  if (!routine) {
    showNotFound("No se encontró esta rutina o el link ya no es válido.");
    return;
  }

  const title = document.getElementById("routineTitle");
  const subtitle = document.getElementById("routineSubtitle");
  const ownerName = routine.owner ? `${routine.owner.nombre} ${routine.owner.apellido}` : "un usuario";
  if (title) title.textContent = routine.nombre;
  if (subtitle) subtitle.textContent = `Rutina de ${ownerName}`;

  renderWeekStatus(routine.semanas.length);

  const diasBase = routine.semanas[0]?.dias ?? [];
  const weekContent = document.getElementById("weekContent");
  if (weekContent) {
    weekContent.innerHTML = diasBase
      .map(
        (dia: any, diaIndex: number) => `
      <div class="day-accordion reveal" data-dia="${diaIndex}">
        <button class="day-row" type="button" data-dia="${diaIndex}">
          <div class="day-row-info"><h3>${escapeHtml(diaLabel(dia.dia_semana))}</h3><p>${dia.ejercicios.length} ejercicio${dia.ejercicios.length === 1 ? "" : "s"}</p></div>
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
                <span>${exc.serie}</span><span>${exc.repe}</span><span>${routine.semanas.length}</span>
              </div>`
              )
              .join("")}
          </div>
        </div>
      </div>`
      )
      .join("");

    weekContent.querySelectorAll<HTMLButtonElement>(".day-row").forEach((row) => {
      row.addEventListener("click", () => toggleDay(Number(row.dataset.dia)));
    });
    weekContent.querySelectorAll<HTMLButtonElement>(".exc-name").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const dia = diasBase[Number(button.dataset.dia)];
        const exc = dia.ejercicios[Number(button.dataset.exc)];
        openExerciseModal(exc.nombre, exc.info, exc.nota, "Gym Social", exc.category, exc.image_url);
      });
    });
  }

  initShare(async () => window.location.href, routine.nombre, ownerName);
}

async function init() {
  renderNav();

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

init();
