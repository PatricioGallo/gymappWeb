import { escapeHtml } from "../lib/dom";
import { renderVerifiedBadge } from "../lib/verifiedBadge";
import { confirmDialog } from "../lib/confirmDialog";
import { listFollowers, listFollowing, type FollowListRow } from "../services/follow.service";
import {
  listConversations,
  addGroupParticipants,
  removeGroupParticipant,
  leaveGroup,
  renameGroup,
  setGroupAvatar,
  uploadGroupAvatar,
  groupParticipantsOf,
  type ConversationSummary,
  type GroupParticipant,
} from "../services/chat.service";

/**
 * Panel "Info del grupo": lista de integrantes, agregar/sacar (solo admin), salir, y
 * renombrar/cambiar foto (solo admin). Se muestra en el mismo overlay #loaderBody que ya
 * usa chatThread.ts para el modal de reenviar -- self-contained, sin necesitar ViewContext
 * propio (cada render reemplaza el HTML anterior, no quedan listeners colgados al cerrar).
 *
 * Los cambios de nombre/foto del grupo llegan solos al header del hilo abierto vía la
 * suscripción realtime a "conversations" que chatThread.ts ya tiene activa -- este panel no
 * necesita avisarle de vuelta. Cambios de integrantes (agregar/sacar/salir) sí se reflejan acá
 * mismo (se vuelve a pedir list_conversations tras cada acción), pero no empujan un refresh en
 * vivo del "N integrantes" del header mientras el panel está cerrado -- se ve actualizado la
 * próxima vez que se abra el hilo o este panel.
 */
