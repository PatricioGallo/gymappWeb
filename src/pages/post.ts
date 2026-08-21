import type { ViewModule } from "../shell/router";
import { navigate, smartNavigate } from "../shell/router";
import { mountPostDetail, type PostDetailController } from "../lib/postDetail";

// mount() define render() (monta mountPostDetail desde cero para cada ?id= -- no hay estado fino
// que preservar entre Reps distintos) y la deja referenciada aca para que update() la reuse. Este
// componente vive normalmente adentro de un modal (ver postDetailModal.ts, la via de entrada
// habitual al tocar un Rep en el feed/perfil); esta vista solo existe para cuando se aterriza
// DIRECTO en post.html?id=... (link compartido) -- mismo componente, montado a pantalla completa
// adentro de #view-root en vez de #loaderBody.
let updateHandler: ((params: URLSearchParams) => void) | null = null;
let hideHandler: (() => void) | null = null;

export const postView: ViewModule = {
  async mount(container, params, ctx, authUserId) {
    const userId = authUserId!; // la ruta se registra con auth:"required"
    let controller: PostDetailController | null = null;

    async function render(p: URLSearchParams): Promise<void> {
      controller?.dispose();
      controller = null;

      const postId = p.get("id");
      if (!postId) {
        container.classList.add("post-detail-modal");
        container.innerHTML = `<div class="post-detail-empty-standalone"><p>No se especificó qué Rep mostrar.</p><a href="feed.html">Volver a Reps</a></div>`;
        return;
      }

      controller = await mountPostDetail(container, postId, {
        viewerId: userId,
        // Vuelve a la pagina anterior (feed, perfil, busqueda, etc.), sea cual sea -- por eso no
        // es un href fijo. Si este Rep se abrio directo (sin historial previo en esta pestaña),
        // no hay a donde volver: manda a Reps.
        onExit: () => {
          if (window.history.length > 1) window.history.back();
          else smartNavigate("feed.html");
        },
        onAuthorClick: (username) => navigate(`profile.html?u=${encodeURIComponent(username)}`),
      });
    }

    await render(params);

    updateHandler = (nextParams) => void render(nextParams);
    hideHandler = () => controller?.pause();
    ctx.addCleanup(() => {
      controller?.dispose();
      updateHandler = null;
      hideHandler = null;
    });
  },
  update(params) {
    updateHandler?.(params);
  },
  onHide() {
    hideHandler?.();
  },
};
