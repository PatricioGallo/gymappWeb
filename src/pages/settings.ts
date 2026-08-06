import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { COUNTRIES } from "../lib/countries";
import { calcularEdad } from "../lib/age";
import {
  getProfile,
  updateProfileFields,
  updateEmail,
  updatePassword,
  parseProfileLinks,
  MAX_PROFILE_LINKS,
  MAX_BIO_LENGTH,
  type Profile,
  type ProfileLink,
} from "../services/profile.service";
import { listBlockedUsers, unblockUser, type BlockedUserRow } from "../services/block.service";
import { renderMultiImageUploader, MultiImageUploader } from "../lib/multiImageUploader";
import { ARGENTINE_UNIVERSITIES } from "../lib/universities";
import {
  getMyVerificationRequest,
  getVerificationDocumentUrl,
  uploadVerificationDocument,
  submitVerificationRequest,
  resubmitVerificationRequest,
  CREDENTIAL_TYPE_OPTIONS,
  CREDENTIAL_TYPE_LABELS,
  CREDENTIAL_SPECIALTY_OPTIONS,
  CREDENTIAL_SPECIALTY_LABELS,
  CREDENTIAL_COMPLETION_STATUS_OPTIONS,
  CREDENTIAL_COMPLETION_STATUS_LABELS,
  MAX_VERIFICATION_DOCUMENTS,
  MAX_CREDENTIALS,
  type VerificationRequest,
  type CredentialType,
  type CredentialSpecialty,
  type CredentialCompletionStatus,
  type Credential,
} from "../services/verification.service";

setupNavToggle();
setupRevealObserver();
const userId = await requireAuth();

const profile = await getProfile(userId);
if (!profile) {
  window.location.href = "profile.html";
  throw new Error("profile not found");
}


// ---------- Tabs ----------

let blockedLoaded = false;
let verificationLoaded = false;

function setupTabs() {
  const tabsWrap = document.getElementById("settingsTabs");
  const editTab = document.getElementById("editTab")!;
  const privacyTab = document.getElementById("privacyTab")!;
  const notificationsTab = document.getElementById("notificationsTab")!;
  const personalizationTab = document.getElementById("personalizationTab")!;
  const blockedTab = document.getElementById("blockedTab")!;
  const verificationTab = document.getElementById("verificationTab")!;
  const verificationTabBtn = document.getElementById("verificationTabBtn") as HTMLButtonElement | null;
  if (!tabsWrap) return;

  if (verificationTabBtn && (profile!.user_type === "entrenador" || profile!.user_type === "gimnasio")) {
    verificationTabBtn.hidden = false;
  }

  tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((btn) => {
    btn.addEventListener("click", async () => {
      tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((b) => b.classList.toggle("active", b === btn));
      const tab = btn.dataset.tab;
      editTab.hidden = tab !== "edit";
      privacyTab.hidden = tab !== "privacy";
      notificationsTab.hidden = tab !== "notifications";
      personalizationTab.hidden = tab !== "personalization";
      blockedTab.hidden = tab !== "blocked";
      verificationTab.hidden = tab !== "verification";
      if (tab === "blocked" && !blockedLoaded) {
        blockedLoaded = true;
        await loadBlocked();
      }
      if (tab === "verification" && !verificationLoaded) {
        verificationLoaded = true;
        await loadVerificationTab();
      }
    });
  });
}

// ---------- Editar perfil ----------

