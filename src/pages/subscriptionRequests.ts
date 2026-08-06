import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { listSubscriptionRequests, acceptSubscriptionRequest, rejectSubscriptionRequest, type SubscriptionRequestRow } from "../services/subscription.service";
import { renderVerifiedBadge } from "../lib/verifiedBadge";

setupNavToggle();
setupRevealObserver();
const userId = await requireAuth();

const summaryEl = document.getElementById("subReqSummary")!;
const listEl = document.getElementById("subReqList")!;

let requests: SubscriptionRequestRow[] = [];

function renderSummary() {
  summaryEl.textContent =
    requests.length === 0
      ? "No tenés solicitudes de suscripción pendientes."
      : `${requests.length} solicitud${requests.length === 1 ? "" : "es"} pendiente${requests.length === 1 ? "" : "s"}.`;

  const badge = document.getElementById("subReqBadge");
  if (badge) {
    badge.hidden = requests.length <= 0;
    badge.textContent = requests.length > 9 ? "9+" : String(requests.length);
  }
}

function renderList() {
  listEl.innerHTML =
    requests
      .map(
        (r) => `
      <div class="follow-request-item" data-id="${r.id}">
        <a class="follow-request-user" href="profile.html?u=${encodeURIComponent(r.username)}">
          <img src="${escapeHtml(r.avatarUrl || "/images/avatars/default.svg")}" alt="" class="search-result-avatar">
          <span class="search-result-body">
            <span class="search-result-name">${escapeHtml(`${r.nombre} ${r.apellido}`.trim())}${renderVerifiedBadge(r.userType, r.isVerified)}</span>
            <span class="search-result-username">@${escapeHtml(r.username)}</span>
          </span>
        </a>
        <div class="follow-request-actions">
          <button class="btn btn-primary btn-sm accept-btn" data-id="${r.id}" type="button">Aceptar</button>
          <button class="btn btn-outline btn-sm reject-btn" data-id="${r.id}" type="button">Rechazar</button>
        </div>
      </div>
    `
      )
      .join("") || `<p class="exc-pick-empty">No tenés solicitudes de suscripción pendientes.</p>`;

  listEl.querySelectorAll<HTMLButtonElement>(".accept-btn").forEach((btn) => {
    btn.addEventListener("click", () => void handleRespond(btn.dataset.id!, true));
  });
  listEl.querySelectorAll<HTMLButtonElement>(".reject-btn").forEach((btn) => {
    btn.addEventListener("click", () => void handleRespond(btn.dataset.id!, false));
  });
}

async function handleRespond(id: string, accept: boolean) {
  const row = listEl.querySelector<HTMLElement>(`.follow-request-item[data-id="${id}"]`);
  row?.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.disabled = true));

  const { error } = accept ? await acceptSubscriptionRequest(id) : await rejectSubscriptionRequest(id);
  if (error) {
    alert(error);
    row?.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.disabled = false));
    return;
  }

  requests = requests.filter((r) => r.id !== id);
  renderSummary();
  renderList();
}

requests = await listSubscriptionRequests(userId);
renderSummary();
renderList();
