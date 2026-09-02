import type { ViewModule } from "../shell/router";
import { navigate } from "../shell/router";
import { escapeHtml } from "../lib/dom";
import { COUNTRIES } from "../lib/countries";
import { calcularEdad } from "../lib/age";
import { birthdateFieldHtml, setupBirthdatePicker } from "../lib/birthdatePicker";
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
import { DAY_LABELS as HOURS_DAY_LABELS, DAY_ABBR as HOURS_DAY_ABBR, formatHoursTime, parseBusinessHours, serializeBusinessHours, type BusinessHoursEntry } from "../lib/businessHours";
import { listTrainedExercises, type TrainedExercise } from "../services/weightLog.service";
import {
  STAT_WIDGET_CATALOG,
  MAX_BY_CATEGORY,
  parseStatWidgets,
  widgetLabel,
  widgetKey,
  exerciseIdOf,
  isExerciseScopedType,
  type StatWidget,
  type StatWidgetType,
  type StatWidgetCategory,
} from "../lib/statsWidgets";
import { isPushSupported, isIosNonStandalone, isPushEnabledForUser, enablePushNotifications, disablePushNotifications } from "../lib/pushNotifications";
import { renderMultiImageUploader, MultiImageUploader } from "../lib/multiImageUploader";
import { ARGENTINE_UNIVERSITIES } from "../lib/universities";
import { ALL_PLATFORMS, getPlatform, type SocialPlatform } from "../lib/socialLinks";
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

const VIEW_MARKUP = `
  <section class="page-hero">
    <div class="container">
      <span class="eyebrow">Tu cuenta</span>
      <h1>Configuración</h1>
      <p>Editá tu perfil, tu privacidad y tus preferencias.</p>
    </div>
  </section>

  <section class="features">
    <div class="container">
      <div class="routine-tabs" id="settingsTabs">
        <button class="routine-tab active" data-tab="edit" type="button">Editar perfil</button>
        <button class="routine-tab" data-tab="privacy" type="button">Privacidad</button>
        <button class="routine-tab" data-tab="notifications" type="button">Notificaciones</button>
        <button class="routine-tab" data-tab="personalization" type="button">Personalización</button>
        <button class="routine-tab" data-tab="blocked" type="button">Bloqueados</button>
        <button class="routine-tab" data-tab="verification" type="button" id="verificationTabBtn" hidden>Verificación</button>
      </div>

      <div id="editTab"></div>
      <div id="privacyTab" hidden></div>
      <div id="notificationsTab" hidden></div>
      <div id="personalizationTab" hidden></div>
      <div id="blockedTab" hidden></div>
      <div id="verificationTab" hidden></div>
    </div>
  </section>
`;

// mount() deja el selector de tab activo referenciado aca para que update() (?tab= distinto,
// sin desmontar la vista) pueda cambiar de pestaña sin re-pedir el perfil ni recargar las
// pestañas ya cargadas (blocked/verification quedan con su propio flag de "ya cargada").
let selectTabHandler: ((tab: string) => void) | null = null;

