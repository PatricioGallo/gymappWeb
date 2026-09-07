// off-search
// ----------------------------------------------------------------------------
// Proxy de Open Food Facts para el buscador de alimentos (nutricion.html).
//
// Por qué existe: el navegador NO puede consultar OFF por texto directamente --
// search-a-licious (search.openfoodfacts.org, el buscador bueno) no manda cabecera
// CORS `Access-Control-Allow-Origin`, y el buscador viejo de Product Opener
// (cgi/search.pl, api/v2/search) sí manda CORS pero vive caído/saturado. Desde el
// server no hay CORS, se puede mandar un User-Agent propio (lo que OFF pide) y se
// puede hacer fallback entre backends.
//
// El lookup por código de barras (api/v2/product) sí anda desde el navegador, pero
// se enruta por acá igual para tener una sola ruta.
//
// verify_jwt = true: solo usuarios logueados (la feature ya requiere sesión) --
// evita que sea un proxy abierto.
//
// Datos de Open Food Facts, Open Database License (ODbL) -- la UI muestra la atribución.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UA = "GymSocial/1.0 (https://gymsocial.com.ar)";
const PRODUCT_FIELDS =
  "code,product_name,product_name_es,generic_name,generic_name_es,brands,nutriments,serving_quantity,serving_quantity_unit,image_front_small_url,image_small_url";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return null;
    const text = await res.text();
    // Product Opener a veces devuelve una página HTML de "temporarily unavailable" con 200.
    if (text.trimStart().startsWith("<")) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let payload: { q?: unknown; barcode?: unknown } = {};
  try {
    payload = await req.json();
  } catch {
    // sin body -> lista vacía
  }

  const q = typeof payload.q === "string" ? payload.q.trim().slice(0, 80) : "";
  const barcode = typeof payload.barcode === "string" ? payload.barcode.replace(/\D/g, "").slice(0, 20) : "";

  if (barcode.length >= 6) {
    const data = await fetchJson(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${PRODUCT_FIELDS}`);
    return json({ product: data?.status === 1 && data?.product ? data.product : null });
  }

  if (q.length >= 2) {
    // 1) search-a-licious (backend dedicado, el bueno)
    const sal = await fetchJson(
      `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=24&fields=code,product_name,product_name_es,generic_name,brands,nutriments`
    );
    if (sal && Array.isArray(sal.hits) && sal.hits.length) return json({ products: sal.hits });

    // 2) fallback: buscador viejo de Product Opener
    const po = await fetchJson(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&fields=${PRODUCT_FIELDS}`
    );
    if (po && Array.isArray(po.products)) return json({ products: po.products });

    return json({ products: [] });
  }

  return json({ products: [] });
});
