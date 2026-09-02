import { supabase, hasPersistedSession } from "../lib/supabaseClient";
import { signOut } from "../services/auth.service";
import { getProfile, type Profile } from "../services/profile.service";
import { escapeHtml } from "../lib/dom";
import { renderMultiImageUploader, MultiImageUploader } from "../lib/multiImageUploader";
import { ALL_PLATFORMS, getPlatform, type SocialPlatform } from "../lib/socialLinks";
import {
  getMyVerificationRequest,
  getVerificationDocumentUrl,
  uploadVerificationDocument,
  submitGymVerificationRequest,
  resubmitGymVerificationRequest,
  MAX_VERIFICATION_DOCUMENTS,
  type VerificationRequest,
  type GymDetails,
  type GymSocialLink,
} from "../services/verification.service";
import {
  listAllNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from "../services/notification.service";

const MAX_SOCIAL_LINKS = 5;
const STATUS_LABEL: Record<string, string> = { pending: "En revisión", approved: "Aprobada", rejected: "Rechazada" };

const root = document.getElementById("gymPendingRoot")!;
const loaderBody = document.getElementById("loaderBody");

document.getElementById("gymPendingLogout")?.addEventListener("click", async (e) => {
  e.preventDefault();
  await signOut();
  window.location.href = "/index.html";
});

// ---------- Sesión + gate (esta página es el único lugar donde puede estar un gimnasio sin aprobar) ----------

/** Detiene la ejecución del módulo mientras el navegador procesa un window.location.href. */
function halt(): Promise<never> {
  return new Promise<never>(() => {});
}

const { data: sessionData } = await supabase.auth.getSession();
let session = sessionData.session;
if (!session && hasPersistedSession()) {
  const { data: refreshed } = await supabase.auth.refreshSession();
  session = refreshed.session;
}
if (!session) {
  window.location.href = "/pages/login.html";
  await halt();
}
const userId = session!.user.id;

const profile = await getProfile(userId).catch(() => null);
if (!profile || profile.user_type !== "gimnasio") {
  // No es un gimnasio: no tiene nada que hacer acá.
  window.location.href = "/pages/profile.html";
  await halt();
}
if (profile!.is_verified) {
  goToApp();
  await halt();
}
// A partir de acá profile está garantizado no-null; capturar con tipo concreto para los closures.
const gym: Profile = profile!;

function goToApp(): void {
  try {
    sessionStorage.removeItem(`gymgate:${userId}`);
  } catch {
    // ignore
  }
  window.location.href = "/pages/profile.html";
}

/** Re-chequea si ya lo aprobaron (al volver a la pestaña o con el botón "Actualizar estado"). */
async function checkApproval(): Promise<void> {
  const { data } = await supabase.from("profiles_public").select("is_verified").eq("id", userId).maybeSingle();
  if (data?.is_verified) goToApp();
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void checkApproval();
});

// ---------- Shell con pestañas ----------

type Tab = "solicitud" | "notificaciones";
let activeTab: Tab = "solicitud";

root.innerHTML = `
  <div class="auth-card gym-pending-card">
    <span class="eyebrow">Alta de gimnasio</span>
    <h1>${escapeHtml(gym.nombre)}</h1>
    <p class="subtitle">
      Para activar tu página de gimnasio, el equipo de Gym Social tiene que aprobar tu cuenta.
      Cargá la documentación que certifique que sos un gimnasio registrado y en poco tiempo la revisamos.
      Más adelante te podemos pedir papeles adicionales.
    </p>

    <div class="routine-tabs" id="gymPendingTabs">
      <button class="routine-tab active" data-tab="solicitud" type="button">Tu solicitud</button>
      <button class="routine-tab" data-tab="notificaciones" type="button">Notificaciones<span class="nav-badge" id="gymPendingNotifBadge" hidden>0</span></button>
    </div>

    <div id="gymPendingSolicitud"></div>
    <div id="gymPendingNotificaciones" hidden></div>
  </div>
`;

