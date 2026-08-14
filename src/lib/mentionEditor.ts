const MENTION_CHIP_CLASS = "mention-chip";

export interface MentionEditorHandle {
  /** El div contenteditable visible: lo que mentionAutocomplete.ts usa para posicionar el panel de sugerencias. */
  el: HTMLDivElement;
  /** Offset (en texto plano) del cursor dentro del contenido, o null si el foco/seleccion no esta adentro. */
  getCaretOffset(): number | null;
  /** Reemplaza el texto plano entre [start, end) por un chip clickeable "@usuario" y deja el cursor despues. */
  insertMention(start: number, end: number, username: string): void;
  /** Se consulta antes de procesar un Enter: si algun hook devuelve true (ej. hay una sugerencia
   * resaltada), no se inserta el salto de linea -- quien pidio el hook ya hizo lo suyo. */
  onBeforeEnter(hook: () => boolean): void;
}

function createMentionChip(username: string): HTMLAnchorElement {
  const chip = document.createElement("a");
  chip.className = MENTION_CHIP_CLASS;
  chip.href = `profile.html?u=${encodeURIComponent(username)}`;
  // _blank: estas a mitad de escribir el Rep, navegar en la misma pestaña te haria perder el
  // borrador. Mismo rel que ya usa linkifyHtml en postCard.ts para links externos.
  chip.target = "_blank";
  chip.rel = "noopener noreferrer";
  chip.contentEditable = "false";
  chip.dataset.username = username;
  chip.textContent = `@${username}`;
  return chip;
}

/** Texto plano equivalente del contenido: <br> y saltos de bloque -> "\n", un chip -> "@usuario". */
export function getPlainText(root: Node): string {
  let text = "";
  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === "BR") {
      text += "\n";
      return;
    }
    if (el.classList.contains(MENTION_CHIP_CLASS)) {
      text += `@${el.dataset.username ?? ""}`;
      return;
    }
    // Defensivo: si el navegador llega a envolver una linea en <div>/<p> (no deberia, Enter esta
    // interceptado mas abajo), que al menos separe como salto de linea en vez de pegar el texto.
    const isBlock = el.tagName === "DIV" || el.tagName === "P";
    if (isBlock && text.length > 0 && !text.endsWith("\n")) text += "\n";
    el.childNodes.forEach(walk);
  }
  root.childNodes.forEach(walk);
  return text;
}

function renderFromPlainText(root: HTMLElement, value: string): void {
  root.innerHTML = "";
  const lines = value.split("\n");
  lines.forEach((line, i) => {
    if (i > 0) root.appendChild(document.createElement("br"));
    if (line) root.appendChild(document.createTextNode(line));
  });
}

