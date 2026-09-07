import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";
import { calcularEdad } from "../lib/age";
import { parseMeals, type Goal, type MacroSet, type Meal, type Sex } from "../lib/macroCalculator";

// ---------------------------------------------------------------------------
// Alimentación / Macros. Feature opt-in (profiles.nutrition_prefs.enabled), mismo
// patrón que Medidas corporales. Tres tablas: food_items (catálogo),
// nutrition_targets (objetivo activo + historial) y nutrition_logs (lo cargado
// por día/comida).
// ---------------------------------------------------------------------------

export type FoodItemRow = Tables<"food_items">;
export type NutritionTargetRow = Tables<"nutrition_targets">;
export type NutritionLogRow = Tables<"nutrition_logs">;

// ---------------------------------------------------------------------------
// Preferencias (profiles.nutrition_prefs) -- por ahora solo el interruptor
// general (apagado por defecto). Se activa/desactiva en Configuración >
// Personalización.
// ---------------------------------------------------------------------------

export interface NutritionPrefs {
  enabled: boolean;
}

export const DEFAULT_NUTRITION_PREFS: NutritionPrefs = { enabled: false };

export function parseNutritionPrefs(raw: unknown): NutritionPrefs {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...DEFAULT_NUTRITION_PREFS, ...(raw as Partial<NutritionPrefs>) };
  }
  return { ...DEFAULT_NUTRITION_PREFS };
}

export async function getNutritionPrefs(userId: string): Promise<NutritionPrefs> {
  const { data, error } = await supabase.from("profiles").select("nutrition_prefs").eq("id", userId).maybeSingle();
  if (error) throw error;
  return parseNutritionPrefs(data?.nutrition_prefs);
}

// ---------------------------------------------------------------------------
// Objetivo de macros
// ---------------------------------------------------------------------------

export interface NutritionTarget {
  id: string;
  mode: "manual" | "calculated";
  goal: Goal | null;
  activityFactor: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meals: Meal[];
  createdAt: string;
}

function mapTarget(row: NutritionTargetRow): NutritionTarget {
  return {
    id: row.id,
    mode: row.mode === "calculated" ? "calculated" : "manual",
    goal: (row.goal as Goal | null) ?? null,
    activityFactor: row.activity_factor != null ? Number(row.activity_factor) : null,
    kcal: Number(row.kcal),
    protein_g: Number(row.protein_g),
    carbs_g: Number(row.carbs_g),
    fat_g: Number(row.fat_g),
    // parseMeals puede devolver null si el jsonb quedó corrupto -- en ese caso el
    // objetivo se considera inválido (el caller lo trata como "sin objetivo").
    meals: parseMeals(row.meals) ?? [],
    createdAt: row.created_at,
  };
}

/** El objetivo activo del usuario, o null si nunca definió uno (o quedó inválido). */
export async function getActiveNutritionTarget(userId: string): Promise<NutritionTarget | null> {
  const { data, error } = await supabase
    .from("nutrition_targets")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const mapped = mapTarget(data);
  return mapped.meals.length > 0 ? mapped : null;
}

export interface SaveNutritionTargetInput {
  mode: "manual" | "calculated";
  goal?: Goal | null;
  activityFactor?: number | null;
  macros: MacroSet;
  meals: Meal[];
  snapshot?: Record<string, unknown> | null;
}

/**
 * Guarda un objetivo nuevo y lo deja como el activo. El anterior queda como
 * historial (is_active=false) -- hay un índice único parcial en (user_id) where
 * is_active, así que primero hay que desactivar el viejo.
 */
export async function saveNutritionTarget(userId: string, input: SaveNutritionTargetInput): Promise<{ error?: string }> {
  const { error: deactivateError } = await supabase
    .from("nutrition_targets")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true);
  if (deactivateError) return { error: "No se pudo guardar tu objetivo. Probá de nuevo." };

  const { error } = await supabase.from("nutrition_targets").insert({
    user_id: userId,
    mode: input.mode,
    goal: input.goal ?? null,
    activity_factor: input.activityFactor ?? null,
    kcal: input.macros.kcal,
    protein_g: input.macros.protein_g,
    carbs_g: input.macros.carbs_g,
    fat_g: input.macros.fat_g,
    meals: input.meals as unknown as NutritionTargetRow["meals"],
    snapshot: (input.snapshot ?? null) as unknown as NutritionTargetRow["snapshot"],
    is_active: true,
  });
  if (error) return { error: "No se pudo guardar tu objetivo. Probá de nuevo." };
  return {};
}

