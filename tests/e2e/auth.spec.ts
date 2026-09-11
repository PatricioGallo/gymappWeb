import { test, expect } from "./fixtures";
import { QA_USERNAME, login } from "./fixtures";

test.describe("Login", () => {
  test("login exitoso redirige a profile.html", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/profile\.html/);
    // requireAuth ya resolvio la sesion -- si algo rompe el flujo de auth esto queda colgado
    // en el loader en vez de mostrar el perfil.
    await expect(page.locator("body")).not.toContainText("Ingresando...");
  });

  test("login con contraseña incorrecta muestra error y no redirige", async ({ page }) => {
    await page.goto("/pages/login.html");
    await page.locator("#mail").fill(QA_USERNAME());
    await page.locator("#pass").fill("esta-contraseña-es-incorrecta-a-proposito");
    await page.locator('#myForm button[type="submit"]').click();

    await expect(page.locator("#alert_message")).not.toBeEmpty({ timeout: 10_000 });
    await expect(page).toHaveURL(/login\.html/);
  });
});
