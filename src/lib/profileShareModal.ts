import { openShareToChatsModal } from "./shareToChatsModal";

export interface ShareableProfile {
  id: string;
  username: string;
}

/**
 * Modal para compartir un perfil (propio o ajeno) con el mismo repertorio que un Rep: mandarlo
 * a un chat (grupo o 1 a 1), publicarlo como Rep, o copiar / compartir el link afuera. El link
 * es gymsocial.com.ar/<username> (funciona sin sesión), igual que el viejo botón "Compartir
 * perfil".
 */
export async function openShareProfileModal(profile: ShareableProfile, viewerId: string): Promise<void> {
  const url = `${window.location.origin}/${encodeURIComponent(profile.username)}`;
  await openShareToChatsModal({
    viewerId,
    title: "Compartir perfil",
    subtitle: `@${profile.username}`,
    sentMessage: "¡Perfil enviado!",
    repPlaceholder: "¿Qué querés contar?",
    sendInput: { sharedProfileId: profile.id },
    prepare: async () => ({
      shareUrl: url,
      shareText: `Mirá el perfil de @${profile.username} en Gym Social`,
      repDefaultText: `Sigan a @${profile.username} 💪`,
    }),
  });
}
