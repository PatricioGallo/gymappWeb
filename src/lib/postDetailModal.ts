import { navigate } from "../shell/router";
import { mountPostDetail, type PostDetailController } from "./postDetail";

// Mismo truco que mediaLightbox.ts: frena el scroll de fondo con body fijo (no solo
// overflow:hidden) porque en Safari/Chrome mobile un position:fixed insertado mientras la pagina
// todavia tiene inercia de scroll puede quedar mal ubicado. Restaura la posicion exacta al cerrar.
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

export interface OpenPostDetailModalOptions {
  /** El caller (feed/perfil) la usa para sumarle 1 al contador de comentarios de su propia copia
   * de ese Rep en la lista de atras -- sin esto el contador queda desactualizado ahi. */
  onCommentPosted?(postId: string): void;
  /** Abre el composer de comentario solito apenas carga -- "Comentar" tocado directo desde una
   * tarjeta, sin pasar primero por el Rep a mano (ver goToPostAndComment en feed.ts/profile.ts). */
  autoOpenComment?: boolean;
}

/**
 * Abre el detalle de un Rep como modal a pantalla completa adentro de #loaderBody, en vez de
 * navegar a post.html (esto es lo que reemplaza esa navegacion en feed/perfil/hilo -- ver
 * mountPostDetail en postDetail.ts para el contenido). Citar/compartir/ver
 * metricas/borrar el Rep reemplazan este modal por el suyo propio (mismo slot #loaderBody, mismo
 * criterio que el resto de los modales de Reps) y cierran de vuelta al feed/perfil de atras, igual
 * que el visor de publicaciones de gimnasio -- comentar/responder/borrar un comentario NO cierran
 * este modal (esos modales se montan aparte, arriba de este, ver openReplyModal en postModals.ts
 * y confirmDialog.ts), asi que agregar o borrar un comentario se ve y se siente en el momento, sin
 * ningun cierre/reapertura de por medio.
 */
export function openPostDetailModal(postId: string, viewerId: string, opts?: OpenPostDetailModalOptions): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;

  loaderBody.innerHTML = "";
  const modalEl = document.createElement("div");
  loaderBody.appendChild(modalEl);

  const unlock = lockBodyScroll();
  let controller: PostDetailController | null = null;
  let closed = false;

  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeydown);
    controller?.dispose();
    unlock();
    modalEl.remove();
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKeydown);

  void mountPostDetail(modalEl, postId, {
    viewerId,
    onExit: close,
    // Citar/compartir/ver metricas/borrar el Rep SI abren su propio modal en el mismo
    // #loaderBody y lo pisan sin avisar -- hay que soltar el scroll lock y el canal realtime
    // ANTES, si no el body se queda con position:fixed para siempre ("trabado").
    onSubmodalOpening: close,
    onCommentPosted: opts?.onCommentPosted,
    onAuthorClick: (username) => {
      close();
      navigate(`profile.html?u=${encodeURIComponent(username)}`);
    },
    autoOpenComment: opts?.autoOpenComment,
  }).then((c) => {
    if (closed) {
      c.dispose(); // se cerro (Escape, swipe) mientras todavia estaba cargando
      return;
    }
    controller = c;
  });
}
