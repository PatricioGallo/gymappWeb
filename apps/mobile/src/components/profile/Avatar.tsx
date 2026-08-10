import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from "react-native";

import { colors } from "@/theme/colors";

export function Avatar({
  uri,
  size = 96,
  editable,
  uploading,
  onPress,
}: {
  uri: string | null;
  size?: number;
  editable?: boolean;
  uploading?: boolean;
  onPress?: () => void;
}) {
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
      {uri ? (
        <Image source={{ uri }} style={[styles.image, { borderRadius: size / 2 }]} />
      ) : (
        <View style={[styles.placeholder, { borderRadius: size / 2 }]}>
          <Ionicons name="person" size={size * 0.5} color={colors.textMuted} />
        </View>
      )}

      {uploading && (
        <View style={[styles.overlay, { borderRadius: size / 2 }]}>
          <ActivityIndicator color={colors.text} />
        </View>
      )}

      {editable && (
        <Pressable style={styles.editButton} onPress={onPress} hitSlop={8}>
          <Ionicons name="camera" size={16} color={colors.bg} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  image: { width: "100%", height: "100%", borderWidth: 3, borderColor: colors.surface2 },
  placeholder: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.surface2,
    borderWidth: 3,
    borderColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 12, 15, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  editButton: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent2,
    borderWidth: 3,
    borderColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
