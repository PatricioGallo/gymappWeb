import { StyleSheet, Switch, Text, View } from "react-native";

import { colors } from "@/theme/colors";

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.textWrap}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ false: colors.surface2, true: colors.accent2 }} thumbColor={colors.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  textWrap: { flex: 1, gap: 4 },
  label: { color: colors.text, fontSize: 14.5, fontWeight: "600" },
  hint: { color: colors.textMuted, fontSize: 12.5, lineHeight: 17 },
});
