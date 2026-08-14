import { escapeHtml } from "./dom";
import { resultAvatar, resultFullName } from "./search";
import { searchProfiles, type ProfileSearchResult } from "../services/search.service";
import { getPlainText, type MentionEditorHandle } from "./mentionEditor";

const DEBOUNCE_MS = 200;
const RESULTS_LIMIT = 6;

interface MentionMatch {
  start: number;
  query: string;
}

/** Si el cursor esta escribiendo un @usuario ahora mismo, devuelve donde empieza el "@" y lo ya tipeado despues. */
function findMentionMatch(text: string, cursor: number): MentionMatch | null {
  let i = cursor - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === "@") {
      const prev = text[i - 1];
      // El "@" tiene que estar al principio del texto o precedido de espacio/salto de linea
      // (si no, es parte de otra cosa, ej. un email pegado).
      if (i > 0 && prev !== undefined && !/\s/.test(prev)) return null;
      return { start: i, query: text.slice(i + 1, cursor) };
    }
    if (!/[a-z0-9_]/i.test(ch)) return null;
    i--;
  }
  return null;
}

/**
 * Autocompletado de @usuario en un editor de menciones (ver mentionEditor.ts): a medida que se
 * escribe despues del "@", sugiere perfiles que van acotando la busqueda hasta pegarle al nombre
 * de usuario (o mostrar que no existe). Al elegir uno, queda insertado como chip clickeable -- ver
 * MentionEditorHandle.insertMention. Se usa en los composers donde el texto pasa por
 * post.service.ts y realmente puede etiquetar a alguien (crear un Rep o citar uno) -- no en
 * comentarios, que no etiquetan.
 */
export function attachMentionAutocomplete(handle: MentionEditorHandle): void {
  const editor = handle.el;
  const panel = document.createElement("div");
  panel.className = "mention-suggest-panel";
  panel.hidden = true;
  document.body.appendChild(panel);

  let results: ProfileSearchResult[] = [];
  let activeIndex = -1;
  let match: MentionMatch | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let requestId = 0;

  function close() {
    panel.hidden = true;
    panel.innerHTML = "";
    results = [];
    activeIndex = -1;
    match = null;
  }

  function positionPanel() {
    const rect = editor.getBoundingClientRect();
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.bottom + 4}px`;
    panel.style.width = `${Math.min(320, rect.width)}px`;
  }

  function pick(idx: number) {
    const chosen = results[idx];
    if (!chosen || !match) return;
    handle.insertMention(match.start, match.start + 1 + match.query.length, chosen.username);
    close();
  }

  function render() {
    if (!match) return close();
    if (results.length === 0) {
      if (!match.query) return close();
      panel.innerHTML = `<p class="notif-empty">No encontramos ese usuario.</p>`;
      panel.hidden = false;
      positionPanel();
      return;
    }

    panel.innerHTML = results
      .map(
        (r, idx) => `
          <button type="button" class="search-result-item mention-suggest-item${idx === activeIndex ? " active" : ""}" data-idx="${idx}">
            <img src="${escapeHtml(resultAvatar(r))}" alt="" class="search-result-avatar">
            <span class="search-result-body">
              <span class="search-result-name">${escapeHtml(r.username)}</span>
              <span class="search-result-username">${escapeHtml(resultFullName(r))}</span>
            </span>
          </button>
        `
      )
      .join("");

    panel.querySelectorAll<HTMLButtonElement>(".mention-suggest-item").forEach((btn) => {
      // mousedown (no click) para ganarle al blur del editor: si esperamos al click, el editor
      // ya perdio el foco y el panel se cerro antes de que el click llegue.
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pick(Number(btn.dataset.idx));
      });
    });

    panel.hidden = false;
    positionPanel();
  }

  async function runSearch(currentMatch: MentionMatch) {
    const myRequestId = ++requestId;
    try {
      const list = await searchProfiles(currentMatch.query, RESULTS_LIMIT, 1);
      if (myRequestId !== requestId || match !== currentMatch) return; // una busqueda mas nueva ya esta en curso, o el usuario ya salio del @token
      results = list;
      activeIndex = list.length > 0 ? 0 : -1;
      render();
    } catch {
      if (myRequestId !== requestId || match !== currentMatch) return;
      results = [];
      render();
    }
  }

  function handleCursorMove() {
    const cursor = handle.getCaretOffset();
    const next = cursor == null ? null : findMentionMatch(getPlainText(editor), cursor);
    match = next;
    if (!next) return close();
    if (!next.query) {
      results = [];
      activeIndex = -1;
      return close();
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void runSearch(next), DEBOUNCE_MS);
  }

  const controller = new AbortController();
  const { signal } = controller;

  editor.addEventListener("input", handleCursorMove, { signal });
  editor.addEventListener("click", handleCursorMove, { signal });
  editor.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") handleCursorMove();
  }, { signal });

  // El Enter tiene doble uso (elegir sugerencia vs. salto de linea): mentionEditor.ts consulta
  // este hook antes de insertar el salto, asi que ganamos la prioridad sin pelear por el orden
  // de dos listeners de "keydown" separados escuchando la misma tecla.
  handle.onBeforeEnter(() => {
    if (panel.hidden || results.length === 0) return false;
    pick(activeIndex);
    return true;
  });

  editor.addEventListener(
    "keydown",
    (e) => {
      if (panel.hidden || results.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % results.length;
        render();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + results.length) % results.length;
        render();
      } else if (e.key === "Tab") {
        e.preventDefault();
        pick(activeIndex);
      } else if (e.key === "Escape") {
        close();
      }
    },
    { signal }
  );

  editor.addEventListener(
    "blur",
    () => {
      // El mousedown de un item del panel ya hizo preventDefault (no dispara blur); esto cubre
      // cuando el foco se va por otro lado (tocar afuera, cambiar de campo, etc).
      setTimeout(close, 100);
    },
    { signal }
  );

  window.addEventListener("scroll", () => { if (!panel.hidden) positionPanel(); }, { signal, capture: true });
  window.addEventListener("resize", () => { if (!panel.hidden) positionPanel(); }, { signal });

  // Los composers de modales (ej. citar un Rep) recrean el editor cada vez que se abren: sin
  // esto, cada apertura dejaria un panel y listeners huerfanos acumulandose en el body.
  const cleanupObserver = new MutationObserver(() => {
    if (editor.isConnected) return;
    controller.abort();
    panel.remove();
    cleanupObserver.disconnect();
  });
  cleanupObserver.observe(document.body, { childList: true, subtree: true });
}
