import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";
import { calcularEdad } from "../lib/age";
import { parseMeals, type Goal, type MacroSet, type Meal, type Sex } from "../lib/macroCalculator";
import { MEAL_TEMPLATES } from "../lib/mealTemplates";

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
// Preferencias (profiles.nutrition_prefs) -- el interruptor general (apagado por
// defecto) y si los entrenadores del usuario pueden ver su alimentación en "Ver
// progreso" (encendido por defecto, ver migración trainer_student_shared_data /
// trainer_can_see_nutrition). Se configuran en Configuración > Personalización.
// ---------------------------------------------------------------------------

export interface NutritionPrefs {
  enabled: boolean;
  shareWithTrainer: boolean;
}

export const DEFAULT_NUTRITION_PREFS: NutritionPrefs = { enabled: false, shareWithTrainer: true };

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

/**
 * Todos los logs de un rango de fechas (ambas inclusive, "YYYY-MM-DD"), ordenados por fecha y
 * comida. Lo usa el panel del entrenador en "Ver progreso" para el gráfico de "últimos N días"
 * sin pegar N veces a la red (una sola query en vez de una por día).
 */
export async function listNutritionLogsRange(userId: string, fromISO: string, toISO: string): Promise<NutritionLog[]> {
  const { data, error } = await supabase
    .from("nutrition_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("log_date", fromISO)
    .lte("log_date", toISO)
    .order("log_date")
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

/** Inserta varios logs de una (usado por las sugerencias de comida completa). */
export async function addNutritionLogs(userId: string, logs: NewNutritionLog[]): Promise<{ error?: string }> {
  if (logs.length === 0) return {};
  const { error } = await supabase.from("nutrition_logs").insert(
    logs.map((log) => ({
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
    }))
  );
  if (error) return { error: "No se pudieron agregar los alimentos. Probá de nuevo." };
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

/** Un alimento del combo con su cantidad y macros ya calculados. */
export interface MealComboItem {
  food: FoodItem;
  grams: number;
  displayQty: number;
  displayUnit: DisplayUnit;
  macros: FoodMacros;
}

/** Una sugerencia de comida completa: varios alimentos que juntos apuntan al objetivo. */
export interface MealCombo {
  title: string;
  items: MealComboItem[];
  totals: FoodMacros;
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

const EMPTY_FOOD_MACROS: FoodMacros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };

function sumFoodMacros(list: FoodMacros[]): FoodMacros {
  return list.reduce<FoodMacros>(
    (a, m) => ({
      kcal: a.kcal + m.kcal,
      protein_g: a.protein_g + m.protein_g,
      carbs_g: a.carbs_g + m.carbs_g,
      fat_g: a.fat_g + m.fat_g,
      fiber_g: (a.fiber_g ?? 0) + (m.fiber_g ?? 0),
    }),
    { ...EMPTY_FOOD_MACROS }
  );
}

/** Reparte `kcal` con las proporciones de macro de `ref` (kcal de P·4 / C·4 / G·9). */
function macrosAtKcal(ref: MacroSet, kcal: number): MacroSet {
  const pk = ref.protein_g * 4;
  const ck = ref.carbs_g * 4;
  const fk = ref.fat_g * 9;
  const tot = pk + ck + fk || 1;
  return {
    kcal,
    protein_g: (kcal * (pk / tot)) / 4,
    carbs_g: (kcal * (ck / tot)) / 4,
    fat_g: (kcal * (fk / tot)) / 9,
  };
}

/**
 * Sugerencias de COMIDAS COMPLETAS para una comida: cada una es un combo de 2-6 alimentos del
 * catálogo (plantillas en `mealTemplates.ts`) escalado como bloque para acercarse a las kcal y
 * al reparto de macros que le faltan a la comida (o, si ya está cubierta, a ~una versión chica
 * con el reparto seteado). Ordenadas por encaje de macros + cercanía de kcal. Devuelve hasta 5,
 * con como mucho 2 que arranquen con el mismo alimento principal.
 */
export async function getMealSuggestions(
  mealName: string,
  remaining: MacroSet,
  mealTarget: MacroSet
): Promise<MealCombo[]> {
  const tags = mealTagsForName(mealName) as string[];
  const foods = await listBuiltinFoods();
  const byName = new Map(foods.map((f) => [f.name, f]));

  const goalKcal = Math.min(mealTarget.kcal * 1.15, Math.max(mealTarget.kcal * 0.35, remaining.kcal));
  const goal: MacroSet =
    remaining.kcal < mealTarget.kcal * 0.35
      ? macrosAtKcal(mealTarget, goalKcal)
      : {
          kcal: goalKcal,
          protein_g: Math.max(0, remaining.protein_g),
          carbs_g: Math.max(0, remaining.carbs_g),
          fat_g: Math.max(0, remaining.fat_g),
        };

  const scored: Array<{ combo: MealCombo; score: number; primary: string }> = [];

  for (const tpl of MEAL_TEMPLATES) {
    if (!tpl.tags.some((t) => tags.includes(t))) continue;
    const parts = tpl.items.map((it) => ({ food: byName.get(it.food), base: it.grams }));
    if (parts.some((p) => !p.food)) continue; // falta un alimento del catálogo -> descartar

    const baseKcal = parts.reduce((s, p) => s + foodMacrosForGrams(p.food!, p.base).kcal, 0);
    if (baseKcal <= 0) continue;
    const f = Math.min(2, Math.max(0.5, goalKcal / baseKcal));

    const items: MealComboItem[] = parts.map((p) => {
      // Los ítems "de relleno" (café con leche, mate, ensalada, agua...) no se escalan tanto
      // como el resto -- si no, un combo grande te deja tomando 400 ml de café.
      const itemF = p.food!.kcal100 < 45 ? Math.min(f, 1.3) : f;
      const grams = Math.max(5, Math.round((p.base * itemF) / 5) * 5);
      return { food: p.food!, grams, displayQty: grams, displayUnit: "g", macros: foodMacrosForGrams(p.food!, grams) };
    });
    const totals = sumFoodMacros(items.map((i) => i.macros));

    const fit = macroFitScore({ protein100: totals.protein_g, carbs100: totals.carbs_g, fat100: totals.fat_g }, goal);
    const kcalScore = 1 - Math.min(1, Math.abs(totals.kcal - goalKcal) / goalKcal);
    scored.push({ combo: { title: tpl.title, items, totals }, score: fit * 0.62 + kcalScore * 0.38, primary: tpl.items[0].food });
  }

  scored.sort((a, b) => b.score - a.score);

  const out: MealCombo[] = [];
  const primaryCount = new Map<string, number>();
  for (const s of scored) {
    if ((primaryCount.get(s.primary) ?? 0) >= 2) continue;
    primaryCount.set(s.primary, (primaryCount.get(s.primary) ?? 0) + 1);
    out.push(s.combo);
    if (out.length >= 5) break;
  }
  return out;
}
