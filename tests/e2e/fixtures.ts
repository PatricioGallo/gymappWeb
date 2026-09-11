import { test as base, expect, type Page, type ConsoleMessage } from "@playwright/test";

/**
 * Credenciales de la cuenta de QA (NO la cuenta real del usuario) -- ver memoria
 * gymappweb_test_account.md: "patoogallo" (doble o) es la cuenta dedicada a testing, separada de
 * "patogallo" (una o) que es la cuenta real. Nunca loguear los tests contra la real: los posts,
 * mensajes y likes que crea este suite terminan en el feed/chat de producción.
 */
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copiá .env.example a .env (local) o cargala como ` +
        `secret de GitHub Actions (CI) -- ver README de tests/e2e.`
    );
  }
  return value;
}

export const QA_USERNAME = () => requiredEnv("QA_TEST_USERNAME");
export const QA_PASSWORD = () => requiredEnv("QA_TEST_PASSWORD");
// Conversación de grupo existente usada para el smoke test de chat (enviar + borrar mensaje).
// Ver gymappweb_test_account.md -- "Grupo del coco" por default si no se pisa por env.
export const QA_CHAT_GROUP_ID = () => process.env.QA_TEST_CHAT_GROUP_ID || "15c3b850-4b49-4e39-a07e-473d3c0d2db3";

/** Prefijo reconocible + único (timestamp) para todo dato que este suite crea, asi es trivial
 *  identificar y limpiar a mano cualquier resto si un test se corta a mitad de camino. */
export function marker(label: string): string {
  return `[QA nightly] ${label} ${Date.now()}`;
}

export async function login(page: Page): Promise<void> {
  await page.goto("/pages/login.html");
  await page.locator("#mail").fill(QA_USERNAME());
  await page.locator("#pass").fill(QA_PASSWORD());
  await page.locator('#myForm button[type="submit"]').click();
  await page.waitForURL(/profile\.html/, { timeout: 15_000 });
}

/** Junta errores de consola del browser durante el test; usalo con expectNoConsoleErrors al final
 *  para que un smoke test de "solo navegar" igual detecte un throw silencioso en la página. */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

export function expectNoConsoleErrors(errors: string[]): void {
  expect(errors, `Errores de consola inesperados: ${errors.join("\n")}`).toEqual([]);
}

/**
 * Escribe en un editor "mention-editor" (el <div contenteditable> que mentionEditor.ts monta
 * encima del <textarea> real para el composer de posts/comentarios, ver postComposerInput /
 * commentModalInput). NO usar locator.fill()/locator.type() acá -- en este build de
 * Playwright/Chromium ninguno de los dos dispara la cadena de eventos "input" que necesita el
 * editor para sincronizar contra el textarea oculto (el contador y el botón de submit quedan
 * sin actualizarse aunque el texto se vea escrito). page.keyboard.type() sí la dispara.
 */
export async function typeIntoMentionEditor(page: Page, locator: import("@playwright/test").Locator, text: string): Promise<void> {
  await locator.click();
  await page.keyboard.type(text);
}

export const test = base;
export { expect };
