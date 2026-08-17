import { registerRoute } from "./router";
import { notificationsView } from "../pages/notifications";
import { searchView } from "../pages/search";
import { chatsView } from "../pages/chats";
import { profileView } from "../pages/profile";
import { followRequestsView } from "../pages/followRequests";
import { subscriptionRequestsView } from "../pages/subscriptionRequests";
import { deleteRutinsView } from "../pages/deleteRutins";
import { addExcView } from "../pages/addExc";
import { followersView } from "../pages/followers";
import { modExcView } from "../pages/modExc";
import { showExcView } from "../pages/showExc";
import { postView } from "../pages/post";
import { alumnosView } from "../pages/alumnos";
import { progressView } from "../pages/progress";
import { rutinsView } from "../pages/rutins";
import { feedView } from "../pages/feed";
import { pesosView } from "../pages/pesos";
import { settingsView } from "../pages/settings";
import { adminView } from "../pages/admin";

/**
 * Registro central de rutas migradas al shell. Cada pagina migrada se agrega aca a medida que
 * pasa por su fase (ver el plan de migracion). Las rutas se evaluan en el orden en que aparecen
 * en este archivo -- por eso la ruta catch-all de perfil por username va ultima: cualquier ruta
 * exacta tiene que tener prioridad sobre ella.
 *
 * Este archivo se importa desde CADA pagina migrada (via startShellPage en shell/boot.ts), asi
 * que cada una conoce todas las rutas migradas y puede navegar client-side hacia cualquiera de
 * ellas -- no solo hacia si misma.
 */
export function registerShellRoutes(): void {
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/notifications.html") ? new URLSearchParams() : null),
    view: notificationsView,
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/search.html") ? new URLSearchParams() : null),
    view: searchView,
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/chats.html") ? new URLSearchParams() : null),
    view: chatsView,
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/followRequests.html") ? new URLSearchParams() : null),
    view: followRequestsView,
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/subscriptionRequests.html") ? new URLSearchParams() : null),
    view: subscriptionRequestsView,
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/deleteRutins.html") ? new URLSearchParams() : null),
    view: deleteRutinsView,
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/addExc.html") ? new URLSearchParams() : null),
    view: addExcView,
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/followers.html") ? new URLSearchParams() : null),
    view: followersView,
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/excView.html") ? new URLSearchParams() : null),
    view: modExcView,
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/showExc.html") ? new URLSearchParams() : null),
    view: showExcView,
    auth: "optional",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/post.html") ? new URLSearchParams() : null),
    view: postView,
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/alumnos.html") ? new URLSearchParams() : null),
    view: alumnosView,
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/progress.html") ? new URLSearchParams() : null),
    view: progressView,
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/rutinsView.html") ? new URLSearchParams() : null),
    view: rutinsView,
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/feed.html") ? new URLSearchParams() : null),
    view: feedView,
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/pesos.html") ? new URLSearchParams() : null),
    view: pesosView,
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/settings.html") ? new URLSearchParams() : null),
    view: settingsView,
    auth: "required",
  });
  registerRoute({
    match: (pathname) => (pathname.endsWith("/pages/admin.html") ? new URLSearchParams() : null),
    view: adminView,
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
    view: profileView,
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
    view: profileView,
    auth: "optional",
    keyFor: profileKeyFor,
  });
}
