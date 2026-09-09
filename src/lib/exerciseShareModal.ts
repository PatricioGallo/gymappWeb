import { CATEGORY_LABELS, updateExercise, type ExerciseCategory } from "../services/exercise.service";
import { openShareToChatsModal } from "./shareToChatsModal";

/** Forma mínima de ejercicio que necesita el modal -- la cubre Exercise (misEjercicios.ts) y
 * se arma a mano en showExc.ts a partir de SharedExerciseDetail. */
export interface ShareableExercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  is_public: boolean;
}

function exerciseShareUrl(id: string): string {
  return `${window.location.origin}/pages/showExc.html?exId=${encodeURIComponent(id)}`;
}

/**
 * Modal para compartir un ejercicio propio con el mismo repertorio que un Rep: mandarlo a un
 * chat (grupo o 1 a 1), publicarlo como Rep, o copiar / compartir el link afuera. Al abrir, si
 * el ejercicio todavía era privado lo marca como público (updateExercise) para que el
 * destinatario pueda verlo y para que el link funcione.
 */
export async function openShareExerciseModal(exercise: ShareableExercise, viewerId: string): Promise<void> {
  await openShareToChatsModal({
    viewerId,
    title: "Compartir ejercicio",
    subtitle: `"${exercise.name}" · ${CATEGORY_LABELS[exercise.category]}`,
    hint: exercise.is_public ? undefined : "Al compartirlo, el ejercicio queda visible para otros usuarios.",
    sentMessage: "¡Ejercicio enviado!",
    repPlaceholder: "¿Qué querés contar sobre este ejercicio?",
    sendInput: { sharedExerciseId: exercise.id },
    prepare: async () => {
      if (!exercise.is_public) {
        const { error } = await updateExercise(exercise.id, { is_public: true });
        if (error) return { error: "No se pudo preparar el ejercicio para compartir. Probá de nuevo." };
        exercise.is_public = true;
      }
      const url = exerciseShareUrl(exercise.id);
      return {
        shareUrl: url,
        shareText: `Mirá este ejercicio en Gym Social: "${exercise.name}"`,
        repDefaultText: `Les comparto este ejercicio 💪\n"${exercise.name}"\n${url}`,
      };
    },
  });
}
