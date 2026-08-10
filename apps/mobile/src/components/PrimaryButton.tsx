import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { colors, radius } from "@/theme/colors";

export function PrimaryButton({
  title,
  onPress,
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [styles.wrap, pressed && !isDisabled && styles.pressed, isDisabled && styles.disabled]}
    >
      <LinearGradient
        colors={[colors.accent, colors.accent2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {loading ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.text}>{title}</Text>}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.pill,
    overflow: "hidden",
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.6,
  },
  gradient: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: colors.bg,
    fontWeight: "700",
    fontSize: 15,
  },
});
