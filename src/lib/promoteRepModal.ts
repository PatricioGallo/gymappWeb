import { escapeHtml } from "./dom";
import { formatFechaCorta } from "./dias";
import {
  PROMO_DURATIONS,
  PROMO_AUDIENCES,
  PROMO_PRICE_PER_DAY,
  getMyPostPromotion,
  requestAdPromotion,
} from "../services/ads.service";

function closeOverlay(): void {
  const loaderBody = document.getElementById("loaderBody");
  if (loaderBody) loaderBody.innerHTML = "";
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Pendiente de pago",
  active: "Activa",
  paused: "Pausada",
};

/**
 * Modal "Promocionar este Rep" -- para el dueño de un perfil de gimnasio/entrenador. Si el Rep ya
 * tiene una promoción en curso, la muestra; si no, arma la solicitud (duración + audiencia +
 * ciudad) y la manda por request_ad_promotion (crea una campaña en DRAFT). El pago se coordina
 * aparte y el admin la activa (Mercado Pago = pendiente).
 */
export async function openPromoteRepModal(postId: string, defaultCiudad: string | null): Promise<void> {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <div class="inline-loader"><div class="modern-spinner"></div><p>Cargando...</p></div>
      </div>
    </div>
  `;

  const existing = await getMyPostPromotion(postId).catch(() => null);

  if (existing) {
    loaderBody.innerHTML = `
      <div class="success-check-container">
        <div class="modal-card">
          <h2>Promoción de este Rep</h2>
          <p class="subtitle">Estado: <strong>${escapeHtml(STATUS_LABEL[existing.status] ?? existing.status)}</strong></p>
          <p class="subtitle">Vigencia hasta el ${escapeHtml(formatFechaCorta(existing.endsAt))}${
            existing.priceTotal != null ? ` · $${existing.priceTotal}` : ""
          }</p>
          ${
            existing.status === "draft"
              ? `<p class="subtitle">Te vamos a contactar para coordinar el pago. En cuanto se confirme, tu anuncio se activa.</p>`
              : ""
          }
          <div class="modal-actions">
            <button class="btn btn-outline" id="promoClose" type="button">Cerrar</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("promoClose")?.addEventListener("click", closeOverlay);
    return;
  }

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Promocionar este Rep</h2>
        <p class="subtitle">Aparece en el feed de gente que todavía no te sigue. Precio plano: $${PROMO_PRICE_PER_DAY} por día.</p>
        <div class="field">
          <label for="promoDays">Duración</label>
          <select id="promoDays">
            ${PROMO_DURATIONS.map((d, i) => `<option value="${d.days}" ${i === 1 ? "selected" : ""}>${d.label} — $${d.days * PROMO_PRICE_PER_DAY}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="promoAudience">Mostrar a</label>
          <select id="promoAudience">
            ${PROMO_AUDIENCES.map((a) => `<option value="${a.value}">${a.label}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="promoCiudad">Ciudad (opcional)</label>
          <input type="text" id="promoCiudad" placeholder="Dejalo vacío para todo el país" value="${escapeHtml(defaultCiudad ?? "")}">
        </div>
        <p class="subtitle">Al enviar, la promoción queda <strong>pendiente de pago</strong>. Te contactamos para coordinarlo y la activamos.</p>
        <div class="alert_message" id="promoAlert"></div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="promoSubmit" type="button">Enviar solicitud</button>
          <button class="btn btn-outline" id="promoCancel" type="button">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("promoCancel")?.addEventListener("click", closeOverlay);
  document.getElementById("promoSubmit")?.addEventListener("click", async () => {
    const alertBox = document.getElementById("promoAlert")!;
    const btn = document.getElementById("promoSubmit") as HTMLButtonElement;
    alertBox.innerHTML = "";
    const days = Number((document.getElementById("promoDays") as HTMLSelectElement).value);
    const audience = (document.getElementById("promoAudience") as HTMLSelectElement).value;
    const ciudad = (document.getElementById("promoCiudad") as HTMLInputElement).value.trim() || null;

    btn.disabled = true;
    const { error } = await requestAdPromotion(postId, days, ciudad, audience);
    btn.disabled = false;
    if (error) {
      alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
      return;
    }
    loaderBody.innerHTML = `
      <div class="success-check-container">
        <div class="modal-card">
          <h2>¡Solicitud enviada!</h2>
          <p class="subtitle">Tu promoción quedó pendiente de pago. Te vamos a contactar para coordinarlo; en cuanto se confirme, el Rep empieza a aparecer en el feed.</p>
          <div class="modal-actions">
            <button class="btn btn-primary" id="promoDone" type="button">Listo</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("promoDone")?.addEventListener("click", closeOverlay);
  });
}
