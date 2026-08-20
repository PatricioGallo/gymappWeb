import { escapeHtml } from "./dom";
import { deletePostMedia } from "../services/post.service";
import {
  createGymPost,
  validateGymPostForm,
  uploadGymPostMedia,
  validateGymMediaVideoDuration,
  classifyGymMediaFile,
  GYM_POST_MEDIA_MAX,
  type GymPostVisibility,
  type GymPostMediaKind,
} from "../services/gymPost.service";

function closeOverlay(): void {
  const loaderBody = document.getElementById("loaderBody");
  if (loaderBody) loaderBody.innerHTML = "";
}

const VIDEO_BADGE_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none"><path d="M4 6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2.5l4.3-2.6A1 1 0 0 1 22 6.7v10.6a1 1 0 0 1-1.5.87L16 15.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z"/></svg>`;
const ADD_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

interface PendingGymMedia {
  id: string;
  previewUrl: string;
  kind: GymPostMediaKind;
  status: "uploading" | "ready" | "error";
  uploadedUrl?: string;
  uploadedPath?: string;
  errorMessage?: string;
}

/** Modal "Agregar publicación": descripción, ubicación opcional, 1-10 fotos/videos (obligatorio al menos uno, suben apenas se eligen), visibilidad y cross-post opcional como Rep. */
export function openCreateGymPostModal(gymId: string, onCreated: (postId: string) => void): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card modal-card-lg">
        <h2>Nueva publicación</h2>
        <form id="gymPostForm">
          <div class="field"><label for="gymPostContent">Descripción</label><textarea id="gymPostContent" rows="3" maxlength="1000" placeholder="Contale algo a tus socios..."></textarea></div>
          <div class="field"><label for="gymPostLocation">Ubicación (opcional)</label><input type="text" id="gymPostLocation" maxlength="120" placeholder="Ej: Sede Palermo"></div>

          <div class="field">
            <label>Fotos o videos</label>
            <div class="gym-post-media-picker">
              <div class="gym-post-media-strip" id="gymPostMediaStrip"></div>
              <label class="gym-post-media-add" id="gymPostMediaAddTile">
                <input type="file" id="gymPostMediaInput" accept="image/*,video/*" multiple hidden>
                ${ADD_ICON}
                <span>Agregar</span>
              </label>
            </div>
            <span class="field-hint">JPG, PNG, WEBP o video · hasta ${GYM_POST_MEDIA_MAX} archivos</span>
          </div>

          <div class="field"><label for="gymPostVisibility">Quién puede verla</label>
            <select id="gymPostVisibility">
              <option value="public" selected>Pública</option>
              <option value="socios">Solo socios</option>
              <option value="entrenadores">Solo entrenadores</option>
            </select>
          </div>

          <label class="member-accept-option">
            <input type="checkbox" id="gymPostCrossPost">
            Publicar también como Rep en tu feed
          </label>

          <div class="alert_message" id="gymPostAlert"></div>
          <div class="modal-actions">
            <button class="btn btn-primary" id="gymPostSubmit" type="submit">Publicar</button>
            <button class="btn btn-outline" id="gymPostCancel" type="button">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  let items: PendingGymMedia[] = [];

  function cleanupItem(item: PendingGymMedia): void {
    URL.revokeObjectURL(item.previewUrl);
    if (item.status === "ready" && item.uploadedPath) void deletePostMedia(item.uploadedPath);
  }

  function updateSubmitState(): void {
    const submitBtn = document.getElementById("gymPostSubmit") as HTMLButtonElement | null;
    if (submitBtn) submitBtn.disabled = items.some((i) => i.status === "uploading");
  }

  function renderStrip(): void {
    const strip = document.getElementById("gymPostMediaStrip");
    const addTile = document.getElementById("gymPostMediaAddTile");
    if (!strip) return;
    strip.innerHTML = items
      .map(
        (item) => `
      <div class="gym-post-media-thumb" data-id="${item.id}">
        ${
          item.kind === "video"
            ? `<video src="${escapeHtml(item.previewUrl)}" muted playsinline></video><span class="gym-post-media-video-badge">${VIDEO_BADGE_ICON}</span>`
            : `<img src="${escapeHtml(item.previewUrl)}" alt="">`
        }
        ${item.status === "uploading" ? `<div class="gym-post-media-thumb-overlay"><div class="modern-spinner"></div></div>` : ""}
        ${
          item.status === "error"
            ? `<div class="gym-post-media-thumb-overlay gym-post-media-thumb-error" title="${escapeHtml(item.errorMessage || "No se pudo subir.")}">✕</div>`
            : ""
        }
        <button type="button" class="gym-post-media-remove" data-id="${item.id}" aria-label="Quitar">×</button>
      </div>
    `
      )
      .join("");
    strip.querySelectorAll<HTMLButtonElement>(".gym-post-media-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = items.find((i) => i.id === btn.dataset.id);
        if (!item) return;
        cleanupItem(item);
        items = items.filter((i) => i.id !== btn.dataset.id);
        renderStrip();
      });
    });
    if (addTile) addTile.classList.toggle("is-hidden", items.length >= GYM_POST_MEDIA_MAX);
    updateSubmitState();
  }

  async function addFiles(fileList: FileList): Promise<void> {
    const remaining = GYM_POST_MEDIA_MAX - items.length;
    if (remaining <= 0) return;
    const files = Array.from(fileList).slice(0, remaining);
    for (const file of files) {
      const kind = classifyGymMediaFile(file);
      if (!kind) {
        alert(`"${file.name}" no es una foto ni un video.`);
        continue;
      }
      if (kind === "video") {
        const durationError = await validateGymMediaVideoDuration(file);
        if (durationError) {
          alert(durationError);
          continue;
        }
      }
      const id = crypto.randomUUID();
      items = [...items, { id, previewUrl: URL.createObjectURL(file), kind, status: "uploading" }];
      renderStrip();

      const { url, path, error } = await uploadGymPostMedia(gymId, file);
      const current = items.find((i) => i.id === id);
      if (!current) continue; // se saco de la tira mientras subia
      if (error || !url) {
        current.status = "error";
        current.errorMessage = error;
        alert(error || "No se pudo subir el archivo.");
      } else {
        current.status = "ready";
        current.uploadedUrl = url;
        current.uploadedPath = path;
      }
      renderStrip();
    }
  }

  document.getElementById("gymPostMediaInput")?.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) void addFiles(input.files);
    input.value = "";
  });

  document.getElementById("gymPostCancel")?.addEventListener("click", () => {
    items.forEach(cleanupItem);
    closeOverlay();
  });

  document.getElementById("gymPostForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertBox = document.getElementById("gymPostAlert")!;
    alertBox.innerHTML = "";
    const content = (document.getElementById("gymPostContent") as HTMLTextAreaElement).value;
    const readyMedia = items.filter((i): i is PendingGymMedia & { uploadedUrl: string } => i.status === "ready" && !!i.uploadedUrl);
    const validationError = validateGymPostForm(content, readyMedia.length);
    if (validationError) {
      alertBox.innerHTML = `<p>${escapeHtml(validationError)}</p>`;
      return;
    }

    const submitBtn = document.getElementById("gymPostSubmit") as HTMLButtonElement;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="btn-spinner"></span> Publicando...`;

    const { id, error } = await createGymPost(gymId, {
      content,
      location: (document.getElementById("gymPostLocation") as HTMLInputElement).value,
      visibility: (document.getElementById("gymPostVisibility") as HTMLSelectElement).value as GymPostVisibility,
      media: readyMedia.map((i) => ({ url: i.uploadedUrl, type: i.kind })),
      crossPostAsRep: (document.getElementById("gymPostCrossPost") as HTMLInputElement).checked,
    });
    if (error || !id) {
      alertBox.innerHTML = `<p>${escapeHtml(error || "No se pudo crear la publicación.")}</p>`;
      submitBtn.disabled = false;
      submitBtn.textContent = "Publicar";
      return;
    }
    items.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    closeOverlay();
    onCreated(id);
  });
}
