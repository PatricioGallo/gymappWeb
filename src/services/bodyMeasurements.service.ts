import { supabase } from "../lib/supabaseClient";
import { calcularEdad } from "../lib/age";
import type { Tables } from "../types/database";

export type BodyWeightUnit = "kg" | "lb";

// ---------------------------------------------------------------------------
// Catálogo de medidas: la única fuente de verdad de qué medidas existen, cómo
// se llaman, a qué columna de body_measurements van y en qué grupo se muestran
// (Configuración > Personalización y el selector de métrica de medidas.ts).
// ---------------------------------------------------------------------------

export type MeasurementKey =
  | "peso"
  | "cuello"
  | "pecho"
  | "cintura"
  | "cadera"
  | "biceps"
  | "antebrazo"
  | "muslo"
  | "pantorrilla"
  | "muneca"
  | "grasaCorporal"
  | "masaMuscular"
  | "aguaCorporal"
  | "masaOsea"
  // Pliegues cutáneos (mm), se miden con adipómetro -- alimentan el % graso profesional.
  | "plieguePectoral"
  | "pliegueAxilar"
  | "pliegueTriceps"
  | "pliegueSubescapular"
  | "pliegueAbdominal"
  | "pliegueSuprailiaco"
  | "pliegueMuslo"
  | "pliegueBiceps"
  // Calculadas: no se cargan a mano, se derivan de las de arriba (ver attachDerivedFields).
  | "imc"
  | "ratioCinturaCadera"
  | "ratioCinturaAltura"
  | "grasaBasica"
  | "grasaPliegues";

export type MeasurementColumn =
  | "peso"
  | "cuello"
  | "pecho"
  | "cintura"
  | "cadera"
  | "biceps"
  | "antebrazo"
  | "muslo"
  | "pantorrilla"
  | "muneca"
  | "grasa_corporal_pct"
  | "masa_muscular"
  | "agua_corporal_pct"
  | "masa_osea"
  | "pliegue_pectoral"
  | "pliegue_axilar"
  | "pliegue_triceps"
  | "pliegue_subescapular"
  | "pliegue_abdominal"
  | "pliegue_suprailiaco"
  | "pliegue_muslo"
  | "pliegue_biceps";

export type MeasurementGroup = "peso" | "circunferencias" | "composicion" | "pliegues" | "calculadas";

export interface MeasurementFieldDef {
  key: MeasurementKey;
  /** Ausente en las 3 medidas calculadas -- no tienen columna propia, no se cargan a mano. */
  column?: MeasurementColumn;
  label: string;
  /** Unidad fija a mostrar. El peso es la única con unidad elegible (kg/lb, ver BodyMeasurementEntry.unidad); las calculadas son índices/ratios sin unidad -- en ambos casos va "". */
  unit: string;
  group: MeasurementGroup;
  /** Mismo límite superior que el check de la base (ver migración body_measurements_expand), para validar en el cliente antes de pegarle a la red. Sin uso en las calculadas. */
  max: number;
  /** Los porcentajes de composición corporal aceptan 0 (el check de la base es >=0); el resto de las medidas tiene que ser estrictamente positivo. */
  allowZero?: boolean;
  /** true en las 3 medidas derivadas: no aparecen como campo del formulario "+Agregar medidas", solo como resultado (tabs/historial/Configuración). */
  computed?: boolean;
  /** Solo en las calculadas: qué OTRAS medidas (con toggle propio, cargadas por fecha) hacen falta tener activas/cargadas para que esta se pueda calcular. Ver measurementFieldsMarkup en settings.ts (cascada al activar) y noDataMarkup en medidas.ts. */
  requires?: MeasurementKey[];
  /** Solo en IMC y ratio cintura-altura: además de `requires`, necesitan profiles.altura_cm seteada (ver getAlturaCm) -- la altura NO es una medida por fecha, se carga una sola vez en Configuración. */
  requiresAltura?: boolean;
  /** Solo en el % graso calculado: necesita profiles.genero (Hombre/Mujer) -- las fórmulas de composición corporal no están validadas para "otro". */
  requiresGenero?: boolean;
  /** Solo en el % graso por pliegues: necesita la edad (profiles.fecha_nacimiento) -- las ecuaciones de densidad corporal la usan. */
  requiresEdad?: boolean;
  /** Instrucciones de cómo tomar esa medida (dónde poner la cinta, en qué postura, etc.) -- se muestran en la guía colapsable de "+Agregar medidas" (ver bwHelpMarkup en medidas.ts). Ausente en peso y en las calculadas (no aplica). */
  howTo?: string;
}

export const GROUP_LABELS: Record<MeasurementGroup, string> = {
  peso: "Peso y altura",
  circunferencias: "Circunferencias",
  composicion: "Composición corporal",
  pliegues: "Pliegues cutáneos (adipómetro)",
  calculadas: "Calculadas",
};

