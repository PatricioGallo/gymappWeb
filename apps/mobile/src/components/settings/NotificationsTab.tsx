import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AlertMessage } from "@/components/AlertMessage";
import { ToggleRow } from "@/components/settings/ToggleRow";
import { updateProfileFields, type Profile } from "@/lib/profileService";
import { colors, radius } from "@/theme/colors";

interface NotificationPrefs {
  likes: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
}

const NOTIFICATION_DEFAULTS: NotificationPrefs = { likes: true, comments: true, follows: true, mentions: true };

function parseNotificationPrefs(raw: Profile["notification_prefs"]): NotificationPrefs {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...NOTIFICATION_DEFAULTS, ...(raw as Partial<NotificationPrefs>) };
  }
  return { ...NOTIFICATION_DEFAULTS };
}

const ITEMS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: "likes", label: "Me gusta en tus publicaciones" },
  { key: "comments", label: "Comentarios en tus publicaciones" },
  { key: "follows", label: "Nuevos seguidores y suscripciones" },
  { key: "mentions", label: "Menciones" },
];

export function NotificationsTab({ profile, userId, onSaved }: { profile: Profile; userId: string; onSaved: (patch: Partial<Profile>) => void }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(parseNotificationPrefs(profile.notification_prefs));
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<keyof NotificationPrefs | null>(null);

  async function handleToggle(key: keyof NotificationPrefs, value: boolean) {
    setError("");
    const previous = prefs;
    const newPrefs = { ...prefs, [key]: value };
    setPrefs(newPrefs);
    setSavingKey(key);
    const { error: saveError } = await updateProfileFields(userId, { notification_prefs: newPrefs as unknown as Profile["notification_prefs"] });
    setSavingKey(null);
    if (saveError) {
      setPrefs(previous);
      setError(saveError);
      return;
    }
    onSaved({ notification_prefs: newPrefs as unknown as Profile["notification_prefs"] });
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Notificaciones</Text>
      <Text style={styles.cardHint}>"Nuevos seguidores" ya está activo. El resto (me gusta, comentarios, menciones) va a aplicarse en cuanto sumemos publicaciones a la red social.</Text>
      {ITEMS.map((item) => (
        <ToggleRow key={item.key} label={item.label} value={prefs[item.key]} onChange={(v) => handleToggle(item.key, v)} disabled={savingKey === item.key} />
      ))}
      <AlertMessage message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 18,
    gap: 4,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  cardHint: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: 8 },
});
