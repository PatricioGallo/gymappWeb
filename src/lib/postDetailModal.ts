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

/**
 * Abre el detalle de un Rep como modal a pantalla completa adentro de #loaderBody, en vez de
 * navegar a post.html (esto es lo que reemplaza esa navegacion en feed/perfil/hilo -- ver
 * wireSwipeToExit/mountPostDetail en postDetail.ts para el contenido). Comentar/citar/compartir/
 * ver metricas/borrar reemplazan este modal por el suyo propio (mismo slot #loaderBody, mismo
 * criterio que el resto de los modales de Reps) -- cerrar esos vuelve al feed/perfil de atras, no
 * a este modal, igual que ya pasa con el visor de publicaciones de gimnasio.
 *
 * onCommentPosted (opcional): si se comento algo desde el modal, el caller (feed/perfil) la usa
 * para sumarle 1 al contador de comentarios de su propia copia de ese Rep en la lista de atras --
 * sin esto, el contador queda desactualizado ahi porque el modal ya se cerro para cuando el
 * comentario termina de mandarse (ver onSubmodalOpening en postDetail.ts).
 */
export function openPostDetailModal(postId: string, viewerId: string, onCommentPosted?: (postId: string) => void): void {
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
    // Comentar/citar/compartir/ver metricas/borrar abren su propio modal en el mismo #loaderBody
    // y lo pisan sin avisar -- hay que soltar el scroll lock y el canal realtime ANTES, si no
    // el body se queda con position:fixed para siempre (la pagina de atras queda "trabada").
    onSubmodalOpening: close,
    onCommentPosted,
    onAuthorClick: (username) => {
      close();
      navigate(`profile.html?u=${encodeURIComponent(username)}`);
    },
  }).then((c) => {
    if (closed) {
      c.dispose(); // se cerro (Escape, swipe) mientras todavia estaba cargando
      return;
    }
    controller = c;
  });
}
