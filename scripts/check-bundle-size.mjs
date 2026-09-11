#!/usr/bin/env node
// Corre después de `npm run build`. Cada página es su propio entry con code-splitting dinámico
// (ver src/shell/routes.ts) -- no hay "un bundle" único que medir, así que esto chequea dos cosas
// más útiles para agarrar una regresión real:
//   1. que ningún chunk individual se infle por un import de más (ej. traer una librería entera
//      donde antes se traía una función), y
//   2. que la suma de TODO el JS (lo peor que podría llegar a pedir un usuario, visitando cada
//      página) no crezca sin que nadie lo note.
// Los presupuestos de abajo salen de medir el build real al armar este script (2026-09-11) con
// ~30-40% de margen -- si algún día crecen por una razón legítima, está bien subir el número acá,
// pero que sea una decisión consciente, no un commit que lo empuja sin darse cuenta.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const DIST_DIR = "dist";
const PER_CHUNK_BUDGET_KB = 130; // gzip. El más grande hoy (supabaseClient, vendor de @supabase/supabase-js) da ~57KB.
const TOTAL_BUDGET_KB = 950; // gzip, suma de todos los .js de dist/assets.

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function kb(bytes) {
  return Math.round((bytes / 1024) * 10) / 10;
}

let dist;
try {
  dist = statSync(DIST_DIR) && walk(DIST_DIR);
} catch {
  console.error(`No existe ${DIST_DIR}/ -- corré "npm run build" antes de este script.`);
  process.exit(1);
}

const rows = dist
  .map((file) => {
    const raw = readFileSync(file);
    return { file, gzipKb: kb(gzipSync(raw).length) };
  })
  .sort((a, b) => b.gzipKb - a.gzipKb);

const totalKb = Math.round(rows.reduce((sum, r) => sum + r.gzipKb, 0) * 10) / 10;
const offenders = rows.filter((r) => r.gzipKb > PER_CHUNK_BUDGET_KB);

console.log(`Bundle JS: ${rows.length} chunks, ${totalKb} KB gzip en total (budget ${TOTAL_BUDGET_KB} KB).`);
console.log("Top 5 chunks más pesados:");
for (const r of rows.slice(0, 5)) console.log(`  ${r.gzipKb.toString().padStart(6)} KB  ${r.file}`);

let failed = false;

if (offenders.length > 0) {
  failed = true;
  console.error(`\n✗ ${offenders.length} chunk(s) superan el budget por-chunk de ${PER_CHUNK_BUDGET_KB}KB gzip:`);
  for (const r of offenders) console.error(`  ${r.gzipKb} KB  ${r.file}`);
}

if (totalKb > TOTAL_BUDGET_KB) {
  failed = true;
  console.error(`\n✗ Total de ${totalKb}KB gzip supera el budget de ${TOTAL_BUDGET_KB}KB.`);
}

if (failed) {
  console.error(
    "\nSi el crecimiento es legítimo (una feature nueva que de verdad pesa eso), subí el budget " +
      "correspondiente en scripts/check-bundle-size.mjs a mano -- no bajes esto silenciando el check."
  );
  process.exit(1);
}

console.log("\n✓ Bundle size dentro de los budgets.");
