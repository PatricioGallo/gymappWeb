import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

import { AlertMessage } from "@/components/AlertMessage";
import { AuthOverlay } from "@/components/AuthOverlay";
import { FormField } from "@/components/FormField";
import { OutlineButton } from "@/components/OutlineButton";
import { PrimaryButton } from "@/components/PrimaryButton";
import { submitUserReport, validateUserReport } from "@/lib/userReportService";
import { colors, radius } from "@/theme/colors";

const VALIDATION_MESSAGES = {
  reason_short: "Contanos un poco más el motivo (mínimo 5 caracteres).",
  reason_long: "El motivo es muy largo.",
} as const;

export function ReportUserModal({
  visible,
  reporterId,
  reportedUserId,
  reportedUsername,
  onClose,
}: {
  visible: boolean;
  reporterId: string;
  reportedUserId: string;
  reportedUsername: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (visible) {
      setReason("");
      setError("");
      setSending(false);
      setSent(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(onClose, 1800);
    return () => clearTimeout(timer);
  }, [sent, onClose]);

  async function handleSubmit() {
    const validationError = validateUserReport(reason);
    if (validationError) {
      setError(VALIDATION_MESSAGES[validationError]);
      return;
    }
    setError("");
    setSending(true);
    const { error: submitError } = await submitUserReport(reporterId, reportedUserId, reason);
    setSending(false);
    if (submitError) {
      setError(submitError);
      return;
    }
    setSent(true);
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Reportar a @{reportedUsername}</Text>
          <Text style={styles.subtitle}>Contanos qué está pasando. Lo revisa el equipo de moderación.</Text>

          <AlertMessage message={error} />

          <FormField
            label="Motivo"
            placeholder="Describí el problema"
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={4}
            style={{ minHeight: 90, textAlignVertical: "top" }}
          />

          <View style={styles.actions}>
            <PrimaryButton title="Enviar reporte" onPress={handleSubmit} />
            <OutlineButton title="Cancelar" onPress={onClose} />
          </View>
        </View>

        {(sending || sent) && (
          <AuthOverlay state={sending ? { kind: "loading", text: "Enviando..." } : { kind: "success", text: "Recibimos tu reporte." }} />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(10, 12, 15, 0.7)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 24,
    gap: 4,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  actions: { gap: 10, marginTop: 8 },
});