// Orden = el que ve el usuario en Configuración y en el selector de métrica de medidas.ts.
// Nota: "altura" NO está acá -- no es una medida por fecha con toggle propio, es
// profiles.altura_cm, un campo de perfil que se pide una sola vez (ver getAlturaCm/setAlturaCm
// más abajo) porque prácticamente no cambia. Se edita en el grupo "peso" de Configuración igual,
// solo que como campo de texto en vez de chip -- ver alturaFieldHtml en settings.ts.
export const MEASUREMENT_FIELDS: MeasurementFieldDef[] = [
  {
    key: "peso",
    column: "peso",
    label: "Peso",
    unit: "",
    group: "peso",
    max: 1000,
    howTo: "Pesate siempre en la misma balanza, a la misma hora del día -- lo ideal es a la mañana, en ayunas y después de ir al baño, con ropa mínima o similar cada vez.",
  },
  {
    key: "cuello",
    column: "cuello",
    label: "Cuello",
    unit: "cm",
    group: "circunferencias",
    max: 300,
    howTo: "Pasá la cinta justo debajo de la nuez de Adán (laringe), en la parte más angosta del cuello, sin apretar.",
  },
  {
    key: "pecho",
    column: "pecho",
    label: "Pecho",
    unit: "cm",
    group: "circunferencias",
    max: 300,
    howTo: "Rodeá el pecho con la cinta a la altura de los pezones, en una respiración normal (ni con el pecho inflado ni exhalando al máximo).",
  },
  {
    key: "cintura",
    column: "cintura",
    label: "Cintura",
    unit: "cm",
    group: "circunferencias",
    max: 300,
    howTo: "Medí en el punto más angosto del torso (generalmente a la altura del ombligo), parado derecho y relajado, sin meter panza ni tomar aire de más.",
  },
  {
    key: "cadera",
    column: "cadera",
    label: "Cadera",
    unit: "cm",
    group: "circunferencias",
    max: 300,
    howTo: "Medí en el punto más ancho de los glúteos, con los pies juntos y el cuerpo relajado.",
  },
  {
    key: "biceps",
    column: "biceps",
    label: "Bíceps",
    unit: "cm",
    group: "circunferencias",
    max: 300,
    howTo: "Con el brazo colgando relajado (o flexionado a 90°, elegí siempre la misma posición para poder comparar), medí en la parte más gruesa del músculo, a mitad de camino entre el hombro y el codo.",
  },
  {
    key: "antebrazo",
    column: "antebrazo",
    label: "Antebrazo",
    unit: "cm",
    group: "circunferencias",
    max: 300,
    howTo: "Con el brazo relajado y colgando, medí en la parte más ancha del antebrazo, cerca del codo.",
  },
  {
    key: "muslo",
    column: "muslo",
    label: "Muslo",
    unit: "cm",
    group: "circunferencias",
    max: 300,
    howTo: "Parado con el peso repartido en ambas piernas, medí en la parte más ancha del muslo, justo debajo del glúteo.",
  },
  {
    key: "pantorrilla",
    column: "pantorrilla",
    label: "Pantorrilla",
    unit: "cm",
    group: "circunferencias",
    max: 300,
    howTo: "Parado con el peso repartido en ambas piernas, medí en la parte más ancha de la pantorrilla, a mitad de camino entre la rodilla y el tobillo.",
  },
  {
    key: "muneca",
    column: "muneca",
    label: "Muñeca",
    unit: "cm",
    group: "circunferencias",
    max: 300,
    howTo: "Medí justo debajo del hueso, en la parte más angosta de la muñeca -- donde normalmente apoyaría un reloj.",
  },
  {
    key: "grasaCorporal",
    column: "grasa_corporal_pct",
    label: "Grasa corporal",
    unit: "%",
    group: "composicion",
    max: 100,
    allowZero: true,
    howTo: "Si usás una balanza de bioimpedancia, medite siempre en las mismas condiciones (en ayunas, sin haber entrenado antes, hidratación similar): el número exacto varía de un dispositivo a otro, lo que importa es la tendencia en TU balanza a lo largo del tiempo.",
  },
  {
    key: "masaMuscular",
    column: "masa_muscular",
    label: "Masa muscular",
    unit: "kg",
    group: "composicion",
    max: 500,
    howTo: "Mismo criterio que la grasa corporal: usá siempre el mismo dispositivo y las mismas condiciones para que los valores se puedan comparar entre sí.",
  },
  {
    key: "aguaCorporal",
    column: "agua_corporal_pct",
    label: "Agua corporal",
    unit: "%",
    group: "composicion",
    max: 100,
    allowZero: true,
    howTo: "Es la que más varía de un día a otro según cuánto tomaste o entrenaste -- para que sea comparable, medite en condiciones parecidas cada vez (mismo horario, sin haber tomado mucha agua justo antes).",
  },
  {
    key: "masaOsea",
    column: "masa_osea",
    label: "Masa ósea",
    unit: "kg",
    group: "composicion",
    max: 500,
    howTo: "La estima el mismo dispositivo que la grasa/músculo (balanza de bioimpedancia). Cambia muy poco con el tiempo -- sirve más como referencia que como algo a modificar.",
  },
  // Pliegues cutáneos (mm). Sitios estándar de Jackson-Pollock (7) + bíceps para Durnin-Womersley.
  // El howTo de cada uno describe el sitio anatómico exacto; el consejo general de cómo pellizcar y
  // leer el adipómetro va en HELP_GROUP_TIP.pliegues (medidas.ts).
  {
    key: "plieguePectoral",
    column: "pliegue_pectoral",
    label: "Pliegue pectoral",
    unit: "mm",
    group: "pliegues",
    max: 100,
    howTo: "Pliegue diagonal (siguiendo la línea del músculo pectoral): en hombres, a mitad de camino entre el pliegue de la axila y el pezón; en mujeres, a un tercio de esa distancia desde la axila.",
  },
  {
    key: "pliegueAxilar",
    column: "pliegue_axilar",
    label: "Pliegue axilar medio",
    unit: "mm",
    group: "pliegues",
    max: 100,
    howTo: "Pliegue vertical sobre la línea axilar media (el costado del tronco), a la altura del apéndice xifoides (el extremo inferior del esternón). Brazo levemente separado del cuerpo.",
  },
  {
    key: "pliegueTriceps",
    column: "pliegue_triceps",
    label: "Pliegue tricipital",
    unit: "mm",
    group: "pliegues",
    max: 100,
    howTo: "Pliegue vertical en la cara posterior del brazo (sobre el tríceps), justo a mitad de camino entre el hueso del hombro (acromion) y el codo (olécranon), con el brazo relajado y colgando.",
  },
  {
    key: "pliegueSubescapular",
    column: "pliegue_subescapular",
    label: "Pliegue subescapular",
    unit: "mm",
    group: "pliegues",
    max: 100,
    howTo: "Pliegue diagonal (~45°, hacia abajo y afuera) justo debajo del ángulo inferior de la escápula (la punta de abajo del omóplato).",
  },
  {
    key: "pliegueAbdominal",
    column: "pliegue_abdominal",
    label: "Pliegue abdominal",
    unit: "mm",
    group: "pliegues",
    max: 100,
    howTo: "Pliegue vertical a unos 2 cm al costado del ombligo (del lado derecho), con el abdomen relajado.",
  },
  {
    key: "pliegueSuprailiaco",
    column: "pliegue_suprailiaco",
    label: "Pliegue suprailíaco",
    unit: "mm",
    group: "pliegues",
    max: 100,
    howTo: "Pliegue diagonal, siguiendo la línea natural de la piel, justo por encima de la cresta ilíaca (el hueso de la cadera), sobre la línea axilar anterior.",
  },
  {
    key: "pliegueMuslo",
    column: "pliegue_muslo",
    label: "Pliegue del muslo",
    unit: "mm",
    group: "pliegues",
    max: 100,
    howTo: "Pliegue vertical en la cara anterior del muslo, a mitad de camino entre el pliegue de la ingle y el borde superior de la rótula. Pierna relajada, con el peso en la otra pierna.",
  },
  {
    key: "pliegueBiceps",
    column: "pliegue_biceps",
    label: "Pliegue bicipital",
    unit: "mm",
    group: "pliegues",
    max: 100,
    howTo: "Pliegue vertical en la cara anterior del brazo (sobre el vientre del bíceps), a la misma altura que el pliegue del tríceps, con el brazo relajado.",
  },
  { key: "imc", label: "IMC", unit: "", group: "calculadas", max: 100, computed: true, requires: ["peso"], requiresAltura: true },
  { key: "ratioCinturaCadera", label: "Ratio cintura-cadera", unit: "", group: "calculadas", max: 10, computed: true, requires: ["cintura", "cadera"] },
  { key: "ratioCinturaAltura", label: "Ratio cintura-altura", unit: "", group: "calculadas", max: 10, computed: true, requires: ["cintura"], requiresAltura: true },
  // % graso básico (US Navy): solo cinta métrica. requires "cadera" también para cubrir a las
  // mujeres (la fórmula femenina la usa; la masculina no, pero es una medida útil igual).
  {
    key: "grasaBasica",
    label: "Grasa corporal (cinta)",
    unit: "%",
    group: "calculadas",
    max: 100,
    computed: true,
    requires: ["cuello", "cintura", "cadera"],
    requiresAltura: true,
    requiresGenero: true,
  },
  // % graso profesional (pliegues): elige la fórmula más completa posible entre JP7 / JP3 / Durnin.
  {
    key: "grasaPliegues",
    label: "Grasa corporal (pliegues)",
    unit: "%",
    group: "calculadas",
    max: 100,
    computed: true,
    requires: [
      "pliegueTriceps",
      "pliegueSubescapular",
      "pliegueSuprailiaco",
      "pliegueAbdominal",
      "plieguePectoral",
      "pliegueAxilar",
      "pliegueMuslo",
      "pliegueBiceps",
    ],
    requiresGenero: true,
    requiresEdad: true,
  },
];

