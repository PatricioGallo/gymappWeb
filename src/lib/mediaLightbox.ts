import { escapeHtml } from "./dom";
import { bindVideoResume, rememberVideoPosition } from "./videoResume";

export type MediaLightboxKind = "image" | "video";

function closeOverlay(): void {
  const loaderBody = document.getElementById("loaderBody");
  if (loaderBody) loaderBody.innerHTML = "";
}

// Frena el scroll de fondo con body fijo (no solo overflow:hidden) porque en Safari/Chrome
// mobile un position:fixed insertado mientras la pagina todavia tiene inercia de scroll
// puede quedar mal ubicado -- "flota" en el punto donde estaba scrolleada la pagina en vez
// de cubrir la pantalla, hasta el proximo scroll. Frenar el scroll antes de insertar el
// overlay evita esa carrera. Restaura la posicion exacta al cerrar.
function lockBodyScroll(): () => void {
  const scrollY = window.scrollY;
  const body = document.body;
  const prev = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width };
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  return () => {
    body.style.position = prev.position;
    body.style.top = prev.top;
    body.style.left = prev.left;
    body.style.right = prev.right;
    body.style.width = prev.width;
    window.scrollTo({ top: scrollY, left: 0, behavior: "instant" });
  };
}

export interface MediaLightboxController {
  goToNext: () => boolean;
  /** Repinta solo el pie con el item actual (mismo objeto, ya mutado por el caller) sin
   * reconstruir el overlay -- para acciones como me gusta que solo cambian un contador. */
  refresh: () => void;
  close: () => void;
}

export interface OpenMediaLightboxOptions<T> {
  queue: T[];
  startIndex: number;
  getMedia: (item: T) => { url: string; kind: MediaLightboxKind };
  /** Opcional: si no se pasa, el visor queda sin pie, solo el media a pantalla completa (uso del chat). */
  renderFooter?: (item: T, footerEl: HTMLElement, controller: MediaLightboxController) => void;
  /** Opcional: se llama al cerrarse el visor (cruz, Escape, fondo, o gesto de deslizar hacia abajo) -- ej. revocar un object URL creado solo para esta vista. */
  onClose?: () => void;
}

/**
 * Visor a pantalla completa de foto/video, compartido por los Reps (feed/perfil) y las
 * fotos del chat: mismo overlay oscuro, mismo boton de cerrar, mismo gesto de deslizar
 * hacia abajo para cerrar (y hacia arriba para pasar al siguiente item de la cola, si hay
 * mas de uno -- estilo Reels/TikTok), mismo zoom (pellizco o doble tap/click). Se cierra
 * con la cruz, Escape, o clickeando el fondo.
 */
