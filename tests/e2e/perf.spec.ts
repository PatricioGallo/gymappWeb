import { test, expect } from "./fixtures";
import { login } from "./fixtures";

/**
 * Guarda de regresión de performance -- no mide "es rápido en términos absolutos" (eso ya lo hace
 * Lighthouse en las páginas públicas, ver scripts/lighthouse-check.mjs), sino "¿alguien agregó un
 * fetch de más sin darse cuenta?". Esta app tuvo justo ese bug real más de una vez (ver
 * gymappweb_perf_request_fanout.md: 15-27 round-trips a Supabase en una sola pantalla del
 * iPhone) -- contar requests por pantalla es la forma más directa de agarrarlo antes de que
 * vuelva a pasar. Los umbrales tienen margen sobre lo medido en la corrida que armó este test
 * (ver PLAYWRIGHT_LOG_REQUEST_COUNTS=1 para imprimir los números reales al correrlo).
 */
const SUPABASE_HOST_FRAGMENT = "supabase.co";

function countSupabaseRequests(page: import("@playwright/test").Page): { get: () => number } {
  let count = 0;
  page.on("request", (req) => {
    if (req.url().includes(SUPABASE_HOST_FRAGMENT)) count++;
  });
  return { get: () => count };
}

test.describe("Performance: request fan-out por pantalla", () => {
  test("profile.html no dispara una cantidad desmedida de requests a Supabase", async ({ page }) => {
    await login(page);
    const counter = countSupabaseRequests(page);
    await page.goto("/pages/profile.html");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const total = counter.get();
    if (process.env.PLAYWRIGHT_LOG_REQUEST_COUNTS) console.log(`[perf] profile.html: ${total} requests a Supabase`);
    expect(total, "Ver gymappweb_perf_request_fanout.md -- si esto sube, algo está haciendo fetch de más en profile.ts").toBeLessThanOrEqual(20);
  });

  test("feed.html no dispara una cantidad desmedida de requests a Supabase", async ({ page }) => {
    await login(page);
    const counter = countSupabaseRequests(page);
    await page.goto("/pages/feed.html");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const total = counter.get();
    if (process.env.PLAYWRIGHT_LOG_REQUEST_COUNTS) console.log(`[perf] feed.html: ${total} requests a Supabase`);
    expect(total).toBeLessThanOrEqual(28);
  });
});

test.describe("Performance: tiempo de carga", () => {
  test("profile.html termina de cargar en un tiempo razonable", async ({ page }) => {
    await login(page);
    const start = Date.now();
    await page.goto("/pages/profile.html");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    const elapsedMs = Date.now() - start;

    if (process.env.PLAYWRIGHT_LOG_REQUEST_COUNTS) console.log(`[perf] profile.html: ${elapsedMs}ms hasta networkidle`);
    // Generoso a propósito -- esto corre contra el dev server / preview local, no contra un
    // iPhone con red móvil real. Sirve para agarrar una regresión grosera, no para benchmarking fino.
    expect(elapsedMs).toBeLessThanOrEqual(8_000);
  });
});