// ---------------------------------------------------------------------------
// Datos para el cálculo automático de macros. El peso sale del último registro
// de Medidas corporales (body_measurements.peso); la altura, edad y sexo del
// perfil. Cada pieza puede faltar -- el asistente muestra qué hace falta.
// ---------------------------------------------------------------------------

const LB_TO_KG = 0.45359237;

export interface NutritionCalcInputs {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  sex: Sex | null;
  /** profiles.body_measurement_prefs.enabled -- hace falta para poder cargar el peso. */
  measurementsEnabled: boolean;
}

export async function getNutritionCalcInputs(userId: string): Promise<NutritionCalcInputs> {
  const [{ data: profile, error: profileError }, { data: lastWeight, error: weightError }] = await Promise.all([
    supabase.from("profiles").select("altura_cm, fecha_nacimiento, genero, body_measurement_prefs").eq("id", userId).maybeSingle(),
    supabase
      .from("body_measurements")
      .select("peso, unidad, fecha")
      .eq("user_id", userId)
      .not("peso", "is", null)
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (profileError) throw profileError;
  if (weightError) throw weightError;

  let weightKg: number | null = null;
  if (lastWeight?.peso != null) {
    const raw = Number(lastWeight.peso);
    weightKg = lastWeight.unidad === "lb" ? raw * LB_TO_KG : raw;
  }

  const measurementsEnabled =
    !!profile?.body_measurement_prefs &&
    typeof profile.body_measurement_prefs === "object" &&
    !Array.isArray(profile.body_measurement_prefs) &&
    (profile.body_measurement_prefs as { enabled?: unknown }).enabled === true;

  return {
    weightKg,
    heightCm: profile?.altura_cm != null ? Number(profile.altura_cm) : null,
    age: profile?.fecha_nacimiento ? calcularEdad(profile.fecha_nacimiento) : null,
    sex: profile?.genero === "hombre" || profile?.genero === "mujer" ? profile.genero : null,
    measurementsEnabled,
  };
}

// ---------------------------------------------------------------------------
// Catálogo de alimentos (food_items). Mismo patrón que exercise.service:
//   'builtin' = curado · 'user' = creado por un usuario (propio o público)
//   'off'     = cacheado de Open Food Facts al elegirlo
// ---------------------------------------------------------------------------

export type FoodSource = "builtin" | "user" | "off";

export interface FoodItem {
  id: string;
  source: FoodSource;
  name: string;
  brand: string | null;
  servingGrams: number | null;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  fiber100: number | null;
  imageUrl: string | null;
  mealTags: string[];
  authorId: string | null;
  isPublic: boolean;
  offBarcode: string | null;
}

function mapFood(r: FoodItemRow): FoodItem {
  return {
    id: r.id,
    source: (r.source as FoodSource) ?? "user",
    name: r.name,
    brand: r.brand,
    servingGrams: r.serving_grams != null ? Number(r.serving_grams) : null,
    kcal100: Number(r.kcal_100g),
    protein100: Number(r.protein_100g),
    carbs100: Number(r.carbs_100g),
    fat100: Number(r.fat_100g),
    fiber100: r.fiber_100g != null ? Number(r.fiber_100g) : null,
    imageUrl: r.image_url,
    mealTags: r.meal_tags ?? [],
    authorId: r.author_id,
    isPublic: r.is_public,
    offBarcode: r.off_barcode,
  };
}

export async function listBuiltinFoods(): Promise<FoodItem[]> {
  const { data, error } = await supabase.from("food_items").select("*").eq("source", "builtin").order("name");
  if (error) throw error;
  return (data ?? []).map(mapFood);
}

export async function listMyFoods(userId: string): Promise<FoodItem[]> {
  const { data, error } = await supabase.from("food_items").select("*").eq("source", "user").eq("author_id", userId).order("name");
  if (error) throw error;
  return (data ?? []).map(mapFood);
}

/** Alimentos ya cacheados de OFF que matchean el texto -- se muestran al instante en la
 * pestaña "Buscar" antes (y además) de pegarle a la API de Open Food Facts. */
export async function searchFoods(term: string, limit = 30): Promise<FoodItem[]> {
  const clean = term.trim();
  if (clean.length < 2) return [];
  const { data, error } = await supabase
    .from("food_items")
    .select("*")
    .in("source", ["builtin", "off"])
    .ilike("name", `%${clean}%`)
    .order("source") // builtin antes que off
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapFood);
}

/** Alimento ya cacheado (de OFF) por código de barras exacto -- evita pegarle a Open Food
 * Facts si alguien ya lo escaneó antes. Devuelve null si no está o el código es muy corto. */
export async function findFoodByBarcode(barcode: string): Promise<FoodItem | null> {
  const code = barcode.replace(/\D/g, "");
  if (code.length < 6) return null;
  const { data, error } = await supabase.from("food_items").select("*").eq("off_barcode", code).limit(1).maybeSingle();
  if (error || !data) return null;
  return mapFood(data);
}

export interface NewUserFood {
  name: string;
  brand?: string | null;
  servingGrams?: number | null;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  fiber100?: number | null;
  isPublic: boolean;
}

export async function createUserFood(userId: string, food: NewUserFood): Promise<{ food?: FoodItem; error?: string }> {
  const { data, error } = await supabase
    .from("food_items")
    .insert({
      source: "user",
      author_id: userId,
      is_public: food.isPublic,
      name: food.name,
      brand: food.brand ?? null,
      serving_grams: food.servingGrams ?? null,
      kcal_100g: food.kcal100,
      protein_100g: food.protein100,
      carbs_100g: food.carbs100,
      fat_100g: food.fat100,
      fiber_100g: food.fiber100 ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "Ya tenés un alimento con ese nombre." };
    return { error: "No se pudo guardar el alimento. Probá de nuevo." };
  }
  return { food: mapFood(data) };
}

/**
 * Guarda (o actualiza) en food_items un producto traído de Open Food Facts, usando el código
 * de barras como clave -- así queda en la caché compartida para futuras búsquedas y para las
 * sugerencias. Devuelve la fila con su id real.
 */
export async function cacheOffFood(candidate: {
  barcode: string;
  name: string;
  brand: string | null;
  servingGrams: number | null;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  fiber100: number | null;
  imageUrl: string | null;
  raw: unknown;
}): Promise<{ food?: FoodItem; error?: string }> {
  const { data, error } = await supabase
    .from("food_items")
    .upsert(
      {
        source: "off",
        off_barcode: candidate.barcode,
        name: candidate.name,
        brand: candidate.brand,
        serving_grams: candidate.servingGrams,
        kcal_100g: candidate.kcal100,
        protein_100g: candidate.protein100,
        carbs_100g: candidate.carbs100,
        fat_100g: candidate.fat100,
        fiber_100g: candidate.fiber100,
        image_url: candidate.imageUrl,
        off_data: candidate.raw as FoodItemRow["off_data"],
      },
      { onConflict: "off_barcode" }
    )
    .select("*")
    .single();
  if (error) return { error: "No se pudo guardar el alimento de Open Food Facts." };
  return { food: mapFood(data) };
}

// ---------------------------------------------------------------------------
// Macros de una porción concreta
// ---------------------------------------------------------------------------

export interface FoodMacros extends MacroSet {
  fiber_g: number | null;
}

const LB_TO_G = 453.59237;

export type DisplayUnit = "g" | "lb" | "porcion";

/** Convierte una cantidad en la unidad elegida a gramos. `porcion` usa serving_grams del alimento. */
export function toGrams(qty: number, unit: DisplayUnit, servingGrams: number | null): number {
  if (unit === "lb") return qty * LB_TO_G;
  if (unit === "porcion") return qty * (servingGrams ?? 0);
  return qty;
}

export function foodMacrosForGrams(food: Pick<FoodItem, "kcal100" | "protein100" | "carbs100" | "fat100" | "fiber100">, grams: number): FoodMacros {
  const f = grams / 100;
  return {
    kcal: Math.round(food.kcal100 * f),
    protein_g: Math.round(food.protein100 * f),
    carbs_g: Math.round(food.carbs100 * f),
    fat_g: Math.round(food.fat100 * f),
    fiber_g: food.fiber100 != null ? Math.round(food.fiber100 * f * 10) / 10 : null,
  };
}

/** Gramos sugeridos para acercarse a `targetKcal` con este alimento (acotado a una porción sensata). */
export function suggestedGrams(kcal100: number, targetKcal: number): number {
  if (kcal100 <= 0 || targetKcal <= 0) return 100;
  const raw = (targetKcal / kcal100) * 100;
  const clamped = Math.min(600, Math.max(10, raw));
  return Math.round(clamped / 5) * 5;
}

// ---------------------------------------------------------------------------
// Registros del día (nutrition_logs)
// ---------------------------------------------------------------------------

export interface NutritionLog {
  id: string;
  logDate: string;
  mealIndex: number;
  mealName: string;
  foodId: string | null;
  foodName: string;
  brand: string | null;
  grams: number;
  displayQty: number;
  displayUnit: DisplayUnit;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
}

function mapLog(r: NutritionLogRow): NutritionLog {
  return {
    id: r.id,
    logDate: r.log_date,
    mealIndex: r.meal_index,
    mealName: r.meal_name,
    foodId: r.food_id,
    foodName: r.food_name,
    brand: r.brand,
    grams: Number(r.grams),
    displayQty: Number(r.display_qty),
    displayUnit: (r.display_unit as DisplayUnit) ?? "g",
    kcal: Number(r.kcal),
    protein_g: Number(r.protein_g),
    carbs_g: Number(r.carbs_g),
    fat_g: Number(r.fat_g),
    fiber_g: r.fiber_g != null ? Number(r.fiber_g) : null,
  };
}

export async function listNutritionLogs(userId: string, logDate: string): Promise<NutritionLog[]> {
  const { data, error } = await supabase
    .from("nutrition_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("log_date", logDate)
    .order("meal_index")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map(mapLog);
}

export interface NewNutritionLog {
  logDate: string;
  mealIndex: number;
  mealName: string;
  foodId: string | null;
  foodName: string;
  brand: string | null;
  grams: number;
  displayQty: number;
  displayUnit: DisplayUnit;
  macros: FoodMacros;
}

export async function addNutritionLog(userId: string, log: NewNutritionLog): Promise<{ error?: string }> {
  const { error } = await supabase.from("nutrition_logs").insert({
    user_id: userId,
    log_date: log.logDate,
    meal_index: log.mealIndex,
    meal_name: log.mealName,
    food_id: log.foodId,
    food_name: log.foodName,
    brand: log.brand,
    grams: log.grams,
    display_qty: log.displayQty,
    display_unit: log.displayUnit,
    kcal: log.macros.kcal,
    protein_g: log.macros.protein_g,
    carbs_g: log.macros.carbs_g,
    fat_g: log.macros.fat_g,
    fiber_g: log.macros.fiber_g,
  });
  if (error) return { error: "No se pudo agregar el alimento. Probá de nuevo." };
  return {};
}

export async function updateNutritionLogQuantity(
  logId: string,
  patch: { grams: number; displayQty: number; displayUnit: DisplayUnit; macros: FoodMacros }
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("nutrition_logs")
    .update({
      grams: patch.grams,
      display_qty: patch.displayQty,
      display_unit: patch.displayUnit,
      kcal: patch.macros.kcal,
      protein_g: patch.macros.protein_g,
      carbs_g: patch.macros.carbs_g,
      fat_g: patch.macros.fat_g,
      fiber_g: patch.macros.fiber_g,
    })
    .eq("id", logId);
  if (error) return { error: "No se pudo actualizar la cantidad." };
  return {};
}

export async function deleteNutritionLog(logId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("nutrition_logs").delete().eq("id", logId);
  if (error) return { error: "No se pudo borrar el alimento." };
  return {};
}

// ---------------------------------------------------------------------------
// Sugerencias por comida + orden "recomendados primero" en el buscador
// ---------------------------------------------------------------------------

export const MEAL_TAGS = ["desayuno", "almuerzo", "merienda", "cena", "snack"] as const;
export type MealTag = (typeof MEAL_TAGS)[number];

/** Infiere el/los tipo(s) de comida a partir del nombre (los nombres los edita el usuario). */
export function mealTagsForName(name: string): MealTag[] {
  const n = name.toLowerCase();
  if (n.includes("desayuno")) return ["desayuno"];
  if (n.includes("merienda")) return ["merienda"];
  if (n.includes("almuerzo")) return ["almuerzo"];
  if (n.includes("cena")) return ["cena"];
  if (/media\s*ma|media\s*tar|brunch/.test(n)) return ["merienda", "snack"];
  if (/tentemp|tentenp|colaci|snack|pre[\s-]?entren|post[\s-]?entren/.test(n)) return ["snack"];
  return ["snack", "merienda"];
}

/**
 * Qué tan bien "encaja" el perfil de macros de un alimento con lo que le falta a la comida
 * -- similitud coseno entre los vectores de kcal por macro (P·4, C·4, G·9). 0..1.
 * Si a la comida ya no le falta nada, devuelve 0.5 (neutro).
 */
export function macroFitScore(food: Pick<FoodItem, "protein100" | "carbs100" | "fat100">, remaining: MacroSet): number {
  const rp = Math.max(0, remaining.protein_g) * 4;
  const rc = Math.max(0, remaining.carbs_g) * 4;
  const rf = Math.max(0, remaining.fat_g) * 9;
  const rMag = Math.hypot(rp, rc, rf);
  if (rMag === 0) return 0.5;
  const fp = food.protein100 * 4;
  const fc = food.carbs100 * 4;
  const ff = food.fat100 * 9;
  const fMag = Math.hypot(fp, fc, ff);
  if (fMag === 0) return 0;
  return (rp * fp + rc * fc + rf * ff) / (rMag * fMag);
}

/** Fracción de kcal que viene de un solo macro (1 = alimento "puro": aceite, azúcar). */
function singleMacroShare(food: Pick<FoodItem, "protein100" | "carbs100" | "fat100">): number {
  const p = food.protein100 * 4;
  const c = food.carbs100 * 4;
  const f = food.fat100 * 9;
  const total = p + c + f;
  if (total <= 0) return 0;
  return Math.max(p, c, f) / total;
}

export interface FoodSuggestion {
  food: FoodItem;
  grams: number;
  macros: FoodMacros;
}

/** Popularidad global por alimento (para ordenar el buscador). */
export async function getFoodPopularity(): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc("get_food_popularity");
  if (error) return new Map();
  const map = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ food_id: string; uses: number }>) {
    if (row.food_id) map.set(row.food_id, Number(row.uses));
  }
  return map;
}

