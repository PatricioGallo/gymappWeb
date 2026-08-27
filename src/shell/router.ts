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
  /** Carga perezosa (dynamic import) en vez de un ViewModule ya resuelto -- así Vite separa el
   * código de cada página en su propio chunk en vez de empaquetar las 21 juntas en uno solo que
   * se descarga entero apenas se visita cualquiera de ellas (ver el cache de resolvedViews más
   * abajo: el resultado se memoiza por RouteDef, tanto para no re-esperar el import en cada
   * navegación como para que el objeto ViewModule sea siempre la misma referencia, que es la key
   * de instancesByView). */
  load(): Promise<ViewModule>;
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
// Memoiza el ViewModule resuelto de cada ruta -- import() de un modulo ya cargado resuelve
// practicamente al toque (sin red, el navegador ya lo tiene evaluado), pero igual hay que
// cachear el VALOR resuelto y no solo confiar en eso: instancesByView usa el objeto ViewModule
// como key, asi que todo el resto del router necesita la misma referencia sin tener que
// encadenar .then() en cada lugar que la usa.
const resolvedViews = new Map<RouteDef, ViewModule>();
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

// Cada llamada a renderCurrentLocation() se identifica con un numero de generacion creciente.
// mount()/requireAuth() son async: si el usuario navega de nuevo antes de que una llamada
// anterior termine de resolver (ej. clickea otro link mientras la vista todavia esta cargando),
// sin esto la llamada vieja terminaria llamando a su propio onShow() DESPUES de que la nueva ya
// tomo el control -- pisando el estado (clases de <body>, etc.) que la vista nueva ya dejo bien
// puesto. Los puntos de chequeo van justo despues de cada await, antes de tocar nada mas.
let renderGeneration = 0;

// Un import() dinamico de una ruta (match.route.load()) falla en la practica por una sola razon:
// la pestaña/PWA quedo abierta desde antes de un deploy y esta pidiendo un chunk con un hash que
// ya no existe -- GitHub Pages sirve el index.html nuevo, con otros nombres de archivo. El
// contexto JS de una PWA de iOS vive dias, asi que pasa seguido. Sin esto, renderCurrentLocation
// rechaza en silencio (nadie await-ea el renderCurrentLocation de navigate()), linkInterceptor
// ya hizo preventDefault(), y toda navegacion interna queda muerta hasta que el usuario recargue
// a mano. La salida es una recarga dura: trae el index.html fresco y con el los chunks nuevos.
// Guarda contra un loop de recarga (si el chunk falta de verdad, por otra causa) con una marca
// de tiempo en sessionStorage -- como mucho una recarga cada 60s.
function recoverFromStaleChunk(): void {
  const KEY = "shell:last-chunk-recovery";
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // sessionStorage no disponible -- igual intentamos la recarga (el caso comun es justamente
    // una PWA vieja, no un modo restringido).
  }
  location.reload();
}

async function renderCurrentLocation(): Promise<void> {
  const myGeneration = ++renderGeneration;
  if (!viewRoot) return;
  const url = new URL(location.href);
  const match = resolve(url.pathname);
  if (!match) return; // no deberia pasar si isRouteRegistered ya filtro antes de navegar

  const params = new URLSearchParams(url.search);
  for (const [k, v] of match.params) params.set(k, v);

  const key = match.route.keyFor ? match.route.keyFor(params) : "__default__";
  let view = resolvedViews.get(match.route);
  if (!view) {
    try {
      view = await match.route.load();
    } catch {
      if (myGeneration !== renderGeneration) return; // una navegacion mas nueva ya tomo el control
      recoverFromStaleChunk(); // chunk viejo tras deploy: recarga dura y salimos
      return;
    }
    if (myGeneration !== renderGeneration) return; // una navegacion mas nueva ya tomo el control
    resolvedViews.set(match.route, view);
  }

  // #loaderBody es chrome global (spinners, modales tipo el selector de ejercicios, checks de
  // exito) que vive fuera del container de cualquier vista -- ni ocultar/descartar una instancia
  // ni un update() dentro de la misma instancia lo tocan por su cuenta. Sin esto, un overlay que
  // quedo abierto (spinner de guardado, modal sin cerrar) se queda pegado en pantalla al navegar,
  // incluso volviendo a la misma ruta con otros params (ej. reabrir rutinsView.html).
  document.getElementById("loaderBody")?.replaceChildren();

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
      if (myGeneration !== renderGeneration) return; // una navegacion mas nueva ya tomo el control
      if (!userId) return; // requireAuth ya redirigio a login.html
    } else if (match.route.auth === "optional") {
      userId = await getOptionalAuth().catch(() => null);
      if (myGeneration !== renderGeneration) return;
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
  if (myGeneration !== renderGeneration) return; // una navegacion mas nueva ya tomo el control
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
  // Vite lo emite cuando el preload de un modulo dinamico falla -- mismo caso que el catch de
  // renderCurrentLocation (chunk viejo tras deploy), pero atrapa tambien los preloads que Vite
  // dispara por su cuenta (ej. modulePreload de un chunk hijo). preventDefault() evita ademas
  // que quede logueado como error no manejado.
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    recoverFromStaleChunk();
  });
  void renderCurrentLocation();
}
