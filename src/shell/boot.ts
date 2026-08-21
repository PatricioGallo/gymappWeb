import { setupNavToggle, setupRevealObserver } from "../lib/nav";
import { logVisitOncePerSession } from "../services/visits.service";
import { setupPasswordToggles } from "../lib/passwordToggle";
import { setupLinkInterceptor } from "./linkInterceptor";
import { startRouter, navigate } from "./router";
import { registerShellRoutes } from "./routes";

let booted = false;

// Al tocar una notificación con la app ya abierta en otra pantalla, el service worker (sw.js,
// notificationclick) le manda este mensaje a esa pestaña en vez de abrir/navegar una ventana
// nueva (eso reinicializaria el shell entero de cero) -- aca la recibimos y navegamos client-side
// con el router de la SPA, tan rapido como tocar un link adentro de la app. El SW manda un
// MessageChannel junto con el mensaje y espera una confirmacion corta por ahi: si esta pestaña
// quedo con JS viejo (abierta desde antes de un deploy) y nadie escucha, el SW se entera de que
// nadie contesto y hace una navegacion de verdad como respaldo en vez de dejarla colgada donde
// estaba -- sin el ack, un push antiguo silenciosamente no hacia nada.
function listenForSwNavigation(): void {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data as { type?: string; url?: string } | null;
    if (data?.type !== "navigate" || typeof data.url !== "string") return;
    const target = new URL(data.url, location.origin);
    navigate(target.pathname + target.search);
    event.ports[0]?.postMessage("ok");
  });
}

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
  listenForSwNavigation();
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