function renderEditTab() {
  const editTab = document.getElementById("editTab")!;
  const initialLinks = parseProfileLinks(profile!.links);

  editTab.innerHTML = `
    <div class="chart-card reveal">
      <div class="field-row">
        <div class="field"><label for="editNombre">Nombre</label><input type="text" id="editNombre" value="${escapeHtml(profile!.nombre)}"></div>
        <div class="field"><label for="editApellido">Apellido</label><input type="text" id="editApellido" value="${escapeHtml(profile!.apellido)}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="editBirthdate">Fecha de nacimiento</label><input type="date" id="editBirthdate" value="${profile!.fecha_nacimiento}"></div>
        <div class="field">
          <label for="editNationality">Nacionalidad</label>
          <select id="editNationality">
            ${COUNTRIES.map((c) => `<option value="${escapeHtml(c)}" ${c === profile!.nacionalidad ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field">
        <label for="editBio">Biografía</label>
        <textarea id="editBio" rows="3" maxlength="${MAX_BIO_LENGTH}">${escapeHtml(profile!.bio ?? "")}</textarea>
        <p class="char-counter" id="bioCounter">${(profile!.bio ?? "").length}/${MAX_BIO_LENGTH}</p>
      </div>
      <div class="field">
        <label>Enlaces</label>
        <div id="linksEditor"></div>
        <button type="button" class="btn btn-outline btn-sm" id="addLinkBtn">+ Agregar enlace</button>
      </div>

      <div class="alert_message" id="editAlert"></div>
      <div class="settings-actions"><button class="btn btn-primary btn-sm" id="saveEditBtn" type="button">Guardar cambios</button></div>
    </div>
  `;

  const bioField = document.getElementById("editBio") as HTMLTextAreaElement;
  const bioCounter = document.getElementById("bioCounter")!;
  bioField.addEventListener("input", () => {
    bioCounter.textContent = `${bioField.value.length}/${MAX_BIO_LENGTH}`;
  });

  const currentLinks: ProfileLink[] = [...initialLinks];
  renderLinksEditor();

  function renderLinksEditor() {
    const linksEditor = document.getElementById("linksEditor")!;
    linksEditor.innerHTML = currentLinks
      .map(
        (l, i) => `
      <div class="settings-link-row" data-index="${i}">
        <input type="text" class="link-label" placeholder="Instagram" value="${escapeHtml(l.label)}">
        <input type="text" class="link-url" placeholder="https://instagram.com/tuusuario" value="${escapeHtml(l.url)}">
        <button type="button" class="settings-link-remove" data-index="${i}" aria-label="Quitar enlace">×</button>
      </div>
    `
      )
      .join("");

    linksEditor.querySelectorAll<HTMLButtonElement>(".settings-link-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentLinks.splice(Number(btn.dataset.index), 1);
        renderLinksEditor();
      });
    });

    const addBtn = document.getElementById("addLinkBtn") as HTMLButtonElement | null;
    if (addBtn) addBtn.disabled = currentLinks.length >= MAX_PROFILE_LINKS;
  }

  document.getElementById("addLinkBtn")?.addEventListener("click", () => {
    if (currentLinks.length >= MAX_PROFILE_LINKS) return;
    currentLinks.push({ label: "", url: "" });
    renderLinksEditor();
  });

  document.getElementById("saveEditBtn")?.addEventListener("click", async () => {
    const alertBox = document.getElementById("editAlert")!;
    alertBox.innerHTML = "";

    const nombre = (document.getElementById("editNombre") as HTMLInputElement).value.trim();
    const apellido = (document.getElementById("editApellido") as HTMLInputElement).value.trim();
    const fechaNacimiento = (document.getElementById("editBirthdate") as HTMLInputElement).value;
    const nacionalidad = (document.getElementById("editNationality") as HTMLSelectElement).value;
    const bio = bioField.value.trim();

    if (nombre.length < 2 || !Number.isNaN(Number(nombre))) {
      alertBox.innerHTML = "<p>Ingresaste un nombre inválido.</p>";
      return;
    }
    if (apellido.length < 2 || !Number.isNaN(Number(apellido))) {
      alertBox.innerHTML = "<p>Ingresaste un apellido inválido.</p>";
      return;
    }
    if (!fechaNacimiento || calcularEdad(fechaNacimiento) < 12 || calcularEdad(fechaNacimiento) > 100) {
      alertBox.innerHTML = "<p>Ingresá una fecha de nacimiento válida.</p>";
      return;
    }

    const linkRows = Array.from(document.querySelectorAll<HTMLDivElement>(".settings-link-row"));
    const newLinks: ProfileLink[] = [];
    for (const row of linkRows) {
      const label = (row.querySelector(".link-label") as HTMLInputElement).value.trim();
      let url = (row.querySelector(".link-url") as HTMLInputElement).value.trim();
      if (!label && !url) continue;
      if (!label || !url) {
        alertBox.innerHTML = "<p>Completá el nombre y la URL de cada enlace (o quitalo con la ×).</p>";
        return;
      }
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      try {
        new URL(url);
      } catch {
        alertBox.innerHTML = `<p>La URL "${escapeHtml(url)}" no es válida.</p>`;
        return;
      }
      newLinks.push({ label, url });
    }

    const { error } = await updateProfileFields(userId, {
      nombre,
      apellido,
      fecha_nacimiento: fechaNacimiento,
      nacionalidad,
      bio: bio || null,
      links: newLinks as unknown as Profile["links"],
    });
    if (error) {
      alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
      return;
    }

    Object.assign(profile!, { nombre, apellido, fecha_nacimiento: fechaNacimiento, nacionalidad, bio: bio || null, links: newLinks });
    alertBox.innerHTML = "<p>¡Cambios guardados!</p>";
  });
}

// ---------- Privacidad y cuenta ----------

function renderPrivacyTab() {
  const privacyTab = document.getElementById("privacyTab")!;
  privacyTab.innerHTML = `
    <div class="chart-card reveal">
      <h3>Privacidad</h3>
      <div class="settings-toggle-row">
        <div>
          <span class="switch-label">Perfil público</span>
          <p class="chart-sub" style="margin:4px 0 0;">Público: cualquiera ve tus rutinas y estadísticas. Privado: solo tu información básica.</p>
        </div>
        <label class="switch">
          <input type="checkbox" id="visibilityToggle" ${profile!.is_public ? "checked" : ""}>
          <span class="switch-track"></span>
        </label>
      </div>
      <div class="alert_message" id="privacyAlert"></div>
    </div>

    <div class="chart-card reveal">
      <h3>Cuenta</h3>
      <div class="field"><label for="mailField">Mail</label><input type="email" placeholder="${escapeHtml(profile!.email)}" id="mailField"></div>
      <div class="field"><label for="pswd">Contraseña nueva</label><input type="password" placeholder="••••••••••••" id="pswd"></div>
      <div class="field"><label for="pswd2">Repetir contraseña nueva</label><input type="password" placeholder="••••••••••••" id="pswd2"></div>
      <div class="alert_message" id="accountAlert"></div>
      <div class="settings-actions"><button class="btn btn-primary btn-sm" id="saveAccountBtn" type="button">Guardar</button></div>
    </div>
  `;

  document.getElementById("visibilityToggle")?.addEventListener("change", async (e) => {
    const alertBox = document.getElementById("privacyAlert")!;
    alertBox.innerHTML = "";
    const toggle = e.target as HTMLInputElement;
    const isPublic = toggle.checked;
    toggle.disabled = true;
    const { error } = await updateProfileFields(userId, { is_public: isPublic });
    toggle.disabled = false;
    if (error) {
      toggle.checked = !isPublic;
      alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
      return;
    }
    profile!.is_public = isPublic;
  });

  document.getElementById("saveAccountBtn")?.addEventListener("click", async () => {
    const alertBox = document.getElementById("accountAlert")!;
    alertBox.innerHTML = "";
    const mail = (document.getElementById("mailField") as HTMLInputElement).value.trim();
    const pass = (document.getElementById("pswd") as HTMLInputElement).value;
    const pass2 = (document.getElementById("pswd2") as HTMLInputElement).value;

    if (!mail && !pass) {
      alertBox.innerHTML = "<p>Ingresá un mail o una contraseña nueva.</p>";
      return;
    }
    if (pass && pass !== pass2) {
      alertBox.innerHTML = "<p>Las contraseñas no coinciden.</p>";
      return;
    }
    if (mail) {
      const { error } = await updateEmail(mail);
      if (error) {
        alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
        return;
      }
    }
    if (pass) {
      const { error } = await updatePassword(pass);
      if (error) {
        alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
        return;
      }
    }
    alertBox.innerHTML = "<p>¡Guardado! Si cambiaste el mail, revisá tu casilla para confirmarlo.</p>";
    (document.getElementById("mailField") as HTMLInputElement).value = "";
    (document.getElementById("pswd") as HTMLInputElement).value = "";
    (document.getElementById("pswd2") as HTMLInputElement).value = "";
  });
}

// ---------- Notificaciones ----------

interface NotificationPrefs {
  likes: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
}

const NOTIFICATION_DEFAULTS: NotificationPrefs = { likes: true, comments: true, follows: true, mentions: true };

function parseNotificationPrefs(raw: Profile["notification_prefs"]): NotificationPrefs {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...NOTIFICATION_DEFAULTS, ...(raw as Partial<NotificationPrefs>) };
  }
  return { ...NOTIFICATION_DEFAULTS };
}

function renderNotificationsTab() {
  const notificationsTab = document.getElementById("notificationsTab")!;
  const prefs = parseNotificationPrefs(profile!.notification_prefs);

  const items: { key: keyof NotificationPrefs; label: string }[] = [
    { key: "likes", label: "Me gusta en tus publicaciones" },
    { key: "comments", label: "Comentarios en tus publicaciones" },
    { key: "follows", label: "Nuevos seguidores" },
    { key: "mentions", label: "Menciones" },
  ];

  notificationsTab.innerHTML = `
    <div class="chart-card reveal">
      <h3>Notificaciones</h3>
      <p class="chart-sub">"Nuevos seguidores" ya está activo. El resto (me gusta, comentarios, menciones) va a aplicarse en cuanto sumemos publicaciones a la red social.</p>
      ${items
        .map(
          (item) => `
        <div class="settings-toggle-row">
          <span>${escapeHtml(item.label)}</span>
          <label class="switch">
            <input type="checkbox" class="notif-toggle" data-key="${item.key}" ${prefs[item.key] ? "checked" : ""} aria-label="${escapeHtml(item.label)}">
            <span class="switch-track"></span>
          </label>
        </div>
      `
        )
        .join("")}
      <div class="alert_message" id="notifAlert"></div>
    </div>
  `;

  notificationsTab.querySelectorAll<HTMLInputElement>(".notif-toggle").forEach((toggle) => {
    toggle.addEventListener("change", async () => {
      const alertBox = document.getElementById("notifAlert")!;
      alertBox.innerHTML = "";
      const key = toggle.dataset.key as keyof NotificationPrefs;
      const newPrefs = { ...parseNotificationPrefs(profile!.notification_prefs), [key]: toggle.checked };
      toggle.disabled = true;
      const { error } = await updateProfileFields(userId, { notification_prefs: newPrefs as unknown as Profile["notification_prefs"] });
      toggle.disabled = false;
      if (error) {
        toggle.checked = !toggle.checked;
        alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
        return;
      }
      profile!.notification_prefs = newPrefs as unknown as Profile["notification_prefs"];
    });
  });
}

// ---------- Personalizacion ----------

function renderPersonalizationTab() {
  const personalizationTab = document.getElementById("personalizationTab")!;
  personalizationTab.innerHTML = `
    <div class="chart-card reveal">
      <h3>Personalización</h3>
      <div class="settings-toggle-row">
        <div>
          <span class="switch-label">Permitir zoom en la web</span>
          <p class="chart-sub" style="margin:4px 0 0;">Por defecto está desactivado para que no moleste al cargar pesos desde el celular. Activalo si preferís poder hacer zoom.</p>
        </div>
        <label class="switch">
          <input type="checkbox" id="zoomToggle" ${profile!.zoom_enabled ? "checked" : ""}>
          <span class="switch-track"></span>
        </label>
      </div>
      <div class="alert_message" id="personalizationAlert"></div>
    </div>
  `;

  document.getElementById("zoomToggle")?.addEventListener("change", async (e) => {
    const alertBox = document.getElementById("personalizationAlert")!;
    alertBox.innerHTML = "";
    const toggle = e.target as HTMLInputElement;
    const zoomEnabled = toggle.checked;
    toggle.disabled = true;
    const { error } = await updateProfileFields(userId, { zoom_enabled: zoomEnabled });
    toggle.disabled = false;
    if (error) {
      toggle.checked = !zoomEnabled;
      alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
      return;
    }
    profile!.zoom_enabled = zoomEnabled;
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) viewport.setAttribute("content", zoomEnabled ? "width=device-width, initial-scale=1" : "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
  });
}

// ---------- Usuarios bloqueados ----------

async function loadBlocked() {
  const blockedTab = document.getElementById("blockedTab")!;
  blockedTab.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando...</p></div>`;
  const blocked = await listBlockedUsers(userId);
  renderBlockedTab(blocked);
}

function renderBlockedTab(blocked: BlockedUserRow[]) {
  const blockedTab = document.getElementById("blockedTab")!;
  blockedTab.innerHTML = `
    <div class="chart-card reveal">
      <h3>Usuarios bloqueados</h3>
      <p class="chart-sub">Bloqueá usuarios desde el menú de tres puntos en su perfil. Acá podés ver y gestionar tus bloqueos.</p>
      ${
        blocked.length
          ? blocked
              .map(
                (b) => `
        <div class="settings-blocked-row" data-id="${b.id}">
          <span>
            <strong>${escapeHtml(b.nombre)} ${escapeHtml(b.apellido)}</strong>
            <small>@${escapeHtml(b.username)}</small>
          </span>
          <button class="btn btn-outline btn-sm unblock-btn" data-id="${b.blockedId}" type="button">Desbloquear</button>
        </div>
      `
              )
              .join("")
          : `<p class="exc-pick-empty">No bloqueaste a nadie todavía.</p>`
      }
    </div>
  `;

  blockedTab.querySelectorAll<HTMLButtonElement>(".unblock-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const { error } = await unblockUser(userId, btn.dataset.id!);
      if (error) {
        btn.disabled = false;
        return;
      }
      await loadBlocked();
    });
  });
}

