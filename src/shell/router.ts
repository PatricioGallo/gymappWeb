import { requireAuth, getOptionalAuth } from "../lib/nav";
import { createViewContext, type ViewContext } from "./viewContext";

export interface ViewModule {
  /** userId viene resuelto por el router (null si la ruta no requiere auth, o si es "optional"
   * y no hay sesion) -- evita que cada vista tenga que resolver su propia sesion y duplicar el
   * heartbeat/presencia. Solo se llama una vez por instancia (ver keyFor) -- reabrir la misma
   * instancia despues nunca vuelve a llamar mount(), ver onShow. */
  mount(container: HTMLElement, params: URLSearchParams, ctx: ViewContext, userId: string | null): void | Promise<void>;
  /** La instancia activa recibe params nuevos sin desmontarse (ej. cambiar de ?c=ID dentro de
   * un chat ya abierto). No confundir con onShow: esto es para cambios DENTRO de la misma
   * instancia; onShow es para cuando se vuelve a esta instancia desde otra. */
  update?(params: URLSearchParams): void;
  /** Esta instancia pasa a ser la visible -- tanto justo despues del primer mount() como cada
   * vez que se vuelve a ella desde otra vista ya visitada. Buen lugar para clases de <body>
   * que dependen de que vista esta activa (la instancia puede quedar viva pero oculta en
   * background, asi que mount()/ctx.addCleanup() no alcanzan para esto). */
  onShow?(): void;
  /** Esta instancia deja de ser la visible (se oculta en background, o se descarta del todo --
   * en ambos casos hay que sacarle de encima cualquier cosa que dependa de estar "activa"). */
  onHide?(): void;
}

/**
 * "required": redirige a login.html si no hay sesion (la mayoria de las paginas).
 * "optional": resuelve el userId si hay sesion, pero nunca redirige (ej. perfil publico).
 * "none": userId siempre null, ni se consulta la sesion (paginas publicas puras).
 */
export type AuthMode = "required" | "optional" | "none";

interface RouteDef {
  match(pathname: string): URLSearchParams | null;
  view: ViewModule;
  auth: AuthMode;
  /** Identifica la instancia dentro de esta ruta -- por default todas las visitas a una ruta
   * comparten la misma instancia unica (chats, notificaciones, busqueda: no tiene sentido tener
   * dos). Rutas que representan "una entidad distinta por parametro" (perfil por username) la
   * sobreescriben para que cada entidad visitada tenga su propia instancia cacheada. */
  keyFor?(params: URLSearchParams): string;
  /** Cuantas instancias de esta ruta se mantienen vivas en memoria (ocultas) al mismo tiempo
   * antes de descartar la mas vieja. Default 1. Solo importa para rutas con keyFor (perfil) --
   * las de instancia unica nunca compiten consigo mismas. */
  maxInstances?: number;
}

interface Instance {
  el: HTMLElement;
  ctx: ViewContext;
  lastUsed: number;
}

const routes: RouteDef[] = [];
// Todas las instancias vivas de cada VISTA (no ruta -- dos rutas distintas pueden apuntar a la
// misma vista, ej. perfil exacto y el catch-all de username, y tienen que compartir el mismo
// cache de instancias para no terminar con dos copias vivas del mismo perfil), aunque esten
// ocultas -- volver a una no vuelve a montar nada, solo la muestra (ver Instance/onShow). Es la
// generalizacion, a nivel de router, del mismo patron que ya usa chats.ts para mantener vivo
// cada hilo de chat abierto.
const instancesByView = new Map<ViewModule, Map<string, Instance>>();
let active: { view: ViewModule; key: string } | null = null;
let viewRoot: HTMLElement | null = null;

function instancesFor(view: ViewModule): Map<string, Instance> {
  let map = instancesByView.get(view);
  if (!map) {
    map = new Map();
    instancesByView.set(view, map);
  }
  return map;
}

/**
 * Registra una ruta migrada al shell. Se evaluan en el orden en que se registran -- por eso
 * la ruta catch-all de perfil por username (Fase 5) tiene que registrarse ultima, despues de
 * cualquier ruta exacta.
 */
