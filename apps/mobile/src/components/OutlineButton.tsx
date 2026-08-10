import { Pressable, StyleSheet, Text } from "react-native";

import { colors, radius } from "@/theme/colors";

export function OutlineButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.wrap, pressed && styles.pressed]} onPress={onPress}>
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    borderColor: colors.accent2,
  },
  text: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
});
