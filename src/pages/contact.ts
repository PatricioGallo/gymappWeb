import { setupNavToggle, setupRevealObserver, redirectIfAuthenticated } from "../lib/nav";
import { submitContactMessage, validateContactMessage, type ContactMessageError } from "../services/contact.service";
import { escapeHtml } from "../lib/dom";

setupNavToggle();
setupRevealObserver();
await redirectIfAuthenticated();

const ERROR_LABELS: Record<ContactMessageError, string> = {
  name_short: "Ingresá tu nombre.",
  name_long: "El nombre es muy largo.",
  email_invalid: "Ingresá un mail válido.",
  message_short: "Contanos un poco más (mínimo 10 caracteres).",
  message_long: "El mensaje es muy largo (máximo 2000 caracteres).",
};

const form = document.getElementById("contactForm") as HTMLFormElement | null;
const alertMessage = document.getElementById("contactAlert");
const loaderBody = document.getElementById("loaderBody");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (alertMessage) alertMessage.innerHTML = "";

  const honeypot = (document.getElementById("contactWebsite") as HTMLInputElement | null)?.value;
  if (honeypot) return;

  const name = (document.getElementById("contactName") as HTMLInputElement).value;
  const email = (document.getElementById("contactEmail") as HTMLInputElement).value;
  const message = (document.getElementById("contactMessage") as HTMLTextAreaElement).value;

  const validationError = validateContactMessage(name, email, message);
  if (validationError) {
    if (alertMessage) alertMessage.innerHTML = `<p>${escapeHtml(ERROR_LABELS[validationError])}</p>`;
    return;
  }

  if (loaderBody) {
    loaderBody.innerHTML = `
      <div class="loader-container">
        <div class="modern-spinner"></div>
        <p>Enviando tu mensaje...</p>
      </div>
    `;
  }

  const { error } = await submitContactMessage(name, email, message);

  if (error) {
    if (loaderBody) loaderBody.innerHTML = "";
    if (alertMessage) alertMessage.innerHTML = `<p>${escapeHtml(error)}</p>`;
    return;
  }

  form.reset();

  if (loaderBody) {
    loaderBody.innerHTML = `
      <div class="success-check-container">
        <div class="success-icon">
          <svg viewBox="0 0 52 52" class="success-svg">
            <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
            <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
          </svg>
        </div>
        <p>¡Mensaje enviado! Te contestamos a la brevedad.</p>
      </div>
    `;
  }

  setTimeout(() => {
    if (loaderBody) loaderBody.innerHTML = "";
  }, 2200);
});
