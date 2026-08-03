import { setupNavToggle, setupRevealObserver, redirectIfAuthenticated } from "../lib/nav";
import { signUp, isUsernameAvailable, isValidUsername, normalizeUsername } from "../services/auth.service";
import { isReservedUsername } from "../lib/reservedUsernames";
import { escapeHtml } from "../lib/dom";
import { supabase } from "../lib/supabaseClient";
import { calcularEdad } from "../lib/age";
import { COUNTRIES } from "../lib/countries";

setupNavToggle();
setupRevealObserver();
await redirectIfAuthenticated();

const form = document.getElementById("myForm") as HTMLFormElement | null;
const alertMessage = document.getElementById("alert_message");
const loaderBody = document.getElementById("loaderBody");

const nationalitySelect = document.getElementById("nationality") as HTMLSelectElement | null;
if (nationalitySelect) {
  nationalitySelect.innerHTML =
    `<option value="">Elegí tu nacionalidad</option>` +
    COUNTRIES.map((country) => `<option value="${escapeHtml(country)}">${escapeHtml(country)}</option>`).join("");
}

function showError(message: string): void {
  if (alertMessage) alertMessage.innerHTML = `<p>${escapeHtml(message)}</p>`;
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (alertMessage) alertMessage.innerHTML = "";

  const nombre = (document.getElementById("name") as HTMLInputElement).value.trim();
  const apellido = (document.getElementById("surn") as HTMLInputElement).value.trim();
  const username = normalizeUsername((document.getElementById("username") as HTMLInputElement).value);
  const mail = (document.getElementById("mail") as HTMLInputElement).value.trim();
  const fechaNacimiento = (document.getElementById("birthdate") as HTMLInputElement).value;
  const nacionalidad = (document.getElementById("nationality") as HTMLSelectElement).value;
  const pass = (document.getElementById("pass") as HTMLInputElement).value;
  const pass2 = (document.getElementById("pass2") as HTMLInputElement).value;
  const terms = (document.getElementById("terms") as HTMLInputElement).checked;

  if (nombre.length < 2 || !Number.isNaN(Number(nombre)) || apellido.length < 2 || !Number.isNaN(Number(apellido))) {
    showError("ERROR! Nombre o apellido inválidos.");
    return;
  }
  if (!isValidUsername(username)) {
    showError("ERROR! El usuario debe tener 3-30 caracteres: minúsculas, números o guion bajo.");
    return;
  }
  if (isReservedUsername(username)) {
    showError("ERROR! Ese nombre de usuario no está disponible.");
    return;
  }
  if (pass !== pass2 || pass.length < 8) {
    showError("ERROR! Contraseñas no coinciden o muy corta (mínimo 8 caracteres).");
    return;
  }
  if (!fechaNacimiento || Number.isNaN(Date.parse(fechaNacimiento)) || calcularEdad(fechaNacimiento) < 12 || calcularEdad(fechaNacimiento) > 100) {
    showError("ERROR! Ingresá una fecha de nacimiento válida (entre 12 y 100 años).");
    return;
  }
  if (!nacionalidad) {
    showError("ERROR! Elegí tu nacionalidad.");
    return;
  }
  if (!terms) {
    showError("ERROR! Debés aceptar los Términos y Condiciones para registrarte.");
    return;
  }

  if (loaderBody) {
    loaderBody.innerHTML = `
      <div id="loading" class="loader-container">
        <div class="modern-spinner"></div>
        <p>Creando cuenta...</p>
      </div>
    `;
  }

  const available = await isUsernameAvailable(username);
  if (!available) {
    if (loaderBody) loaderBody.innerHTML = "";
    showError("ERROR! Ese nombre de usuario ya está en uso.");
    return;
  }

  const { error } = await signUp({ email: mail, password: pass, nombre, apellido, username, fechaNacimiento, nacionalidad });

  if (error) {
    if (loaderBody) loaderBody.innerHTML = "";
    showError(`ERROR! ${error}`);
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const successMessage = sessionData.session
    ? "¡Usuario registrado con éxito! Espera, serás redirigido."
    : "¡Cuenta creada! Revisá tu mail para confirmar la cuenta antes de ingresar.";

  if (loaderBody) {
    loaderBody.innerHTML = `
      <div id="success-check" class="success-check-container">
        <div class="success-icon">
          <svg viewBox="0 0 52 52" class="success-svg">
            <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
            <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
          </svg>
        </div>
        <p>${escapeHtml(successMessage)}</p>
      </div>
    `;
  }

  setTimeout(() => {
    window.location.href = sessionData.session ? "profile.html" : "login.html";
  }, 2500);
});
