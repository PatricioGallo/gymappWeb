import { setupNavToggle, setupRevealObserver, redirectIfAuthenticated } from "../lib/nav";
import { requestPasswordReset } from "../services/auth.service";
import { escapeHtml } from "../lib/dom";

setupNavToggle();
setupRevealObserver();
await redirectIfAuthenticated();

const form = document.getElementById("myForm") as HTMLFormElement | null;
const alertMessage = document.getElementById("alert_message");
const loaderBody = document.getElementById("loaderBody");
const sentMessage = document.getElementById("sentMessage");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const mail = (document.getElementById("mail") as HTMLInputElement).value.trim();

  if (alertMessage) alertMessage.innerHTML = "";

  if (!mail) {
    if (alertMessage) alertMessage.innerHTML = "<p>Ingresá tu mail.</p>";
    return;
  }

  if (loaderBody) {
    loaderBody.innerHTML = `
      <div id="loading" class="loader-container">
        <div class="modern-spinner"></div>
        <p>Enviando...</p>
      </div>
    `;
  }

  const { error } = await requestPasswordReset(mail);
  if (loaderBody) loaderBody.innerHTML = "";

  if (error) {
    if (alertMessage) alertMessage.innerHTML = `<p>${escapeHtml(error)}</p>`;
    return;
  }

  if (form) form.hidden = true;
  sentMessage?.removeAttribute("hidden");
});
