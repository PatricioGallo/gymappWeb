import { registerRoute } from "./router";

/**
 * Registro central de rutas migradas al shell. Cada pagina migrada se agrega aca a medida que
 * pasa por su fase (ver el plan de migracion). Las rutas se evaluan en el orden en que aparecen
 * en este archivo -- por eso la ruta catch-all de perfil por username va ultima: cualquier ruta
 * exacta tiene que tener prioridad sobre ella.
 *
 * Este archivo se importa desde CADA pagina migrada (via startShellPage en shell/boot.ts), asi
 * que cada una conoce todas las rutas migradas y puede navegar client-side hacia cualquiera de
 * ellas -- no solo hacia si misma. Por eso cada `load` es un import() dinamico en vez de un
 * import estatico de arriba del archivo: si las 21 paginas se importaran todas de una, Vite las
 * empaqueta juntas en un solo chunk gigante que se descarga entero apenas se visita CUALQUIERA
 * de ellas (medido: ~145KB gzip en el primer login, sin importar a que pagina entrás). Con
 * import() dinamico cada pagina cae en su propio chunk, que solo se pide la primera vez que esa
 * ruta puntual se visita de verdad -- ver el cache de resolvedViews en router.ts, que evita
 * re-esperar el import en cada navegacion subsiguiente a una ruta ya visitada.
 */
export function registerShellRoutes(): void {
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/notifications.html") ? new URLSearchParams() : null),
    load: () => import("../pages/notifications").then((m) => m.notificationsView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/search.html") ? new URLSearchParams() : null),
    load: () => import("../pages/search").then((m) => m.searchView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/chats.html") ? new URLSearchParams() : null),
    load: () => import("../pages/chats").then((m) => m.chatsView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/followRequests.html") ? new URLSearchParams() : null),
    load: () => import("../pages/followRequests").then((m) => m.followRequestsView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/subscriptionRequests.html") ? new URLSearchParams() : null),
    load: () => import("../pages/subscriptionRequests").then((m) => m.subscriptionRequestsView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/addExc.html") ? new URLSearchParams() : null),
    load: () => import("../pages/addExc").then((m) => m.addExcView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/misEjercicios.html") ? new URLSearchParams() : null),
    load: () => import("../pages/misEjercicios").then((m) => m.misEjerciciosView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/followers.html") ? new URLSearchParams() : null),
    load: () => import("../pages/followers").then((m) => m.followersView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/excView.html") ? new URLSearchParams() : null),
    load: () => import("../pages/modExc").then((m) => m.modExcView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/showExc.html") ? new URLSearchParams() : null),
    load: () => import("../pages/showExc").then((m) => m.showExcView),
    auth: "optional",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/post.html") ? new URLSearchParams() : null),
    load: () => import("../pages/post").then((m) => m.postView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/alumnos.html") ? new URLSearchParams() : null),
    load: () => import("../pages/alumnos").then((m) => m.alumnosView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/socios.html") ? new URLSearchParams() : null),
    load: () => import("../pages/socios").then((m) => m.sociosView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/entrenadores.html") ? new URLSearchParams() : null),
    load: () => import("../pages/entrenadores").then((m) => m.entrenadoresView),
    auth: "required",
  });
  // keyFor: clases.html ahora tiene dos modos (dueño de gimnasio administrando lo propio, o
  // visitante viendo el calendario de "?u=<gimnasio>") -- sin esto, navegar de un gimnasio a
  // otro (o de tu propia gestion a la de otro) pegaba en el fast-path de "misma instancia" del
  // router y se quedaba mostrando el primer gimnasio para siempre. Mismo patron que profileKeyFor.
  // auth "optional" (no "required"): un visitante anonimo tiene que poder ver el calendario de
  // un gimnasio publico sin loguearse, igual que puede ver su perfil.
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/clases.html") ? new URLSearchParams() : null),
    load: () => import("../pages/clases").then((m) => m.clasesView),
    auth: "optional",
    keyFor: (params) => params.get("u") ?? "__self__",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/progress.html") ? new URLSearchParams() : null),
    load: () => import("../pages/progress").then((m) => m.progressView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/rutinsView.html") ? new URLSearchParams() : null),
    load: () => import("../pages/rutins").then((m) => m.rutinsView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/feed.html") ? new URLSearchParams() : null),
    load: () => import("../pages/feed").then((m) => m.feedView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/pesos.html") ? new URLSearchParams() : null),
    load: () => import("../pages/pesos").then((m) => m.pesosView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/medidas.html") ? new URLSearchParams() : null),
    load: () => import("../pages/medidas").then((m) => m.medidasView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/settings.html") ? new URLSearchParams() : null),
    load: () => import("../pages/settings").then((m) => m.settingsView),
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/admin.html") ? new URLSearchParams() : null),
    load: () => import("../pages/admin").then((m) => m.adminView),
    auth: "required",
  });
  // keyFor: cada perfil visitado (propio o de un username distinto) es una "entidad" propia --
  // sin esto todas las visitas a perfil compartirian una sola instancia y volver a tu propio
  // perfil despues de ver el de otro mostraria el ajeno. maxInstances:1 (default del router) es
  // a proposito: profile.ts usa document.getElementById global en vez de scoping por
  // contenedor, asi que nunca puede haber mas de un perfil vivo en el DOM a la vez sin
  // arriesgar colisiones de id -- entrar a un tercer perfil descarta el mas viejo.
  const profileKeyFor = (params: URLSearchParams) => params.get("u") ?? params.get("pathUsername") ?? "__self__";

  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/profile.html") ? new URLSearchParams() : null),
    load: () => import("../pages/profile").then((m) => m.profileView),
    auth: "optional",
    keyFor: profileKeyFor,
  });
  // Catch-all: gymsocial.com.ar/<username>. Tiene que ir ultima -- cualquier pathname de un
  // solo segmento, sin punto, que no matcheo ninguna ruta exacta de arriba (incluye rutas de
  // /pages/*.html todavia no migradas: esas SIGUEN sin matchear aca, asi que un click en un
  // link a una pagina no migrada navega de verdad como corresponde).
  registerRoute({
    match: (pathname) => {
      const trimmed = pathname.replace(/^\/+|\/+$/g, "");
      if (!trimmed || trimmed.includes("/") || trimmed.includes(".")) return null;
      return new URLSearchParams({ pathUsername: trimmed });
    },
    load: () => import("../pages/profile").then((m) => m.profileView),
    auth: "optional",
    keyFor: profileKeyFor,
  });
}
