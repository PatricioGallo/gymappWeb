import { setupNavToggle, setupRevealObserver } from "../lib/nav";
import { supabase } from "../lib/supabaseClient";
import { updatePassword } from "../services/profile.service";
import { escapeHtml } from "../lib/dom";

setupNavToggle();
setupRevealObserver();

const form = document.getElementById("myForm") as HTMLFormElement | null;
const alertMessage = document.getElementById("alert_message");
const loaderBody = document.getElementById("loaderBody");
const invalidWrap = document.getElementById("resetInvalidWrap");

if (loaderBody) {
  loaderBody.innerHTML = `
    <div id="loading" class="loader-container">
      <div class="modern-spinner"></div>
      <p>Verificando el link...</p>
    </div>
  `;
}

// El link del mail trae un token de recuperacion que el cliente de Supabase consume solo
// (deja una sesion activa) apenas carga la pagina; si no hay sesion, el link ya vencio o
// ya se uso.
const { data } = await supabase.auth.getSession();
if (loaderBody) loaderBody.innerHTML = "";
if (data.session) {
  form?.removeAttribute("hidden");
} else {
  invalidWrap?.removeAttribute("hidden");
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const pass = (document.getElementById("pswd") as HTMLInputElement).value;
  const pass2 = (document.getElementById("pswd2") as HTMLInputElement).value;

  if (alertMessage) alertMessage.innerHTML = "";

  if (pass !== pass2) {
    if (alertMessage) alertMessage.innerHTML = "<p>Las contraseñas no coinciden.</p>";
    return;
  }

  if (loaderBody) {
    loaderBody.innerHTML = `
      <div id="loading" class="loader-container">
        <div class="modern-spinner"></div>
        <p>Guardando...</p>
      </div>
    `;
  }

  const { error } = await updatePassword(pass);

  if (error) {
    if (loaderBody) loaderBody.innerHTML = "";
    if (alertMessage) alertMessage.innerHTML = `<p>${escapeHtml(error)}</p>`;
    return;
  }

  if (loaderBody) {
    loaderBody.innerHTML = `
      <div id="success-check" class="success-check-container">
        <div class="success-icon">
          <svg viewBox="0 0 52 52" class="success-svg">
            <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
            <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
          </svg>
        </div>
        <p>¡Contraseña actualizada!</p>
      </div>
    `;
  }
  await supabase.auth.signOut();
  setTimeout(() => {
    window.location.href = "login.html";
  }, 1500);
});
