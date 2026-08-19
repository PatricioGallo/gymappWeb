// Catalogo de "widgets" que se pueden mostrar en la pestaña Estadisticas del perfil (ver
// settings.ts para el picker que arma esta lista, y profile.ts para el render). Vive aca
// porque ambos archivos lo necesitan y no hay un lado "dueño" natural del otro.

export type StatWidgetCategory = "card" | "chart";

export type StatWidgetType = "last_trained" | "top_exercise" | "training_days_count" | "active_routines" | "frequency_chart" | "exercise_progress_chart" | "max_weight_card";

// Los dos tipos "exercise-scoped" (progreso por ejercicio, peso maximo por ejercicio) llevan un
// exerciseId elegible -- uno vive en graficos y el otro en tarjetas, pero comparten la misma
// forma y la misma logica de "automatico vs elegido a mano".
const EXERCISE_SCOPED_TYPES = ["exercise_progress_chart", "max_weight_card"] as const;
type ExerciseScopedType = (typeof EXERCISE_SCOPED_TYPES)[number];

// Chequea un StatWidgetType suelto (ej. el value de un <select>, antes de armar el objeto) --
// para angostar un StatWidget entero, ver isExerciseScopedWidget mas abajo (angostar w.type no
// alcanza para que TS angoste tambien a w, son dos expresiones distintas para el control flow).
export function isExerciseScopedType(type: StatWidgetType): type is ExerciseScopedType {
  return (EXERCISE_SCOPED_TYPES as readonly string[]).includes(type);
}

export interface StatWidgetSimple {
  type: Exclude<StatWidgetType, ExerciseScopedType>;
}

export interface StatWidgetExerciseScoped {
  type: ExerciseScopedType;
  // null = automatico (el ejercicio mas entrenado, se recalcula solo con el tiempo). Un uuid
  // fija el widget a ese ejercicio puntual.
  exerciseId: string | null;
}

export type StatWidget = StatWidgetSimple | StatWidgetExerciseScoped;

export function isExerciseScopedWidget(w: StatWidget): w is StatWidgetExerciseScoped {
  return isExerciseScopedType(w.type);
}

export function exerciseIdOf(w: StatWidget): string | null | undefined {
  return isExerciseScopedWidget(w) ? w.exerciseId : undefined;
}

export interface StatWidgetCatalogEntry {
  type: StatWidgetType;
  category: StatWidgetCategory;
  label: string;
  description: string;
  // Si es false, solo puede haber una instancia de este tipo en la lista (ver widgetKey).
  allowMultiple: boolean;
}

export const STAT_WIDGET_CATALOG: StatWidgetCatalogEntry[] = [
  { type: "last_trained", category: "card", label: "Último entrenamiento", description: "Fecha de tu entrenamiento más reciente.", allowMultiple: false },
  { type: "top_exercise", category: "card", label: "Ejercicio más entrenado", description: "El ejercicio con más registros en tu historial.", allowMultiple: false },
  { type: "training_days_count", category: "card", label: "Entrenamientos registrados", description: "Cantidad de días distintos que entrenaste.", allowMultiple: false },
  { type: "active_routines", category: "card", label: "Rutinas activas", description: "Cantidad de rutinas activas en este momento.", allowMultiple: false },
  { type: "max_weight_card", category: "card", label: "Peso máximo por ejercicio", description: "El peso más pesado que levantaste en un ejercicio a elección (o automático: el más entrenado).", allowMultiple: true },
  { type: "frequency_chart", category: "chart", label: "Frecuencia de entrenamiento", description: "Ejercicios distintos entrenados por día, última semana.", allowMultiple: false },
  { type: "exercise_progress_chart", category: "chart", label: "Progreso por ejercicio", description: "Peso máximo por día de un ejercicio a elección (o automático: el más entrenado).", allowMultiple: true },
];

export function catalogEntry(type: StatWidgetType): StatWidgetCatalogEntry {
  return STAT_WIDGET_CATALOG.find((c) => c.type === type)!;
}

export const MAX_STAT_CARDS = 4;
export const MAX_STAT_CHARTS = 4;
export const MAX_BY_CATEGORY: Record<StatWidgetCategory, number> = { card: MAX_STAT_CARDS, chart: MAX_STAT_CHARTS };

export function widgetsByCategory(widgets: StatWidget[], category: StatWidgetCategory): StatWidget[] {
  return widgets.filter((w) => catalogEntry(w.type).category === category);
}

// Las 4 tarjetas de siempre + los 2 graficos de siempre -- exactamente lo que se veia antes
// de que esto fuera configurable, para que nadie note un cambio hasta que entre a elegir.
export const DEFAULT_STAT_WIDGETS: StatWidget[] = [
  { type: "last_trained" },
  { type: "top_exercise" },
  { type: "training_days_count" },
  { type: "active_routines" },
  { type: "frequency_chart" },
  { type: "exercise_progress_chart", exerciseId: null },
];

// stats_widgets es un jsonb sin constraint de forma en la base -- se confia en que solo lo
// escribe nuestro propio codigo (via updateProfileFields), pero igual se valida minimamente
// al leer por si quedo un valor viejo/corrupto de algun experimento manual.
export function parseStatWidgets(raw: unknown): StatWidget[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_STAT_WIDGETS;
  const parsed = raw.filter((w): w is StatWidget => {
    if (!w || typeof w !== "object" || typeof (w as { type?: unknown }).type !== "string") return false;
    return STAT_WIDGET_CATALOG.some((c) => c.type === (w as { type: string }).type);
  });
  return parsed.length > 0 ? parsed : DEFAULT_STAT_WIDGETS;
}

const EXERCISE_SCOPED_PREFIX: Record<ExerciseScopedType, string> = {
  exercise_progress_chart: "Progreso",
  max_weight_card: "Peso máximo",
};

export function widgetLabel(widget: StatWidget, exerciseName?: string | null): string {
  if (isExerciseScopedWidget(widget)) {
    const prefix = EXERCISE_SCOPED_PREFIX[widget.type];
    return widget.exerciseId ? `${prefix}: ${exerciseName ?? "ejercicio"}` : `${prefix}: ejercicio más entrenado (automático)`;
  }
  return catalogEntry(widget.type).label;
}

export function widgetKey(w: StatWidget): string {
  return isExerciseScopedWidget(w) ? `${w.type}:${w.exerciseId ?? "auto"}` : w.type;
}
