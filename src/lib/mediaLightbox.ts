import { escapeHtml } from "./dom";
import { bindVideoResume, rememberVideoPosition } from "./videoResume";

export type MediaLightboxKind = "image" | "video";

export interface MediaLightboxMedia {
  url: string;
  kind: MediaLightboxKind;
}

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
  /** Igual que goToNext pero hacia atrás -- false si ya está en el primer item de la cola. */
  goToPrev: () => boolean;
  /** Repinta solo el pie con el item actual (mismo objeto, ya mutado por el caller) sin
   * reconstruir el overlay -- para acciones como me gusta que solo cambian un contador. */
  refresh: () => void;
  close: () => void;
}

export interface OpenMediaLightboxOptions<T> {
  queue: T[];
  startIndex: number;
  /** Devolvé el media ya resuelto, o una promesa que resuelve a él (o a null si falló) --
   * en ese caso el visor se abre YA con un spinner y pinta el media recién cuando la promesa
   * resuelve. Lo usa el chat para las fotos/videos efímeros: la cadena de "marcar visto +
   * URL firmada + descarga" corre por detrás sin dejar la pantalla en blanco. */
  getMedia: (item: T) => MediaLightboxMedia | Promise<MediaLightboxMedia | null>;
  /** Opcional: si no se pasa, el visor queda sin pie, solo el media a pantalla completa (uso del chat). */
  renderFooter?: (item: T, footerEl: HTMLElement, controller: MediaLightboxController) => void;
  /** Opcional: se llama al cerrarse el visor (cruz, Escape, fondo, o gesto de deslizar hacia abajo) -- ej. revocar un object URL creado solo para esta vista. */
  onClose?: () => void;
  /** Opcional: fondo 100% opaco en vez del negro semitransparente por defecto -- lo usa el
   * chat para las efímeras, así no se ve la conversación por detrás mientras está abierta. */
  opaque?: boolean;
  /**
   * Opcional (default false): cambia el gesto de arrastre de un dedo de vertical (abajo cierra,
   * arriba pasa al siguiente, estilo Reels -- el comportamiento de siempre) a horizontal
   * (izquierda pasa al siguiente, derecha vuelve al anterior, estilo carrusel/stories). En este
   * modo cerrar arrastrando queda deshabilitado -- solo cruz, Escape o click en el fondo --
   * porque ese eje ahora lo usa la navegación. Pensado para colecciones sin orden temporal tipo
   * Reels (ej. fotos de progreso), donde "avanzar/volver" es más natural que "siguiente/cerrar".
   */
  horizontalNav?: boolean;
}

/**
 * Visor a pantalla completa de foto/video, compartido por los Reps (feed/perfil) y las
 * fotos del chat: mismo overlay oscuro, mismo boton de cerrar, mismo gesto de deslizar
 * hacia abajo para cerrar (y hacia arriba para pasar al siguiente item de la cola, si hay
 * mas de uno -- estilo Reels/TikTok), mismo zoom (pellizco o doble tap/click). Se cierra
 * con la cruz, Escape, o clickeando el fondo.
 */
