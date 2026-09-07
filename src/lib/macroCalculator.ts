// ---------------------------------------------------------------------------
// Funciones puras del cálculo de macros: BMR/TDEE (Mifflin-St Jeor), reparto de
// calorías en proteína/carbohidrato/grasa, y el reparto del objetivo diario en
// comidas. Sin dependencias -- lo usan el asistente de objetivo (nutricion.ts) y
// la vista del día.
// ---------------------------------------------------------------------------

export type Goal = "definicion" | "mantenimiento" | "volumen";
export type ActivityLevel = "sedentario" | "ligero" | "moderado" | "activo" | "atleta";
export type Sex = "hombre" | "mujer";

export const GOAL_LABELS: Record<Goal, string> = {
  definicion: "Definición",
  mantenimiento: "Mantenimiento",
  volumen: "Volumen",
};

export const GOAL_HINTS: Record<Goal, string> = {
  definicion: "Bajar grasa manteniendo músculo (~20% menos de calorías).",
  mantenimiento: "Sostener tu peso actual.",
  volumen: "Ganar masa muscular (~12% más de calorías).",
};

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentario: 1.2,
  ligero: 1.375,
  moderado: 1.55,
  activo: 1.725,
  atleta: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentario: "Sedentario — poco o nada de ejercicio",
  ligero: "Ligero — 1 a 3 días por semana",
  moderado: "Moderado — 3 a 5 días por semana",
  activo: "Activo — 6 a 7 días por semana",
  atleta: "Muy activo — doble turno o trabajo físico",
};

