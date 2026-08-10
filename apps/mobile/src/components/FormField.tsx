import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

import { colors, radius } from "@/theme/colors";

export function FormField({
  label,
  style,
  ...inputProps
}: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.textMuted} style={[styles.input, style]} {...inputProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14.5,
  },
});
