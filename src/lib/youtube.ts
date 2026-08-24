// ---------------------------------------------------------------------------
// Deteccion y embed de links de YouTube -- compartido entre Reps (post.service.ts /
// postCard.ts / feed.ts) y el chat (chatThread.ts). Puramente texto/markup, no pega a la red.
// ---------------------------------------------------------------------------

const URL_RE = /https?:\/\/[^\s]+/i;
const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

/** Primera URL http(s) encontrada en un texto libre, o null si no hay ninguna. */
export function extractFirstUrl(content: string): string | null {
  const match = content.match(URL_RE);
  if (!match) return null;
  // Sacamos puntuacion de cierre pegada al final ("mirá esto: https://x.com." o "(https://x.com)").
  return match[0].replace(/[.,;:!?)\]}'"]+$/, "");
}

/** Id del video si la URL es de YouTube (watch/youtu.be/embed/shorts), o null. No pega a la red: es solo un parseo. */
export function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(YOUTUBE_RE);
  return match ? match[1] : null;
}

const PLAY_ICON_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;

function iframeHtml(videoId: string): string {
  // nocookie: no larga cookies de tracking hasta que se le da play. autoplay=1 porque este
  // <iframe> recien se monta cuando el usuario ya toco "play" en la miniatura (ver mas abajo) --
  // sin esto habria que tocar play dos veces (una para montar el embed, otra adentro del player).
  return `
    <iframe
      src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1"
      title="Video de YouTube"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
    ></iframe>
  `;
}

/** Miniatura con boton de play -- el <iframe> real recien se monta al tocarla (ver la
 * delegacion global mas abajo). Antes esto devolvia un <iframe> ya montado y en vivo: cada uno
 * le costaba al hilo principal ~100-300ms para crearse, y mientras sigue montado sigue
 * consumiendo CPU en segundo plano aunque nadie lo este mirando (medido con Playwright real:
 * 2 iframes ya cargados sumaron mas de 14s de longtask "cross-origin-descendant" en pocos
 * segundos, en un grupo de chat con el resto de la conversacion activa) -- multiplicado por
 * cada mensaje/Rep con un link de YouTube que haya en pantalla (incluidos los que quedan
 * ocultos en hilos de chat que el usuario visito antes y siguen vivos en memoria, ver
 * chats.ts), esto era un contribuyente real a que el chat se sintiera lento/trabado. La
 * miniatura (thumbnail de YouTube, no pega a ninguna API) no tiene ese costo: es una <img> común.
 */
export function youtubeEmbedHtml(videoId: string): string {
  const id = encodeURIComponent(videoId);
  return `
    <div class="post-youtube-embed">
      <button type="button" class="youtube-embed-thumb" data-yt-id="${id}" aria-label="Reproducir video de YouTube">
        <img src="https://img.youtube.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy">
        <span class="youtube-embed-play">${PLAY_ICON_SVG}</span>
      </button>
    </div>
  `;
}

// Delegacion global unica (no por pantalla): cualquier .youtube-embed-thumb que aparezca en
// cualquier parte del documento -- Reps, feed, o cualquier hilo de chat -- monta su <iframe> de
// verdad recien al tocarla. Vive aca (no en postCard.ts/chatThread.ts) para que alcance con
// definir youtubeEmbedHtml() una sola vez y no haya que repetir el wiring en cada pantalla que
// la use.
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".youtube-embed-thumb");
    if (!btn) return;
    const id = btn.dataset.ytId;
    if (!id) return;
    btn.outerHTML = iframeHtml(decodeURIComponent(id));
  });
}