export function openMediaLightbox<T>(options: OpenMediaLightboxOptions<T>): MediaLightboxController | undefined {
  const { queue, getMedia, renderFooter } = options;
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody || queue.length === 0) return undefined;
  const horizontalNav = !!options.horizontalNav;

  const unlockBodyScroll = lockBodyScroll();

  loaderBody.innerHTML = `
    <div class="media-lightbox${options.opaque ? " media-lightbox-opaque" : ""}${horizontalNav ? " media-lightbox-carousel" : ""}" id="mediaLightboxOverlay">
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

  // URL del media efectivamente pintado (ver paintMedia): se guarda aparte porque getMedia
  // puede ser async y devolver una promesa -- no se puede volver a llamar en close() para
  // sacarle la url sin re-disparar el trabajo de atrás.
  let currentMediaUrl: string | null = null;

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    // Marca final exacta antes de soltar el video: el throttle de timeupdate pudo
    // dejar la ultima posicion hasta ~0.25s vieja, y quien abrio el visor (la
    // tarjeta del feed) va a leer esta marca justo despues via options.onClose.
    // mediaEl (no un querySelector sobre mediaWrap) es el video ACTUAL -- con horizontalNav
    // mediaWrap puede tener hasta 3 <video> a la vez (anterior/actual/siguiente).
    const closingVideo = mediaEl?.tagName === "VIDEO" ? (mediaEl as HTMLVideoElement) : null;
    if (closingVideo && currentMediaUrl) rememberVideoPosition(currentMediaUrl, closingVideo.currentTime);
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
  /** Solo horizontalNav: la "cinta" de 3 paneles (anterior/actual/siguiente) -- ver renderTrack. */
  let trackEl: HTMLElement | null = null;
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

  let renderSeq = 0;

  function paintMedia({ url, kind }: MediaLightboxMedia): void {
    currentMediaUrl = url;
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

  // ---------------------------------------------------------------------------
  // horizontalNav: en vez de pintar UN solo media en mediaWrap, arma una "cinta" de 3 paneles
  // (anterior/actual/siguiente, cada uno 33.33% de ancho) para que arrastrar mueva la cinta en
  // vivo -- la foto de al lado ya está pintada y se ve entrar siguiendo el dedo, en vez de recién
  // cambiar de golpe al soltar (ver setTrackTransform/finishSlide, usadas desde el gesto más
  // abajo). El modo vertical (default, sin horizontalNav) no usa nada de esto.
  // ---------------------------------------------------------------------------

  function setTrackTransform(dragPx: number): void {
    if (trackEl) trackEl.style.transform = `translateX(calc(-33.3333% + ${dragPx}px))`;
  }

  /** Pinta un media (sync o async) dentro de UN panel de la cinta. Solo el panel "actual" queda
   * enganchado a mediaEl/zoom/video-resume -- los de al lado son una vista previa nomás. */
  function paintSlide(el: HTMLElement, item: T, isCurrent: boolean): void {
    const result = getMedia(item);
    if (result instanceof Promise) {
      el.innerHTML = `<div class="modern-spinner media-lightbox-spinner" role="status" aria-label="Cargando"></div>`;
      void result.then(
        (media) => {
          // el.isConnected: si la cinta se reconstruyó (renderTrack) mientras esto bajaba, este
          // panel ya es viejo -- pintar ahí sería invisible (y para el actual, pisaría datos
          // de la foto nueva con la vieja).
          if (closed || !el.isConnected) return;
          if (media) paintSlideMedia(el, media, isCurrent);
          else el.innerHTML = `<p class="media-lightbox-msg">No se pudo cargar el contenido.</p>`;
        },
        () => {
          if (closed || !el.isConnected) return;
          el.innerHTML = `<p class="media-lightbox-msg">No se pudo cargar el contenido.</p>`;
        }
      );
      return;
    }
    paintSlideMedia(el, result, isCurrent);
  }

  function paintSlideMedia(el: HTMLElement, { url, kind }: MediaLightboxMedia, isCurrent: boolean): void {
    el.innerHTML =
      kind === "video"
        ? `<video class="media-lightbox-media" src="${escapeHtml(url)}" ${isCurrent ? "controls autoplay" : "muted"} playsinline></video>`
        : `<img class="media-lightbox-media" src="${escapeHtml(url)}" alt="" draggable="false">`;
    if (!isCurrent) return; // panel vecino: solo vista previa, no toca mediaEl/zoom/video-resume
    currentMediaUrl = url;
    mediaEl = el.querySelector<HTMLElement>(".media-lightbox-media");
    resetZoom();
    const video = el.querySelector("video");
    if (video) {
      disposeVideoResume = bindVideoResume(video, url);
      video.play().catch(() => {});
    }
  }

  function renderTrack(): void {
    mediaWrap.innerHTML = `
      <div class="media-lightbox-track" id="mediaLightboxTrack">
        <div class="media-lightbox-slide" id="mediaLightboxSlidePrev"></div>
        <div class="media-lightbox-slide" id="mediaLightboxSlideCurrent"></div>
        <div class="media-lightbox-slide" id="mediaLightboxSlideNext"></div>
      </div>
    `;
    trackEl = document.getElementById("mediaLightboxTrack");
    setTrackTransform(0);

    const prevItem = index > 0 ? queue[index - 1] : null;
    const nextItem = index < queue.length - 1 ? queue[index + 1] : null;
    if (prevItem) paintSlide(document.getElementById("mediaLightboxSlidePrev")!, prevItem, false);
    paintSlide(document.getElementById("mediaLightboxSlideCurrent")!, currentItem, true);
    if (nextItem) paintSlide(document.getElementById("mediaLightboxSlideNext")!, nextItem, false);
  }

  /**
   * Termina el gesto horizontal animando la cinta el resto del camino: a la foto siguiente
   * (-66.6666%), a la anterior (0%), o de vuelta a la actual (-33.3333%, "cancel" -- el drag no
   * llegó al umbral). Solo next/prev cambian de índice, y recién CUANDO TERMINA la animación
   * (transitionend, con un timeout de respaldo por si el navegador no lo dispara) -- goToNext/
   * goToPrev reconstruyen la cinta entera centrada de nuevo vía renderTrack.
   */
  function finishSlide(direction: "next" | "prev" | "cancel"): void {
    if (!trackEl) return;
    const track = trackEl;
    const targetPercent = direction === "next" ? -66.6666 : direction === "prev" ? 0 : -33.3333;
    track.style.transition = "transform 0.25s ease";
    track.style.transform = `translateX(${targetPercent}%)`;
    if (direction === "cancel") return;

    // Mientras esto está en camino, onPointerDown bloquea un drag nuevo (ver isAdvancing) -- sin
    // eso, un segundo swipe empezado ANTES de que este termine pisa el transform/transition de la
    // cinta a mitad de camino con el startX/hasNext/hasPrev de un index que todavía no cambió,
    // pudiendo dejar la cinta trabada mostrando dos fotos a la vez en vez de una sola.
    isAdvancing = true;
    let done = false;
    const advance = () => {
      if (done || closed) return;
      done = true;
      track.removeEventListener("transitionend", advance);
      clearTimeout(timeoutId);
      if (direction === "next") goToNext();
      else goToPrev();
      isAdvancing = false;
    };
    track.addEventListener("transitionend", advance, { once: true });
    const timeoutId = setTimeout(advance, 300); // red de seguridad si transitionend no llega a disparar
  }

  function renderMedia(): void {
    disposeVideoResume?.();
    disposeVideoResume = null;
    mediaEl = null;
    currentMediaUrl = null;
    if (horizontalNav) {
      renderTrack();
      return;
    }
    const result = getMedia(currentItem);
    if (result instanceof Promise) {
      const seq = ++renderSeq;
      mediaWrap.innerHTML = `<div class="modern-spinner media-lightbox-spinner" role="status" aria-label="Cargando"></div>`;
      void result.then(
        (media) => {
          if (seq !== renderSeq || closed) return;
          if (media) paintMedia(media);
          else mediaWrap.innerHTML = `<p class="media-lightbox-msg">No se pudo cargar el contenido.</p>`;
        },
        () => {
          if (seq !== renderSeq || closed) return;
          mediaWrap.innerHTML = `<p class="media-lightbox-msg">No se pudo cargar el contenido.</p>`;
        }
      );
      return;
    }
    paintMedia(result);
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

  function goToPrev(): boolean {
    if (index <= 0) return false;
    index--;
    currentItem = queue[index];
    renderMedia();
    callRenderFooter();
    return true;
  }

  const controller: MediaLightboxController = { goToNext, goToPrev, refresh: callRenderFooter, close };

  renderMedia();
  callRenderFooter();

  document.getElementById("mediaLightboxClose")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (suppressBackgroundClick) {
      suppressBackgroundClick = false;
      return;
    }
    // "Fondo" = cualquier click que NO caiga en el media, el pie o la cruz. Antes exigía
    // e.target === overlay -- pero mediaWrap (y, en horizontalNav, track/slide) son wrappers de
    // layout que cubren TODA esa zona, así que un click "al lado de la foto" nunca tenía a
    // overlay como target real y no cerraba nada.
    if (!(e.target as HTMLElement).closest(".media-lightbox-media, .media-lightbox-footer, .media-lightbox-close")) close();
  });

  // Deslizar hacia abajo cierra el visor; hacia arriba pasa al siguiente item de la cola
  // (si hay uno -- si no, el gesto directamente no hace nada, ni se mueve la imagen). Con
  // options.horizontalNav este mismo mecanismo pasa a moverse en X en vez de Y (izquierda =
  // siguiente, derecha = anterior) y pierde el cierre por arrastre (ver más abajo, ramas
  // `if (horizontalNav)`) -- el resto del gesto (umbral de enganche, velocidad, rebote si no hay
  // item de ese lado) es el mismo código, solo cambia el eje. Se
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
  let hasPrev = false;
  // Solo horizontalNav: true entre que un swipe cruza el umbral y termina de animar+cambiar de
  // índice (ver finishSlide) -- bloquea un drag nuevo mientras tanto (ver onPointerDown).
  let isAdvancing = false;
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let dragX = 0;
  let dragY = 0;
  // Un drag que llegó a "engaged" a veces igual dispara, al soltar, el click de compatibilidad
  // del navegador con target=overlay (el pointer capture lo retarget ahí) -- sin esto, ese click
  // cae en el listener de "click en el fondo cierra" de más abajo y cierra el visor de rebote
  // justo después de navegar. Se prende al enganchar el drag y el propio listener lo consume.
  let suppressBackgroundClick = false;

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
    // Un swipe anterior todavía está animando hacia la foto vecina y cambiando de índice (ver
    // finishSlide) -- si se dejara arrancar un drag nuevo acá, pisaría la cinta a mitad de
    // camino con datos del índice viejo y podía quedar mostrando dos fotos superpuestas.
    if (horizontalNav && isAdvancing) {
      // Sin este drag, el pointerup de este mismo toque sigue de largo como un click nativo sin
      // interceptar -- si no se suprime, el listener de "click afuera cierra" de más abajo podía
      // llegar a cerrar el visor de rebote por un swipe que arrancó una fracción de segundo antes
      // de que el anterior terminara de asentarse.
      suppressBackgroundClick = true;
      return;
    }
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
    suppressBackgroundClick = false;
    hasNext = index < queue.length - 1;
    hasPrev = index > 0;
    startX = e.clientX;
    startY = e.clientY;
    startTime = Date.now();
    dragX = 0;
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
        suppressBackgroundClick = true;
        overlay.setPointerCapture(e.pointerId);
      }
      e.preventDefault();
      panX = panStartX + (e.clientX - panPointerX);
      panY = panStartY + (e.clientY - panPointerY);
      clampPan();
      applyZoomTransform();
      return;
    }

    if (horizontalNav) {
      dragX = e.clientX - startX;
      if ((dragX < 0 && !hasNext) || (dragX > 0 && !hasPrev)) return; // sin item de ese lado: no se mueve
      if (!engaged) {
        if (Math.abs(dragX) < DRAG_ENGAGE_THRESHOLD) return; // todavia podria ser un tap en los controles nativos
        engaged = true;
        suppressBackgroundClick = true;
        overlay.setPointerCapture(e.pointerId);
        if (trackEl) trackEl.style.transition = "none"; // sin esto cada frame animaria detras del dedo
      }
      e.preventDefault();
      setTrackTransform(dragX); // mueve la cinta -- la foto vecina ya está pintada, se ve entrar en vivo
      return;
    }

    dragY = e.clientY - startY;
    if (dragY < 0 && !hasNext) return; // swipe hacia arriba sin siguiente: no hace nada
    if (!engaged) {
      if (Math.abs(dragY) < DRAG_ENGAGE_THRESHOLD) return; // todavia podria ser un tap en los controles nativos
      engaged = true;
      suppressBackgroundClick = true;
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

    overlay.classList.remove("media-lightbox-dragging"); // no-op en horizontalNav (nunca se agrega, ver onPointerMove)
    // .media-lightbox-dragging apaga "animation" mientras se arrastra (ver esa clase en
    // modern.css); al sacarla, "animation" vuelve a valer media-lightbox-slide-up y el navegador
    // la re-dispara desde cero (pasar de animation:none a un nombre de animación la reinicia,
    // aunque ya se haya reproducido antes) -- se veía como que la foto siguiente "entraba desde
    // abajo" en cada swipe vertical. Fijarla a "none" por estilo inline (gana por especificidad a
    // la clase) apenas termina el primer drag deja esa animación de entrada como lo que es: algo
    // de una sola vez, al abrir el visor. Inofensivo para horizontalNav (ahí quien anima es
    // trackEl, no overlay).
    overlay.style.animation = "none";

    if (horizontalNav) {
      const velocityX = dragX / Math.max(Date.now() - startTime, 1);
      if (dragX < -DISMISS_DISTANCE || velocityX < -DISMISS_VELOCITY) finishSlide("next");
      else if (dragX > DISMISS_DISTANCE || velocityX > DISMISS_VELOCITY) finishSlide("prev");
      else finishSlide("cancel"); // no llegó al umbral: la cinta vuelve a mostrar la actual
      return;
    }

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

  return controller;
}
