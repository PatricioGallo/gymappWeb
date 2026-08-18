import { setupNavToggle, setupRevealObserver } from "../lib/nav";
import { logVisitOncePerSession } from "../services/visits.service";
import { setupPasswordToggles } from "../lib/passwordToggle";
import { setupLinkInterceptor } from "./linkInterceptor";
import { startRouter } from "./router";
import { registerShellRoutes } from "./routes";

let booted = false;

/**
 * Arranca el shell persistente: header/nav, click-afuera-cierra-menu, revelado por scroll,
 * intercepcion de links internos, y los efectos de "una vez por carga" que hoy vive cada pagina
 * MPA repite en su propio nav.ts (visita, ojito de contrasena). Se llama una sola vez por
 * documento, desde el bootstrap de cada pagina migrada -- nav.ts no pierde nada todavia (sigue
 * llamando estas mismas funciones a nivel de modulo en las paginas no migradas, son documentos
 * distintos y no colisionan).
 */
export function bootShell(): void {
  if (booted) return;
  booted = true;

  setupNavToggle();
  setupRevealObserver();
  setupPasswordToggles();
  setupLinkInterceptor();
  void logVisitOncePerSession();
}

/**
 * Punto de entrada de una pagina migrada al shell: arranca el shell (una vez por documento),
 * registra todas las rutas migradas conocidas, y arranca el router contra el contenedor
 * `#view-root` de esta pagina. Cada pagina migrada llama esto desde su propio script de entrada.
 */
export function startShellPage(rootId = "view-root"): void {
  bootShell();
  registerShellRoutes();
  const root = document.getElementById(rootId);
  if (!root) throw new Error(`startShellPage: no se encontro #${rootId} en este documento`);
  startRouter(root);
}