/** Busca el nodo de texto (o el punto justo despues de un <br>/chip) que corresponde a un offset de texto plano. */
function locateOffset(root: HTMLElement, targetOffset: number): { node: Node; offset: number } {
  let remaining = targetOffset;
  let found: { node: Node; offset: number } | null = null;

  function afterNode(el: HTMLElement): { node: Node; offset: number } {
    const parent = el.parentNode!;
    return { node: parent, offset: Array.prototype.indexOf.call(parent.childNodes, el) + 1 };
  }

  function walk(node: Node): boolean {
    if (found) return true;
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        found = { node, offset: remaining };
        return true;
      }
      remaining -= len;
      return false;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node as HTMLElement;
    if (el.tagName === "BR") {
      if (remaining <= 1) {
        found = afterNode(el);
        return true;
      }
      remaining -= 1;
      return false;
    }
    if (el.classList.contains(MENTION_CHIP_CLASS)) {
      const len = (`@${el.dataset.username ?? ""}`).length;
      if (remaining <= len) {
        found = afterNode(el);
        return true;
      }
      remaining -= len;
      return false;
    }
    for (const child of Array.from(el.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  }

  for (const child of Array.from(root.childNodes)) {
    if (walk(child)) break;
  }
  return found ?? { node: root, offset: root.childNodes.length };
}

/**
 * Convierte un <textarea> (ya existente en el DOM, con su placeholder/clases/maxlength) en un
 * editor "contenteditable" que se ve y actua igual, pero puede tener adentro un @usuario etiquetado
 * como chip clickeable de verdad (naranja, link al perfil) en vez de texto plano. El textarea
 * original queda oculto en el DOM como fuente de verdad de ".value": todo el codigo existente que
 * lee/escribe composerInput.value (contador de caracteres, publicar, limpiar el composer) sigue
 * funcionando sin cambios, porque ".value" queda redefinido para reflejar el contenido del editor.
 */
export function makeMentionEditable(textarea: HTMLTextAreaElement): MentionEditorHandle {
  const editor = document.createElement("div");
  editor.className = `${textarea.className} mention-editor`.trim();
  editor.contentEditable = "true";
  editor.setAttribute("role", "textbox");
  editor.setAttribute("aria-multiline", "true");
  editor.dataset.placeholder = textarea.placeholder;

  textarea.parentElement!.insertBefore(editor, textarea);
  textarea.style.display = "none";
  textarea.setAttribute("aria-hidden", "true");
  textarea.tabIndex = -1;

  const nativeValueDescriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!;
  let currentValue = textarea.value;

  function updateEmptyState(): void {
    editor.classList.toggle("mention-editor-empty", currentValue.length === 0);
  }

  function renderFromExternalValue(value: string): void {
    currentValue = value;
    renderFromPlainText(editor, value);
    updateEmptyState();
  }
  renderFromExternalValue(currentValue);

  function syncFromEditor(): void {
    currentValue = getPlainText(editor);
    nativeValueDescriptor.set!.call(textarea, currentValue);
    updateEmptyState();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // El resto del codigo (feed.ts, postModals.ts, post.service.ts) no sabe que esto ahora es un
  // div: sigue leyendo/escribiendo composerInput.value como si fuera el textarea de siempre.
  Object.defineProperty(textarea, "value", {
    configurable: true,
    get: () => currentValue,
    set: (v: string) => {
      nativeValueDescriptor.set!.call(textarea, v);
      renderFromExternalValue(v);
    },
  });

  const beforeEnterHooks: Array<() => boolean> = [];

  editor.addEventListener("input", syncFromEditor);

  editor.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (beforeEnterHooks.some((hook) => hook())) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    document.execCommand("insertLineBreak");
    syncFromEditor();
  });

  // Pegar como texto plano: si no, un copy/paste desde otra pagina puede meter HTML con
  // estilos/tags que romperian el modelo de texto plano que espera post.service.ts.
  editor.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    document.execCommand("insertText", false, text);
  });

  function getCaretOffset(): number | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.startContainer)) return null;
    const preRange = range.cloneRange();
    preRange.selectNodeContents(editor);
    preRange.setEnd(range.startContainer, range.startOffset);
    const frag = preRange.cloneContents();
    return getPlainText(frag).length;
  }

  function insertMention(start: number, end: number, username: string): void {
    // Si ya hay texto (u otro espacio) justo despues, no sumamos un espacio propio -- si no, tocar
    // un @usuario en medio de una frase ya escrita deja doble espacio antes de lo que sigue.
    const charAfter = getPlainText(editor)[end];
    const needsTrailingSpace = charAfter === undefined || !/\s/.test(charAfter);

    const from = locateOffset(editor, start);
    const to = locateOffset(editor, end);
    const range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    range.deleteContents();

    const frag = document.createDocumentFragment();
    const chip = createMentionChip(username);
    frag.appendChild(chip);
    const caretAnchor: Node = needsTrailingSpace ? document.createTextNode(" ") : chip;
    if (needsTrailingSpace) frag.appendChild(caretAnchor);
    range.insertNode(frag);

    // Nada de editor.normalize() aca: si el texto de despues (" mundo") quedara pegado al nodo de
    // texto que insertamos, normalize() los fusiona en uno solo y el caret se nos va al final de
    // ESE nodo fusionado (el final de la linea) en vez de quedarse justo despues de lo insertado.
    const caretRange = document.createRange();
    caretRange.setStartAfter(caretAnchor);
    caretRange.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(caretRange);

    editor.focus();
    syncFromEditor();
  }

  return {
    el: editor,
    getCaretOffset,
    insertMention,
    onBeforeEnter: (hook) => beforeEnterHooks.push(hook),
  };
}
