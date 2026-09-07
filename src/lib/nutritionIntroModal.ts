import { smartNavigate } from "../shell/router";

/**
 * Mini tutorial de "Alimentación / Macros". Lo abre el tap de la notificación
 * `nutrition_reminder` (link `nutricion.html?intro=1`, ver nutricion.ts) cuando el usuario
 * todavía no tiene la feature activada -- explica qué es y lleva a Configuración para prenderla
 * (el modal NO activa directo, solo guía -- mismo criterio que measurementsIntroModal.ts).
 *
 * Mismo overlay que confirmDialog.ts / measurementsIntroModal.ts: se monta en un <div> propio
 * directo en <body> (no dentro de #loaderBody) para sobrevivir al cambio de vista que hace
 * nutricion.ts justo después de abrirlo (navigate("profile.html")). Reusa las clases
 * `.measurements-intro-*` (son genéricas, solo estilan la lista de pasos y el pie).
 */
export function openNutritionIntroModal(): void {
  if (document.getElementById("nutritionIntroOverlay")) return; // ya abierto

  const overlay = document.createElement("div");
  overlay.id = "nutritionIntroOverlay";
  overlay.className = "success-check-container";
  overlay.style.zIndex = "1100";
  overlay.innerHTML = `
    <div class="modal-card">
      <h2>🥗 Seguí tu alimentación</h2>
      <!-- <div>, no <p>: la regla global .success-check-container p arranca en opacity:0 y hace
           un fade-in de ~0.9s -- acá el resto del contenido aparece al instante. Ver nota en
           measurementsIntroModal.ts / gymappweb_body_measurements_feature. -->
      <div class="subtitle">
        Fijá un objetivo de calorías y macros (a mano o calculado a partir de tu peso), repartilo
        en comidas y cargá lo que comés cada día. Con gráficos, sugerencias por comida y la opción
        de repetir lo de otro día. Está desactivado por defecto.
      </div>
      <ol class="measurements-intro-steps">
        <li>Entrá a <strong>Configuración &rsaquo; Personalización</strong>.</li>
        <li>Activá <strong>&ldquo;Registrar alimentación y macros&rdquo;</strong>.</li>
        <li>Definí tu objetivo y empezá a cargar tus comidas.</li>
      </ol>
      <div class="measurements-intro-hint">La podés activar o desactivar cuando quieras.</div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="nutritionIntroDismiss">Ahora no</button>
        <button type="button" class="btn btn-primary" id="nutritionIntroGo">Ir a Configuración</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  function close(): void {
    overlay.remove();
  }

  overlay.querySelector("#nutritionIntroDismiss")?.addEventListener("click", close);
  overlay.querySelector("#nutritionIntroGo")?.addEventListener("click", () => {
    close();
    smartNavigate("settings.html?tab=personalization&highlight=nutrition");
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
}