export function fieldDef(key: MeasurementKey): MeasurementFieldDef {
  return MEASUREMENT_FIELDS.find((f) => f.key === key)!;
}

// ---------------------------------------------------------------------------
// Clasificación de IMC (OMS, 4 categorías -- sin desglosar obesidad en grados
// I/II/III por pedido explícito). Usado en medidas.ts para el badge de "dónde
// estoy parado" y la tabla de fronteras de peso según la altura del perfil.
// ---------------------------------------------------------------------------

export type ImcCategoryKey = "bajoPeso" | "normal" | "sobrepeso" | "obesidad";

export interface ImcCategory {
  key: ImcCategoryKey;
  label: string;
  /** Límite inferior de IMC (kg/m²), inclusive. */
  min: number;
  /** Límite superior de IMC (kg/m²), exclusivo. null = sin techo (Obesidad). */
  max: number | null;
}

export const IMC_CATEGORIES: ImcCategory[] = [
  { key: "bajoPeso", label: "Bajo peso", min: 0, max: 18.5 },
  { key: "normal", label: "Normal", min: 18.5, max: 25 },
  { key: "sobrepeso", label: "Sobrepeso", min: 25, max: 30 },
  { key: "obesidad", label: "Obesidad", min: 30, max: null },
];

export function imcCategoryFor(imc: number): ImcCategory {
  return IMC_CATEGORIES.find((c) => imc >= c.min && (c.max == null || imc < c.max)) ?? IMC_CATEGORIES[IMC_CATEGORIES.length - 1];
}

/**
 * IMC = peso(kg) / altura(m)² -- despejado para peso, da los cortes de cada categoría en kg para
 * una altura dada. El techo de una categoría "de dos puntas" (min>0, ej. Normal/Sobrepeso) se
 * muestra 0.1 de IMC por debajo del corte real antes de convertir a kg, para que no se vea pegado
 * al piso de la categoría siguiente -- mismo criterio que la tabla clásica de la OMS
 * ("18.5–24.9 / 25–29.9" en vez de "18.5–25 / 25–30"). Bajo peso (min=0, "menos de X") y Obesidad
 * (max=null, "X o más") no llevan ese ajuste.
 */
export function imcWeightBoundariesKg(alturaCm: number): Array<{ category: ImcCategory; minKg: number | null; maxKg: number | null }> {
  const alturaM2 = (alturaCm / 100) ** 2;
  return IMC_CATEGORIES.map((c) => ({
    category: c,
    minKg: c.min > 0 ? c.min * alturaM2 : null,
    maxKg: c.max != null ? (c.min > 0 ? c.max - 0.1 : c.max) * alturaM2 : null,
  }));
}

// ---------------------------------------------------------------------------
// Clasificación de Ratio Cintura-Altura (RCA) -- igual que IMC, no depende del sexo y se ancla
// en profiles.altura_cm (perfil, no por fecha). Fuente: tabla de Ashwell ("mantené tu cintura
// por debajo de la mitad de tu altura" -- el corte 0.5 es exactamente ese).
// ---------------------------------------------------------------------------

export type RcaCategoryKey = "bajoPeso" | "saludable" | "sobrepeso" | "obesidad";

export interface RcaCategory {
  key: RcaCategoryKey;
  label: string;
  /** Límite inferior del ratio, inclusive. */
  min: number;
  /** Límite superior del ratio, exclusivo. null = sin techo (Obesidad). */
  max: number | null;
}

export const RCA_CATEGORIES: RcaCategory[] = [
  { key: "bajoPeso", label: "Bajo peso", min: 0, max: 0.4 },
  { key: "saludable", label: "Saludable", min: 0.4, max: 0.5 },
  { key: "sobrepeso", label: "Sobrepeso", min: 0.5, max: 0.6 },
  { key: "obesidad", label: "Obesidad", min: 0.6, max: null },
];

export function rcaCategoryFor(ratio: number): RcaCategory {
  return RCA_CATEGORIES.find((c) => ratio >= c.min && (c.max == null || ratio < c.max)) ?? RCA_CATEGORIES[RCA_CATEGORIES.length - 1];
}

/**
 * Ratio = cintura / altura (mismas unidades) -- despejado para cintura, da los cortes de cada
 * categoría en cm para una altura dada. Mismo ajuste de -0.01 en el techo de las categorías "de
 * dos puntas" que imcWeightBoundariesKg (ver esa función para el porqué), pero a 2 decimales en
 * vez de 1 porque el ratio se reporta así.
 */
export function rcaWaistBoundariesCm(alturaCm: number): Array<{ category: RcaCategory; minCm: number | null; maxCm: number | null }> {
  return RCA_CATEGORIES.map((c) => ({
    category: c,
    minCm: c.min > 0 ? c.min * alturaCm : null,
    maxCm: c.max != null ? (c.min > 0 ? c.max - 0.01 : c.max) * alturaCm : null,
  }));
}