/**
 * Alimentos sugeridos para una comida, con una cantidad escalada para acercarse a lo que le
 * falta (o a ~1/3 del objetivo si ya está cubierta). Ordenados por: encaje de macros +
 * popularidad. Los curados que matchean el tipo de comida entran aunque nadie los haya cargado.
 */
export async function getMealSuggestions(mealName: string, remaining: MacroSet, mealTargetKcal: number): Promise<FoodSuggestion[]> {
  const tags = mealTagsForName(mealName);
  const { data, error } = await supabase.rpc("get_meal_suggestion_foods", { p_meal_tags: tags, p_limit: 16 });
  if (error) throw error;
  // La RPC ya viene ordenada por match de tipo de comida y después uso. El encaje de macros
  // re-acomoda un poco (un alimento que le cae justo a lo que falta salta ~3 puestos), y se
  // penalizan los "puros" (aceite, azúcar) salvo que lo que falte sea justo ese macro.
  const foods = ((data ?? []) as FoodItemRow[]).map(mapFood);
  const ranked = foods
    .map((food, i) => {
      const purePenalty = singleMacroShare(food) > 0.85 && macroFitScore(food, remaining) < 0.9 ? 6 : 0;
      return { food, rank: i - macroFitScore(food, remaining) * 4 + purePenalty };
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 8);

  // Una sugerencia = ~la mitad de lo que falta (una comida real son 2-3 alimentos, no uno solo
  // gigante). Se acota a una porción sensata: si el alimento trae serving_grams, se redondea a
  // porciones; si no, tope de 300 g.
  const targetKcal = Math.min(
    remaining.kcal > 60 ? remaining.kcal * 0.55 : mealTargetKcal * 0.25,
    mealTargetKcal * 0.5
  );
  return ranked.map(({ food }) => {
    const rawGrams = food.kcal100 > 0 ? (targetKcal / food.kcal100) * 100 : 100;
    let grams: number;
    if (food.servingGrams && food.servingGrams > 0) {
      const servings = Math.max(1, Math.min(4, Math.round(rawGrams / food.servingGrams)));
      grams = servings * food.servingGrams;
    } else {
      grams = Math.round(Math.min(300, Math.max(15, rawGrams)) / 5) * 5;
    }
    return { food, grams, macros: foodMacrosForGrams(food, grams) };
  });
}
