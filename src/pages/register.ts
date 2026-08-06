import { setupNavToggle, setupRevealObserver, redirectIfAuthenticated } from "../lib/nav";
import { signUp, isUsernameAvailable, isValidUsername, normalizeUsername, suggestUsername } from "../services/auth.service";
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

let selectedRole: "usuario" | "entrenador" = "usuario";
const roleChips = document.getElementById("roleChips");
const trainerFields = document.getElementById("trainerFields") as HTMLElement | null;

roleChips?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".exc-pick-chip");
  if (!btn) return;
  selectedRole = btn.dataset.role as "usuario" | "entrenador";
  roleChips.querySelectorAll<HTMLButtonElement>(".exc-pick-chip").forEach((b) => b.classList.toggle("active", b === btn));
  if (trainerFields) trainerFields.hidden = selectedRole !== "entrenador";
});

function openAccountTypeHelp(): void {
  if (!loaderBody) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>¿Qué significa cada cuenta?</h2>
        <p class="subtitle">Así funciona cada tipo de perfil en Gym Social.</p>
        <div class="help-list">
          <div class="help-item">
            <strong>Gymbro (usuario)</strong>
            <p>Creá rutinas personalizadas o usá las predefinidas de Gym Social o de un entrenador, seguí tu progreso, seguí a otras personas y dejá que te sigan. Registro libre, gratuito y sin validación.</p>
          </div>
          <div class="help-item">
            <strong>Entrenador</strong>
            <p>Todos los beneficios de Gymbro, más la posibilidad de tener alumnos/suscriptores: vas a poder hacer seguimiento de su progreso, ver sus rutinas y modificarlas.</p>
          </div>
          <div class="help-item">
            <strong>Gimnasio</strong>
            <p>Es la más completa: tiene entrenadores y miembros propios, los entrenadores hacen seguimiento de los miembros, y los miembros acceden a las rutinas del gimnasio, se anotan a clases, ven la ocupación en vivo, qué máquinas se usan más y la reputación de los entrenadores. Por ahora este rol lo asigna un admin — escribinos desde <a href="contact.html" target="_blank" rel="noopener">Contacto</a> si tenés un gimnasio.</p>
          </div>
        </div>
        <div class="modal-actions"><button class="btn btn-outline" id="closeAccountTypeHelp">Entendido</button></div>
      </div>
    </div>
  `;
  document.getElementById("closeAccountTypeHelp")?.addEventListener("click", () => {
    loaderBody.innerHTML = "";
  });
}

document.getElementById("accountTypeHelpBtn")?.addEventListener("click", openAccountTypeHelp);

function showError(message: string): void {
  if (alertMessage) alertMessage.innerHTML = `<p>${escapeHtml(message)}</p>`;
}

// ---------- Sugerencia de nombre de usuario ----------

const nameInput = document.getElementById("name") as HTMLInputElement | null;
const surnInput = document.getElementById("surn") as HTMLInputElement | null;
const usernameInput = document.getElementById("username") as HTMLInputElement | null;
const usernameSuggestion = document.getElementById("usernameSuggestion") as HTMLElement | null;

let usernameTouched = false;
let suggestionTimer: ReturnType<typeof setTimeout> | null = null;
let suggestionRequestId = 0;

usernameInput?.addEventListener("input", () => {
  usernameTouched = true;
  if (usernameSuggestion) usernameSuggestion.hidden = true;
});

function scheduleUsernameSuggestion(): void {
  if (usernameTouched || !usernameSuggestion) return;
  if (suggestionTimer) clearTimeout(suggestionTimer);
  suggestionTimer = setTimeout(async () => {
    const nombre = nameInput?.value.trim() ?? "";
    const apellido = surnInput?.value.trim() ?? "";
    if (nombre.length < 2 || apellido.length < 2) {
      usernameSuggestion.hidden = true;
      return;
    }
    const requestId = ++suggestionRequestId;
    const candidate = await suggestUsername(nombre, apellido);
    if (requestId !== suggestionRequestId || usernameTouched) return;
    if (!candidate) {
      usernameSuggestion.hidden = true;
      return;
    }
    usernameSuggestion.hidden = false;
    usernameSuggestion.innerHTML = `Sugerencia: <button type="button" class="username-suggestion-btn" id="applyUsernameSuggestion">@${escapeHtml(candidate)}</button>`;
    document.getElementById("applyUsernameSuggestion")?.addEventListener("click", () => {
      if (usernameInput) usernameInput.value = candidate;
      usernameSuggestion.hidden = true;
    });
  }, 600);
}

nameInput?.addEventListener("input", scheduleUsernameSuggestion);
surnInput?.addEventListener("input", scheduleUsernameSuggestion);

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

  const { error } = await signUp({ email: mail, password: pass, nombre, apellido, username, fechaNacimiento, nacionalidad, userType: selectedRole });

  if (error) {
    if (loaderBody) loaderBody.innerHTML = "";
    showError(`ERROR! ${error}`);
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();

  const successMessage = sessionData.session
    ? "¡Usuario registrado con éxito! Espera, serás redirigido."
    : selectedRole === "entrenador"
      ? "¡Cuenta creada! Revisá tu mail para confirmar la cuenta. Una vez que ingreses, subí tu documentación desde Configuración > Verificación para tener el tick verde."
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
  }, sessionData.session ? 2500 : 4000);
});