export interface MacroSet {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

// kcal por gramo de cada macronutriente.
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/** Metabolismo basal (kcal/día) -- ecuación de Mifflin-St Jeor. */
export function bmrMifflinStJeor(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "hombre" ? base + 5 : base - 161;
}

/** Gasto energético total diario = BMR × factor de actividad. */
export function tdee(bmr: number, activity: ActivityLevel): number {
  return bmr * ACTIVITY_FACTORS[activity];
}

const GOAL_KCAL_DELTA: Record<Goal, number> = {
  definicion: -0.2,
  mantenimiento: 0,
  volumen: 0.12,
};

// Proteína objetivo en g/kg de peso corporal (un poco más alta en déficit para
// preservar músculo). Grasa fija en g/kg; el resto de las calorías son carbos.
const GOAL_PROTEIN_PER_KG: Record<Goal, number> = {
  definicion: 2.2,
  mantenimiento: 2,
  volumen: 1.9,
};
const FAT_PER_KG = 0.9;
const FAT_PER_KG_MIN = 0.6;

export interface CalcMacrosInput {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  activity: ActivityLevel;
  goal: Goal;
}

/**
 * Macros calculados a partir de datos corporales + actividad + objetivo.
 * Proteína y grasa se anclan al peso; los carbos absorben lo que queda. Si con la
 * grasa "ideal" los carbos darían negativos, se recorta la grasa hasta un piso.
 */
export function calcMacros(input: CalcMacrosInput): MacroSet {
  const bmr = bmrMifflinStJeor(input.weightKg, input.heightCm, input.age, input.sex);
  const maintenance = tdee(bmr, input.activity);
  const kcal = Math.round((maintenance * (1 + GOAL_KCAL_DELTA[input.goal])) / 10) * 10;

  const protein_g = Math.round(input.weightKg * GOAL_PROTEIN_PER_KG[input.goal]);
  let fat_g = Math.round(input.weightKg * FAT_PER_KG);

  let carbsKcal = kcal - protein_g * KCAL_PER_G.protein - fat_g * KCAL_PER_G.fat;
  if (carbsKcal < 0) {
    // Recortar grasa hasta el piso para no dejar los carbos en negativo.
    fat_g = Math.max(Math.round(input.weightKg * FAT_PER_KG_MIN), Math.round((kcal - protein_g * KCAL_PER_G.protein) / KCAL_PER_G.fat));
    carbsKcal = kcal - protein_g * KCAL_PER_G.protein - fat_g * KCAL_PER_G.fat;
  }
  const carbs_g = Math.max(0, Math.round(carbsKcal / KCAL_PER_G.carbs));

  return { kcal, protein_g, carbs_g, fat_g };
}

/** Macros en gramos a partir de kcal totales + reparto porcentual (modo manual). */
export function macrosFromPercentages(kcal: number, proteinPct: number, carbsPct: number, fatPct: number): MacroSet {
  return {
    kcal: Math.round(kcal),
    protein_g: Math.round((kcal * proteinPct) / 100 / KCAL_PER_G.protein),
    carbs_g: Math.round((kcal * carbsPct) / 100 / KCAL_PER_G.carbs),
    fat_g: Math.round((kcal * fatPct) / 100 / KCAL_PER_G.fat),
  };
}

/** Reparto porcentual aproximado de un set de macros (para precargar el modo manual al editar). */
export function percentagesFromMacros(m: MacroSet): { proteinPct: number; carbsPct: number; fatPct: number } {
  const p = m.protein_g * KCAL_PER_G.protein;
  const c = m.carbs_g * KCAL_PER_G.carbs;
  const f = m.fat_g * KCAL_PER_G.fat;
  const total = p + c + f || 1;
  const proteinPct = Math.round((p / total) * 100);
  const carbsPct = Math.round((c / total) * 100);
  return { proteinPct, carbsPct, fatPct: 100 - proteinPct - carbsPct };
}

// ---------------------------------------------------------------------------
// Reparto en comidas
// ---------------------------------------------------------------------------

export interface Meal {
  name: string;
  /** Porcentaje de las calorías diarias que va a esta comida. El total suma 100. */
  pct: number;
}

export const MIN_MEALS = 3;
export const MAX_MEALS = 6;

// Nombres por defecto según la cantidad de comidas (editables por el usuario).
const DEFAULT_MEALS_BY_COUNT: Record<number, Meal[]> = {
  3: [
    { name: "Desayuno", pct: 30 },
    { name: "Almuerzo", pct: 40 },
    { name: "Cena", pct: 30 },
  ],
  4: [
    { name: "Desayuno", pct: 25 },
    { name: "Almuerzo", pct: 35 },
    { name: "Merienda", pct: 15 },
    { name: "Cena", pct: 25 },
  ],
  5: [
    { name: "Desayuno", pct: 25 },
    { name: "Media mañana", pct: 10 },
    { name: "Almuerzo", pct: 30 },
    { name: "Merienda", pct: 10 },
    { name: "Cena", pct: 25 },
  ],
  6: [
    { name: "Desayuno", pct: 20 },
    { name: "Media mañana", pct: 10 },
    { name: "Almuerzo", pct: 30 },
    { name: "Merienda", pct: 10 },
    { name: "Cena", pct: 20 },
    { name: "Tentempié", pct: 10 },
  ],
};

export function defaultMeals(count: number): Meal[] {
  const clamped = Math.min(MAX_MEALS, Math.max(MIN_MEALS, Math.round(count)));
  return DEFAULT_MEALS_BY_COUNT[clamped].map((m) => ({ ...m }));
}

/** Macros recomendados para una comida = fracción del objetivo diario según su pct. */
export function mealMacros(target: MacroSet, pct: number): MacroSet {
  const r = pct / 100;
  return {
    kcal: Math.round(target.kcal * r),
    protein_g: Math.round(target.protein_g * r),
    carbs_g: Math.round(target.carbs_g * r),
    fat_g: Math.round(target.fat_g * r),
  };
}

export function mealsPctTotal(meals: Meal[]): number {
  return meals.reduce((sum, m) => sum + (Number(m.pct) || 0), 0);
}

/** Valida la forma de `meals` leída de la base (jsonb sin constraint). Devuelve null si no sirve. */
export function parseMeals(raw: unknown): Meal[] | null {
  if (!Array.isArray(raw) || raw.length < MIN_MEALS || raw.length > MAX_MEALS) return null;
  const meals: Meal[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const name = (item as { name?: unknown }).name;
    const pct = (item as { pct?: unknown }).pct;
    if (typeof name !== "string" || typeof pct !== "number" || !Number.isFinite(pct)) return null;
    meals.push({ name: name.slice(0, 40), pct });
  }
  return meals;
}