// ---------------------------------------------------------------------------
// Clasificación de Ratio Cintura-Cadera (RCC) -- a diferencia de IMC/RCA SÍ depende del sexo
// (profiles.genero). No tiene un ancla fija como la altura: la cadera se carga por fecha, así
// que la "frontera en cm" de cada categoría se calcula aparte para la cadera de UN registro
// puntual (ver rccWaistBoundariesCmForHip), no como una tabla única de una vez.
// ---------------------------------------------------------------------------

export type RccCategoryKey = "bajoRiesgo" | "riesgoModerado" | "riesgoAlto";
export type RccSex = "hombre" | "mujer";

export interface RccCategory {
  key: RccCategoryKey;
  label: string;
  min: number;
  max: number | null;
}

const RCC_CATEGORIES_BY_SEX: Record<RccSex, RccCategory[]> = {
  hombre: [
    { key: "bajoRiesgo", label: "Bajo riesgo", min: 0, max: 0.9 },
    { key: "riesgoModerado", label: "Riesgo moderado", min: 0.9, max: 1.0 },
    { key: "riesgoAlto", label: "Riesgo alto", min: 1.0, max: null },
  ],
  mujer: [
    { key: "bajoRiesgo", label: "Bajo riesgo", min: 0, max: 0.8 },
    { key: "riesgoModerado", label: "Riesgo moderado", min: 0.8, max: 0.85 },
    { key: "riesgoAlto", label: "Riesgo alto", min: 0.85, max: null },
  ],
};

export function rccCategoriesFor(sex: RccSex): RccCategory[] {
  return RCC_CATEGORIES_BY_SEX[sex];
}

export function rccCategoryFor(ratio: number, sex: RccSex): RccCategory {
  const categories = RCC_CATEGORIES_BY_SEX[sex];
  return categories.find((c) => ratio >= c.min && (c.max == null || ratio < c.max)) ?? categories[categories.length - 1];
}

/** Ratio = cintura / cadera -- despejado para cintura, da los cortes de cada categoría en cm para LA cadera de un registro puntual (a diferencia de la altura, la cadera se carga por fecha -- ver nota arriba). */
export function rccWaistBoundariesCmForHip(caderaCm: number, sex: RccSex): Array<{ category: RccCategory; minCm: number | null; maxCm: number | null }> {
  const categories = RCC_CATEGORIES_BY_SEX[sex];
  return categories.map((c) => ({
    category: c,
    minCm: c.min > 0 ? c.min * caderaCm : null,
    maxCm: c.max != null ? (c.min > 0 ? c.max - 0.01 : c.max) * caderaCm : null,
  }));
}

/** profiles.genero -- se pide en Configuración > Editar perfil (mismo campo del registro). null si no está cargado o es "otro" (la clasificación de RCC y el % graso solo tienen fórmulas para hombre/mujer, ver RCC_CATEGORIES_BY_SEX / navyBodyFat). */
export async function getGenero(userId: string): Promise<RccSex | null> {
  const { data, error } = await supabase.from("profiles").select("genero").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data?.genero === "hombre" || data?.genero === "mujer" ? data.genero : null;
}

/** Edad en años a partir de profiles.fecha_nacimiento (requerida en el registro). null si no está. La usan las ecuaciones de densidad corporal del % graso por pliegues (grasaPliegues). */
export async function getEdad(userId: string): Promise<number | null> {
  const { data, error } = await supabase.from("profiles").select("fecha_nacimiento").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data?.fecha_nacimiento ? calcularEdad(data.fecha_nacimiento) : null;
}

// ---------------------------------------------------------------------------
// % graso corporal calculado. Dos métodos, ambos derivados (no se cargan a mano):
//   - grasaBasica  (US Navy): solo cinta métrica -- cuello, cintura, cadera (mujeres), altura, sexo.
//   - grasaPliegues (adipómetro): elige la fórmula más completa posible entre
//     Jackson-Pollock 7, Jackson-Pollock 3 (según sexo) y Durnin-Womersley (4 pliegues);
//     densidad corporal -> % graso por la ecuación de Siri (495/D - 450).
// El sexo sale de profiles.genero (getGenero) y la edad de profiles.fecha_nacimiento (getEdad).
// Los dos resultados se clampean a [2, 75] % -- fuera de ese rango se asume entrada mala -> null.
// Mismas fórmulas replicadas server-side en la RPC get_profile_measurement_series (widgets del perfil).
// ---------------------------------------------------------------------------

const BODYFAT_MIN_PCT = 2;
const BODYFAT_MAX_PCT = 75;

function clampBodyFat(pct: number): number | null {
  return Number.isFinite(pct) && pct >= BODYFAT_MIN_PCT && pct <= BODYFAT_MAX_PCT ? pct : null;
}

/** Ecuación de Siri: densidad corporal (g/cm³) -> % graso. */
function siriBodyFat(density: number): number {
  return 495 / density - 450;
}

export interface NavyBodyFatInput {
  sexo: RccSex;
  alturaCm: number;
  cuello: number;
  cintura: number;
  /** Obligatoria en mujeres (la fórmula femenina la usa); ignorada en hombres. */
  cadera: number | null;
}

/**
 * % graso por el método US Navy (versión métrica, cm). Hombre: usa cuello + cintura + altura.
 * Mujer: además cadera. Devuelve null si falta algún dato o el argumento del logaritmo no es positivo.
 */
export function navyBodyFat(i: NavyBodyFatInput): number | null {
  if (!(i.alturaCm > 0) || !(i.cuello > 0) || !(i.cintura > 0)) return null;
  let pct: number;
  if (i.sexo === "hombre") {
    const d = i.cintura - i.cuello;
    if (d <= 0) return null;
    pct = 495 / (1.0324 - 0.19077 * Math.log10(d) + 0.15456 * Math.log10(i.alturaCm)) - 450;
  } else {
    if (i.cadera == null || i.cadera <= 0) return null;
    const d = i.cintura + i.cadera - i.cuello;
    if (d <= 0) return null;
    pct = 495 / (1.29579 - 0.35004 * Math.log10(d) + 0.221 * Math.log10(i.alturaCm)) - 450;
  }
  return clampBodyFat(pct);
}

export type SkinfoldMethod = "jp7" | "jp3" | "durnin";

export const SKINFOLD_METHOD_LABELS: Record<SkinfoldMethod, string> = {
  jp7: "Jackson-Pollock (7 pliegues)",
  jp3: "Jackson-Pollock (3 pliegues)",
  durnin: "Durnin-Womersley (4 pliegues)",
};

