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

// nocookie: no larga cookies de tracking hasta que se le da play, buen default sin pedirle nada al usuario.
export function youtubeEmbedHtml(videoId: string): string {
  return `
    <div class="post-youtube-embed">
      <iframe
        src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}"
        title="Video de YouTube"
        loading="lazy"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    </div>
  `;
}
