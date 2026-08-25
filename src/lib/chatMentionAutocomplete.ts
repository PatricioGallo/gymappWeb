import { escapeHtml } from "./dom";

export interface ChatMentionCandidate {
  username: string;
  avatar_url: string | null;
}

interface MentionMatch {
  start: number;
  query: string;
}

const RESULTS_LIMIT = 6;

/** Si el cursor esta escribiendo un @usuario ahora mismo, devuelve donde empieza el "@" y lo ya
 * tipeado despues. Misma lógica que mentionAutocomplete.ts (Reps) -- se duplica en vez de
 * compartirse porque ese otro corre sobre un editor contenteditable con chips y búsqueda global
 * de perfiles, mientras que este es un <textarea> plano contra una lista fija ya en memoria (los
 * integrantes del grupo), un modelo bastante distinto para justificar una abstracción en común. */
function findMentionMatch(text: string, cursor: number): MentionMatch | null {
  let i = cursor - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === "@") {
      const prev = text[i - 1];
      if (i > 0 && prev !== undefined && !/\s/.test(prev)) return null;
      return { start: i, query: text.slice(i + 1, cursor) };
    }
    if (!/[a-z0-9_]/i.test(ch)) return null;
    i--;
  }
  return null;
}

/**
 * Autocompletado de @usuario en el composer de un chat de GRUPO: a medida que se escribe
 * despues del "@", sugiere integrantes del grupo cuyo username empieza/contiene lo tipeado. No
 * hace falta pegarle a la red por letra (a diferencia del de Reps): getCandidates() ya devuelve
 * la lista de integrantes actuales, que chatThread.ts arma una sola vez a partir de la
 * conversación. Al elegir uno, inserta "@usuario " como texto plano -- linkifyHtml ya convierte
 * cualquier @usuario en un link al perfil al renderizar el mensaje (ver bubbleBodyHtml), así que
 * no hace falta ningún marcado especial acá, alcanza con el texto.
 */
export function attachChatMentionAutocomplete(textarea: HTMLTextAreaElement, getCandidates: () => ChatMentionCandidate[], signal: AbortSignal): void {
  const panel = document.createElement("div");
  panel.className = "mention-suggest-panel";
  panel.hidden = true;
  document.body.appendChild(panel);
  signal.addEventListener("abort", () => panel.remove());

  let results: ChatMentionCandidate[] = [];
  let activeIndex = -1;
  let match: MentionMatch | null = null;

  function close(): void {
    panel.hidden = true;
    panel.innerHTML = "";
    results = [];
    activeIndex = -1;
    match = null;
  }

  // El composer del chat vive pegado abajo del todo de la pantalla -- a diferencia del panel de
  // Reps (que abre hacia abajo desde el composer, arriba del feed), acá el panel tiene que abrir
  // hacia ARRIBA, apoyado justo encima del textarea, para no quedar tapado por el teclado.
  function positionPanel(): void {
    const rect = textarea.getBoundingClientRect();
    panel.style.left = `${rect.left}px`;
    panel.style.width = `${Math.min(320, rect.width)}px`;
    panel.style.bottom = `${window.innerHeight - rect.top + 6}px`;
    panel.style.top = "auto";
  }

  function pick(idx: number): void {
    const chosen = results[idx];
    if (!chosen || !match) return;
    const value = textarea.value;
    const before = value.slice(0, match.start);
    const after = value.slice(match.start + 1 + match.query.length);
    // Si ya hay un espacio justo despues, no sumamos uno propio -- si no, elegir un @usuario en
    // medio de una frase ya escrita deja doble espacio antes de lo que sigue.
    const needsTrailingSpace = after.length === 0 || !/^\s/.test(after);
    const insertion = `@${chosen.username}${needsTrailingSpace ? " " : ""}`;
    const caret = before.length + insertion.length;
    textarea.value = `${before}${insertion}${after}`;
    textarea.setSelectionRange(caret, caret);
    // El resto del composer (auto-grow, habilitar "Enviar", vista previa de YouTube) escucha
    // "input" -- disparo el mismo evento a mano ya que el cambio de .value de acá no lo dispara solo.
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
    close();
  }

  function render(): void {
    if (!match || results.length === 0) return close();
    panel.innerHTML = results
      .map(
        (r, idx) => `
          <button type="button" class="search-result-item mention-suggest-item${idx === activeIndex ? " active" : ""}" data-idx="${idx}">
            <img src="${escapeHtml(r.avatar_url || "/images/avatars/default.svg")}" alt="" class="search-result-avatar">
            <span class="search-result-body"><span class="search-result-name">${escapeHtml(r.username)}</span></span>
          </button>
        `
      )
      .join("");
    panel.querySelectorAll<HTMLButtonElement>(".mention-suggest-item").forEach((btn) => {
      // mousedown (no click) para ganarle al blur del textarea: si esperamos al click, el
      // textarea ya perdio el foco y el panel se cerro antes de que el click llegue.
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pick(Number(btn.dataset.idx));
      });
    });
    panel.hidden = false;
    positionPanel();
  }

  function updateMatch(): void {
    const cursor = textarea.selectionStart;
    const next = cursor == null ? null : findMentionMatch(textarea.value, cursor);
    match = next;
    if (!next) return close();
    const q = next.query.toLowerCase();
    results = getCandidates()
      .filter((c) => c.username.toLowerCase().includes(q))
      .slice(0, RESULTS_LIMIT);
    activeIndex = results.length > 0 ? 0 : -1;
    render();
  }

  textarea.addEventListener("input", updateMatch, { signal });
  textarea.addEventListener("click", updateMatch, { signal });
  textarea.addEventListener(
    "keyup",
    (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") updateMatch();
    },
    { signal }
  );

  // Registrado ANTES que el "Enter para enviar" del composer (ver mountThread) a propósito:
  // stopImmediatePropagation() acá corta ese otro listener del mismo elemento cuando el Enter
  // en realidad era para elegir la sugerencia resaltada, no para mandar el mensaje.
  textarea.addEventListener(
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
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopImmediatePropagation();
        pick(activeIndex);
      } else if (e.key === "Escape") {
        close();
      }
    },
    { signal }
  );

  textarea.addEventListener(
    "blur",
    () => {
      // El mousedown de un item del panel ya hizo preventDefault (no dispara blur); esto cubre
      // cuando el foco se va por otro lado (tocar afuera, cambiar de campo, mandar el mensaje).
      setTimeout(close, 100);
    },
    { signal }
  );

  window.addEventListener(
    "scroll",
    () => {
      if (!panel.hidden) positionPanel();
    },
    { signal, capture: true }
  );
  window.addEventListener(
    "resize",
    () => {
      if (!panel.hidden) positionPanel();
    },
    { signal }
  );
}
