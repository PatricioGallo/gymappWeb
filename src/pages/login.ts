import { setupNavToggle, setupRevealObserver, redirectIfAuthenticated } from "../lib/nav";
import { signIn } from "../services/auth.service";
import { escapeHtml } from "../lib/dom";

setupNavToggle();
setupRevealObserver();
await redirectIfAuthenticated();

const form = document.getElementById("myForm") as HTMLFormElement | null;
const alertMessage = document.getElementById("alert_message");
const loaderBody = document.getElementById("loaderBody");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const mail = (document.getElementById("mail") as HTMLInputElement).value.trim();
  const pass = (document.getElementById("pass") as HTMLInputElement).value;

  if (alertMessage) alertMessage.innerHTML = "";
  if (loaderBody) {
    loaderBody.innerHTML = `
      <div id="loading" class="loader-container">
        <div class="modern-spinner"></div>
        <p>Ingresando...</p>
      </div>
    `;
  }

  const { error } = await signIn(mail, pass);

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
        <p>¡Bienvenido!</p>
      </div>
    `;
  }
  setTimeout(() => {
    window.location.href = "profile.html";
  }, 1500);
});
