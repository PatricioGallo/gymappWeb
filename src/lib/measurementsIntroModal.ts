import { smartNavigate } from "../shell/router";

/**
 * Mini tutorial de "Medidas corporales". Lo abre el tap de la notificación
 * `measurements_reminder` (link `medidas.html?intro=1`, ver medidas.ts) cuando el usuario
 * todavía no tiene la feature activada -- explica qué es y lleva a Configuración para prenderla
 * (el usuario pidió que el modal NO active directo, solo guíe).
 *
 * Mismo overlay que confirmDialog.ts: se monta en un <div> propio directo en <body> (no dentro
 * de #loaderBody) para sobrevivir al cambio de vista que hace medidas.ts justo después de
 * abrirlo (navigate("profile.html")).
 */
export function openMeasurementsIntroModal(): void {
  if (document.getElementById("measurementsIntroOverlay")) return; // ya abierto

  const overlay = document.createElement("div");
  overlay.id = "measurementsIntroOverlay";
  overlay.className = "success-check-container";
  overlay.style.zIndex = "1100";
  overlay.innerHTML = `
    <div class="modal-card">
      <h2>📏 Seguí tus medidas corporales</h2>
      <!-- <div>, no <p>: la regla global .success-check-container p arranca en opacity:0 y hace
           un fade-in de ~0.9s -- acá el resto del contenido (lista, pie) aparece al instante, así
           que el texto también. Ver nota en gymappweb_body_measurements_feature. -->
      <div class="subtitle">
        Registrá tu peso y, si querés, otras medidas (cintura, bíceps, % de grasa...) para ver tu
        evolución en gráficos y mostrar en tu perfil las que elijas. Está desactivado por defecto.
      </div>
      <ol class="measurements-intro-steps">
        <li>Entrá a <strong>Configuración &rsaquo; Personalización</strong>.</li>
        <li>Activá <strong>&ldquo;Registrar medidas corporales&rdquo;</strong>.</li>
        <li>Elegí qué medidas seguir &mdash; el peso ya viene marcado.</li>
      </ol>
      <div class="measurements-intro-hint">La podés activar o desactivar cuando quieras.</div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="measurementsIntroDismiss">Ahora no</button>
        <button type="button" class="btn btn-primary" id="measurementsIntroGo">Ir a Configuración</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  function close(): void {
    overlay.remove();
  }

  overlay.querySelector("#measurementsIntroDismiss")?.addEventListener("click", close);
  overlay.querySelector("#measurementsIntroGo")?.addEventListener("click", () => {
    close();
    smartNavigate("settings.html?tab=personalization&highlight=measurements");
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
}