export interface SkinfoldValues {
  pectoral: number | null;
  axilar: number | null;
  triceps: number | null;
  subescapular: number | null;
  abdominal: number | null;
  suprailiaco: number | null;
  muslo: number | null;
  biceps: number | null;
}

// Durnin-Womersley: densidad = c - m·log10(Σ4 pliegues). c y m por sexo y tramo de edad.
const DURNIN_COEFFS: Record<RccSex, Array<{ maxAge: number; c: number; m: number }>> = {
  hombre: [
    { maxAge: 19, c: 1.162, m: 0.063 },
    { maxAge: 29, c: 1.1631, m: 0.0632 },
    { maxAge: 39, c: 1.1422, m: 0.0544 },
    { maxAge: 49, c: 1.162, m: 0.07 },
    { maxAge: Infinity, c: 1.1715, m: 0.0779 },
  ],
  mujer: [
    { maxAge: 19, c: 1.1549, m: 0.0678 },
    { maxAge: 29, c: 1.1599, m: 0.0717 },
    { maxAge: 39, c: 1.1423, m: 0.0632 },
    { maxAge: 49, c: 1.1333, m: 0.0612 },
    { maxAge: Infinity, c: 1.1339, m: 0.0645 },
  ],
};

export interface SkinfoldBodyFatResult {
  pct: number;
  method: SkinfoldMethod;
}

/**
 * % graso a partir de pliegues (mm) + sexo + edad. Elige la fórmula más completa que los datos
 * permitan, en este orden: Jackson-Pollock 7 -> Jackson-Pollock 3 (pecho/abdomen/muslo en hombres,
 * tríceps/suprailíaco/muslo en mujeres) -> Durnin-Womersley (bíceps/tríceps/subescapular/suprailíaco).
 * Devuelve null (con el método usado) si no alcanza para ninguna.
 */
export function skinfoldBodyFat(folds: SkinfoldValues, sexo: RccSex, edad: number): SkinfoldBodyFatResult | null {
  const f = folds;
  const ok = (...vals: Array<number | null>) => vals.every((v) => v != null && v > 0);

  let density: number | null = null;
  let method: SkinfoldMethod | null = null;

  if (ok(f.pectoral, f.axilar, f.triceps, f.subescapular, f.abdominal, f.suprailiaco, f.muslo)) {
    const s = f.pectoral! + f.axilar! + f.triceps! + f.subescapular! + f.abdominal! + f.suprailiaco! + f.muslo!;
    density =
      sexo === "hombre"
        ? 1.112 - 0.00043499 * s + 0.00000055 * s * s - 0.00028826 * edad
        : 1.097 - 0.00046971 * s + 0.00000056 * s * s - 0.00012828 * edad;
    method = "jp7";
  } else if (sexo === "hombre" && ok(f.pectoral, f.abdominal, f.muslo)) {
    const s = f.pectoral! + f.abdominal! + f.muslo!;
    density = 1.10938 - 0.0008267 * s + 0.0000016 * s * s - 0.0002574 * edad;
    method = "jp3";
  } else if (sexo === "mujer" && ok(f.triceps, f.suprailiaco, f.muslo)) {
    const s = f.triceps! + f.suprailiaco! + f.muslo!;
    density = 1.0994921 - 0.0009929 * s + 0.0000023 * s * s - 0.0001392 * edad;
    method = "jp3";
  } else if (ok(f.biceps, f.triceps, f.subescapular, f.suprailiaco)) {
    const s = f.biceps! + f.triceps! + f.subescapular! + f.suprailiaco!;
    const { c, m } = DURNIN_COEFFS[sexo].find((row) => edad <= row.maxAge)!;
    density = c - m * Math.log10(s);
    method = "durnin";
  }

  if (density == null || method == null || density <= 0) return null;
  const pct = clampBodyFat(siriBodyFat(density));
  return pct == null ? null : { pct, method };
}

// ---------------------------------------------------------------------------
// Clasificación de % graso corporal -- cortes por sexo (escala estándar ACE / ACSM):
// Grasa esencial / Atletas / Fitness / Aceptable / Obesidad. Se aplica igual al % graso básico
// (Navy), al de pliegues y al cargado a mano por bioimpedancia (grasaCorporal) -- ver
// bodyFatClassificationMarkup en medidas.ts.
// ---------------------------------------------------------------------------

export type BodyFatCategoryKey = "esencial" | "atletas" | "fitness" | "aceptable" | "obesidad";

export interface BodyFatCategory {
  key: BodyFatCategoryKey;
  label: string;
  /** Límite inferior de % graso, inclusive. */
  min: number;
  /** Límite superior, exclusivo. null = sin techo (Obesidad). */
  max: number | null;
}

const BODYFAT_CATEGORIES_BY_SEX: Record<RccSex, BodyFatCategory[]> = {
  hombre: [
    { key: "esencial", label: "Grasa esencial", min: 0, max: 6 },
    { key: "atletas", label: "Atletas", min: 6, max: 14 },
    { key: "fitness", label: "Fitness", min: 14, max: 18 },
    { key: "aceptable", label: "Aceptable", min: 18, max: 25 },
    { key: "obesidad", label: "Obesidad", min: 25, max: null },
  ],
  mujer: [
    { key: "esencial", label: "Grasa esencial", min: 0, max: 14 },
    { key: "atletas", label: "Atletas", min: 14, max: 21 },
    { key: "fitness", label: "Fitness", min: 21, max: 25 },
    { key: "aceptable", label: "Aceptable", min: 25, max: 32 },
    { key: "obesidad", label: "Obesidad", min: 32, max: null },
  ],
};

export function bodyFatCategoriesFor(sexo: RccSex): BodyFatCategory[] {
  return BODYFAT_CATEGORIES_BY_SEX[sexo];
}

export function bodyFatCategoryFor(pct: number, sexo: RccSex): BodyFatCategory {
  const cats = BODYFAT_CATEGORIES_BY_SEX[sexo];
  return cats.find((c) => pct >= c.min && (c.max == null || pct < c.max)) ?? cats[cats.length - 1];
}

/** Los campos que se pueden cargar a mano en el modal "+Agregar medidas" (todas menos las 3 calculadas). */
export interface LoggableFieldDef extends MeasurementFieldDef {
  column: MeasurementColumn;
}
export function loggableFields(): LoggableFieldDef[] {
  return MEASUREMENT_FIELDS.filter((f): f is LoggableFieldDef => !f.computed);
}

