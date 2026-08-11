export interface ExerciseFormState {
  key: string;
  exerciseId: string | null;
  exerciseName: string | null;
  exerciseInfo: string | null;
  serie: string;
  repe: string;
  repeMax: string;
  sinPeso: boolean;
  mismoPeso: boolean;
  nota: string;
}

export interface DayFormState {
  diaSemana: number;
  nombre: string;
  exercises: ExerciseFormState[];
}

let keyCounter = 0;
export function nextKey(): string {
  keyCounter += 1;
  return `k${keyCounter}`;
}

export function createEmptyExercise(): ExerciseFormState {
  return {
    key: nextKey(),
    exerciseId: null,
    exerciseName: null,
    exerciseInfo: null,
    serie: "",
    repe: "",
    repeMax: "",
    sinPeso: false,
    mismoPeso: true,
    nota: "",
  };
}
