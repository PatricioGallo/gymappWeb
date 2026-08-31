// Memoria compartida de "en qué segundo iba cada video": deja que un video que
// arrancó en el feed siga desde ahí al abrir el visor a pantalla completa (o el
// modal de detalle del Rep), y al revés, que la tarjeta del feed se ponga al día
// al volver del visor. Clave: la URL del media -- el mismo Rep se ve con la misma
// src en el feed, el visor y el hilo. Solo vive en memoria (se pierde al recargar):
// es una comodidad, no estado que valga la pena persistir.

interface Mark {
  time: number;
  at: number;
}

const marks = new Map<string, Mark>();

// Pasado este tiempo damos por hecho que el usuario ya se olvidó de ese video y
// conviene arrancarlo de cero en vez de saltar a un punto que ya no espera.
const MAX_AGE_MS = 5 * 60 * 1000;
// Ni molestarse en recordar/saltar por unos pocos cuadros.
const MIN_SEEK = 0.75;

export function rememberVideoPosition(url: string | null | undefined, seconds: number): void {
  if (!url || !Number.isFinite(seconds) || seconds < MIN_SEEK) return;
  marks.set(url, { time: seconds, at: Date.now() });
}

export function recallVideoPosition(url: string | null | undefined): number {
  if (!url) return 0;
  const mark = marks.get(url);
  if (!mark) return 0;
  if (Date.now() - mark.at > MAX_AGE_MS) {
    marks.delete(url);
    return 0;
  }
  return mark.time;
}

/**
 * Engancha un <video>: (a) al tener metadata salta a donde había quedado ese media
 * (si la marca es reciente y no está casi al final), y (b) mientras corre va
 * guardando su posición para el próximo lugar donde se abra el mismo video.
 * Devuelve un disposer que corta los listeners (llamarlo antes de tirar el elemento).
 */
export function bindVideoResume(video: HTMLVideoElement, url: string | null | undefined): () => void {
  if (!url) return () => {};

  function seekToMark(): void {
    const target = recallVideoPosition(url);
    if (target < MIN_SEEK) return;
    const dur = video.duration;
    if (Number.isFinite(dur) && target > dur - MIN_SEEK) return; // marca casi al final: arrancar de cero
    if (Math.abs(video.currentTime - target) < MIN_SEEK) return; // ya está donde toca
    try {
      video.currentTime = target;
    } catch {
      // el navegador puede rechazar el seek si todavía no hay rango buscable, no es un error real
    }
  }

  if (video.readyState >= 1 /* HAVE_METADATA */) seekToMark();
  else video.addEventListener("loadedmetadata", seekToMark);

  // timeupdate dispara varias veces por segundo: guardamos como mucho ~4/s.
  let lastSaved = 0;
  function onTimeUpdate(): void {
    const now = Date.now();
    if (now - lastSaved < 250) return;
    lastSaved = now;
    rememberVideoPosition(url, video.currentTime);
  }
  video.addEventListener("timeupdate", onTimeUpdate);
  video.addEventListener("pause", onTimeUpdate);

  return () => {
    video.removeEventListener("loadedmetadata", seekToMark);
    video.removeEventListener("timeupdate", onTimeUpdate);
    video.removeEventListener("pause", onTimeUpdate);
  };
}
