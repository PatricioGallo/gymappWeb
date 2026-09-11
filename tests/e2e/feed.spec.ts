import { test, expect } from "./fixtures";
import { login, marker, typeIntoMentionEditor } from "./fixtures";

/**
 * Este suite crea contenido real en el feed de producción (no hay staging, ver discusión en la
 * conversación que armó este suite). Por eso: (1) todo texto lleva el prefijo "[QA nightly]" para
 * poder identificarlo a simple vista, y (2) el post se borra en el finally pase lo que pase, para
 * no dejar basura visible a usuarios reales.
 */
test.describe("Feed", () => {
  test("crear post, likear, comentar y borrar", async ({ page }) => {
    const postText = marker("post");
    const commentText = marker("comment");

    await login(page);
    await page.goto("/pages/feed.html");

    const composer = page.locator("#postComposerWrap .mention-editor");
    await typeIntoMentionEditor(page, composer, postText);
    await page.locator("#postComposerSubmit").click();

    const postCard = page.locator("#postFeedList article.post-card", { hasText: postText }).first();
    await expect(postCard).toBeVisible({ timeout: 15_000 });
    // Publicar es un insert + un fetch aparte (getPost) antes de limpiar el draft -- si algo
    // interrumpe ese segundo paso, el texto autosaveado puede reaparecer en el próximo test.
    await page.waitForFunction(
      () => (document.getElementById("postComposerInput") as HTMLTextAreaElement | null)?.value === "",
      null,
      { timeout: 15_000 }
    );

    try {
      // --- Like ---
      const likeBtn = postCard.getByRole("button", { name: "Me gusta" });
      await likeBtn.click();
      await expect(likeBtn).toHaveClass(/is-active/, { timeout: 10_000 });

      // --- Comment ---
      // "Comentar" desde la card del feed abre el modal de detalle del Rep (loaderBody, pantalla
      // completa) CON el composer de respuesta apilado encima (autoOpenComment) -- ver
      // openPostDetailModal en postDetailModal.ts. Al postear la respuesta solo se cierra ese
      // composer; el detalle de atrás queda abierto y tapa (intercepta clicks de) la card
      // original del feed, así que hay que cerrarlo con Escape antes de poder borrar el post.
      await postCard.getByRole("button", { name: "Comentar" }).click();
      const commentModal = page.locator(".post-comment-modal-overlay");
      await expect(commentModal).toBeVisible();
      await typeIntoMentionEditor(page, commentModal.locator(".mention-editor"), commentText);
      await commentModal.locator("#commentModalSubmit").click();
      await expect(commentModal).toBeHidden({ timeout: 10_000 });
      await page.keyboard.press("Escape");
      await expect(page.locator("#loaderBody")).toBeEmpty({ timeout: 10_000 });

      // El contador de comentarios del card en el feed refleja el nuevo comentario.
      await expect(postCard.getByRole("button", { name: "Comentar" })).toContainText("1");
    } finally {
      // --- Cleanup: borrar el post (arrastra el like y el comentario) ---
      await postCard.getByRole("button", { name: "Eliminar Rep" }).click();
      await page.locator("#confirmDeletePost").click();
      await expect(postCard).toBeHidden({ timeout: 10_000 });
    }
  });
});
