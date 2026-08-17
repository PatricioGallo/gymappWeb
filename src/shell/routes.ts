import { registerRoute } from "./router";
import { notificationsView } from "../pages/notifications";
import { searchView } from "../pages/search";
import { chatsView } from "../pages/chats";
import { profileView } from "../pages/profile";

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
