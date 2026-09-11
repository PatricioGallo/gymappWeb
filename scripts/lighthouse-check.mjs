#!/usr/bin/env node
// Lighthouse contra las páginas públicas (no requieren login) -- las páginas autenticadas del
// shell SPA quedan cubiertas por el chequeo de cantidad de requests en tests/e2e/perf.spec.ts en
// vez de por Lighthouse, porque hacer que Lighthouse navegue ya logueado es bastante más frágil
// que loguear con Playwright y contar requests directamente.
//
// Uso: BASE_URL=http://localhost:4173 node scripts/lighthouse-check.mjs
import { writeFileSync } from "node:fs";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:5173";
// 0-1. Medido contra el build de producción real (vite preview) al armar este script
// (2026-09-11): Landing 96/100, Login 98/100 -- 85 deja margen para fluctuación normal sin dejar
// pasar una regresión real.
const MIN_PERFORMANCE_SCORE = 0.85;

// Reusa el Chromium que Playwright ya instala para los tests de tests/e2e/ en vez de depender de
// que el runner (local o CI) tenga Chrome/Edge del sistema -- chrome-launcher no lo encuentra solo.
function resolveChromePath() {
  try {
    return chromium.executablePath();
  } catch {
    return undefined; // deja que chrome-launcher busque un Chrome del sistema como fallback
  }
}

const PAGES = [
  { path: "/index.html", label: "Landing" },
  { path: "/pages/login.html", label: "Login" },
];

async function auditPage(chrome, path) {
  const result = await lighthouse(`${BASE_URL}${path}`, {
    port: chrome.port,
    output: "json",
    onlyCategories: ["performance"],
    formFactor: "mobile",
    screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 2.625, disabled: false },
    logLevel: "error",
  });
  return result;
}

async function main() {
  const chrome = await launch({ chromeFlags: ["--headless=new"], chromePath: resolveChromePath() });
  let failed = false;

  try {
    for (const { path, label } of PAGES) {
      const result = await auditPage(chrome, path);
      const score = result.lhr.categories.performance.score;
      const reportPath = `lighthouse-report-${label.toLowerCase()}.json`;
      writeFileSync(reportPath, result.report);

      const pct = Math.round(score * 100);
      const ok = score >= MIN_PERFORMANCE_SCORE;
      console.log(`${ok ? "✓" : "✗"} ${label} (${path}): performance ${pct}/100 (mínimo ${Math.round(MIN_PERFORMANCE_SCORE * 100)}) -- reporte en ${reportPath}`);
      if (!ok) failed = true;
    }
  } finally {
    await chrome.kill();
  }

  if (failed) {
    console.error("\nAlguna página bajó del score mínimo de performance. Ver los .json de reporte para el detalle.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error corriendo Lighthouse:", err);
  process.exit(1);
});