export function openMediaLightbox<T>(options: OpenMediaLightboxOptions<T>): void {
  const { queue, getMedia, renderFooter } = options;
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody || queue.length === 0) return;

  const unlockBodyScroll = lockBodyScroll();

  loaderBody.innerHTML = `
    <div class="media-lightbox" id="mediaLightboxOverlay">
      <button type="button" class="media-lightbox-close" id="mediaLightboxClose" aria-label="Cerrar">✕</button>
      <div class="media-lightbox-media-wrap" id="mediaLightboxMediaWrap"></div>
      ${renderFooter ? `<div class="media-lightbox-footer" id="mediaLightboxFooter"></div>` : ""}
    </div>
  `;

  const overlay = document.getElementById("mediaLightboxOverlay")!;
  const mediaWrap = document.getElementById("mediaLightboxMediaWrap")!;
  const footer = document.getElementById("mediaLightboxFooter");

  let index = Math.max(Math.min(options.startIndex, queue.length - 1), 0);
  let currentItem = queue[index];

  // Corta el bind de "seguir donde iba" del video actual (ver renderMedia). Se
  // reasigna en cada renderMedia y se llama al cerrar / cambiar de item.
  let disposeVideoResume: (() => void) | null = null;

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    // Marca final exacta antes de soltar el video: el throttle de timeupdate pudo
    // dejar la ultima posicion hasta ~0.25s vieja, y quien abrio el visor (la
    // tarjeta del feed) va a leer esta marca justo despues via options.onClose.
    const closingVideo = mediaWrap.querySelector("video");
    if (closingVideo) rememberVideoPosition(getMedia(currentItem).url, closingVideo.currentTime);
    disposeVideoResume?.();
    document.removeEventListener("keydown", onKeydown);
    unlockBodyScroll();
    closeOverlay();
    options.onClose?.();
  }
  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKeydown);

  // ---------------------------------------------------------------------------
  // Zoom: pellizcar con dos dedos, o doble tap/doble click para alternar entre 1x
  // y ZOOM_DOUBLE_TAP. Mientras esta con zoom, arrastrar con un dedo desplaza la
  // imagen (pan) en vez de activar el gesto de cerrar/cambiar de abajo. Declarado
  // ANTES de renderMedia() porque renderMedia() llama a resetZoom() apenas se
  // invoca mas abajo -- si no, esos "let" todavia no estarian inicializados ahi.
  // ---------------------------------------------------------------------------
  const ZOOM_MAX = 4;
  const ZOOM_DOUBLE_TAP = 2.5;
  const DOUBLE_TAP_MS = 300;
  const DOUBLE_TAP_DIST = 30;
  let mediaEl: HTMLElement | null = null;
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  function applyZoomTransform(): void {
    if (mediaEl) mediaEl.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  function resetZoom(): void {
    scale = 1;
    panX = 0;
    panY = 0;
    if (mediaEl) {
      mediaEl.style.transition = "";
      mediaEl.classList.remove("is-zoomed");
      applyZoomTransform();
    }
  }

  function clampPan(): void {
    const maxPanX = (mediaWrap.clientWidth * (scale - 1)) / 2;
    const maxPanY = (mediaWrap.clientHeight * (scale - 1)) / 2;
    panX = clamp(panX, -maxPanX, maxPanX);
    panY = clamp(panY, -maxPanY, maxPanY);
  }

  function setZoom(newScale: number, animate: boolean): void {
    scale = clamp(newScale, 1, ZOOM_MAX);
    if (scale === 1) {
      panX = 0;
      panY = 0;
    } else {
      clampPan();
    }
    if (mediaEl) {
      mediaEl.style.transition = animate ? "transform 0.2s ease" : "";
      mediaEl.classList.toggle("is-zoomed", scale > 1);
    }
    applyZoomTransform();
  }

  function toggleZoomAt(clientX: number, clientY: number): void {
    if (scale > 1) {
      setZoom(1, true);
      return;
    }
    // Centra el zoom en el punto tocado en vez de siempre en el medio de la imagen.
    const rect = mediaWrap.getBoundingClientRect();
    panX = (rect.left + rect.width / 2 - clientX) * (ZOOM_DOUBLE_TAP - 1);
    panY = (rect.top + rect.height / 2 - clientY) * (ZOOM_DOUBLE_TAP - 1);
    setZoom(ZOOM_DOUBLE_TAP, true);
  }

  mediaWrap.addEventListener("dblclick", (e) => toggleZoomAt(e.clientX, e.clientY));

  function renderMedia(): void {
    disposeVideoResume?.();
    disposeVideoResume = null;
    const { url, kind } = getMedia(currentItem);
    mediaWrap.innerHTML =
      kind === "video"
        ? `<video class="media-lightbox-media" src="${escapeHtml(url)}" controls autoplay playsinline></video>`
        : `<img class="media-lightbox-media" src="${escapeHtml(url)}" alt="" draggable="false">`;
    mediaEl = mediaWrap.querySelector<HTMLElement>(".media-lightbox-media");
    resetZoom();
    const video = mediaWrap.querySelector("video");
    if (video) {
      // Seguir desde el segundo en que venia ese mismo media (ej. el video que ya
      // estaba corriendo mudo en el feed cuando se toco para abrir este visor), y
      // seguir marcando la posicion para cuando se vuelva a la tarjeta de atras.
      disposeVideoResume = bindVideoResume(video, url);
      // autoplay a veces no alcanza solo con el atributo (el elemento se crea via innerHTML,
      // no via una carga de página "de verdad"); .play() de mas no hace nada si ya arrancó.
      video.play().catch(() => {});
    }
  }

  function callRenderFooter(): void {
    if (!renderFooter || !footer) return;
    renderFooter(currentItem, footer, controller);
  }

  function goToNext(): boolean {
    if (index >= queue.length - 1) return false;
    index++;
    currentItem = queue[index];
    renderMedia();
    callRenderFooter();
    return true;
  }

  const controller: MediaLightboxController = { goToNext, refresh: callRenderFooter, close };

  renderMedia();
  callRenderFooter();

  document.getElementById("mediaLightboxClose")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) close(); // solo el fondo cierra, no un click en la imagen/video/pie
  });

  // Deslizar hacia abajo cierra el visor; hacia arriba pasa al siguiente item de la cola
  // (si hay uno -- si no, el gesto directamente no hace nada, ni se mueve la imagen). Se
  // sigue el dedo en vivo y si pasa el umbral (o el gesto fue rapido) hace su acción; si
  // no, vuelve solo a su lugar. La apertura desliza desde abajo via CSS (ver .media-lightbox
  // en modern.css); esto es el gesto que la mueve despues de abierta.
  //
  // El drag no se "compromete" (transform/preventDefault/capture) hasta pasar
  // DRAG_ENGAGE_THRESHOLD de movimiento vertical: por debajo de eso, un toque en los
  // controles nativos del video (play/pausa, barra) sigue llegando intacto, sin que este
  // gesto se lo coma.
  const DISMISS_DISTANCE = 120;
  const DISMISS_VELOCITY = 0.5; // px/ms
  const DRAG_ENGAGE_THRESHOLD = 12;
  let dragging = false;
  let engaged = false;
  let hasNext = false;
  let startY = 0;
  let startTime = 0;
  let dragY = 0;

  // Pointers activos por id, para distinguir un pellizco de dos dedos de un arrastre
  // de uno solo -- Pointer Events dispara un down/move/up independiente por cada dedo.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let panStartX = 0;
  let panStartY = 0;
  let panPointerX = 0;
  let panPointerY = 0;

  function pinchDistance(): number {
    const pts = [...pointers.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  // La captura del puntero se difiere hasta "engaged" (recien cuando el gesto se
  // confirma) en los casos de un solo dedo: asi un tap en los controles nativos del
  // video sigue llegando intacto. Con el segundo dedo (el pellizco) no hay ambiguedad
  // posible con un tap, asi que ahi se captura de una.
  function onPointerDown(e: PointerEvent): void {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".media-lightbox-close, .media-lightbox-footer")) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      // Arranca el pellizco: se cancela cualquier arrastre de un solo dedo en curso.
      dragging = false;
      engaged = false;
      overlay.classList.remove("media-lightbox-dragging");
      overlay.style.transform = "";
      overlay.style.opacity = "";
      for (const id of pointers.keys()) overlay.setPointerCapture(id);
      pinchStartDist = pinchDistance();
      pinchStartScale = scale;
      return;
    }
    if (pointers.size > 2) return;

    dragging = true;
    engaged = false;
    hasNext = index < queue.length - 1;
    startY = e.clientY;
    startTime = Date.now();
    dragY = 0;
    panStartX = panX;
    panStartY = panY;
    panPointerX = e.clientX;
    panPointerY = e.clientY;
  }

  function onPointerMove(e: PointerEvent): void {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      e.preventDefault();
      const dist = pinchDistance();
      if (pinchStartDist > 0) setZoom(pinchStartScale * (dist / pinchStartDist), false);
      return;
    }
    if (!dragging) return;

    if (scale > 1) {
      // Con zoom activo, un dedo desplaza la imagen (pan) en vez de cerrar/cambiar de item.
      if (!engaged) {
        const moved = Math.hypot(e.clientX - panPointerX, e.clientY - panPointerY);
        if (moved < DRAG_ENGAGE_THRESHOLD) return; // todavia podria ser un tap (ej. doble tap)
        engaged = true;
        overlay.setPointerCapture(e.pointerId);
      }
      e.preventDefault();
      panX = panStartX + (e.clientX - panPointerX);
      panY = panStartY + (e.clientY - panPointerY);
      clampPan();
      applyZoomTransform();
      return;
    }

    dragY = e.clientY - startY;
    if (dragY < 0 && !hasNext) return; // swipe hacia arriba sin siguiente: no hace nada
    if (!engaged) {
      if (Math.abs(dragY) < DRAG_ENGAGE_THRESHOLD) return; // todavia podria ser un tap en los controles nativos
      engaged = true;
      overlay.classList.add("media-lightbox-dragging");
      overlay.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
    overlay.style.transform = `translateY(${dragY}px)`;
    overlay.style.opacity = dragY > 0 ? String(Math.max(1 - dragY / 400, 0.4)) : "1";
  }

  function endDrag(e: PointerEvent): void {
    const wasPinching = pointers.size === 2;
    pointers.delete(e.pointerId);
    if (wasPinching) {
      // Si sigue quedando un dedo apoyado del pellizco, se espera a que tambien se
      // levante en vez de arrancar un drag nuevo con ese mismo toque.
      dragging = false;
      engaged = false;
      return;
    }
    if (pointers.size >= 1) return; // sigue habiendo un dedo apoyado, no se termino el gesto
    if (!dragging) return;
    dragging = false;

    if (!engaged) {
      // Fue un tap simple (ni arrastre ni pellizco), con o sin zoom activo: si fue rapido y
      // cerca del anterior cuenta como doble tap y alterna el zoom; si no, no hace nada
      // (ej. un tap suelto en los controles nativos del video). Con mouse esto se ignora --
      // el listener nativo de "dblclick" de mas arriba ya cubre el doble click, y contar
      // ademas aca duplicaria el toggle (zoom entra y sale en el mismo click).
      if (e.pointerType !== "mouse") {
        const now = Date.now();
        const dist = Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY);
        if (now - lastTapTime < DOUBLE_TAP_MS && dist < DOUBLE_TAP_DIST) {
          toggleZoomAt(e.clientX, e.clientY);
          lastTapTime = 0;
        } else {
          lastTapTime = now;
          lastTapX = e.clientX;
          lastTapY = e.clientY;
        }
      }
      return;
    }

    if (scale > 1) return; // fue un pan: ya se aplico en vivo, nada mas que hacer al soltar

    overlay.classList.remove("media-lightbox-dragging");
    const velocity = dragY / Math.max(Date.now() - startTime, 1);
    if (dragY > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
      close();
      return;
    }
    // Si no habia siguiente, goToNext() no hizo nada y esto es simplemente el reset de
    // "volver a su lugar" -- funciona igual para el rebote que para el cambio de item.
    if (dragY < -DISMISS_DISTANCE || velocity < -DISMISS_VELOCITY) goToNext();
    overlay.style.transform = "";
    overlay.style.opacity = "";
  }

  overlay.addEventListener("pointerdown", onPointerDown);
  overlay.addEventListener("pointermove", onPointerMove);
  overlay.addEventListener("pointerup", endDrag);
  overlay.addEventListener("pointercancel", endDrag);
}
