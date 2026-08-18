import { isRouteRegistered, navigate } from "./router";

/**
 * Delegacion de click a nivel de documento, registrada una sola vez desde el shell. No hace
 * falta tocar ningun <a href> existente (ni los del header/nav/footer repetidos en cada pagina,
 * ni los que arman al vuelo post.ts/profile.ts/etc. en template strings): siguen siendo hrefs
 * reales, asi que Ctrl+click, "abrir en pestana nueva" y "copiar link" del navegador funcionan
 * igual. Solo interceptamos el click normal cuando el destino ya esta migrado al shell -- si no,
 * se deja navegar de verdad (reload real, comportamiento de hoy).
 */
export function setupLinkInterceptor(): void {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    if (anchor.target && anchor.target !== "_self") return;
    if (anchor.hasAttribute("download")) return;

    let url: URL;
    try {
      url = new URL(anchor.href, location.href);
    } catch {
      return;
    }
    if (url.origin !== location.origin) return;
    // Ancla dentro de la misma pagina (ej. "Tus rutinas" -> #rutinas en el propio perfil): el
    // router no maneja hashes, asi que hay que dejar que el navegador haga el scroll nativo en
    // vez de interceptar y perder el hash en navigate().
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
    if (!isRouteRegistered(url.pathname)) return;

    e.preventDefault();
    navigate(url.pathname + url.search);
  });
}
