import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Avatar } from "@/components/profile/Avatar";
import {
  formatCredentialLabel,
  getVerificationDocumentUrl,
  listVerificationRequestsAdmin,
  reviewVerificationRequest,
  type AdminVerificationRequestRow,
  type ApplicantType,
} from "@/lib/adminVerificationService";
import { colors, radius } from "@/theme/colors";

const STATUS_LABELS: Record<string, string> = { pending: "En revisión", approved: "Aprobada", rejected: "Rechazada" };

export function ValidationTab() {
  const [applicantType, setApplicantType] = useState<ApplicantType>("entrenador");
  const [rows, setRows] = useState<AdminVerificationRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<AdminVerificationRequestRow | null>(null);

  function reload() {
    setLoading(true);
    listVerificationRequestsAdmin(applicantType)
      .then(setRows)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicantType]);

  return (
    <View style={styles.flex}>
      <View style={styles.subTabsRow}>
        <Pressable style={[styles.subTabChip, applicantType === "entrenador" && styles.subTabChipActive]} onPress={() => setApplicantType("entrenador")}>
          <Text style={[styles.subTabText, applicantType === "entrenador" && styles.subTabTextActive]}>Entrenadores</Text>
        </Pressable>
        <Pressable style={[styles.subTabChip, applicantType === "gimnasio" && styles.subTabChipActive]} onPress={() => setApplicantType("gimnasio")}>
          <Text style={[styles.subTabText, applicantType === "gimnasio" && styles.subTabTextActive]}>Gimnasios</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent2} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {rows.length === 0 ? (
            <Text style={styles.emptyText}>No hay solicitudes de validación.</Text>
          ) : (
            rows.map((r) => (
              <Pressable key={r.id} style={styles.row} onPress={() => setReviewing(r)}>
                <Avatar uri={r.applicantAvatarUrl} size={40} />
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>{r.applicantName}</Text>
                  <Text style={styles.rowSub}>@{r.applicantUsername}</Text>
                </View>
                <Text style={[styles.statusBadge, r.status === "approved" && styles.statusApproved, r.status === "rejected" && styles.statusRejected]}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}

      {reviewing && (
        <ReviewModal
          request={reviewing}
          onClose={() => setReviewing(null)}
          onReviewed={() => {
            setReviewing(null);
            reload();
          }}
        />
      )}
    </View>
  );
}

function ReviewModal({ request, onClose, onReviewed }: { request: AdminVerificationRequestRow; onClose: () => void; onReviewed: () => void }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [note, setNote] = useState(request.admin_note ?? "");
  const [saving, setSaving] = useState<"approved" | "rejected" | null>(null);

  useEffect(() => {
    Promise.all(((request.documents as string[]) ?? []).map((p) => getVerificationDocumentUrl(p))).then((list) => setUrls(list.filter((u): u is string => Boolean(u))));
  }, [request]);

  async function handleReview(status: "approved" | "rejected") {
    setSaving(status);
    const { error } = await reviewVerificationRequest(request.id, status, note);
    setSaving(null);
    if (error) return;
    onReviewed();
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.reviewWrap} edges={["bottom"]}>
        <ScreenHeader title={request.applicantName} onBack={onClose} avatarUrl={null} />
        <ScrollView contentContainerStyle={styles.reviewScroll}>
          <Text style={styles.reviewLabel}>Estado actual: {STATUS_LABELS[request.status] ?? request.status}</Text>

          {request.credentials.length > 0 && (
            <View style={styles.credentialsSection}>
              <Text style={styles.reviewLabel}>Títulos / certificaciones</Text>
              {request.credentials.map((c, i) => (
                <Text key={i} style={styles.credentialText}>
                  • {formatCredentialLabel(c)}
                </Text>
              ))}
            </View>
          )}

          <Text style={styles.reviewLabel}>Documentación</Text>
          <View style={styles.docsGrid}>
            {urls.map((url) => (
              <Image key={url} source={{ uri: url }} style={styles.docThumb} />
            ))}
          </View>

          <Text style={styles.reviewLabel}>Nota (opcional)</Text>
          <TextInput style={styles.noteInput} multiline value={note} onChangeText={setNote} placeholder="Motivo, aclaración..." placeholderTextColor={colors.textMuted} />

          <View style={styles.reviewActions}>
            <PrimaryButton title="Aprobar" onPress={() => handleReview("approved")} loading={saving === "approved"} disabled={saving !== null} />
            <Pressable style={styles.rejectBtn} onPress={() => handleReview("rejected")} disabled={saving !== null}>
              <Text style={styles.rejectBtnText}>{saving === "rejected" ? "Rechazando..." : "Rechazar"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  subTabsRow: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 0 },
  subTabChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  subTabChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent2 },
  subTabText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700" },
  subTabTextActive: { color: colors.accent2 },
  scroll: { padding: 16, paddingBottom: 48, gap: 10 },
  emptyText: { color: colors.textMuted, fontSize: 13.5, textAlign: "center", paddingVertical: 24 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 12 },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  rowSub: { color: colors.textMuted, fontSize: 12 },
  statusBadge: { color: colors.accent2, fontSize: 11, fontWeight: "700" },
  statusApproved: { color: colors.live },
  statusRejected: { color: colors.dangerText },
  reviewWrap: { flex: 1, backgroundColor: colors.bg },
  reviewScroll: { padding: 20, gap: 10, paddingBottom: 48 },
  reviewLabel: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700", marginTop: 6 },
  credentialsSection: { gap: 4 },
  credentialText: { color: colors.text, fontSize: 13 },
  docsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  docThumb: { width: 90, height: 90, borderRadius: radius.input, backgroundColor: colors.surface2 },
  noteInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  reviewActions: { gap: 10, marginTop: 10 },
  rejectBtn: { borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center" },
  rejectBtnText: { color: colors.dangerText, fontWeight: "700", fontSize: 14 },
});
