import { setRoutineShareable } from "../services/routine.service";
import { openShareToChatsModal } from "./shareToChatsModal";

/** Forma mínima de rutina que necesita el modal -- la cubre RoutineWithCounts (profile.ts) y
 * también se arma a mano en showExc.ts a partir de RoutineDetail. */
export interface ShareableRoutine {
  id: string;
  nombre: string;
  is_shareable: boolean;
  share_token: string;
  semanasCount: number;
  diasPorSemana: number;
  ejerciciosCount: number;
}

function routineShareUrl(token: string): string {
  return `${window.location.origin}/pages/showExc.html?token=${encodeURIComponent(token)}`;
}

/**
 * Modal para compartir una rutina propia con el mismo repertorio que un Rep: mandarla a un
 * chat (grupo o 1 a 1), publicarla como Rep, o copiar / compartir el link afuera. Al abrir, si
 * la rutina todavía no era compartible, la marca como tal (setRoutineShareable) para poder
 * generar el link público.
 */
export async function openShareRoutineModal(routine: ShareableRoutine, viewerId: string): Promise<void> {
  const stats = `${routine.semanasCount} sem · ${routine.diasPorSemana} días · ${routine.ejerciciosCount} ejercicios`;
  await openShareToChatsModal({
    viewerId,
    title: "Compartir rutina",
    subtitle: `"${routine.nombre}" · ${stats}`,
    hint: "Cualquiera con el link va a poder ver la rutina.",
    sentMessage: "¡Rutina enviada!",
    repPlaceholder: "¿Qué querés contar sobre esta rutina?",
    sendInput: { sharedRoutineId: routine.id },
    prepare: async () => {
      let token = routine.share_token;
      if (!routine.is_shareable) {
        try {
          const t = await setRoutineShareable(routine.id, true);
          if (t) token = t;
          routine.is_shareable = true;
        } catch {
          return { error: "No se pudo preparar el link de la rutina. Probá de nuevo." };
        }
      }
      const url = routineShareUrl(token);
      return {
        shareUrl: url,
        shareText: `Miren esta rutina en Gym Social: "${routine.nombre}"`,
        repDefaultText: `¡Miren esta rutina! 💪\n"${routine.nombre}"\n${url}`,
      };
    },
  });
}