// ---------- Verificación ----------

const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente de revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
};

async function loadVerificationTab() {
  const verificationTab = document.getElementById("verificationTab")!;
  verificationTab.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando...</p></div>`;
  const request = await getMyVerificationRequest(userId);
  await renderVerificationTab(request);
}

function emptyCredential(): Credential {
  return { type: CREDENTIAL_TYPE_OPTIONS[0], institution: "", specialty: CREDENTIAL_SPECIALTY_OPTIONS[0], completionStatus: "recibido" };
}

function renderCredentialCard(cred: Credential, index: number): string {
  const isUniversidad = cred.type === "universitario";
  const isCustomInstitution = cred.institution === "__otro__" || (cred.institution !== "" && !ARGENTINE_UNIVERSITIES.includes(cred.institution));
  const selectValue = isUniversidad ? (isCustomInstitution ? "__otro__" : cred.institution) : "";
  const showInstitutionText = !isUniversidad || isCustomInstitution;
  const institutionTextValue = cred.institution === "__otro__" ? "" : cred.institution;

  return `
    <div class="credential-card" data-index="${index}">
      <button type="button" class="credential-remove" data-index="${index}" aria-label="Quitar título">×</button>
      <div class="field-row">
        <div class="field">
          <label>Tipo de título</label>
          <select class="cred-type" data-index="${index}">
            ${CREDENTIAL_TYPE_OPTIONS.map((t) => `<option value="${t}" ${cred.type === t ? "selected" : ""}>${escapeHtml(CREDENTIAL_TYPE_LABELS[t])}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>¿De qué es el título?</label>
          <select class="cred-specialty" data-index="${index}">
            ${CREDENTIAL_SPECIALTY_OPTIONS.map((s) => `<option value="${s}" ${cred.specialty === s ? "selected" : ""}>${escapeHtml(CREDENTIAL_SPECIALTY_LABELS[s])}</option>`).join("")}
          </select>
        </div>
      </div>
      ${
        cred.type === "otro"
          ? `<div class="field">
               <label>¿Qué tipo de título es?</label>
               <input type="text" class="cred-other-type" data-index="${index}" value="${escapeHtml(cred.otherTypeText ?? "")}" placeholder="Ej: certificación internacional">
             </div>`
          : ""
      }
      ${
        cred.specialty === "otro"
          ? `<div class="field">
               <label>¿De qué es específicamente?</label>
               <input type="text" class="cred-other-specialty" data-index="${index}" value="${escapeHtml(cred.otherSpecialtyText ?? "")}" placeholder="Ej: instructor de crossfit">
             </div>`
          : ""
      }
      ${
        isUniversidad
          ? `<div class="field">
               <label>Universidad</label>
               <select class="cred-institution-select" data-index="${index}">
                 <option value="">Elegí una universidad</option>
                 ${ARGENTINE_UNIVERSITIES.map((u) => `<option value="${escapeHtml(u)}" ${selectValue === u ? "selected" : ""}>${escapeHtml(u)}</option>`).join("")}
                 <option value="__otro__" ${selectValue === "__otro__" ? "selected" : ""}>Otro / no está en la lista</option>
               </select>
               ${
                 showInstitutionText
                   ? `<input type="text" class="cred-institution-text credential-institution-other" data-index="${index}" value="${escapeHtml(institutionTextValue)}" placeholder="Nombre de la universidad">`
                   : ""
               }
             </div>`
          : `<div class="field">
               <label>Institución / entidad que lo emitió</label>
               <input type="text" class="cred-institution-text" data-index="${index}" value="${escapeHtml(institutionTextValue)}" placeholder="Ej: nombre del instituto o entidad">
             </div>`
      }
      <div class="field">
        <label>¿Recibido o estudiante?</label>
        <select class="cred-completion-status" data-index="${index}">
          ${CREDENTIAL_COMPLETION_STATUS_OPTIONS.map((s) => `<option value="${s}" ${cred.completionStatus === s ? "selected" : ""}>${escapeHtml(CREDENTIAL_COMPLETION_STATUS_LABELS[s])}</option>`).join("")}
        </select>
      </div>
    </div>
  `;
}

async function renderVerificationTab(request: VerificationRequest | null) {
  const verificationTab = document.getElementById("verificationTab")!;
  const isGimnasio = profile!.user_type === "gimnasio";
  const canEdit = !request || request.status === "rejected";

  const documentUrls = request
    ? await Promise.all(((request.documents as string[]) ?? []).map(async (path) => ({ path, url: await getVerificationDocumentUrl(path) })))
    : [];

  verificationTab.innerHTML = `
    <div class="chart-card reveal">
      <h3>Validación y tick verde</h3>
      <p class="chart-sub">
        ${
          isGimnasio
            ? "Subí documentación que demuestre la existencia y actividad de tu gimnasio (habilitación, fotos del local, etc.) para pedir el tick verde."
            : "Contanos de dónde sale tu título (obligatorio) y subí fotos como respaldo (opcional, pero necesario para el tick verde) para pedir el tick de entrenador certificado. Seguís teniendo todos los beneficios de entrenador aunque no lo hagas, solo no vas a tener el tick hasta que lo hagamos."
        }
      </p>

      ${
        request
          ? `<p class="profile-badge">Estado: ${escapeHtml(VERIFICATION_STATUS_LABELS[request.status] ?? request.status)}</p>
             ${request.status === "rejected" && request.admin_note ? `<p class="chart-sub"><strong>Motivo:</strong> ${escapeHtml(request.admin_note)}</p>` : ""}`
          : ""
      }

      ${
        canEdit
          ? `
        ${
          !isGimnasio
            ? `
        <div class="field">
          <label>Tus títulos (obligatorio)</label>
          <div id="credentialsEditor"></div>
          <button type="button" class="btn btn-outline btn-sm" id="addCredentialBtn">+ Agregar título</button>
        </div>`
            : ""
        }
        <div class="field">
          <label>Fotos (opcional, necesario para el tick verde)</label>
          <div id="verifDocsUploader"></div>
        </div>
        <div class="alert_message" id="verifAlert"></div>
        <div class="settings-actions"><button class="btn btn-primary btn-sm" id="verifSaveBtn" type="button">${request ? "Reenviar solicitud" : "Enviar solicitud"}</button></div>
      `
          : `<p class="chart-sub">${
              request!.status === "approved"
                ? "Tu solicitud ya fue aprobada, ¡felicitaciones! Si necesitás actualizar tu documentación escribinos por Contacto."
                : "Tu solicitud está en revisión. Vas a poder volver a enviarla si te la rechazan; mientras tanto no se puede editar."
            }</p>
             <div class="verify-doc-grid">${documentUrls.map((d) => (d.url ? `<div class="verify-doc-item"><img src="${escapeHtml(d.url)}" alt=""></div>` : "")).join("")}</div>`
      }
    </div>
  `;

  if (canEdit) {
    const currentCredentials: Credential[] = isGimnasio
      ? []
      : request?.credentials?.length
        ? request.credentials.map((c) => ({ ...c }))
        : [emptyCredential()];

    function renderCredentialsEditor() {
      const editor = document.getElementById("credentialsEditor");
      if (!editor) return;
      editor.innerHTML = currentCredentials.map((c, i) => renderCredentialCard(c, i)).join("");

      editor.querySelectorAll<HTMLSelectElement>(".cred-type").forEach((sel) => {
        sel.addEventListener("change", () => {
          const i = Number(sel.dataset.index);
          currentCredentials[i] = { ...currentCredentials[i], type: sel.value as CredentialType, otherTypeText: null };
          renderCredentialsEditor();
        });
      });
      editor.querySelectorAll<HTMLInputElement>(".cred-other-type").forEach((input) => {
        input.addEventListener("input", () => {
          currentCredentials[Number(input.dataset.index)].otherTypeText = input.value;
        });
      });
      editor.querySelectorAll<HTMLSelectElement>(".cred-specialty").forEach((sel) => {
        sel.addEventListener("change", () => {
          const i = Number(sel.dataset.index);
          currentCredentials[i] = { ...currentCredentials[i], specialty: sel.value as CredentialSpecialty, otherSpecialtyText: null };
          renderCredentialsEditor();
        });
      });
      editor.querySelectorAll<HTMLInputElement>(".cred-other-specialty").forEach((input) => {
        input.addEventListener("input", () => {
          currentCredentials[Number(input.dataset.index)].otherSpecialtyText = input.value;
        });
      });
      editor.querySelectorAll<HTMLSelectElement>(".cred-completion-status").forEach((sel) => {
        sel.addEventListener("change", () => {
          currentCredentials[Number(sel.dataset.index)].completionStatus = sel.value as CredentialCompletionStatus;
        });
      });
      editor.querySelectorAll<HTMLSelectElement>(".cred-institution-select").forEach((sel) => {
        sel.addEventListener("change", () => {
          const i = Number(sel.dataset.index);
          currentCredentials[i].institution = sel.value;
          renderCredentialsEditor();
        });
      });
      editor.querySelectorAll<HTMLInputElement>(".cred-institution-text").forEach((input) => {
        input.addEventListener("input", () => {
          currentCredentials[Number(input.dataset.index)].institution = input.value;
        });
      });
      editor.querySelectorAll<HTMLButtonElement>(".credential-remove").forEach((btn) => {
        btn.addEventListener("click", () => {
          currentCredentials.splice(Number(btn.dataset.index), 1);
          renderCredentialsEditor();
        });
      });

      const addBtn = document.getElementById("addCredentialBtn") as HTMLButtonElement | null;
      if (addBtn) addBtn.disabled = currentCredentials.length >= MAX_CREDENTIALS;
    }

    if (!isGimnasio) {
      renderCredentialsEditor();
      document.getElementById("addCredentialBtn")?.addEventListener("click", () => {
        if (currentCredentials.length >= MAX_CREDENTIALS) return;
        currentCredentials.push(emptyCredential());
        renderCredentialsEditor();
      });
    }

    const mount = document.getElementById("verifDocsUploader")!;
    mount.innerHTML = renderMultiImageUploader("verifDocsUploader", MAX_VERIFICATION_DOCUMENTS);
    const uploader = new MultiImageUploader("verifDocsUploader", MAX_VERIFICATION_DOCUMENTS);
    uploader.seedExisting(documentUrls.filter((d): d is { path: string; url: string } => Boolean(d.url)));

    document.getElementById("verifSaveBtn")?.addEventListener("click", async () => {
      const alertBox = document.getElementById("verifAlert")!;
      alertBox.innerHTML = "";

      const credentials = currentCredentials
        .map((c) => ({
          type: c.type,
          institution: c.institution === "__otro__" ? "" : c.institution.trim(),
          otherTypeText: c.type === "otro" ? (c.otherTypeText ?? "").trim() : null,
          specialty: c.specialty,
          otherSpecialtyText: c.specialty === "otro" ? (c.otherSpecialtyText ?? "").trim() : null,
          completionStatus: c.completionStatus,
        }))
        .filter((c) => c.institution || c.otherTypeText);

      if (!isGimnasio) {
        if (credentials.length === 0) {
          alertBox.innerHTML = "<p>Agregá al menos un título: es obligatorio para pedir la validación.</p>";
          return;
        }
        const missingInstitution = credentials.some((c) => !c.institution);
        if (missingInstitution) {
          alertBox.innerHTML = "<p>Completá la institución de cada título que agregaste.</p>";
          return;
        }
        const missingOtherType = credentials.some((c) => c.type === "otro" && !c.otherTypeText);
        if (missingOtherType) {
          alertBox.innerHTML = "<p>Contanos qué tipo de título es en los que elegiste \"Otro\".</p>";
          return;
        }
        const missingOtherSpecialty = credentials.some((c) => c.specialty === "otro" && !c.otherSpecialtyText);
        if (missingOtherSpecialty) {
          alertBox.innerHTML = "<p>Contanos de qué es el título en los que elegiste \"Otro\".</p>";
          return;
        }
        const missingCompletionStatus = credentials.some((c) => !c.completionStatus);
        if (missingCompletionStatus) {
          alertBox.innerHTML = "<p>Indicá si estás recibido o sos estudiante en cada título.</p>";
          return;
        }
      }

      const saveBtn = document.getElementById("verifSaveBtn") as HTMLButtonElement;
      saveBtn.disabled = true;

      const loaderBody = document.getElementById("loaderBody");
      if (loaderBody) {
        loaderBody.innerHTML = `
          <div class="loader-container">
            <div class="modern-spinner"></div>
            <p>Subiendo documentación...</p>
          </div>
        `;
      }

      const newFiles = uploader.getNewFiles();
      const paths = [...uploader.getExistingPaths()];
      for (const file of newFiles) {
        const { path, error } = await uploadVerificationDocument(userId, file);
        if (error) {
          if (loaderBody) loaderBody.innerHTML = "";
          saveBtn.disabled = false;
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }
        if (path) paths.push(path);
      }

      const { error } = request
        ? await resubmitVerificationRequest(request.id, credentials, paths)
        : await submitVerificationRequest(userId, credentials, paths);

      saveBtn.disabled = false;
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
            <p>¡Gracias por cargar tus datos! Tu solicitud quedó pendiente de revisión.</p>
          </div>
        `;
      }

      setTimeout(async () => {
        if (loaderBody) loaderBody.innerHTML = "";
        await loadVerificationTab();
      }, 2200);
    });
  }
}

// ---------- Init ----------

setupTabs();
renderEditTab();
renderPrivacyTab();
renderNotificationsTab();
renderPersonalizationTab();
