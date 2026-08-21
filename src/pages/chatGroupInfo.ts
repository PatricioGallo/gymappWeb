import { escapeHtml } from "../lib/dom";
import { renderVerifiedBadge } from "../lib/verifiedBadge";
import { confirmDialog } from "../lib/confirmDialog";
import { listFollowers, listFollowing, type FollowListRow } from "../services/follow.service";
import {
  listConversations,
  addGroupParticipants,
  removeGroupParticipant,
  setGroupParticipantRole,
  leaveGroup,
  renameGroup,
  setGroupAvatar,
  uploadGroupAvatar,
  groupParticipantsOf,
  type ConversationSummary,
  type GroupParticipant,
} from "../services/chat.service";

const MEMBER_MENU_KEBAB_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;

/**
 * Panel "Info del grupo": lista de integrantes (con menu de tres puntos por fila para
 * hacer/quitar admin y eliminar, solo admin), agregar/salir, y renombrar/cambiar foto (solo
 * admin). Un grupo puede tener mas de un admin -- no es exclusivo de quien lo creo. Se
 * muestra en el mismo overlay #loaderBody que ya usa chatThread.ts para el modal de reenviar
 * -- self-contained, sin necesitar ViewContext propio (cada render reemplaza el HTML
 * anterior, no quedan listeners colgados al cerrar).
 *
 * Los cambios de nombre/foto del grupo llegan solos al header del hilo abierto vía la
 * suscripción realtime a "conversations" que chatThread.ts ya tiene activa -- este panel no
 * necesita avisarle de vuelta. Cambios de integrantes (agregar/eliminar/roles/salir) sí se
 * reflejan acá mismo (se vuelve a pedir list_conversations tras cada acción), pero no empujan
 * un refresh en vivo del "N integrantes" del header mientras el panel está cerrado -- se ve
 * actualizado la próxima vez que se abra el hilo o este panel.
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
      <div class="success-check-container" id="chatGroupInfoOverlay">
        <div class="modal-card">
          <div class="post-comment-modal-header">
            <button type="button" class="post-comment-modal-close" id="chatGroupInfoClose" aria-label="Cerrar">✕</button>
          </div>

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

          ${
            admin
              ? `<input type="text" id="chatGroupInfoName" class="chat-group-info-name-input" value="${escapeHtml(current.group_name ?? "")}" maxlength="80">`
              : `<p class="chat-group-info-name">${escapeHtml(current.group_name ?? "Grupo")}</p>`
          }
          <p class="subtitle" style="text-align:center">${participants.length} integrantes</p>

          <div class="alert_message" id="chatGroupInfoAlert"></div>

          <div class="chat-group-members-head">
            <span>Integrantes</span>
            ${admin ? `<button type="button" class="btn btn-outline btn-sm" id="chatGroupInfoAdd">Agregar</button>` : ""}
          </div>
          <div class="post-share-list" id="chatGroupInfoMembers"></div>

          <button type="button" class="chat-group-leave-link" id="chatGroupInfoLeave">Salir del grupo</button>

          <div class="chat-group-floating-menu" id="chatGroupFloatingMenu" hidden></div>
        </div>
      </div>
    `;

    const alertBox = document.getElementById("chatGroupInfoAlert")!;
    const membersEl = document.getElementById("chatGroupInfoMembers")!;
    const overlay = document.getElementById("chatGroupInfoOverlay")!;
    const floatingMenu = document.getElementById("chatGroupFloatingMenu") as HTMLDivElement;

    membersEl.innerHTML = participants
      .map((p) => {
        const canManage = admin && p.user_id !== userId;
        const menuBtn = canManage
          ? `<button type="button" class="profile-menu-btn chat-group-member-menu-btn" data-id="${escapeHtml(p.user_id)}" data-role="${escapeHtml(p.role)}" aria-label="Más opciones" aria-expanded="false">${MEMBER_MENU_KEBAB_ICON}</button>`
          : "";
        return `
      <div class="post-share-row chat-group-member-row" data-id="${escapeHtml(p.user_id)}">
        <img src="${escapeHtml(p.avatar_url || "/images/avatars/default.svg")}" class="chat-avatar" alt="">
        <span class="post-share-name">${escapeHtml(p.username)}${p.role === "admin" ? ` <span class="chat-group-admin-tag">Admin</span>` : ""}</span>
        ${menuBtn}
      </div>
    `;
      })
      .join("");

    // ---------------------------------------------------------------------------
    // Menu de integrante: se renderiza UNA sola vez, flotante y con position:fixed en vez de
    // vivir anidado (con position:absolute) adentro de cada fila -- la lista de integrantes
    // scrollea (.post-share-list, overflow-y:auto) y un menu anidado ahi quedaba recortado o
    // se veia mal segun donde tocaras. Con position:fixed no lo recorta ningun ancestro:
    // se posiciona a mano (getBoundingClientRect del boton tocado) cada vez que se abre.
    // ---------------------------------------------------------------------------
    let openMenuBtn: HTMLButtonElement | null = null;

    function closeFloatingMenu(): void {
      floatingMenu.hidden = true;
      openMenuBtn?.classList.remove("open");
      openMenuBtn?.setAttribute("aria-expanded", "false");
      openMenuBtn = null;
    }

    function wireFloatingMenuItems(targetId: string): void {
      floatingMenu.querySelector<HTMLButtonElement>(".chat-group-promote-btn")?.addEventListener("click", async () => {
        closeFloatingMenu();
        try {
          const { error } = await setGroupParticipantRole(current.conversation_id, targetId, "admin");
          if (error) {
            alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
            return;
          }
          await refresh();
        } catch {
          alertBox.innerHTML = `<p>No se pudo hacer admin a esa persona. Probá de nuevo.</p>`;
        }
      });

      floatingMenu.querySelector<HTMLButtonElement>(".chat-group-demote-btn")?.addEventListener("click", async () => {
        closeFloatingMenu();
        try {
          const { error } = await setGroupParticipantRole(current.conversation_id, targetId, "member");
          if (error) {
            alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
            return;
          }
          await refresh();
        } catch {
          alertBox.innerHTML = `<p>No se pudo quitar el admin de esa persona. Probá de nuevo.</p>`;
        }
      });

      floatingMenu.querySelector<HTMLButtonElement>(".chat-group-remove-btn")?.addEventListener("click", async () => {
        closeFloatingMenu();
        if (!(await confirmDialog("¿Eliminar a esta persona del grupo?", { confirmLabel: "Eliminar", danger: true }))) return;
        try {
          const { error } = await removeGroupParticipant(current.conversation_id, targetId);
          if (error) {
            alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
            return;
          }
          await refresh();
        } catch {
          alertBox.innerHTML = `<p>No se pudo eliminar a esa persona. Probá de nuevo.</p>`;
        }
      });
    }

    function openFloatingMenuFor(btn: HTMLButtonElement): void {
      const targetId = btn.dataset.id!;
      floatingMenu.innerHTML = `
        ${
          btn.dataset.role === "admin"
            ? `<button type="button" class="profile-menu-item chat-group-demote-btn">Quitar admin</button>`
            : `<button type="button" class="profile-menu-item chat-group-promote-btn">Hacer admin</button>`
        }
        <button type="button" class="profile-menu-item profile-menu-item-danger chat-group-remove-btn">Eliminar del grupo</button>
      `;
      wireFloatingMenuItems(targetId);

      floatingMenu.hidden = false;
      const rect = btn.getBoundingClientRect();
      const menuWidth = floatingMenu.offsetWidth;
      const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
      floatingMenu.style.left = `${left}px`;
      floatingMenu.style.top = `${rect.bottom + 6}px`;

      btn.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
      openMenuBtn = btn;
    }

    membersEl.querySelectorAll<HTMLButtonElement>(".chat-group-member-menu-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (openMenuBtn === btn) {
          closeFloatingMenu();
          return;
        }
        openFloatingMenuFor(btn);
      });
    });

    // Scrollear la lista con el menu abierto lo dejaria flotando lejos de su boton (es
    // position:fixed, no se mueve con el contenido) -- mas simple cerrarlo que reposicionarlo
    // en cada evento de scroll.
    membersEl.addEventListener("scroll", () => closeFloatingMenu(), { passive: true });

    // Un solo listener en el overlay (se recrea entero en cada renderMain(), no queda
    // colgado): tocar el fondo oscuro cierra todo el panel; cualquier otro click afuera del
    // menu flotante (y de su boton disparador) lo cierra a el solo.
    overlay.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) {
        close();
        return;
      }
      const target = e.target as HTMLElement;
      if (!target.closest(".chat-group-member-menu-btn") && !target.closest(".chat-group-floating-menu")) closeFloatingMenu();
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
          // Ya sabemos el nombre nuevo (lo acabamos de guardar) -- actualizar current en vez
          // de refresh()+renderMain() completo evita el parpadeo de recrear todo el modal por
          // un cambio que ya se ve reflejado en el input tal cual esta.
          current = { ...current, group_name: name };
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
          // Mismo criterio que el nombre: ya tenemos la URL real subida, no hace falta
          // refresh()+renderMain() completo (el preview local ya se ve puesto arriba).
          current = { ...current, group_avatar_url: url };
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
      <div class="success-check-container" id="chatGroupAddOverlay">
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
    document.getElementById("chatGroupAddOverlay")?.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) close();
    });

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
