import { escapeHtml } from "./dom";
import { formatFechaCorta } from "./dias";
import { rateGymTrainer, deleteGymTrainerRating, listGymTrainerReviews } from "../services/gymTrainerRating.service";

function closeOverlay(): void {
  const loaderBody = document.getElementById("loaderBody");
  if (loaderBody) loaderBody.innerHTML = "";
}

const STAR_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2.5l2.76 5.6 6.18.9-4.47 4.36 1.06 6.16L12 16.6l-5.53 2.92 1.06-6.16-4.47-4.36 6.18-.9L12 2.5z"/></svg>`;

/** Modal para que un socio activo califique (1-5 estrellas + comentario opcional) a un handle
 * activo del gym, o edite/quite una calificacion ya hecha. `current` viene de list_gym_trainer_ratings. */
export function openRateTrainerModal(
  gymId: string,
  trainerId: string,
  memberId: string,
  trainerName: string,
  current: { rating: number | null; comment: string | null },
  onSaved: () => void
): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;

  let selected = current.rating ?? 0;

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Calificar a ${escapeHtml(trainerName)}</h2>
        <div class="field">
          <div class="trainer-rating-stars-input" id="trainerRatingStarsInput"></div>
        </div>
        <div class="field">
          <label for="trainerRatingComment">Comentario (opcional)</label>
          <textarea id="trainerRatingComment" rows="3" maxlength="500" placeholder="Contá tu experiencia...">${escapeHtml(current.comment ?? "")}</textarea>
        </div>
        <div class="alert_message" id="trainerRatingAlert"></div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="trainerRatingSubmit" type="button">Guardar</button>
          ${current.rating != null ? `<button class="btn btn-outline" id="trainerRatingRemove" type="button">Quitar calificación</button>` : ""}
          <button class="btn btn-outline" id="trainerRatingCancel" type="button">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  const starsWrap = document.getElementById("trainerRatingStarsInput")!;
  function paintStars(): void {
    starsWrap.innerHTML = Array.from({ length: 5 }, (_, i) => {
      const n = i + 1;
      return `<button type="button" class="trainer-rating-star-btn${n <= selected ? " is-filled" : ""}" data-n="${n}" aria-label="${n} estrella${n > 1 ? "s" : ""}">${STAR_ICON}</button>`;
    }).join("");
    starsWrap.querySelectorAll<HTMLButtonElement>(".trainer-rating-star-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        selected = Number(btn.dataset.n);
        paintStars();
      });
    });
  }
  paintStars();

  document.getElementById("trainerRatingCancel")?.addEventListener("click", closeOverlay);

  document.getElementById("trainerRatingSubmit")?.addEventListener("click", async () => {
    const alertEl = document.getElementById("trainerRatingAlert")!;
    alertEl.textContent = "";
    if (selected < 1) {
      alertEl.textContent = "Elegí de 1 a 5 estrellas.";
      return;
    }
    const submitBtn = document.getElementById("trainerRatingSubmit") as HTMLButtonElement;
    submitBtn.disabled = true;
    const comment = (document.getElementById("trainerRatingComment") as HTMLTextAreaElement).value.trim();
    const { error } = await rateGymTrainer(gymId, trainerId, memberId, selected, comment || null);
    if (error) {
      alertEl.textContent = error;
      submitBtn.disabled = false;
      return;
    }
    closeOverlay();
    onSaved();
  });

  document.getElementById("trainerRatingRemove")?.addEventListener("click", async () => {
    const removeBtn = document.getElementById("trainerRatingRemove") as HTMLButtonElement;
    removeBtn.disabled = true;
    const { error } = await deleteGymTrainerRating(gymId, trainerId, memberId);
    if (error) {
      document.getElementById("trainerRatingAlert")!.textContent = error;
      removeBtn.disabled = false;
      return;
    }
    closeOverlay();
    onSaved();
  });
}

function reviewRowMarkup(r: { username: string; nombre: string; apellido: string; avatarUrl: string | null; rating: number; comment: string | null; createdAt: string }): string {
  const nombreCompleto = `${r.nombre} ${r.apellido}`.trim() || r.username;
  const stars = Array.from({ length: 5 }, (_, i) => `<span class="trainer-rating-star${i < r.rating ? " is-filled" : ""}">${STAR_ICON}</span>`).join("");
  return `
    <div class="trainer-review-row">
      <img src="${escapeHtml(r.avatarUrl || "/images/avatars/default.svg")}" alt="" class="trainer-review-avatar">
      <div class="trainer-review-body">
        <div class="trainer-review-head">
          <span class="trainer-review-name">${escapeHtml(nombreCompleto)}</span>
          <span class="trainer-rating-stars">${stars}</span>
          <span class="trainer-review-date">${escapeHtml(formatFechaCorta(r.createdAt))}</span>
        </div>
        ${r.comment ? `<p class="trainer-review-comment">${escapeHtml(r.comment)}</p>` : ""}
      </div>
    </div>
  `;
}

/** Modal de solo lectura con la lista de reseñas de un handle puntual. */
export function openTrainerReviewsModal(gymId: string, trainerId: string, trainerName: string): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Reseñas de ${escapeHtml(trainerName)}</h2>
        <div class="trainer-reviews-list" id="trainerReviewsList"><div class="modern-spinner"></div></div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="trainerReviewsClose" type="button">Cerrar</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("trainerReviewsClose")?.addEventListener("click", closeOverlay);

  void listGymTrainerReviews(gymId, trainerId)
    .then((reviews) => {
      const listEl = document.getElementById("trainerReviewsList");
      if (!listEl) return;
      listEl.innerHTML = reviews.length ? reviews.map(reviewRowMarkup).join("") : `<p class="chart-sub">Todavía no hay reseñas.</p>`;
    })
    .catch(() => {
      const listEl = document.getElementById("trainerReviewsList");
      if (listEl) listEl.innerHTML = `<p class="chart-sub">No se pudieron cargar las reseñas.</p>`;
    });
}
