import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { MAX_PROFILE_LINKS, type ProfileLink } from "@/lib/profileService";
import { ALL_PLATFORMS, getPlatform, type SocialPlatform } from "@/lib/socialLinks";
import { colors, radius } from "@/theme/colors";

const PLATFORM_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  instagram: "logo-instagram",
  facebook: "logo-facebook",
  whatsapp: "logo-whatsapp",
  tiktok: "logo-tiktok",
  youtube: "logo-youtube",
  x: "logo-twitter",
  other: "link",
};

export function LinksEditor({ links, onChange }: { links: ProfileLink[]; onChange: (links: ProfileLink[]) => void }) {
  function updateAt(index: number, patch: Partial<ProfileLink>) {
    onChange(links.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  function removeAt(index: number) {
    onChange(links.filter((_, i) => i !== index));
  }
  function addPlatform(platform: SocialPlatform) {
    if (links.length >= MAX_PROFILE_LINKS) return;
    onChange([...links, { platform: platform.key, label: platform.label, url: "" }]);
  }

  const usedKeys = new Set(links.map((l) => l.platform ?? "other"));
  const atLimit = links.length >= MAX_PROFILE_LINKS;
  const available = ALL_PLATFORMS.filter((p) => p.key === "other" || !usedKeys.has(p.key));

  return (
    <View style={styles.wrap}>
      {links.map((l, i) => {
        const platform = getPlatform(l.platform);
        const isOther = platform.key === "other";
        return (
          <View key={i} style={styles.row}>
            <Ionicons name={PLATFORM_ICON[platform.key] ?? "link"} size={16} color={colors.accent2} />
            {isOther ? (
              <View style={styles.rowFields}>
                <TextInput
                  style={styles.input}
                  placeholder="Nombre (ej: Mi web)"
                  placeholderTextColor={colors.textMuted}
                  value={l.label}
                  onChangeText={(v) => updateAt(i, { label: v })}
                />
                <TextInput
                  style={styles.input}
                  placeholder={platform.placeholder}
                  placeholderTextColor={colors.textMuted}
                  value={l.url}
                  onChangeText={(v) => updateAt(i, { url: v })}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            ) : (
              <TextInput
                style={[styles.input, styles.rowFieldSingle]}
                placeholder={platform.placeholder}
                placeholderTextColor={colors.textMuted}
                value={platform.extractHandle(l.url)}
                onChangeText={(v) => updateAt(i, { url: v })}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
            <Pressable onPress={() => removeAt(i)} hitSlop={8}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        );
      })}

      <View style={styles.pickerRow}>
        {available.map((p) => (
          <Pressable key={p.key} style={[styles.chip, atLimit && styles.chipDisabled]} disabled={atLimit} onPress={() => addPlatform(p)}>
            <Ionicons name={PLATFORM_ICON[p.key] ?? "link"} size={13} color={colors.accent2} />
            <Text style={styles.chipText}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowFields: { flex: 1, gap: 6 },
  rowFieldSingle: { flex: 1 },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.text,
    fontSize: 13.5,
  },
  pickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipDisabled: { opacity: 0.4 },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
});
