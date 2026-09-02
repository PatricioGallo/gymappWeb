import type { ViewContext } from "../shell/viewContext";

interface PullToRefreshOptions {
  /** Indicador (con el .modern-spinner adentro) cuya altura se anima de 0 a X mientras se arrastra. */
  indicator: HTMLElement;
  /** Container de la vista. Si esta hidden (el router la dejo viva en background), el gesto se ignora
   *  -- sin esto, arrastrar hacia abajo en OTRA vista dispararia preventDefault() aca y bloquearia
   *  su scroll (mismo problema que ya tuvo feed.ts con la lista de chats). */
  container: HTMLElement;
  /** Se llama al soltar pasado el umbral. El spinner queda visible mientras la promesa este pendiente. */
  onRefresh: () => Promise<void>;
  ctx: ViewContext;
}

/**
 * Pull-to-refresh tactil (solo mobile): arrastrar hacia abajo estando ya arriba del todo dispara
 * onRefresh(). Generalizacion del gesto que originalmente vivia inline en feed.ts. Todos los
 * listeners van atados a ctx.signal, asi que se desenganchan solos al desmontar la vista.
 */
export function setupPullToRefresh({ indicator, container, onRefresh, ctx }: PullToRefreshOptions): void {
  const THRESHOLD = 70;
  const MAX = 110;
  const LOADING_HEIGHT = 56;

  let dragging = false;
  let active = false; // true una vez que se movio hacia abajo lo suficiente como para contar como "pull" y no un scroll comun
  let startY = 0;
  let refreshing = false;

  const isMobile = (): boolean => window.matchMedia("(max-width: 859px)").matches;
  const isAtTop = (): boolean => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

  function setHeight(px: number, animated: boolean): void {
    indicator.classList.toggle("pull-refresh-animate", animated);
    indicator.style.height = `${px}px`;
  }

  async function run(): Promise<void> {
    refreshing = true;
    setHeight(LOADING_HEIGHT, true);
    try {
      await onRefresh();
    } catch {
      // silencioso: un pull-to-refresh fallido no tiene mucho mas que mostrar que "no paso nada"
    } finally {
      setHeight(0, true);
      refreshing = false;
    }
  }

  document.addEventListener(
    "touchstart",
    (e) => {
      if (refreshing || container.hidden || !isMobile() || !isAtTop()) return;
      dragging = true;
      active = false;
      startY = e.touches[0].clientY;
    },
    { passive: true, signal: ctx.signal }
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      if (!dragging) return;
      const deltaY = e.touches[0].clientY - startY;
      if (deltaY <= 0 || !isAtTop()) {
        dragging = false;
        if (active) setHeight(0, true);
        active = false;
        return;
      }
      active = true;
      e.preventDefault(); // corta el rebote/pull-to-refresh nativo mientras dura el gesto propio
      setHeight(Math.min(deltaY * 0.5, MAX), false);
    },
    { passive: false, signal: ctx.signal }
  );

  function onEnd(): void {
    if (!dragging) return;
    dragging = false;
    if (!active) return;
    active = false;
    const reached = indicator.getBoundingClientRect().height >= THRESHOLD;
    if (reached) void run();
    else setHeight(0, true);
  }
  document.addEventListener("touchend", onEnd, { signal: ctx.signal });
  document.addEventListener("touchcancel", onEnd, { signal: ctx.signal });
}
