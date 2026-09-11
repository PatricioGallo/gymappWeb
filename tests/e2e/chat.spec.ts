import { test, expect } from "./fixtures";
import { login, marker, QA_CHAT_GROUP_ID } from "./fixtures";

test.describe("Chat", () => {
  test("enviar mensaje en un grupo existente y borrarlo", async ({ page }) => {
    const messageText = marker("chat");

    await login(page);
    await page.goto(`/pages/chats.html?c=${QA_CHAT_GROUP_ID()}`);

    // Esperar a que el historial haya terminado de cargar antes de escribir -- si el composer
    // ya está en el DOM pero el hilo todavía está resolviendo la conversación/mensajes, el envío
    // puede quedar deshabilitado un rato aunque el input ya sea visible.
    await expect(page.locator(".chat-bubble").first()).toBeVisible({ timeout: 15_000 });

    const composer = page.locator("#chatComposerInput");
    await composer.click();
    await page.keyboard.type(messageText);
    await expect(page.locator("#chatSendBtn")).toBeEnabled({ timeout: 10_000 });
    await page.locator("#chatSendBtn").click();

    const bubble = page.locator(".chat-bubble", { hasText: messageText }).first();
    await expect(bubble).toBeVisible({ timeout: 15_000 });
    // El mensaje recién enviado se pinta optimista y después se reconcilia con el eco de
    // realtime (mismo mecanismo que documenta gymappweb_chat_performance_freeze_fixes.md) --
    // abrir el menú de un bubble que todavía está por reconciliarse a veces lo cierra solo a
    // mitad de camino. Dar un respiro antes de interactuar con él.
    await page.waitForTimeout(800);

    // Cleanup: abrir el menú del mensaje (click sobre la burbuja) y borrarlo -- soft delete, ver
    // gymappweb_chat_edit_delete_messages.md. Reintenta el click si el menú no llega a abrirse.
    const menu = page.locator(".chat-msg-menu");
    const deleteBtn = menu.getByRole("button", { name: "Eliminar" });
    await expect(async () => {
      await bubble.click();
      await expect(deleteBtn).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await deleteBtn.click();
    await page.locator("#confirmDeleteMsg").click();

    await expect(bubble).toBeHidden({ timeout: 10_000 });
  });
});
