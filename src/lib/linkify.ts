import { escapeHtml } from "./dom";

// URL o @usuario (mismo charset que valida el username al registrarse, ver USERNAME_RE en auth.service.ts).
const URL_OR_MENTION_RE = /(https?:\/\/[^\s]+)|@([a-z0-9_]{3,30})/gi;
const URL_TRAILING_PUNCT_RE = /[.,;:!?)\]}'"]+$/;

// Convierte URLs en links de verdad (con click, ctrl+click, copiar, etc.) y @usuario en
// link al perfil. No valida que el @usuario exista: mismo criterio "best effort" que la URL.
// Escapa cada segmento de texto plano por separado y solo agrega markup en lo que matcheó,
// para no terminar reinyectando HTML sin escapar del usuario.
export function linkifyHtml(text: string): string {
  let html = "";
  let lastIndex = 0;
  for (const match of text.matchAll(URL_OR_MENTION_RE)) {
    const start = match.index ?? 0;
    html += escapeHtml(text.slice(lastIndex, start)).replace(/\n/g, "<br>");

    const [full, urlMatch, mentionMatch] = match;
    if (urlMatch) {
      let url = urlMatch;
      const trailingMatch = url.match(URL_TRAILING_PUNCT_RE);
      const trailing = trailingMatch ? trailingMatch[0] : "";
      if (trailing) url = url.slice(0, -trailing.length);
      html += `<a class="post-card-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
      html += escapeHtml(trailing);
    } else {
      html += `<a class="post-card-mention" href="profile.html?u=${encodeURIComponent(mentionMatch)}">@${escapeHtml(mentionMatch)}</a>`;
    }
    lastIndex = start + full.length;
  }
  html += escapeHtml(text.slice(lastIndex)).replace(/\n/g, "<br>");
  return html;
}