export function registerRoute(def: RouteDef): void {
  routes.push(def);
}

function resolve(pathname: string): { route: RouteDef; params: URLSearchParams } | null {
  for (const route of routes) {
    const params = route.match(pathname);
    if (params) return { route, params };
  }
  return null;
}

/** Usado por linkInterceptor para decidir si un click se resuelve client-side o navega de verdad. */
export function isRouteRegistered(pathname: string): boolean {
  return resolve(pathname) !== null;
}

function evictOldest(view: ViewModule, max: number): void {
  const instances = instancesFor(view);
  while (instances.size >= max) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, inst] of instances) {
      if (inst.lastUsed < oldestTime) {
        oldestTime = inst.lastUsed;
        oldestKey = key;
      }
    }
    if (oldestKey === null) return;
    const evicted = instances.get(oldestKey)!;
    evicted.ctx.dispose();
    evicted.el.remove();
    instances.delete(oldestKey);
  }
}

async function renderCurrentLocation(): Promise<void> {
  if (!viewRoot) return;
  const url = new URL(location.href);
  const match = resolve(url.pathname);
  if (!match) return; // no deberia pasar si isRouteRegistered ya filtro antes de navegar

  const params = new URLSearchParams(url.search);
  for (const [k, v] of match.params) params.set(k, v);

  const key = match.route.keyFor ? match.route.keyFor(params) : "__default__";
  const view = match.route.view;

  // Misma instancia ya activa: no hay nada que mostrar/ocultar, solo avisarle que
  // cambiaron los params (ej. otro ?c=ID dentro del mismo chat ya abierto).
  if (active?.view === view && active.key === key) {
    view.update?.(params);
    return;
  }

  const instances = instancesFor(view);
  const cached = instances.get(key);

  let userId: string | null = null;
  if (!cached) {
    if (match.route.auth === "required") {
      userId = await requireAuth().catch(() => null);
      if (!userId) return; // requireAuth ya redirigio a login.html
    } else if (match.route.auth === "optional") {
      userId = await getOptionalAuth().catch(() => null);
    }
  }

  // Ocultar (sin destruir) lo que estaba activo -- sigue vivo en memoria para cuando se
  // vuelva, salvo que su propia vista ya haya limitado cuantas instancias mantiene.
  if (active) {
    const prevInstances = instancesFor(active.view);
    const prev = prevInstances.get(active.key);
    if (prev) {
      prev.el.setAttribute("hidden", "");
      active.view.onHide?.();
    }
  }

  if (cached) {
    cached.el.removeAttribute("hidden");
    cached.lastUsed = Date.now();
    active = { view, key };
    view.update?.(params);
    view.onShow?.();
    return;
  }

  evictOldest(view, match.route.maxInstances ?? 1);

  const el = document.createElement("div");
  viewRoot.appendChild(el);
  const ctx = createViewContext();
  instances.set(key, { el, ctx, lastUsed: Date.now() });
  active = { view, key };
  await view.mount(el, params, ctx, userId);
  view.onShow?.();
}

/** Navegacion client-side. La usa linkInterceptor y las vistas migradas (ej. abrir un chat). */
export function navigate(url: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  void renderCurrentLocation();
}

/**
 * Para navegacion programatica (ej. location.href = "x.html" hoy) donde el destino puede o no
 * estar migrado todavia: si ya esta migrado, navega client-side; si no, hace un reload real.
 * Asi no hace falta condicionar cada llamador a mano segun el estado de la migracion.
 */
export function smartNavigate(url: string): void {
  const target = new URL(url, location.href);
  if (target.origin === location.origin && isRouteRegistered(target.pathname)) {
    navigate(target.pathname + target.search);
  } else {
    location.href = url;
  }
}

/** Arranca el router contra #view-root. Se llama una vez, desde el bootstrap de cada pagina migrada. */
export function startRouter(root: HTMLElement): void {
  viewRoot = root;
  window.addEventListener("popstate", () => void renderCurrentLocation());
  void renderCurrentLocation();
}
