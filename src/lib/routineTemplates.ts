export type RoutineLevel = "principiante" | "baja" | "media" | "alta";

export interface RoutineTemplateExercise {
  name: string;
  serie: number;
  repe: number;
  nota?: string;
  es_medible?: boolean;
}

export interface RoutineTemplateDay {
  dia_semana: number;
  titulo: string;
  ejercicios: RoutineTemplateExercise[];
}

export interface RoutineTemplate {
  level: RoutineLevel;
  label: string;
  description: string;
  semanasSugeridas: number;
  dias: RoutineTemplateDay[];
}

export const LEVEL_LABELS: Record<RoutineLevel, string> = {
  principiante: "Principiante",
  baja: "Intensidad baja",
  media: "Intensidad media",
  alta: "Intensidad alta",
};

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    level: "principiante",
    label: "Principiante",
    description: "3 días full body por semana. Ideal para arrancar: técnica, movimientos básicos y progresión simple.",
    semanasSugeridas: 4,
    dias: [
      {
        dia_semana: 1,
        titulo: "Full body A",
        ejercicios: [
          { name: "Sentadilla goblet con mancuerna", serie: 3, repe: 12 },
          { name: "Press plano", serie: 3, repe: 12 },
          { name: "Jalon al pecho", serie: 3, repe: 12 },
          { name: "Press de hombros en maquina", serie: 3, repe: 12 },
          { name: "Crunch en el suelo", serie: 3, repe: 15 },
          { name: "Estiramiento de cuadriceps de pie", serie: 1, repe: 1, es_medible: false, nota: "Mantener 30 seg por lado" },
        ],
      },
      {
        dia_semana: 3,
        titulo: "Full body B",
        ejercicios: [
          { name: "Press de piernas(prensa)", serie: 3, repe: 12 },
          { name: "Remo en maquina", serie: 3, repe: 12 },
          { name: "Apertura en maquina", serie: 3, repe: 12 },
          { name: "Elevaciones laterales", serie: 3, repe: 12 },
          { name: "Elevacion de piernas", serie: 3, repe: 15 },
          { name: "Estiramiento lateral de cuello", serie: 1, repe: 1, es_medible: false, nota: "Mantener 20 seg por lado" },
        ],
      },
      {
        dia_semana: 5,
        titulo: "Full body C",
        ejercicios: [
          { name: "Estocadas con mancuernas", serie: 3, repe: 10 },
          { name: "Jalon en polea", serie: 3, repe: 12 },
          { name: "Press en maquina Smith", serie: 3, repe: 12 },
          { name: "Encogimiento con man.", serie: 3, repe: 15 },
          { name: "Plancha abdominal (plank)", serie: 3, repe: 1, es_medible: false, nota: "Mantener 20-30 seg" },
          { name: "Estiramiento de isquiotibiales de pie", serie: 1, repe: 1, es_medible: false, nota: "Mantener 30 seg por lado" },
        ],
      },
    ],
  },
  {
    level: "baja",
    label: "Baja",
    description: "4 días con división torso/pierna y volumen bajo. Para quienes ya tienen algo de base y entrenan con constancia moderada.",
    semanasSugeridas: 4,
    dias: [
      {
        dia_semana: 1,
        titulo: "Tren superior A",
        ejercicios: [
          { name: "Press de banca plano con barra", serie: 3, repe: 10 },
          { name: "Remo con barra", serie: 3, repe: 10 },
          { name: "Press de hombros en maquina", serie: 3, repe: 10 },
          { name: "Curl con barra", serie: 3, repe: 12 },
          { name: "Tricep en polea alta", serie: 3, repe: 12 },
          { name: "Estiramiento de pectoral en marco de puerta", serie: 1, repe: 1, es_medible: false, nota: "Mantener 30 seg por lado" },
        ],
      },
      {
        dia_semana: 2,
        titulo: "Tren inferior A",
        ejercicios: [
          { name: "Sentadilla libre con barra", serie: 3, repe: 10 },
          { name: "Peso muerto rumano", serie: 3, repe: 10 },
          { name: "Pantorilla en prensa", serie: 3, repe: 15 },
          { name: "Abdominales maquina", serie: 3, repe: 15 },
          { name: "Estiramiento de gemelos contra la pared", serie: 1, repe: 1, es_medible: false, nota: "Mantener 30 seg por lado" },
        ],
      },
      {
        dia_semana: 4,
        titulo: "Tren superior B",
        ejercicios: [
          { name: "Press inclinado con mancuernas", serie: 3, repe: 10 },
          { name: "Jalon al pecho", serie: 3, repe: 10 },
          { name: "Elevaciones laterales", serie: 3, repe: 12 },
          { name: "Curl martillo con mancuerna", serie: 3, repe: 12 },
          { name: "Fondos en banco para triceps", serie: 3, repe: 12 },
          { name: "Estiramiento cruzado de hombro", serie: 1, repe: 1, es_medible: false, nota: "Mantener 20 seg por lado" },
        ],
      },
      {
        dia_semana: 5,
        titulo: "Tren inferior B",
        ejercicios: [
          { name: "Sentadilla en hacka", serie: 3, repe: 12 },
          { name: "Femorales maquina unilateral", serie: 3, repe: 12 },
          { name: "Elevaciones de gemelos de pie*", serie: 3, repe: 15 },
          { name: "Elevacion de piernas colgado en barra", serie: 3, repe: 12 },
          { name: "Estiramiento de gluteo (figura 4) acostado", serie: 1, repe: 1, es_medible: false, nota: "Mantener 30 seg por lado" },
        ],
      },
    ],
  },
  {
    level: "media",
    label: "Media",
    description: "4 días con formato push / pull / piernas / torso y volumen moderado. Para quienes entrenan hace tiempo y quieren un poco más de estímulo.",
    semanasSugeridas: 5,
    dias: [
      {
        dia_semana: 1,
        titulo: "Push",
        ejercicios: [
          { name: "Press de banca inclinado", serie: 4, repe: 10 },
          { name: "Press militar (pie o sentado)*", serie: 4, repe: 10 },
          { name: "Cruce de poleas de pie (cable crossover)", serie: 3, repe: 12 },
          { name: "Elevaciones laterales", serie: 3, repe: 12 },
          { name: "Tricep en polea alta", serie: 3, repe: 12 },
          { name: "Estiramiento de pectoral en marco de puerta", serie: 1, repe: 1, es_medible: false, nota: "Mantener 30 seg por lado" },
        ],
      },
      {
        dia_semana: 2,
        titulo: "Pull",
        ejercicios: [
          { name: "Peso muerto convencional", serie: 4, repe: 8 },
          { name: "Dominadas (agarre prono)", serie: 3, repe: 10 },
          { name: "Remo con mancuerna a un brazo", serie: 3, repe: 12 },
          { name: "Face pull en polea", serie: 3, repe: 15 },
          { name: "Curl alterno con mancuerna", serie: 3, repe: 12 },
          { name: "Estiramiento cruzado de hombro", serie: 1, repe: 1, es_medible: false, nota: "Mantener 20 seg por lado" },
        ],
      },
      {
        dia_semana: 4,
        titulo: "Piernas",
        ejercicios: [
          { name: "Sentadilla frontal con barra", serie: 4, repe: 8 },
          { name: "Peso muerto rumano", serie: 3, repe: 10 },
          { name: "Sentadilla bulgara con mancuernas", serie: 3, repe: 10 },
          { name: "Hip trust", serie: 3, repe: 12 },
          { name: "Elevaciones de gemelos sentado*", serie: 3, repe: 15 },
          { name: "Estiramiento de gemelos contra la pared", serie: 1, repe: 1, es_medible: false, nota: "Mantener 30 seg por lado" },
        ],
      },
      {
        dia_semana: 5,
        titulo: "Torso",
        ejercicios: [
          { name: "Press plano", serie: 3, repe: 10 },
          { name: "Jalon tras nuca", serie: 3, repe: 10 },
          { name: "Apertura en polea", serie: 3, repe: 12 },
          { name: "Remo en maquina baja", serie: 3, repe: 12 },
          { name: "Rueda abdominal (ab wheel)", serie: 3, repe: 12 },
          { name: "Estiramiento gato-camello para columna", serie: 1, repe: 1, es_medible: false, nota: "10 repeticiones lentas" },
        ],
      },
    ],
  },
  {
    level: "alta",
    label: "Alta",
    description: "5 días de rutina dividida por grupo muscular (split), alto volumen. Para gente entrenada que quiere una rutina cargada.",
    semanasSugeridas: 6,
    dias: [
      {
        dia_semana: 1,
        titulo: "Pecho",
        ejercicios: [
          { name: "Press de banca plano con barra", serie: 4, repe: 10 },
          { name: "Press de banca inclinado", serie: 4, repe: 10 },
          { name: "Press declinado con barra", serie: 3, repe: 10 },
          { name: "Cruce de poleas de pie (cable crossover)", serie: 3, repe: 12 },
          { name: "Pecho polea (alta, media y baja)", serie: 3, repe: 12 },
          { name: "Fondos en paralelas (pecho)", serie: 3, repe: 12 },
          { name: "Estiramiento de pectoral en marco de puerta", serie: 1, repe: 1, es_medible: false, nota: "Mantener 30 seg por lado" },
        ],
      },
      {
        dia_semana: 2,
        titulo: "Espalda",
        ejercicios: [
          { name: "Peso muerto convencional", serie: 4, repe: 6 },
          { name: "Dominadas agarre supino", serie: 4, repe: 10 },
          { name: "Remo con barra", serie: 4, repe: 10 },
          { name: "Jalon al pecho", serie: 3, repe: 12 },
          { name: "Remo en punta (T-bar)", serie: 3, repe: 12 },
          { name: "Pull-over en polea alta", serie: 3, repe: 12 },
          { name: "Postura del nino (estiramiento de espalda baja)", serie: 1, repe: 1, es_medible: false, nota: "Mantener 45 seg" },
        ],
      },
      {
        dia_semana: 3,
        titulo: "Piernas",
        ejercicios: [
          { name: "Sentadilla libre con barra", serie: 5, repe: 8 },
          { name: "Peso muerto rumano", serie: 4, repe: 10 },
          { name: "Press de piernas(prensa)", serie: 4, repe: 12 },
          { name: "Sentadilla bulgara con mancuernas", serie: 3, repe: 10 },
          { name: "Femorales maquina unilateral", serie: 3, repe: 12 },
          { name: "Elevaciones de gemelos de pie*", serie: 4, repe: 15 },
          { name: "Estiramiento de cuadriceps de pie", serie: 1, repe: 1, es_medible: false, nota: "Mantener 30 seg por lado" },
        ],
      },
      {
        dia_semana: 4,
        titulo: "Hombros y abdomen",
        ejercicios: [
          { name: "Press militar (pie o sentado)*", serie: 4, repe: 10 },
          { name: "Press Arnold con mancuernas", serie: 3, repe: 10 },
          { name: "Elevaciones laterales", serie: 4, repe: 15 },
          { name: "Pajaros con mancuernas (elevacion posterior)", serie: 3, repe: 15 },
          { name: "Trapecios en polea", serie: 3, repe: 12 },
          { name: "Plancha abdominal (plank)", serie: 3, repe: 1, es_medible: false, nota: "Mantener 30-45 seg" },
          { name: "Giro ruso con disco (Russian twist)", serie: 3, repe: 20 },
          { name: "Estiramiento lateral de cuello", serie: 1, repe: 1, es_medible: false, nota: "Mantener 20 seg por lado" },
        ],
      },
      {
        dia_semana: 5,
        titulo: "Brazos",
        ejercicios: [
          { name: "Curl con barra", serie: 4, repe: 10 },
          { name: "Press frances con barra", serie: 4, repe: 10 },
          { name: "Curl en banco Scott (predicador)", serie: 3, repe: 12 },
          { name: "Tricep en polea alta", serie: 3, repe: 12 },
          { name: "Curl martillo con mancuerna", serie: 3, repe: 12 },
          { name: "Fondos en banco para triceps", serie: 3, repe: 12 },
          { name: "Estiramiento de triceps por detras de la cabeza", serie: 1, repe: 1, es_medible: false, nota: "Mantener 30 seg por lado" },
        ],
      },
    ],
  },
];
