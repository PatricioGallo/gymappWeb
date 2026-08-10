import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme/colors";

type AuthOverlayState = { kind: "loading"; text: string } | { kind: "success"; text: string };

export function AuthOverlay({ state }: { state: AuthOverlayState | null }) {
  if (!state) return null;
  return (
    <View style={styles.overlay}>
      {state.kind === "loading" ? (
        <ActivityIndicator size="large" color={colors.accent2} />
      ) : (
        <LinearGradient colors={[colors.accent, colors.accent2]} style={styles.successCircle}>
          <Ionicons name="checkmark" size={38} color="#fff" />
        </LinearGradient>
      )}
      <Text style={styles.text}>{state.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlayBg,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    zIndex: 1000,
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: colors.text,
    fontSize: 15,
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