export const settingsView: ViewModule = {
  async mount(container, params, ctx, authUserId) {
    const userId = authUserId!; // la ruta se registra con requiresAuth:true
    container.innerHTML = VIEW_MARKUP;

    const profile = await getProfile(userId);
    if (!profile) {
      navigate("profile.html");
      return;
    }

    // ---------- Animacion de guardado (mismo lenguaje visual que el resto de la app) ----------

    function showSavedAnimation(message = "¡Cambios guardados!", durationMs = 1600): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="success-icon">
            <svg viewBox="0 0 52 52" class="success-svg">
              <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
              <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
            </svg>
          </div>
          <p>${escapeHtml(message)}</p>
        </div>
      `;
      const t = setTimeout(() => {
        loaderBody.innerHTML = "";
      }, durationMs);
      ctx.addCleanup(() => clearTimeout(t));
    }

    // ---------- Tabs ----------

    let blockedLoaded = false;
    let verificationLoaded = false;

    function setupTabs(): void {
      const tabsWrap = container.querySelector("#settingsTabs");
      const editTab = container.querySelector("#editTab")!;
      const privacyTab = container.querySelector("#privacyTab")!;
      const notificationsTab = container.querySelector("#notificationsTab")!;
      const personalizationTab = container.querySelector("#personalizationTab")!;
      const blockedTab = container.querySelector("#blockedTab")!;
      const verificationTab = container.querySelector("#verificationTab")!;
      const verificationTabBtn = container.querySelector("#verificationTabBtn") as HTMLButtonElement | null;
      if (!tabsWrap) return;

      // Gimnasio: la documentación / estado de alta se gestiona en gym-pending.html (flujo con
      // ubicación + redes), no en esta pestaña -- acá queda solo para entrenador.
      if (verificationTabBtn && profile!.user_type === "entrenador") {
        verificationTabBtn.hidden = false;
      }

      async function activateTab(tab: string): Promise<void> {
        tabsWrap!.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
        (editTab as HTMLElement).hidden = tab !== "edit";
        (privacyTab as HTMLElement).hidden = tab !== "privacy";
        (notificationsTab as HTMLElement).hidden = tab !== "notifications";
        (personalizationTab as HTMLElement).hidden = tab !== "personalization";
        (blockedTab as HTMLElement).hidden = tab !== "blocked";
        (verificationTab as HTMLElement).hidden = tab !== "verification";
        if (tab === "blocked" && !blockedLoaded) {
          blockedLoaded = true;
          await loadBlocked();
        }
        if (tab === "verification" && !verificationLoaded) {
          verificationLoaded = true;
          await loadVerificationTab();
        }
      }

      tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((btn) => {
        btn.addEventListener(
          "click",
          () => {
            void activateTab(btn.dataset.tab!);
          },
          { signal: ctx.signal }
        );
      });

      selectTabHandler = (tab: string) => void activateTab(tab);

      const requestedTab = params.get("tab");
      if (requestedTab) void activateTab(requestedTab);
    }

    // ---------- Editar perfil ----------

    const EDIT_BIRTHDATE_IDS = { dayId: "editBirthdateDay", monthId: "editBirthdateMonth", yearId: "editBirthdateYear", hiddenId: "editBirthdate" };

    function renderEditTab(): void {
      const editTab = container.querySelector("#editTab")!;
      const initialLinks = parseProfileLinks(profile!.links);
      const isGym = profile!.user_type === "gimnasio";

      editTab.innerHTML = `
        <div class="chart-card reveal">
          ${
            isGym
              ? `<div class="field"><label for="editNombre">Nombre del gimnasio</label><input type="text" id="editNombre" maxlength="80" value="${escapeHtml(profile!.nombre)}"></div>
                 <input type="hidden" id="editApellido" value="${escapeHtml(profile!.apellido)}">`
              : `<div class="field-row">
                   <div class="field"><label for="editNombre">Nombre</label><input type="text" id="editNombre" value="${escapeHtml(profile!.nombre)}"></div>
                   <div class="field"><label for="editApellido">Apellido</label><input type="text" id="editApellido" value="${escapeHtml(profile!.apellido)}"></div>
                 </div>`
          }
          <div class="field-row">
            ${
              isGym
                ? `<input type="hidden" id="editBirthdate" value="${escapeHtml(profile!.fecha_nacimiento)}">`
                : `<div class="field">
                     <label for="editBirthdateDay">Fecha de nacimiento</label>
                     ${birthdateFieldHtml(EDIT_BIRTHDATE_IDS, profile!.fecha_nacimiento)}
                   </div>`
            }
            <div class="field">
              <label for="editNationality">${isGym ? "País" : "Nacionalidad"}</label>
              <select id="editNationality">
                ${COUNTRIES.map((c) => `<option value="${escapeHtml(c)}" ${c === profile!.nacionalidad ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="field-row">
            ${
              isGym
                ? `<input type="hidden" id="editGenero" value="">`
                : `<div class="field">
                     <label for="editGenero">Género</label>
                     <select id="editGenero">
                       <option value="" ${!profile!.genero ? "selected" : ""}>Elegí una opción</option>
                       <option value="hombre" ${profile!.genero === "hombre" ? "selected" : ""}>Hombre</option>
                       <option value="mujer" ${profile!.genero === "mujer" ? "selected" : ""}>Mujer</option>
                       <option value="otro" ${profile!.genero === "otro" ? "selected" : ""}>Otro</option>
                     </select>
                   </div>`
            }
            <div class="field">
              <label for="editProvincia">Provincia</label>
              <input type="text" id="editProvincia" placeholder="Ej: Tucumán" value="${escapeHtml(profile!.provincia ?? "")}">
            </div>
          </div>
          <div class="field">
            <label for="editCiudad">Ciudad (opcional)</label>
            <input type="text" id="editCiudad" placeholder="Ej: San Miguel de Tucumán" value="${escapeHtml(profile!.ciudad ?? "")}">
          </div>
          ${
            isGym
              ? `<div class="field">
                   <label for="editAddress">Ubicación</label>
                   <input type="text" id="editAddress" maxlength="300" placeholder="Calle, número, ciudad, provincia" value="${escapeHtml(profile!.address ?? "")}">
                 </div>
                 <div class="field">
                   <label for="editMapsUrl">Link de Google Maps (opcional)</label>
                   <input type="text" id="editMapsUrl" maxlength="500" placeholder="https://maps.google.com/..." value="${escapeHtml(profile!.maps_url ?? "")}">
                 </div>`
              : ""
          }
          <div class="field">
            <label for="editBio">Biografía</label>
            <textarea id="editBio" rows="3" maxlength="${MAX_BIO_LENGTH}">${escapeHtml(profile!.bio ?? "")}</textarea>
            <p class="char-counter" id="bioCounter">${(profile!.bio ?? "").length}/${MAX_BIO_LENGTH}</p>
          </div>
          <div class="field">
            <label>Redes y enlaces</label>
            <p class="chart-sub" style="margin:0 0 10px;">Agregá tus redes para que aparezcan como iconos en tu perfil, estilo Instagram.</p>
            <div id="linksEditor"></div>
            <div class="settings-link-picker" id="linkPicker"></div>
          </div>

          ${
            profile!.user_type === "gimnasio"
              ? `
          <div class="field">
            <label>Horario</label>
            <p class="chart-sub" style="margin:0 0 10px;">Se muestra en tu perfil público.</p>
            <div class="class-session-chips" id="hoursChips"></div>
            <div class="class-session-form">
              <div class="field"><label for="hoursDay">Día</label>
                <select id="hoursDay">${HOURS_DAY_LABELS.map((d, i) => `<option value="${i}">${d}</option>`).join("")}</select>
              </div>
              <div class="field"><label for="hoursOpens">Desde</label><input type="time" id="hoursOpens" value="08:00"></div>
              <div class="field"><label for="hoursCloses">Hasta</label><input type="time" id="hoursCloses" value="22:00"></div>
              <button type="button" class="btn btn-outline btn-sm" id="addHoursBtn">+ Agregar</button>
            </div>
          </div>
          `
              : ""
          }

          <div class="alert_message" id="editAlert"></div>
          <div class="settings-actions"><button class="btn btn-primary btn-sm" id="saveEditBtn" type="button">Guardar cambios</button></div>
        </div>
      `;

      if (!isGym) setupBirthdatePicker(EDIT_BIRTHDATE_IDS);

      const bioField = container.querySelector("#editBio") as HTMLTextAreaElement;
      const bioCounter = container.querySelector("#bioCounter")!;
      bioField.addEventListener("input", () => {
        bioCounter.textContent = `${bioField.value.length}/${MAX_BIO_LENGTH}`;
      });

      const currentLinks: ProfileLink[] = [...initialLinks];
      renderLinksEditor();

      const businessHours: BusinessHoursEntry[] = parseBusinessHours(profile!.business_hours);

      function renderHoursChips(): void {
        const chipsEl = container.querySelector("#hoursChips");
        if (!chipsEl) return;
        chipsEl.innerHTML = businessHours
          .map(
            (h, i) => `
          <span class="class-session-chip" data-i="${i}">
            ${HOURS_DAY_ABBR[h.dayOfWeek]} ${formatHoursTime(h.opens)}-${formatHoursTime(h.closes)}
            <button type="button" data-i="${i}" aria-label="Quitar horario">×</button>
          </span>
        `
          )
          .join("");
        chipsEl.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
          btn.addEventListener("click", () => {
            businessHours.splice(Number(btn.dataset.i), 1);
            renderHoursChips();
          });
        });
      }
      renderHoursChips();

      container.querySelector("#addHoursBtn")?.addEventListener("click", () => {
        const day = Number((container.querySelector("#hoursDay") as HTMLSelectElement).value);
        const opens = (container.querySelector("#hoursOpens") as HTMLInputElement).value;
        const closes = (container.querySelector("#hoursCloses") as HTMLInputElement).value;
        if (!opens || !closes || opens >= closes) {
          alert("El horario de cierre tiene que ser después del de apertura.");
          return;
        }
        businessHours.push({ dayOfWeek: day, opens, closes });
        renderHoursChips();
      });

      function iconSvg(platform: SocialPlatform): string {
        return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${platform.icon}</svg>`;
      }

      function renderLinksEditor(): void {
        const linksEditorEl = container.querySelector("#linksEditor")!;
        linksEditorEl.innerHTML = currentLinks
          .map((l, i) => {
            const platform = getPlatform(l.platform);
            const isOther = platform.key === "other";
            return `
          <div class="settings-link-row" data-index="${i}">
            <span class="settings-link-icon">${iconSvg(platform)}</span>
            ${
              isOther
                ? `<input type="text" class="link-label" placeholder="Nombre (ej: Mi web)" value="${escapeHtml(l.label)}">
                   <input type="text" class="link-url" placeholder="${escapeHtml(platform.placeholder)}" value="${escapeHtml(l.url)}">`
                : `<span class="settings-link-prefix">${escapeHtml(platform.inputPrefix ?? "")}</span>
                   <input type="text" class="link-handle" placeholder="${escapeHtml(platform.placeholder)}" value="${escapeHtml(platform.extractHandle(l.url))}">`
            }
            <button type="button" class="settings-link-remove" data-index="${i}" aria-label="Quitar enlace">×</button>
          </div>
        `;
          })
          .join("");

        linksEditorEl.querySelectorAll<HTMLButtonElement>(".settings-link-remove").forEach((btn) => {
          btn.addEventListener("click", () => {
            currentLinks.splice(Number(btn.dataset.index), 1);
            renderLinksEditor();
          });
        });

        // Sincroniza cada tecleo con currentLinks (no solo al guardar): agregar o quitar
        // otro enlace reconstruye este innerHTML desde currentLinks, y si no estuviera
        // sincronizado se perdería lo ya tipeado en las filas existentes.
        linksEditorEl.querySelectorAll<HTMLDivElement>(".settings-link-row").forEach((row) => {
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

        renderLinkPicker();
      }

      function renderLinkPicker(): void {
        const picker = container.querySelector("#linkPicker")!;
        const usedKeys = new Set(currentLinks.map((l) => l.platform ?? "other"));
        const atLimit = currentLinks.length >= MAX_PROFILE_LINKS;
        picker.innerHTML = ALL_PLATFORMS.filter((p) => p.key === "other" || !usedKeys.has(p.key))
          .map(
            (p) => `
          <button type="button" class="exc-pick-chip link-add-chip" data-platform="${p.key}" ${atLimit ? "disabled" : ""}>
            ${iconSvg(p)} ${escapeHtml(p.label)}
          </button>
        `
          )
          .join("");

        picker.querySelectorAll<HTMLButtonElement>(".link-add-chip").forEach((btn) => {
          btn.addEventListener("click", () => {
            if (currentLinks.length >= MAX_PROFILE_LINKS) return;
            const platform = getPlatform(btn.dataset.platform);
            currentLinks.push({ platform: platform.key, label: platform.label, url: "" });
            renderLinksEditor();
            container
              .querySelector("#linksEditor")!
              .querySelector<HTMLInputElement>(".settings-link-row:last-child .link-handle, .settings-link-row:last-child .link-label")
              ?.focus();
          });
        });
      }

      container.querySelector("#saveEditBtn")?.addEventListener("click", async () => {
        const alertBox = container.querySelector("#editAlert")!;
        alertBox.innerHTML = "";

        const nombre = (container.querySelector("#editNombre") as HTMLInputElement).value.trim();
        const apellido = (container.querySelector("#editApellido") as HTMLInputElement).value.trim();
        const fechaNacimiento = (container.querySelector("#editBirthdate") as HTMLInputElement).value;
        const nacionalidad = (container.querySelector("#editNationality") as HTMLSelectElement).value;
        const genero = (container.querySelector("#editGenero") as HTMLSelectElement).value as "hombre" | "mujer" | "otro" | "";
        const provincia = (container.querySelector("#editProvincia") as HTMLInputElement).value.trim();
        const ciudad = (container.querySelector("#editCiudad") as HTMLInputElement).value.trim();
        const bio = bioField.value.trim();
        const address = ((container.querySelector("#editAddress") as HTMLInputElement | null)?.value ?? "").trim();
        let mapsUrl = ((container.querySelector("#editMapsUrl") as HTMLInputElement | null)?.value ?? "").trim();

        if (nombre.length < 2 || !Number.isNaN(Number(nombre))) {
          alertBox.innerHTML = `<p>Ingresaste un ${isGym ? "nombre de gimnasio" : "nombre"} inválido.</p>`;
          return;
        }
        if (!isGym) {
          if (apellido.length < 2 || !Number.isNaN(Number(apellido))) {
            alertBox.innerHTML = "<p>Ingresaste un apellido inválido.</p>";
            return;
          }
          if (!fechaNacimiento || calcularEdad(fechaNacimiento) < 12 || calcularEdad(fechaNacimiento) > 100) {
            alertBox.innerHTML = "<p>Ingresá una fecha de nacimiento válida.</p>";
            return;
          }
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

        const newLinks: ProfileLink[] = [];
        for (const l of currentLinks) {
          const platform = getPlatform(l.platform);
          if (platform.key === "other") {
            const label = l.label.trim();
            let url = l.url.trim();
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
            newLinks.push({ platform: "other", label, url });
          } else {
            const handle = l.url.trim();
            if (!handle) continue;
            const url = platform.buildUrl(handle);
            if (!url) continue;
            newLinks.push({ platform: platform.key, label: platform.label, url });
          }
        }

        const gymExtra = isGym
          ? {
              business_hours: serializeBusinessHours(businessHours) as unknown as Profile["business_hours"],
              address: address || null,
              maps_url: mapsUrl || null,
            }
          : {};

        const { error } = await updateProfileFields(userId, {
          nombre,
          apellido,
          fecha_nacimiento: fechaNacimiento,
          nacionalidad,
          genero: genero || null,
          provincia: provincia || null,
          ciudad: ciudad || null,
          bio: bio || null,
          links: newLinks as unknown as Profile["links"],
          ...gymExtra,
        });
        if (error) {
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }

        Object.assign(profile!, {
          nombre,
          apellido,
          fecha_nacimiento: fechaNacimiento,
          nacionalidad,
          genero: genero || null,
          provincia: provincia || null,
          ciudad: ciudad || null,
          bio: bio || null,
          links: newLinks,
          ...(isGym ? { business_hours: serializeBusinessHours(businessHours), address: address || null, maps_url: mapsUrl || null } : {}),
        });
        showSavedAnimation();
      });
    }

    // ---------- Privacidad y cuenta ----------

    function renderPrivacyTab(): void {
      const privacyTab = container.querySelector("#privacyTab")!;
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
          <div class="settings-toggle-row">
            <div>
              <span class="switch-label">Última conexión</span>
              <p class="chart-sub" style="margin:4px 0 0;">Si lo desactivás, dejás de ver la última conexión de los demás (aunque ellos lo tengan activado).</p>
            </div>
            <label class="switch">
              <input type="checkbox" id="lastSeenToggle" ${profile!.show_last_seen ? "checked" : ""}>
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="settings-toggle-row">
            <div>
              <span class="switch-label">Confirmaciones de lectura (tick azul)</span>
              <p class="chart-sub" style="margin:4px 0 0;">Si lo desactivás, dejás de ver cuándo leen tus mensajes (aunque el otro lo tenga activado).</p>
            </div>
            <label class="switch">
              <input type="checkbox" id="readReceiptsToggle" ${profile!.show_read_receipts ? "checked" : ""}>
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

      container.querySelector("#visibilityToggle")?.addEventListener("change", async (e) => {
        const alertBox = container.querySelector("#privacyAlert")!;
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

      container.querySelector("#lastSeenToggle")?.addEventListener("change", async (e) => {
        const alertBox = container.querySelector("#privacyAlert")!;
        alertBox.innerHTML = "";
        const toggle = e.target as HTMLInputElement;
        const showLastSeen = toggle.checked;
        toggle.disabled = true;
        const { error } = await updateProfileFields(userId, { show_last_seen: showLastSeen });
        toggle.disabled = false;
        if (error) {
          toggle.checked = !showLastSeen;
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }
        profile!.show_last_seen = showLastSeen;
      });

      container.querySelector("#readReceiptsToggle")?.addEventListener("change", async (e) => {
        const alertBox = container.querySelector("#privacyAlert")!;
        alertBox.innerHTML = "";
        const toggle = e.target as HTMLInputElement;
        const showReadReceipts = toggle.checked;
        toggle.disabled = true;
        const { error } = await updateProfileFields(userId, { show_read_receipts: showReadReceipts });
        toggle.disabled = false;
        if (error) {
          toggle.checked = !showReadReceipts;
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }
        profile!.show_read_receipts = showReadReceipts;
      });

      container.querySelector("#saveAccountBtn")?.addEventListener("click", async () => {
        const alertBox = container.querySelector("#accountAlert")!;
        alertBox.innerHTML = "";
        const mail = (container.querySelector("#mailField") as HTMLInputElement).value.trim();
        const pass = (container.querySelector("#pswd") as HTMLInputElement).value;
        const pass2 = (container.querySelector("#pswd2") as HTMLInputElement).value;

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
        showSavedAnimation(mail ? "¡Guardado! Si cambiaste el mail, revisá tu casilla para confirmarlo." : "¡Cambios guardados!", mail ? 2600 : 1600);
        (container.querySelector("#mailField") as HTMLInputElement).value = "";
        (container.querySelector("#pswd") as HTMLInputElement).value = "";
        (container.querySelector("#pswd2") as HTMLInputElement).value = "";
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

    // El estado de "activada/desactivada" vive en el navegador (permiso + suscripcion),
    // no en el perfil -- por eso es una seccion aparte de los toggles de notification_prefs
    // (esos gatean que se genere la notificacion; esto gatea si tu dispositivo la recibe como push).
    async function pushSectionMarkup(): Promise<string> {
      if (isIosNonStandalone()) {
        return `
          <div class="settings-toggle-row">
            <div>
              <span class="switch-label">Notificaciones push</span>
              <p class="chart-sub" style="margin:4px 0 0;">En iPhone, agregá esta web a tu pantalla de inicio (Compartir → Añadir a inicio) para poder activarlas.</p>
            </div>
          </div>
        `;
      }
      if (!isPushSupported()) {
        return `
          <div class="settings-toggle-row">
            <div>
              <span class="switch-label">Notificaciones push</span>
              <p class="chart-sub" style="margin:4px 0 0;">Tu navegador no soporta notificaciones push.</p>
            </div>
          </div>
        `;
      }
      if (Notification.permission === "denied") {
        return `
          <div class="settings-toggle-row">
            <div>
              <span class="switch-label">Notificaciones push</span>
              <p class="chart-sub" style="margin:4px 0 0;">Bloqueaste el permiso de notificaciones. Activalo desde la configuración del navegador para poder recibirlas.</p>
            </div>
          </div>
        `;
      }

      const enabled = await isPushEnabledForUser(userId);
      return `
        <div class="settings-toggle-row">
          <div>
            <span class="switch-label">Notificaciones push</span>
            <p class="chart-sub" style="margin:4px 0 0;">Recibí avisos en este dispositivo aunque no tengas la web abierta: mensajes de chat, me gusta, comentarios, seguidores y más.</p>
          </div>
          <label class="switch">
            <input type="checkbox" id="pushToggle" ${enabled ? "checked" : ""} aria-label="Notificaciones push">
            <span class="switch-track"></span>
          </label>
        </div>
      `;
    }

    async function renderNotificationsTab(): Promise<void> {
      const notificationsTab = container.querySelector("#notificationsTab")!;
      const prefs = parseNotificationPrefs(profile!.notification_prefs);

      const items: { key: keyof NotificationPrefs; label: string }[] = [
        { key: "likes", label: "Me gusta en tus publicaciones" },
        { key: "comments", label: "Comentarios en tus publicaciones" },
        { key: "follows", label: "Nuevos seguidores y suscripciones" },
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
        <div class="chart-card reveal">
          <h3>Recordatorio de clases</h3>
          <p class="chart-sub">Si estás inscripto en una clase de un gimnasio, te avisamos antes de que empiece.</p>
          <div class="field">
            <label for="classReminderSelect">Avisarme</label>
            <select id="classReminderSelect">
              <option value="">No avisarme</option>
              <option value="5">5 minutos antes</option>
              <option value="10">10 minutos antes</option>
              <option value="15">15 minutos antes</option>
              <option value="30">30 minutos antes</option>
              <option value="60">1 hora antes</option>
            </select>
          </div>
          <div class="alert_message" id="classReminderAlert"></div>
        </div>
        <div class="chart-card reveal" id="pushSection">
          <h3>Push en este dispositivo</h3>
          <p class="chart-sub">Cargando...</p>
          <div class="alert_message" id="pushAlert"></div>
        </div>
      `;

      notificationsTab.querySelectorAll<HTMLInputElement>(".notif-toggle").forEach((toggle) => {
        toggle.addEventListener("change", async () => {
          const alertBox = container.querySelector("#notifAlert")!;
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

      const classReminderSelect = container.querySelector("#classReminderSelect") as HTMLSelectElement | null;
      if (classReminderSelect) {
        classReminderSelect.value = profile!.class_reminder_minutes != null ? String(profile!.class_reminder_minutes) : "";
        classReminderSelect.addEventListener("change", async () => {
          const alertBox = container.querySelector("#classReminderAlert")!;
          alertBox.innerHTML = "";
          const minutes = classReminderSelect.value ? Number(classReminderSelect.value) : null;
          classReminderSelect.disabled = true;
          const { error } = await updateProfileFields(userId, { class_reminder_minutes: minutes });
          classReminderSelect.disabled = false;
          if (error) {
            classReminderSelect.value = profile!.class_reminder_minutes != null ? String(profile!.class_reminder_minutes) : "";
            alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
            return;
          }
          profile!.class_reminder_minutes = minutes;
        });
      }

      const pushSection = container.querySelector("#pushSection")!;
      const pushMarkup = await pushSectionMarkup();
      pushSection.innerHTML = `<h3>Push en este dispositivo</h3>${pushMarkup}<div class="alert_message" id="pushAlert"></div>`;

      pushSection.querySelector<HTMLInputElement>("#pushToggle")?.addEventListener("change", async (e) => {
        const toggle = e.target as HTMLInputElement;
        const alertBox = container.querySelector("#pushAlert")!;
        alertBox.innerHTML = "";
        toggle.disabled = true;
        if (toggle.checked) {
          const { error } = await enablePushNotifications(userId);
          if (error) {
            toggle.checked = false;
            alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          }
        } else {
          await disablePushNotifications();
        }
        toggle.disabled = false;
      });
    }

    // ---------- Personalizacion ----------

    // Nombres de los ejercicios que este usuario entreno alguna vez, para resolver el label
    // de un widget "Progreso por ejercicio" con exerciseId puntual (tanto en la lista actual
    // como en el selector de "+ Agregar") sin traer weight_logs completo -- ver
    // list_trained_exercises (RPC dedicada, evita el limite de 1000 filas de una cuenta con
    // mucho historial solo para sacar nombres unicos).
    let trainedExercisesCache: TrainedExercise[] | null = null;
    async function getTrainedExercises(): Promise<TrainedExercise[]> {
      if (!trainedExercisesCache) trainedExercisesCache = await listTrainedExercises().catch(() => []);
      return trainedExercisesCache;
    }

    const CATEGORY_LABEL: Record<StatWidgetCategory, string> = { card: "tarjeta", chart: "gráfico" };
    const CATEGORY_LABEL_PLURAL: Record<StatWidgetCategory, string> = { card: "tarjetas", chart: "gráficos" };

    async function renderPersonalizationTab(): Promise<void> {
      const personalizationTab = container.querySelector("#personalizationTab")!;

      // Edicion en borrador: los cambios (toggle, agregar/sacar widgets) NO se guardan solos --
      // se acumulan aca y recien se persisten con el boton "Guardar cambios" (pedido explicito
      // del usuario: antes cada click pegaba a la base al toque). saved* es el ultimo estado
      // confirmado contra la base, usado tanto para "Cancelar" como para decidir si mostrar la
      // barra de guardado (ver isDirty).
      let savedShowStats = profile!.show_stats;
      let savedWidgets = parseStatWidgets(profile!.stats_widgets);
      let showStatsDraft = savedShowStats;
      let widgetsDraft = [...savedWidgets];

      const trainedExercises = await getTrainedExercises();
      const exerciseNameOf = (id: string | null): string | null => (id ? (trainedExercises.find((e) => e.id === id)?.name ?? "Ejercicio") : null);

      function categoryWidgets(category: StatWidgetCategory): StatWidget[] {
        return widgetsDraft.filter((w) => STAT_WIDGET_CATALOG.find((c) => c.type === w.type)!.category === category);
      }

      // No compara con JSON.stringify: jsonb en Postgres no garantiza mantener el orden de
      // claves de cada objeto tal cual se escribio, asi que el mismo widget podria volver de
      // la base con las claves en otro orden y disparar un falso "sucio". widgetKey da un
      // string canonico por widget, insensible a eso.
      function isDirty(): boolean {
        if (showStatsDraft !== savedShowStats) return true;
        const a = savedWidgets.map(widgetKey);
        const b = widgetsDraft.map(widgetKey);
        return a.length !== b.length || a.some((k, i) => k !== b[i]);
      }

      function widgetsListMarkup(category: StatWidgetCategory): string {
        const items = categoryWidgets(category);
        if (items.length === 0) return `<p class="exc-pick-empty">No tenés ${CATEGORY_LABEL_PLURAL[category]} seleccionadas.</p>`;
        return items
          .map((w) => {
            const idx = widgetsDraft.indexOf(w);
            return `
          <div class="settings-blocked-row" data-index="${idx}">
            <span><strong>${escapeHtml(widgetLabel(w, exerciseNameOf(exerciseIdOf(w) ?? null)))}</strong></span>
            <button class="btn btn-outline btn-sm remove-widget-btn" data-index="${idx}" type="button">Quitar</button>
          </div>
        `;
          })
          .join("");
      }

      function addRowMarkup(category: StatWidgetCategory): string {
        const items = categoryWidgets(category);
        const max = MAX_BY_CATEGORY[category];
        if (items.length >= max) return `<p class="chart-sub">Llegaste al máximo de ${max} ${CATEGORY_LABEL_PLURAL[category]}.</p>`;
        const addableTypes = STAT_WIDGET_CATALOG.filter((c) => c.category === category && (c.allowMultiple || !widgetsDraft.some((w) => w.type === c.type)));
        if (addableTypes.length === 0) return "";
        // Cada categoria tiene a lo sumo un tipo "exercise-scoped" (progreso por ejercicio en
        // graficos, peso maximo en tarjetas) -- el set de exclusion es por ESE tipo puntual, no
        // por categoria entera: agregar "Peso máximo: Sentadilla" (tarjeta) no debe sacar
        // "Sentadilla" del selector de "Progreso por ejercicio" (grafico), son widgets distintos.
        const exerciseScopedType = addableTypes.find((c) => isExerciseScopedType(c.type))?.type;
        const usedExerciseIds = new Set(exerciseScopedType ? widgetsDraft.filter((w) => w.type === exerciseScopedType).map((w) => exerciseIdOf(w)) : []);
        const typeSelectId = category === "card" ? "addCardType" : "addChartType";
        const excSelectId = category === "card" ? "addCardExercise" : "addChartExercise";
        const confirmId = category === "card" ? "addCardConfirm" : "addChartConfirm";
        return `
          <div class="settings-add-widget">
            <select id="${typeSelectId}" aria-label="Elegir ${CATEGORY_LABEL[category]} a agregar">
              <option value="">+ Agregar ${CATEGORY_LABEL[category]}</option>
              ${addableTypes.map((c) => `<option value="${c.type}">${escapeHtml(c.label)}</option>`).join("")}
            </select>
            ${
              exerciseScopedType
                ? `<select id="${excSelectId}" aria-label="Elegir ejercicio" hidden>
              ${!usedExerciseIds.has(null) ? `<option value="">Automático (el más entrenado)</option>` : ""}
              ${trainedExercises
                .filter((e) => !usedExerciseIds.has(e.id))
                .map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`)
                .join("")}
            </select>`
                : ""
            }
            <button class="btn btn-primary btn-sm" id="${confirmId}" type="button" disabled>Agregar</button>
          </div>
        `;
      }

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

        <div class="chart-card reveal">
          <h3>Personalización del perfil</h3>
          <div class="settings-toggle-row">
            <div>
              <span class="switch-label">Mostrar estadísticas en tu perfil</span>
              <p class="chart-sub" style="margin:4px 0 0;">Si lo apagás, en "Tu actividad" vas a ver directamente tus Reps en vez de la pestaña de Estadísticas (también para vos, no solo para las visitas).</p>
            </div>
            <label class="switch">
              <input type="checkbox" id="showStatsToggle" ${showStatsDraft ? "checked" : ""}>
              <span class="switch-track"></span>
            </label>
          </div>
          <div id="statsWidgetsSection" ${showStatsDraft ? "" : "hidden"}>
            <div class="settings-widget-group">
              <h4>Tarjetas <span class="chart-sub">(máx. ${MAX_BY_CATEGORY.card})</span></h4>
              <div id="statsCardsList">${widgetsListMarkup("card")}</div>
              <div id="addCardWrap">${addRowMarkup("card")}</div>
            </div>
            <div class="settings-widget-group">
              <h4>Gráficos <span class="chart-sub">(máx. ${MAX_BY_CATEGORY.chart})</span></h4>
              <div id="statsChartsList">${widgetsListMarkup("chart")}</div>
              <div id="addChartWrap">${addRowMarkup("chart")}</div>
            </div>
          </div>
          <div class="settings-save-bar" id="statsSaveBar" hidden>
            <span class="chart-sub">Tenés cambios sin guardar.</span>
            <div class="settings-save-bar-actions">
              <button class="btn btn-outline btn-sm" id="statsCancelBtn" type="button">Cancelar</button>
              <button class="btn btn-primary btn-sm" id="statsSaveBtn" type="button">Guardar cambios</button>
            </div>
          </div>
          <div class="alert_message" id="statsWidgetsAlert"></div>
        </div>
      `;

      container.querySelector("#zoomToggle")?.addEventListener("change", async (e) => {
        const alertBox = container.querySelector("#personalizationAlert")!;
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

      function syncSaveBar(): void {
        const bar = container.querySelector("#statsSaveBar") as HTMLElement | null;
        if (bar) bar.hidden = !isDirty();
      }

      function refreshWidgetsDom(): void {
        const cardsList = container.querySelector("#statsCardsList");
        if (cardsList) cardsList.innerHTML = widgetsListMarkup("card");
        const addCardWrap = container.querySelector("#addCardWrap");
        if (addCardWrap) addCardWrap.innerHTML = addRowMarkup("card");
        const chartsList = container.querySelector("#statsChartsList");
        if (chartsList) chartsList.innerHTML = widgetsListMarkup("chart");
        const addChartWrap = container.querySelector("#addChartWrap");
        if (addChartWrap) addChartWrap.innerHTML = addRowMarkup("chart");
        wireDynamicControls();
        syncSaveBar();
      }

      function wireAddRow(category: StatWidgetCategory): void {
        const typeSelect = container.querySelector(category === "card" ? "#addCardType" : "#addChartType") as HTMLSelectElement | null;
        const excSelect = container.querySelector(category === "card" ? "#addCardExercise" : "#addChartExercise") as HTMLSelectElement | null;
        const confirmBtn = container.querySelector(category === "card" ? "#addCardConfirm" : "#addChartConfirm") as HTMLButtonElement | null;
        if (!typeSelect || !confirmBtn) return;

        function sync(): void {
          const type = typeSelect!.value as StatWidgetType | "";
          confirmBtn!.disabled = !type;
          if (excSelect) excSelect.hidden = !type || !isExerciseScopedType(type);
        }
        sync();
        typeSelect.addEventListener("change", sync);

        confirmBtn.addEventListener("click", () => {
          const type = typeSelect.value as StatWidgetType | "";
          if (!type) return;
          const newWidget: StatWidget = isExerciseScopedType(type) ? { type, exerciseId: excSelect?.value || null } : { type };
          if (widgetsDraft.some((w) => widgetKey(w) === widgetKey(newWidget))) return;
          widgetsDraft.push(newWidget);
          refreshWidgetsDom();
        });
      }

      function wireDynamicControls(): void {
        container.querySelectorAll<HTMLButtonElement>(".remove-widget-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            const idx = Number(btn.dataset.index);
            widgetsDraft.splice(idx, 1);
            refreshWidgetsDom();
          });
        });
        wireAddRow("card");
        wireAddRow("chart");
      }

      wireDynamicControls();

      container.querySelector("#showStatsToggle")?.addEventListener("change", (e) => {
        showStatsDraft = (e.target as HTMLInputElement).checked;
        const section = container.querySelector("#statsWidgetsSection") as HTMLElement | null;
        if (section) section.hidden = !showStatsDraft;
        syncSaveBar();
      });

      container.querySelector("#statsCancelBtn")?.addEventListener("click", () => {
        showStatsDraft = savedShowStats;
        widgetsDraft = [...savedWidgets];
        const toggle = container.querySelector("#showStatsToggle") as HTMLInputElement | null;
        if (toggle) toggle.checked = showStatsDraft;
        const section = container.querySelector("#statsWidgetsSection") as HTMLElement | null;
        if (section) section.hidden = !showStatsDraft;
        container.querySelector("#statsWidgetsAlert")!.innerHTML = "";
        refreshWidgetsDom();
      });

      container.querySelector("#statsSaveBtn")?.addEventListener("click", async () => {
        const saveBtn = container.querySelector("#statsSaveBtn") as HTMLButtonElement | null;
        const alertBox = container.querySelector("#statsWidgetsAlert")!;
        alertBox.innerHTML = "";
        if (saveBtn) saveBtn.disabled = true;
        const { error } = await updateProfileFields(userId, {
          show_stats: showStatsDraft,
          stats_widgets: widgetsDraft as unknown as Profile["stats_widgets"],
        });
        if (saveBtn) saveBtn.disabled = false;
        if (error) {
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }
        profile!.show_stats = showStatsDraft;
        profile!.stats_widgets = widgetsDraft as unknown as Profile["stats_widgets"];
        savedShowStats = showStatsDraft;
        savedWidgets = [...widgetsDraft];
        syncSaveBar();
        showSavedAnimation();
      });
    }

    // ---------- Usuarios bloqueados ----------

    async function loadBlocked(): Promise<void> {
      const blockedTab = container.querySelector("#blockedTab")!;
      blockedTab.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando...</p></div>`;
      const blocked = await listBlockedUsers(userId);
      renderBlockedTab(blocked);
    }

    function renderBlockedTab(blocked: BlockedUserRow[]): void {
      const blockedTab = container.querySelector("#blockedTab")!;
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

    async function loadVerificationTab(): Promise<void> {
      const verificationTab = container.querySelector("#verificationTab")!;
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

    async function renderVerificationTab(request: VerificationRequest | null): Promise<void> {
      const verificationTab = container.querySelector("#verificationTab")!;
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

        function renderCredentialsEditor(): void {
          const editor = container.querySelector("#credentialsEditor");
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

          const addBtn = container.querySelector("#addCredentialBtn") as HTMLButtonElement | null;
          if (addBtn) addBtn.disabled = currentCredentials.length >= MAX_CREDENTIALS;
        }

        if (!isGimnasio) {
          renderCredentialsEditor();
          container.querySelector("#addCredentialBtn")?.addEventListener("click", () => {
            if (currentCredentials.length >= MAX_CREDENTIALS) return;
            currentCredentials.push(emptyCredential());
            renderCredentialsEditor();
          });
        }

        const mount = container.querySelector("#verifDocsUploader")!;
        mount.innerHTML = renderMultiImageUploader("verifDocsUploader", MAX_VERIFICATION_DOCUMENTS);
        const uploader = new MultiImageUploader("verifDocsUploader", MAX_VERIFICATION_DOCUMENTS);
        uploader.seedExisting(documentUrls.filter((d): d is { path: string; url: string } => Boolean(d.url)));

        container.querySelector("#verifSaveBtn")?.addEventListener("click", async () => {
          const alertBox = container.querySelector("#verifAlert")!;
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

          const saveBtn = container.querySelector("#verifSaveBtn") as HTMLButtonElement;
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

          const t = setTimeout(async () => {
            if (loaderBody) loaderBody.innerHTML = "";
            await loadVerificationTab();
          }, 2200);
          ctx.addCleanup(() => clearTimeout(t));
        });
      }
    }

    // ---------- Init ----------

    setupTabs();
    renderEditTab();
    renderPrivacyTab();
    void renderNotificationsTab();
    void renderPersonalizationTab();

    ctx.addCleanup(() => {
      selectTabHandler = null;
    });
  },
  update(params) {
    const tab = params.get("tab");
    if (tab) selectTabHandler?.(tab);
  },
};
