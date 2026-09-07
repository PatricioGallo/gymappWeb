// ---------------------------------------------------------------------------
// Cliente de Open Food Facts (búsqueda de alimentos por texto o código de barras).
//
// Va SIEMPRE por la Edge Function `off-search` (proxy): el buscador por texto no
// se puede consultar desde el navegador -- search-a-licious no manda CORS y el
// buscador viejo de Product Opener vive saturado. El proxy resuelve CORS, manda
// un User-Agent propio (lo que OFF pide) y hace fallback entre backends. Quien
// llama igual busca primero en la caché local (food_items, ver searchFoods).
//
// Datos bajo Open Database License (ODbL) -- la UI muestra la atribución.
// ---------------------------------------------------------------------------

import { supabase } from "./supabaseClient";

export interface OffCandidate {
  barcode: string;
  name: string;
  brand: string | null;
  /** Gramos por porción, solo si OFF lo da en gramos. */
  servingGrams: number | null;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  fiber100: number | null;
  imageUrl: string | null;
  /** Payload OFF crudo -- se guarda en food_items.off_data al cachear. */
  raw: unknown;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Normaliza un producto OFF a nuestra forma. Devuelve null si no tiene calorías por 100g
 * (sin eso no sirve para calcular macros) o no tiene código de barras. */
function normalize(product: any): OffCandidate | null {
  const barcode: string | undefined = product?.code || product?._id;
  if (!barcode) return null;

  const nutr = product?.nutriments ?? {};
  const kcal100 = num(nutr["energy-kcal_100g"]) ?? (num(nutr["energy-kj_100g"]) != null ? Math.round(num(nutr["energy-kj_100g"])! / 4.184) : null);
  if (kcal100 == null || kcal100 <= 0) return null;

  const nameRaw = product.product_name_es ?? product.product_name ?? product.generic_name_es ?? product.generic_name ?? "";
  const name: string = (typeof nameRaw === "string" ? nameRaw : "").trim();
  if (!name) return null;

  // `brands` viene string ("A,B,C") en Product Opener y array (["A","B"]) en search-a-licious.
  const brandRaw = Array.isArray(product.brands) ? product.brands[0] : product.brands;
  const brand = typeof brandRaw === "string" && brandRaw.trim() ? brandRaw.split(",")[0].trim() : null;

  const servingGrams =
    (product.serving_quantity_unit === "g" || !product.serving_quantity_unit) && num(product.serving_quantity) != null
      ? num(product.serving_quantity)
      : null;

  return {
    barcode: String(barcode),
    name: name.slice(0, 120),
    brand: brand ? brand.slice(0, 80) : null,
    servingGrams: servingGrams && servingGrams > 0 ? servingGrams : null,
    kcal100: Math.round(kcal100),
    protein100: Math.max(0, num(nutr["proteins_100g"]) ?? 0),
    carbs100: Math.max(0, num(nutr["carbohydrates_100g"]) ?? 0),
    fat100: Math.max(0, num(nutr["fat_100g"]) ?? 0),
    fiber100: num(nutr["fiber_100g"]),
    imageUrl: product.image_front_small_url || product.image_small_url || product.image_front_url || null,
    raw: { code: barcode, product_name: product.product_name, brands: product.brands, nutriments: nutr, serving_quantity: product.serving_quantity, serving_quantity_unit: product.serving_quantity_unit },
  };
}

/** Llama a la Edge Function `off-search` con el access token del usuario. */
async function invokeOffSearch(body: { q: string } | { barcode: string }): Promise<any | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return null;
  const { data, error } = await supabase.functions.invoke("off-search", {
    body,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error) return null;
  return data;
}

function normalizeMany(products: any[]): OffCandidate[] {
  const seen = new Set<string>();
  const out: OffCandidate[] = [];
  for (const p of products) {
    const c = normalize(p);
    if (c && !seen.has(c.barcode)) {
      seen.add(c.barcode);
      out.push(c);
    }
  }
  return out;
}

export async function searchOpenFoodFacts(term: string, signal?: AbortSignal): Promise<OffCandidate[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const data = await invokeOffSearch({ q });
  if (signal?.aborted) return [];
  return Array.isArray(data?.products) ? normalizeMany(data.products) : [];
}

export async function getOpenFoodFactsByBarcode(barcode: string): Promise<OffCandidate | null> {
  const code = barcode.replace(/\D/g, "");
  if (code.length < 6) return null;
  const data = await invokeOffSearch({ barcode: code });
  return data?.product ? normalize(data.product) : null;
}
