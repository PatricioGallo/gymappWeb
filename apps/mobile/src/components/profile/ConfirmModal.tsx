import { Modal, StyleSheet, Text, View } from "react-native";

import { AuthOverlay } from "@/components/AuthOverlay";
import { OutlineButton } from "@/components/OutlineButton";
import { PrimaryButton } from "@/components/PrimaryButton";
import { colors, radius } from "@/theme/colors";

export function ConfirmModal({
  visible,
  title,
  subtitle,
  confirmLabel,
  loadingText,
  successText,
  loading,
  success,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  confirmLabel: string;
  loadingText: string;
  successText: string;
  loading: boolean;
  success: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <View style={styles.actions}>
            <PrimaryButton title={confirmLabel} onPress={onConfirm} />
            <OutlineButton title="Cancelar" onPress={onCancel} />
          </View>
        </View>
        {(loading || success) && <AuthOverlay state={loading ? { kind: "loading", text: loadingText } : { kind: "success", text: successText }} />}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(10, 12, 15, 0.7)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 24,
    gap: 16,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  actions: { gap: 10, marginTop: 4 },
});