// ---------------------------------------------------------------------------
// Preferencias (profiles.body_measurement_prefs): qué medidas sigue cada usuario.
// "enabled" es el interruptor general (por defecto apagado); con él prendido,
// cada medida se activa/desactiva individualmente -- "peso" viene prendida por
// default, el resto no (ver migración body_measurements_expand).
// ---------------------------------------------------------------------------

export type BodyMeasurementPrefs = Record<MeasurementKey, boolean> & { enabled: boolean };

export const DEFAULT_BODY_MEASUREMENT_PREFS: BodyMeasurementPrefs = {
  enabled: false,
  peso: true,
  cuello: false,
  pecho: false,
  cintura: false,
  cadera: false,
  biceps: false,
  antebrazo: false,
  muslo: false,
  pantorrilla: false,
  muneca: false,
  grasaCorporal: false,
  masaMuscular: false,
  aguaCorporal: false,
  masaOsea: false,
  plieguePectoral: false,
  pliegueAxilar: false,
  pliegueTriceps: false,
  pliegueSubescapular: false,
  pliegueAbdominal: false,
  pliegueSuprailiaco: false,
  pliegueMuslo: false,
  pliegueBiceps: false,
  imc: false,
  ratioCinturaCadera: false,
  ratioCinturaAltura: false,
  grasaBasica: false,
  grasaPliegues: false,
};

export function parseBodyMeasurementPrefs(raw: unknown): BodyMeasurementPrefs {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...DEFAULT_BODY_MEASUREMENT_PREFS, ...(raw as Partial<BodyMeasurementPrefs>) };
  }
  return { ...DEFAULT_BODY_MEASUREMENT_PREFS };
}

/** Trae solo el toggle de preferencias (liviano: lo usan el gate de medidas.ts y el quick-action de profile.ts). */
export async function getBodyMeasurementPrefs(userId: string): Promise<BodyMeasurementPrefs> {
  const { data, error } = await supabase.from("profiles").select("body_measurement_prefs").eq("id", userId).maybeSingle();
  if (error) throw error;
  return parseBodyMeasurementPrefs(data?.body_measurement_prefs);
}

// ---------------------------------------------------------------------------
// Altura: NO es una medida por fecha (ver nota en MEASUREMENT_FIELDS) -- vive en
// profiles.altura_cm, un solo valor que IMC y ratio cintura-altura reutilizan
// para todo el historial (ver attachDerivedFields).
// ---------------------------------------------------------------------------

export async function getAlturaCm(userId: string): Promise<number | null> {
  const { data, error } = await supabase.from("profiles").select("altura_cm").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data?.altura_cm != null ? Number(data.altura_cm) : null;
}

export async function setAlturaCm(userId: string, alturaCm: number | null): Promise<{ error?: string }> {
  const { error } = await supabase.from("profiles").update({ altura_cm: alturaCm }).eq("id", userId);
  if (error) return { error: "No se pudo guardar tu altura. Probá de nuevo." };
  return {};
}

// ---------------------------------------------------------------------------
// Registros
// ---------------------------------------------------------------------------

export interface BodyMeasurementEntry {
  id: string;
  fecha: string; // "YYYY-MM-DD"
  createdAt: string;
  unidad: BodyWeightUnit;
  peso: number | null;
  cuello: number | null;
  pecho: number | null;
  cintura: number | null;
  cadera: number | null;
  biceps: number | null;
  antebrazo: number | null;
  muslo: number | null;
  pantorrilla: number | null;
  muneca: number | null;
  grasaCorporal: number | null;
  masaMuscular: number | null;
  aguaCorporal: number | null;
  masaOsea: number | null;
  plieguePectoral: number | null;
  pliegueAxilar: number | null;
  pliegueTriceps: number | null;
  pliegueSubescapular: number | null;
  pliegueAbdominal: number | null;
  pliegueSuprailiaco: number | null;
  pliegueMuslo: number | null;
  pliegueBiceps: number | null;
  // Calculadas -- no vienen de una columna, las llena attachDerivedFields() al listar.
  imc: number | null;
  ratioCinturaCadera: number | null;
  ratioCinturaAltura: number | null;
  grasaBasica: number | null;
  grasaPliegues: number | null;
  /** Método con el que se calculó grasaPliegues ese día (jp7 / jp3 / durnin), null si no se pudo. Transitorio, no es columna. */
  grasaPlieguesMetodo: SkinfoldMethod | null;
  /** Path en el bucket privado "measurement-photos" (no la URL -- ver getMeasurementPhotoUrl(s)). */
  fotoPath: string | null;
}

function n(v: number | string | null): number | null {
  return v == null ? null : Number(v);
}

function mapRow(r: Tables<"body_measurements">): BodyMeasurementEntry {
  return {
    id: r.id,
    fecha: r.fecha,
    createdAt: r.created_at,
    unidad: (r.unidad === "lb" ? "lb" : "kg") as BodyWeightUnit,
    peso: n(r.peso),
    cuello: n(r.cuello),
    pecho: n(r.pecho),
    cintura: n(r.cintura),
    cadera: n(r.cadera),
    biceps: n(r.biceps),
    antebrazo: n(r.antebrazo),
    muslo: n(r.muslo),
    pantorrilla: n(r.pantorrilla),
    muneca: n(r.muneca),
    grasaCorporal: n(r.grasa_corporal_pct),
    masaMuscular: n(r.masa_muscular),
    aguaCorporal: n(r.agua_corporal_pct),
    masaOsea: n(r.masa_osea),
    plieguePectoral: n(r.pliegue_pectoral),
    pliegueAxilar: n(r.pliegue_axilar),
    pliegueTriceps: n(r.pliegue_triceps),
    pliegueSubescapular: n(r.pliegue_subescapular),
    pliegueAbdominal: n(r.pliegue_abdominal),
    pliegueSuprailiaco: n(r.pliegue_suprailiaco),
    pliegueMuslo: n(r.pliegue_muslo),
    pliegueBiceps: n(r.pliegue_biceps),
    imc: null,
    ratioCinturaCadera: null,
    ratioCinturaAltura: null,
    grasaBasica: null,
    grasaPliegues: null,
    grasaPlieguesMetodo: null,
    fotoPath: r.foto_path,
  };
}

const LB_TO_KG = 0.45359237;

/** Kg -> unidad de peso preferida del usuario, para mostrar los cortes de imcWeightBoundariesKg() en Lb cuando corresponda. */
export function kgToUnit(kg: number, unidad: BodyWeightUnit): number {
  return unidad === "lb" ? kg / LB_TO_KG : kg;
}