export function openGroupInfoPanel(conversation: ConversationSummary, userId: string, opts: { onLeft: () => void }): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;

  let current = conversation;

  function close(): void {
    loaderBody!.innerHTML = "";
  }

  async function refresh(): Promise<void> {
    const rows = await listConversations();
    const fresh = rows.find((c) => c.conversation_id === current.conversation_id);
    if (!fresh) {
      close();
      opts.onLeft();
      return;
    }
    current = fresh;
    renderMain();
  }

  function activeParticipants(): GroupParticipant[] {
    return groupParticipantsOf(current).filter((p) => !p.left_at);
  }

  function isAdmin(): boolean {
    return groupParticipantsOf(current).find((p) => p.user_id === userId)?.role === "admin";
  }

  function renderMain(): void {
    const participants = activeParticipants();
    const admin = isAdmin();

    loaderBody!.innerHTML = `
      <div class="success-check-container">
        <div class="modal-card">
          <h2>Info del grupo</h2>
          <div class="avatar-wrap avatar-wrap-sm">
            <img src="${escapeHtml(current.group_avatar_url || "/images/avatars/default.svg")}" alt="" id="chatGroupInfoAvatarImg">
            <div class="avatar-uploading" id="chatGroupInfoAvatarUploading" hidden><div class="modern-spinner"></div></div>
            ${
              admin
                ? `<label class="avatar-edit" title="Cambiar foto del grupo">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="4"/></svg>
              <input type="file" id="chatGroupInfoAvatarInput" accept="image/jpeg,image/png,image/webp">
            </label>`
                : ""
            }
          </div>
          <p class="chat-group-info-name" style="text-align:center">${escapeHtml(current.group_name ?? "Grupo")}</p>
          <p class="subtitle" style="text-align:center">${participants.length} integrantes</p>

          ${
            admin
              ? `
          <div class="field">
            <label>Nombre del grupo</label>
            <input type="text" id="chatGroupInfoName" value="${escapeHtml(current.group_name ?? "")}" maxlength="80">
          </div>
          `
              : ""
          }

          <div class="alert_message" id="chatGroupInfoAlert"></div>

          <div class="post-share-list" id="chatGroupInfoMembers"></div>

          <div class="modal-actions">
            ${admin ? `<button class="btn btn-outline" id="chatGroupInfoAdd" type="button">Agregar</button>` : ""}
            <button class="btn btn-outline" id="chatGroupInfoLeave" type="button">Salir del grupo</button>
            <button class="btn btn-primary" id="chatGroupInfoClose" type="button">Cerrar</button>
          </div>
        </div>
      </div>
    `;

    const alertBox = document.getElementById("chatGroupInfoAlert")!;
    const membersEl = document.getElementById("chatGroupInfoMembers")!;

    membersEl.innerHTML = participants
      .map(
        (p) => `
      <div class="post-share-row chat-group-member-row" data-id="${escapeHtml(p.user_id)}">
        <img src="${escapeHtml(p.avatar_url || "/images/avatars/default.svg")}" class="chat-avatar" alt="">
        <span class="post-share-name">${escapeHtml(p.username)}${p.role === "admin" ? ` <span class="chat-group-admin-tag">Admin</span>` : ""}</span>
        ${admin && p.user_id !== userId ? `<button type="button" class="btn btn-outline btn-sm chat-group-remove-btn" data-id="${escapeHtml(p.user_id)}">Sacar</button>` : ""}
      </div>
    `
      )
      .join("");

    membersEl.querySelectorAll<HTMLButtonElement>(".chat-group-remove-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!(await confirmDialog("¿Sacar a esta persona del grupo?", { confirmLabel: "Sacar", danger: true }))) return;
        btn.disabled = true;
        try {
          const { error } = await removeGroupParticipant(current.conversation_id, btn.dataset.id!);
          if (error) {
            alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
            return;
          }
          await refresh();
        } catch {
          alertBox.innerHTML = `<p>No se pudo sacar a esa persona. Probá de nuevo.</p>`;
        } finally {
          btn.disabled = false;
        }
      });
    });

    document.getElementById("chatGroupInfoClose")?.addEventListener("click", close);

    document.getElementById("chatGroupInfoLeave")?.addEventListener("click", async (e) => {
      // Ojo: e.currentTarget solo es válido mientras el evento se está despachando -- hay que
      // guardarlo ANTES del await a confirmDialog (que espera un click en OTRO botón, en otro
      // ciclo de eventos) o para cuando el await resuelve ya quedó en null.
      const btn = e.currentTarget as HTMLButtonElement;
      if (!(await confirmDialog("¿Salir de este grupo?", { confirmLabel: "Salir", danger: true }))) return;
      btn.disabled = true;
      try {
        const { error } = await leaveGroup(current.conversation_id);
        if (error) {
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }
        loaderBody!.innerHTML = `
          <div class="success-check-container">
            <div class="success-icon">
              <svg viewBox="0 0 52 52" class="success-svg">
                <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
                <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
              </svg>
            </div>
            <p>Saliste del grupo</p>
          </div>
        `;
        setTimeout(() => {
          close();
          opts.onLeft();
        }, 1400);
      } catch {
        alertBox.innerHTML = `<p>No se pudo salir del grupo. Probá de nuevo.</p>`;
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById("chatGroupInfoAdd")?.addEventListener("click", () => renderAddStep());

    if (admin) {
      const nameInput = document.getElementById("chatGroupInfoName") as HTMLInputElement;
      nameInput.addEventListener("change", async () => {
        const name = nameInput.value.trim();
        if (!name || name === current.group_name) return;
        try {
          const { error } = await renameGroup(current.conversation_id, name);
          if (error) {
            alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
            nameInput.value = current.group_name ?? "";
            return;
          }
          await refresh();
        } catch {
          alertBox.innerHTML = `<p>No se pudo renombrar el grupo. Probá de nuevo.</p>`;
          nameInput.value = current.group_name ?? "";
        }
      });

      const avatarInput = document.getElementById("chatGroupInfoAvatarInput") as HTMLInputElement;
      const avatarImg = document.getElementById("chatGroupInfoAvatarImg") as HTMLImageElement;
      const avatarUploading = document.getElementById("chatGroupInfoAvatarUploading") as HTMLDivElement;
      avatarInput.addEventListener("change", async () => {
        const file = avatarInput.files?.[0];
        if (!file) return;
        avatarImg.src = URL.createObjectURL(file);
        avatarInput.disabled = true;
        avatarUploading.hidden = false;
        try {
          const { url, error } = await uploadGroupAvatar(current.conversation_id, file);
          if (error || !url) {
            alertBox.innerHTML = `<p>${escapeHtml(error || "No se pudo subir la foto.")}</p>`;
            return;
          }
          const setResult = await setGroupAvatar(current.conversation_id, url);
          if (setResult.error) {
            alertBox.innerHTML = `<p>${escapeHtml(setResult.error)}</p>`;
            return;
          }
          await refresh();
        } catch {
          alertBox.innerHTML = `<p>No se pudo actualizar la foto. Probá de nuevo.</p>`;
        } finally {
          avatarInput.disabled = false;
          avatarUploading.hidden = true;
        }
      });
    }
  }

  function renderAddStep(): void {
    const existingIds = new Set(activeParticipants().map((p) => p.user_id));
    const selected = new Map<string, FollowListRow>();

    loaderBody!.innerHTML = `
      <div class="success-check-container">
        <div class="modal-card">
          <h2>Agregar integrantes</h2>
          <div class="field">
            <input type="text" id="chatGroupAddSearch" placeholder="Buscar entre tus seguidores...">
          </div>
          <div class="post-share-list" id="chatGroupAddList"><p class="exc-pick-empty">Cargando...</p></div>
          <div class="alert_message" id="chatGroupAddAlert"></div>
          <div class="modal-actions">
            <button class="btn btn-outline" id="chatGroupAddBack" type="button">Atrás</button>
            <button class="btn btn-primary" id="chatGroupAddConfirm" type="button" disabled>Agregar (<span id="chatGroupAddCount">0</span>)</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById("chatGroupAddBack")?.addEventListener("click", () => renderMain());

    const listEl = document.getElementById("chatGroupAddList")!;
    const searchInput = document.getElementById("chatGroupAddSearch") as HTMLInputElement;
    const confirmBtn = document.getElementById("chatGroupAddConfirm") as HTMLButtonElement;
    const countEl = document.getElementById("chatGroupAddCount")!;
    const alertBox = document.getElementById("chatGroupAddAlert")!;

    function updateCount(): void {
      countEl.textContent = String(selected.size);
      confirmBtn.disabled = selected.size === 0;
    }

    function renderRows(rows: FollowListRow[]): void {
      const candidates = rows.filter((r) => !existingIds.has(r.id));
      listEl.innerHTML = candidates.length
        ? candidates
            .map(
              (r) => `
        <button type="button" class="post-share-row chat-group-pick-row${selected.has(r.id) ? " selected" : ""}" data-id="${escapeHtml(r.id)}">
          <img src="${escapeHtml(r.avatarUrl || "/images/avatars/default.svg")}" class="chat-avatar" alt="">
          <span class="post-share-name">${escapeHtml(r.username)}${renderVerifiedBadge(r.userType, r.isVerified)}</span>
          <input type="checkbox" ${selected.has(r.id) ? "checked" : ""} tabindex="-1">
        </button>
      `
            )
            .join("")
        : `<p class="exc-pick-empty">No hay más seguidores para agregar.</p>`;

      listEl.querySelectorAll<HTMLButtonElement>(".chat-group-pick-row").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.id!;
          const row = candidates.find((r) => r.id === id);
          if (!row) return;
          const checkbox = btn.querySelector("input[type=checkbox]") as HTMLInputElement;
          if (selected.has(id)) {
            selected.delete(id);
            checkbox.checked = false;
          } else {
            selected.set(id, row);
            checkbox.checked = true;
          }
          btn.classList.toggle("selected", selected.has(id));
          updateCount();
        });
      });
    }

    async function runSearch(search: string): Promise<void> {
      try {
        const [followers, following] = await Promise.all([listFollowers(userId, search, 30), listFollowing(userId, search, 30)]);
        const merged = new Map<string, FollowListRow>();
        for (const r of [...followers, ...following]) {
          if (r.id !== userId) merged.set(r.id, r);
        }
        renderRows([...merged.values()]);
      } catch {
        listEl.innerHTML = `<p class="exc-pick-empty">No se pudo cargar tus seguidores.</p>`;
      }
    }

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    searchInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void runSearch(searchInput.value.trim()), 250);
    });

    confirmBtn.addEventListener("click", async () => {
      confirmBtn.disabled = true;
      try {
        const { error } = await addGroupParticipants(current.conversation_id, [...selected.keys()]);
        if (error) {
          alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }
        await refresh();
      } catch {
        alertBox.innerHTML = `<p>No se pudieron agregar los integrantes. Probá de nuevo.</p>`;
      } finally {
        confirmBtn.disabled = false;
      }
    });

    void runSearch("");
  }

  renderMain();
}