const solicitudEl = root.querySelector<HTMLElement>("#gymPendingSolicitud")!;
const notifsEl = root.querySelector<HTMLElement>("#gymPendingNotificaciones")!;

root.querySelector("#gymPendingTabs")?.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".routine-tab");
  if (!btn) return;
  activeTab = btn.dataset.tab as Tab;
  root.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((b) => b.classList.toggle("active", b === btn));
  solicitudEl.hidden = activeTab !== "solicitud";
  notifsEl.hidden = activeTab !== "notificaciones";
  if (activeTab === "notificaciones") void loadNotifications();
  if (activeTab === "solicitud") void checkApproval();
});

// ---------- Pestaña: Tu solicitud ----------

function iconSvg(platform: SocialPlatform): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${platform.icon}</svg>`;
}

async function loadSolicitud(): Promise<void> {
  solicitudEl.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando...</p></div>`;
  const request = await getMyVerificationRequest(userId).catch(() => null);
  await renderSolicitud(request);
}

async function renderSolicitud(request: VerificationRequest | null): Promise<void> {
  const canEdit = !request || request.status === "rejected";
  const prev = request?.gym_details ?? null;

  const documentUrls = request
    ? await Promise.all(
        ((request.documents as string[]) ?? []).map(async (path) => ({ path, url: await getVerificationDocumentUrl(path) }))
      )
    : [];
  const readyDocs = documentUrls.filter((d): d is { path: string; url: string } => Boolean(d.url));

  const socialSeed: GymSocialLink[] = prev?.socialLinks?.length
    ? prev.socialLinks.map((l) => ({ ...l }))
    : [];

  const statusHtml = request
    ? `<div class="gym-pending-status gym-pending-status-${request.status}">
         <strong>Estado:</strong> ${escapeHtml(STATUS_LABEL[request.status] ?? request.status)}
         ${
           request.status === "rejected" && request.admin_note
             ? `<p class="gym-pending-status-note"><strong>Motivo:</strong> ${escapeHtml(request.admin_note)}</p>`
             : ""
         }
       </div>
       <div class="settings-actions"><button class="btn btn-outline btn-sm" id="gymPendingRefresh" type="button">Actualizar estado</button></div>`
    : "";

  if (!canEdit) {
    // Pendiente o aprobada: solo lectura.
    solicitudEl.innerHTML = `
      ${statusHtml}
      <p class="chart-sub">${
        request!.status === "pending"
          ? "Tu solicitud está en revisión. Te avisamos por notificación en cuanto tengamos una respuesta."
          : "Tu solicitud ya fue aprobada."
      }</p>
      <div class="gym-pending-summary">
        <p><strong>Nombre:</strong> ${escapeHtml(prev?.gymName || gym.nombre)}</p>
        <p><strong>Ubicación:</strong> ${escapeHtml(prev?.location || "—")}</p>
        ${prev?.mapsUrl ? `<p><strong>Google Maps:</strong> <a href="${escapeHtml(prev.mapsUrl)}" target="_blank" rel="noopener">Ver ubicación</a></p>` : ""}
        ${
          socialSeed.length
            ? `<p><strong>Redes:</strong> ${socialSeed.map((l) => `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label)}</a>`).join(" · ")}</p>`
            : ""
        }
      </div>
      <div class="verify-doc-grid">${readyDocs.map((d) => `<div class="verify-doc-item"><img src="${escapeHtml(d.url)}" alt=""></div>`).join("")}</div>
    `;
    solicitudEl.querySelector("#gymPendingRefresh")?.addEventListener("click", () => void checkApproval());
    return;
  }

  solicitudEl.innerHTML = `
    ${statusHtml}
    <div class="field">
      <label for="gymName">Nombre del gimnasio</label>
      <input type="text" id="gymName" maxlength="80" value="${escapeHtml(prev?.gymName || gym.nombre)}" placeholder="Ej: Iron House Gym">
    </div>
    <div class="field">
      <label for="gymLocation">Ubicación</label>
      <input type="text" id="gymLocation" maxlength="300" value="${escapeHtml(prev?.location || "")}" placeholder="Calle, número, ciudad, provincia">
    </div>
    <div class="field">
      <label for="gymMapsUrl">Link de Google Maps (opcional)</label>
      <input type="text" id="gymMapsUrl" maxlength="500" value="${escapeHtml(prev?.mapsUrl || "")}" placeholder="https://maps.google.com/...">
    </div>
    <div class="field">
      <label>Redes sociales (opcional)</label>
      <div id="gymSocialEditor"></div>
      <div class="exc-pick-chips" id="gymSocialPicker"></div>
    </div>
    <div class="field">
      <label>Documentación (obligatorio)</label>
      <p class="field-hint">Habilitación municipal, inscripción, contrato de alquiler comercial, fotos del local con cartel, etc.</p>
      <div id="gymDocsUploader"></div>
    </div>
    <div class="alert_message" id="gymPendingAlert"></div>
    <button class="btn btn-primary btn-block" id="gymPendingSubmit" type="button">${request ? "Reenviar solicitud" : "Enviar solicitud"}</button>
  `;

  solicitudEl.querySelector("#gymPendingRefresh")?.addEventListener("click", () => void checkApproval());

  // Editor de redes sociales (patrón de Configuración, compacto).
  const currentLinks: GymSocialLink[] = socialSeed;

  function renderSocialEditor(): void {
    const editor = solicitudEl.querySelector<HTMLElement>("#gymSocialEditor")!;
    editor.innerHTML = currentLinks
      .map((l, i) => {
        const platform = getPlatform(l.platform);
        const isOther = platform.key === "other";
        return `
        <div class="settings-link-row" data-index="${i}">
          <span class="settings-link-icon">${iconSvg(platform)}</span>
          ${
            isOther
              ? `<input type="text" class="link-label" placeholder="Nombre (ej: Sitio web)" value="${escapeHtml(l.label)}">
                 <input type="text" class="link-url" placeholder="${escapeHtml(platform.placeholder)}" value="${escapeHtml(l.url)}">`
              : `<span class="settings-link-prefix">${escapeHtml(platform.inputPrefix ?? "")}</span>
                 <input type="text" class="link-handle" placeholder="${escapeHtml(platform.placeholder)}" value="${escapeHtml(platform.extractHandle(l.url))}">`
          }
          <button type="button" class="settings-link-remove" data-index="${i}" aria-label="Quitar enlace">×</button>
        </div>`;
      })
      .join("");

    editor.querySelectorAll<HTMLButtonElement>(".settings-link-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentLinks.splice(Number(btn.dataset.index), 1);
        renderSocialEditor();
      });
    });
    editor.querySelectorAll<HTMLDivElement>(".settings-link-row").forEach((row) => {
      const i = Number(row.dataset.index);
      row.querySelector<HTMLInputElement>(".link-handle")?.addEventListener("input", (e) => {
        currentLinks[i].url = (e.target as HTMLInputElement).value;
      });
      row.querySelector<HTMLInputElement>(".link-label")?.addEventListener("input", (e) => {
        currentLinks[i].label = (e.target as HTMLInputElement).value;
      });
      row.querySelector<HTMLInputElement>(".link-url")?.addEventListener("input", (e) => {
        currentLinks[i].url = (e.target as HTMLInputElement).value;
      });
    });

    renderSocialPicker();
  }

  function renderSocialPicker(): void {
    const picker = solicitudEl.querySelector<HTMLElement>("#gymSocialPicker")!;
    const usedKeys = new Set(currentLinks.map((l) => l.platform || "other"));
    const atLimit = currentLinks.length >= MAX_SOCIAL_LINKS;
    picker.innerHTML = ALL_PLATFORMS.filter((p) => p.key === "other" || !usedKeys.has(p.key))
      .map(
        (p) => `<button type="button" class="exc-pick-chip link-add-chip" data-platform="${p.key}" ${atLimit ? "disabled" : ""}>${iconSvg(p)} ${escapeHtml(p.label)}</button>`
      )
      .join("");
    picker.querySelectorAll<HTMLButtonElement>(".link-add-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (currentLinks.length >= MAX_SOCIAL_LINKS) return;
        const platform = getPlatform(btn.dataset.platform);
        currentLinks.push({ platform: platform.key, label: platform.label, url: "" });
        renderSocialEditor();
      });
    });
  }

  renderSocialEditor();

  // Uploader de documentos.
  const mount = solicitudEl.querySelector<HTMLElement>("#gymDocsUploader")!;
  mount.innerHTML = renderMultiImageUploader("gymDocsUploader", MAX_VERIFICATION_DOCUMENTS);
  const uploader = new MultiImageUploader("gymDocsUploader", MAX_VERIFICATION_DOCUMENTS);
  uploader.seedExisting(readyDocs);

  solicitudEl.querySelector("#gymPendingSubmit")?.addEventListener("click", async () => {
    const alertBox = solicitudEl.querySelector<HTMLElement>("#gymPendingAlert")!;
    alertBox.innerHTML = "";

    const gymName = (solicitudEl.querySelector("#gymName") as HTMLInputElement).value.trim();
    const location = (solicitudEl.querySelector("#gymLocation") as HTMLInputElement).value.trim();
    let mapsUrl = (solicitudEl.querySelector("#gymMapsUrl") as HTMLInputElement).value.trim();

    if (gymName.length < 2) {
      alertBox.innerHTML = "<p>Ingresá el nombre del gimnasio.</p>";
      return;
    }
    if (location.length < 5) {
      alertBox.innerHTML = "<p>Ingresá la ubicación del gimnasio (calle, número, ciudad).</p>";
      return;
    }
    if (mapsUrl) {
      if (!/^https?:\/\//i.test(mapsUrl)) mapsUrl = `https://${mapsUrl}`;
      try {
        new URL(mapsUrl);
      } catch {
        alertBox.innerHTML = "<p>El link de Google Maps no es válido.</p>";
        return;
      }
    }

    const socialLinks: GymSocialLink[] = [];
    for (const l of currentLinks) {
      const platform = getPlatform(l.platform);
      if (platform.key === "other") {
        const label = l.label.trim();
        let url = l.url.trim();
        if (!label && !url) continue;
        if (!label || !url) {
          alertBox.innerHTML = "<p>Completá el nombre y la URL de cada red (o quitala con la ×).</p>";
          return;
        }
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        try {
          new URL(url);
        } catch {
          alertBox.innerHTML = `<p>La URL "${escapeHtml(url)}" no es válida.</p>`;
          return;
        }
        socialLinks.push({ platform: "other", label, url });
      } else {
        const handle = l.url.trim();
        if (!handle) continue;
        const url = platform.buildUrl(handle);
        if (!url) continue;
        socialLinks.push({ platform: platform.key, label: platform.label, url });
      }
    }

    const submitBtn = solicitudEl.querySelector("#gymPendingSubmit") as HTMLButtonElement;
    submitBtn.disabled = true;
    if (loaderBody) {
      loaderBody.innerHTML = `<div class="loader-container"><div class="modern-spinner"></div><p>Subiendo documentación...</p></div>`;
    }

    const paths = [...uploader.getExistingPaths()];
    for (const file of uploader.getNewFiles()) {
      const { path, error } = await uploadVerificationDocument(userId, file);
      if (error) {
        if (loaderBody) loaderBody.innerHTML = "";
        submitBtn.disabled = false;
        alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
        return;
      }
      if (path) paths.push(path);
    }

    if (paths.length === 0) {
      if (loaderBody) loaderBody.innerHTML = "";
      submitBtn.disabled = false;
      alertBox.innerHTML = "<p>Subí al menos un documento que certifique tu gimnasio.</p>";
      return;
    }

    const details: GymDetails = { gymName, location, mapsUrl: mapsUrl || null, socialLinks };
    const { error } = request
      ? await resubmitGymVerificationRequest(request.id, details, paths)
      : await submitGymVerificationRequest(userId, details, paths);

    submitBtn.disabled = false;
    if (error) {
      if (loaderBody) loaderBody.innerHTML = "";
      alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
      return;
    }

    if (loaderBody) {
      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="success-icon">
            <svg viewBox="0 0 52 52" class="success-svg">
              <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
              <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
            </svg>
          </div>
          <p>¡Solicitud enviada! Queda pendiente de revisión.</p>
        </div>
      `;
    }
    setTimeout(async () => {
      if (loaderBody) loaderBody.innerHTML = "";
      await loadSolicitud();
    }, 2200);
  });
}

// ---------- Pestaña: Notificaciones ----------

function relativeTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "Ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `Hace ${diffHour} h`;
  return `Hace ${Math.floor(diffHour / 24)} d`;
}

async function loadNotifications(): Promise<void> {
  notifsEl.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando...</p></div>`;
  const notifications = await listAllNotifications().catch(() => [] as AppNotification[]);

  if (notifications.length === 0) {
    notifsEl.innerHTML = `<p class="exc-pick-empty">No tenés notificaciones todavía.</p>`;
    return;
  }

  const unread = notifications.filter((n) => !n.is_read).length;
  notifsEl.innerHTML = `
    <div class="search-recent-header">
      <span>Notificaciones</span>
      <button type="button" class="notif-mark-all" id="gymNotifMarkAll" ${unread === 0 ? "disabled" : ""}>Marcar todas como leídas</button>
    </div>
    <div class="notif-page-list">
      ${notifications
        .map(
          (n) => `
        <button type="button" class="notif-page-item ${n.is_read ? "" : "unread"}" data-id="${n.id}" data-link="${escapeHtml(n.link ?? "")}">
          <span class="notif-page-dot"></span>
          <span class="notif-page-body">
            <span class="notif-page-title">🔔 ${escapeHtml(n.title)}</span>
            ${n.body ? `<p class="notif-page-text">${escapeHtml(n.body)}</p>` : ""}
            <span class="notif-page-time">${relativeTime(n.created_at)}</span>
          </span>
        </button>`
        )
        .join("")}
    </div>
  `;

  notifsEl.querySelectorAll<HTMLButtonElement>(".notif-page-item").forEach((item) => {
    item.addEventListener("click", async () => {
      const id = item.dataset.id!;
      const notif = notifications.find((n) => n.id === id);
      if (notif && !notif.is_read) {
        notif.is_read = true;
        item.classList.remove("unread");
        void markNotificationRead(id);
      }
      // El único destino útil desde acá es la propia página (si ya lo aprobaron, el gate deja pasar).
      await checkApproval();
    });
  });
  notifsEl.querySelector("#gymNotifMarkAll")?.addEventListener("click", async () => {
    notifications.forEach((n) => (n.is_read = true));
    notifsEl.querySelectorAll(".notif-page-item.unread").forEach((el) => el.classList.remove("unread"));
    notifsEl.querySelector<HTMLButtonElement>("#gymNotifMarkAll")?.setAttribute("disabled", "");
    await markAllNotificationsRead();
  });
}

// Badge de no leídas en la pestaña Notificaciones.
void listAllNotifications()
  .then((notifs) => {
    const unread = notifs.filter((n) => !n.is_read).length;
    const badge = root.querySelector<HTMLElement>("#gymPendingNotifBadge");
    if (badge && unread > 0) {
      badge.textContent = String(unread);
      badge.hidden = false;
    }
  })
  .catch(() => {
    /* silencioso */
  });

void loadSolicitud();