/**
 * Peso corporal más reciente del usuario en kg (convierte de lb si el registro estaba en lb).
 * `null` si no tiene ningún registro de peso cargado, o si no es visible (RLS -- ej. un
 * entrenador mirando a un alumno que no comparte sus medidas). Consulta liviana: 1 fila, no
 * baja todo el historial como listBodyMeasurements().
 */
export async function getLatestBodyWeightKg(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("body_measurements")
    .select("peso, unidad")
    .eq("user_id", userId)
    .not("peso", "is", null)
    .order("fecha", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (error || row?.peso == null) return null;
  const peso = Number(row.peso);
  return row.unidad === "lb" ? peso * LB_TO_KG : peso;
}

/**
 * Completa las medidas calculadas de cada entrada (mutando in-place). `alturaCm`, `sexo` y `edad`
 * son valores ÚNICOS del perfil (profiles.altura_cm / .genero / .fecha_nacimiento) que se aplican
 * por igual a todo el historial -- ninguno se carga por fecha, la altura y el sexo no cambian y la
 * edad varía tan poco entre registros que no vale la pena rastrearla por fila (mismo criterio que
 * la altura, ver nota en MEASUREMENT_FIELDS).
 */
function attachDerivedFields(rows: BodyMeasurementEntry[], alturaCm: number | null, sexo: RccSex | null, edad: number | null): BodyMeasurementEntry[] {
  const alturaM = alturaCm != null && alturaCm > 0 ? alturaCm / 100 : null;
  for (const r of rows) {
    const pesoKg = r.peso != null ? (r.unidad === "lb" ? r.peso * LB_TO_KG : r.peso) : null;

    r.imc = pesoKg != null && alturaM != null ? pesoKg / (alturaM * alturaM) : null;
    r.ratioCinturaCadera = r.cintura != null && r.cadera != null && r.cadera > 0 ? r.cintura / r.cadera : null;
    r.ratioCinturaAltura = r.cintura != null && alturaCm != null && alturaCm > 0 ? r.cintura / alturaCm : null;

    r.grasaBasica =
      sexo != null && alturaCm != null && r.cuello != null && r.cintura != null
        ? navyBodyFat({ sexo, alturaCm, cuello: r.cuello, cintura: r.cintura, cadera: r.cadera })
        : null;

    const skin =
      sexo != null && edad != null
        ? skinfoldBodyFat(
            {
              pectoral: r.plieguePectoral,
              axilar: r.pliegueAxilar,
              triceps: r.pliegueTriceps,
              subescapular: r.pliegueSubescapular,
              abdominal: r.pliegueAbdominal,
              suprailiaco: r.pliegueSuprailiaco,
              muslo: r.pliegueMuslo,
              biceps: r.pliegueBiceps,
            },
            sexo,
            edad
          )
        : null;
    r.grasaPliegues = skin?.pct ?? null;
    r.grasaPlieguesMetodo = skin?.method ?? null;
  }
  return rows;
}

function fieldValue(entry: BodyMeasurementEntry, key: MeasurementKey): number | null {
  return entry[key];
}

// Historial completo, más viejo primero (así los gráficos y los cálculos de racha/diferencia
// recorren la serie en orden cronológico sin re-ordenar) -- mismo criterio que el resto de la app.
// alturaCm / sexo / edad: datos del perfil (ver getAlturaCm / getGenero / getEdad) -- los pasa
// quien llama para no pegarle a la red de nuevo acá adentro (medidas.ts ya los tiene en memoria
// junto con las preferencias). Alimentan las medidas calculadas (ver attachDerivedFields).
export async function listBodyMeasurements(
  userId: string,
  alturaCm: number | null,
  sexo: RccSex | null = null,
  edad: number | null = null
): Promise<BodyMeasurementEntry[]> {
  const { data, error } = await supabase.from("body_measurements").select("*").eq("user_id", userId).order("fecha", { ascending: true });
  if (error) throw error;
  return attachDerivedFields((data ?? []).map(mapRow), alturaCm, sexo, edad);
}

export type MeasurementValues = Partial<Record<MeasurementColumn, number | null>>;

// Upsert (no insert): volver a cargar medidas de un día ya cargado pisa los valores anteriores
// (constraint unique (user_id, fecha)). `values` trae SIEMPRE una entrada por cada medida activa
// mostrada en el formulario (número o null si se dejó vacía) -- una medida que no está activa en
// las preferencias del usuario nunca aparece en el objeto, así que nunca se toca en el upsert
// (PostgREST solo hace SET de las columnas presentes en el body), preservando el valor que
// tuviera cargado de antes por si se reactiva más adelante. `fotoPath` en cambio SIEMPRE se manda
// explícito (null incluido) -- a diferencia de las medidas no depende de un toggle de
// Configuración, así que el caller siempre sabe su estado final (ver openMeasurementModal).
export async function upsertBodyMeasurement(userId: string, fecha: string, values: MeasurementValues, unidad: BodyWeightUnit, fotoPath: string | null): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("body_measurements")
    .upsert({ user_id: userId, fecha, unidad, ...values, foto_path: fotoPath, created_at: new Date().toISOString() }, { onConflict: "user_id,fecha" });
  if (error) return { error: "No se pudieron guardar las medidas. Probá de nuevo." };
  return {};
}

// ---------------------------------------------------------------------------
// Foto de progreso opcional (una por registro/fecha, igual que el resto de las medidas).
// Bucket privado ("measurement-photos") -- se guarda el PATH en la fila, nunca la URL: la URL
// pública no existe (RLS de storage.objects solo deja leer al dueño), hay que pedir una firmada
// bajo demanda. Mismo patrón que verification.service.ts.
// ---------------------------------------------------------------------------

const PHOTO_BUCKET = "measurement-photos";
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function uploadMeasurementPhoto(userId: string, file: File): Promise<{ path?: string; error?: string }> {
  if (file.size > PHOTO_MAX_BYTES) return { error: "La imagen es muy pesada. Elegí una de menos de 10MB." };
  if (!PHOTO_ALLOWED_TYPES.includes(file.type)) return { error: "Formato no soportado. Usá JPG, PNG o WEBP." };

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file);
  if (uploadError) return { error: "No se pudo subir la foto. Probá de nuevo." };
  return { path };
}

/** Borra el archivo viejo del storage al reemplazar o quitar una foto -- no es crítico si falla (queda un archivo huérfano, nada más), por eso no devuelve error al caller. */
export async function deleteMeasurementPhoto(path: string): Promise<void> {
  await supabase.storage.from(PHOTO_BUCKET).remove([path]);
}

