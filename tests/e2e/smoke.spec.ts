import { test, expect } from "./fixtures";
import { login, trackConsoleErrors, expectNoConsoleErrors } from "./fixtures";

/**
 * Smoke tests de solo lectura: navegar y confirmar que la vista carga sin explotar. No hacen
 * mutaciones, así que no necesitan cleanup -- a cambio, no prueban que las acciones de escritura
 * de cada página funcionen (eso lo cubren feed.spec.ts / chat.spec.ts para las áreas con más
 * historial de bugs). Sirven para agarrar un throw/import roto en cualquiera de las vistas del
 * shell SPA (ver gymappweb_spa_shell_migration.md) que un test más puntual no toca.
 */
const PAGES: { path: string; label: string }[] = [
  { path: "/pages/profile.html", label: "Perfil" },
  { path: "/pages/notifications.html", label: "Notificaciones" },
  { path: "/pages/search.html", label: "Buscar" },
  { path: "/pages/settings.html", label: "Configuración" },
  { path: "/pages/rutinsView.html", label: "Rutinas" },
  { path: "/pages/pesos.html", label: "Pesos" },
  { path: "/pages/medidas.html", label: "Medidas corporales" },
  { path: "/pages/nutricion.html", label: "Nutrición" },
  { path: "/pages/misEjercicios.html", label: "Mis ejercicios" },
  { path: "/pages/clases.html", label: "Clases" },
];

test.describe("Smoke: navegación de lectura", () => {
  for (const { path, label } of PAGES) {
    test(`${label} (${path}) carga sin errores`, async ({ page }) => {
      const errors = trackConsoleErrors(page);
      await login(page);
      await page.goto(path);
      // Cualquier vista del shell termina redirigiendo a login.html si requireAuth falla --
      // si eso pasa acá (con una sesión recién logueada) es un bug real de la vista.
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await expect(page).not.toHaveURL(/login\.html/);
      await expect(page.locator("body")).toBeVisible();
      expectNoConsoleErrors(errors);
    });
  }
});