export async function getMeasurementPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, PHOTO_SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  return data.signedUrl;
}

/**
 * Descarga la foto de una medida como Blob -- se usa para re-subirla a OTRO bucket al compartir
 * la medida como Rep (el bucket de Reps es público, el de fotos de progreso es privado, no se
 * puede referenciar una URL firmada con TTL desde un Rep permanente). Ver openShareMeasurementModal
 * en medidas.ts. Devuelve null si falla -- el caller ofrece subir una foto a mano en ese caso.
 */
export async function downloadMeasurementPhoto(path: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) return null;
  return data;
}

/** Batch para el historial (varias filas con foto a la vez) -- una sola llamada de red en vez de N. */
export async function getMeasurementPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, PHOTO_SIGNED_URL_TTL_SECONDS);
  if (error || !data) return map;
  data.forEach((d) => {
    if (d.signedUrl && d.path) map.set(d.path, d.signedUrl);
  });
  return map;
}

export async function deleteBodyMeasurement(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("body_measurements").delete().eq("id", id);
  if (error) return { error: "No se pudo borrar el registro. Probá de nuevo." };
  return {};
}

export interface MeasurementStats {
  count: number;
  current: { value: number; fecha: string };
  first: { value: number; fecha: string };
  max: { value: number; fecha: string };
  min: { value: number; fecha: string };
  /** valor actual − primer valor registrado (positivo = subió, negativo = bajó). */
  netChange: number;
  /** La mayor caída pico→valle que hubo en algún tramo del historial (drawdown máximo). */
  maxDrop: number;
  /** La mayor subida valle→pico que hubo en algún tramo del historial (run-up máximo). */
  maxGain: number;
}

/**
 * Estadísticas de UNA medida sobre el historial completo -- filtra las filas donde esa medida
 * está cargada (puede haber huecos: no todos los días se cargan todas las medidas activas).
 * Para "peso" además elige la unidad dominante del historial (kg y lb no son convertibles entre
 * sí) y filtra solo esa serie, igual que hacía antes computeBodyWeightStats; el resto de las
 * medidas tiene una unidad fija (ver MEASUREMENT_FIELDS) y no necesita ese paso.
 * Devuelve null si no hay ningún registro de esa medida (o, para peso, en esa unidad).
 */
export function computeMeasurementStats(entries: BodyMeasurementEntry[], key: MeasurementKey): { unidad: BodyWeightUnit | null; stats: MeasurementStats } | null {
  let series = entries.filter((e) => fieldValue(e, key) != null);
  let unidad: BodyWeightUnit | null = null;

  if (key === "peso") {
    const countByUnit = new Map<BodyWeightUnit, number>();
    series.forEach((e) => countByUnit.set(e.unidad, (countByUnit.get(e.unidad) ?? 0) + 1));
    if (countByUnit.size === 0) return null;
    unidad = [...countByUnit.entries()].sort((a, b) => b[1] - a[1])[0][0];
    series = series.filter((e) => e.unidad === unidad);
  }
  if (series.length === 0) return null;

  const v = (e: BodyMeasurementEntry) => fieldValue(e, key)!;
  const first = series[0];
  const current = series[series.length - 1];
  const max = series.reduce((best, e) => (v(e) > v(best) ? e : best));
  const min = series.reduce((best, e) => (v(e) < v(best) ? e : best));

  let runningPeak = v(series[0]);
  let runningTrough = v(series[0]);
  let maxDrop = 0;
  let maxGain = 0;
  series.forEach((e) => {
    const value = v(e);
    runningPeak = Math.max(runningPeak, value);
    runningTrough = Math.min(runningTrough, value);
    maxDrop = Math.max(maxDrop, runningPeak - value);
    maxGain = Math.max(maxGain, value - runningTrough);
  });

  return {
    unidad,
    stats: {
      count: series.length,
      current: { value: v(current), fecha: current.fecha },
      first: { value: v(first), fecha: first.fecha },
      max: { value: v(max), fecha: max.fecha },
      min: { value: v(min), fecha: min.fecha },
      netChange: v(current) - v(first),
      maxDrop,
      maxGain,
    },
  };
}

// ---------------------------------------------------------------------------
// Serie de medidas para los widgets de Estadísticas del perfil (tarjeta = valor actual,
// gráfico = evolución). A diferencia de listBodyMeasurements (owner-only, RLS directa), esto
// va por la RPC get_profile_measurement_series (SECURITY DEFINER): los widgets del perfil son
// públicos igual que el resto, así que un visitante también los ve -- pero la RPC devuelve
// SOLO las medidas que ese usuario puso explícitamente como widget (curado server-side), con
// IMC/ratios ya calculados. Ver profile.ts (renderStats).
// ---------------------------------------------------------------------------

export interface ProfileMeasurementPoint {
  fecha: string; // "YYYY-MM-DD"
  value: number;
  /** Solo para "peso" (kg/lb); null en el resto. */
  unidad: BodyWeightUnit | null;
}

export async function getProfileMeasurementSeries(userId: string): Promise<Map<MeasurementKey, ProfileMeasurementPoint[]>> {
  const { data, error } = await supabase.rpc("get_profile_measurement_series", { p_user_id: userId });
  if (error) throw error;

  const byKey = new Map<MeasurementKey, ProfileMeasurementPoint[]>();
  for (const row of data ?? []) {
    const key = row.measure_key as MeasurementKey;
    const unidad: BodyWeightUnit | null = row.unidad === "lb" ? "lb" : row.unidad === "kg" ? "kg" : null;
    const arr = byKey.get(key) ?? [];
    arr.push({ fecha: row.fecha, value: Number(row.value), unidad });
    byKey.set(key, arr);
  }

  // "peso" puede tener registros en kg y en lb mezclados (no son convertibles entre sí, mismo
  // criterio que computeMeasurementStats) -- si hay de las dos, quedarse solo con la dominante.
  const peso = byKey.get("peso");
  if (peso && peso.length > 0) {
    const counts = new Map<BodyWeightUnit, number>();
    peso.forEach((p) => p.unidad && counts.set(p.unidad, (counts.get(p.unidad) ?? 0) + 1));
    if (counts.size > 1) {
      const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      byKey.set(
        "peso",
        peso.filter((p) => p.unidad === dominant)
      );
    }
  }

  // La RPC ya ordena por fecha ascendente, pero no cuesta nada asegurarlo.
  byKey.forEach((arr) => arr.sort((a, b) => a.fecha.localeCompare(b.fecha)));
  return byKey;
}
