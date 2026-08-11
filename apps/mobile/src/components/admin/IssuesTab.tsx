import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AlertMessage } from "@/components/AlertMessage";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ConfirmModal } from "@/components/profile/ConfirmModal";
import {
  addIssueReport,
  deleteIssueReport,
  ISSUE_SEVERITY_LABELS,
  ISSUE_SEVERITY_OPTIONS,
  ISSUE_STATUS_LABELS,
  ISSUE_STATUS_OPTIONS,
  listIssueReports,
  updateIssueReport,
  validateIssueReport,
  type IssueReportWithReporter,
  type IssueSeverity,
  type IssueStatus,
} from "@/lib/adminIssueService";
import { colors, radius } from "@/theme/colors";

const SEVERITY_COLOR: Record<IssueSeverity, string> = { low: colors.textMuted, medium: colors.accent2, high: colors.dangerText };

export function IssuesTab({ adminId }: { adminId: string }) {
  const [issues, setIssues] = useState<IssueReportWithReporter[]>([]);
  const [loading, setLoading] = useState(true);
  const [formFor, setFormFor] = useState<{ existing: IssueReportWithReporter | null } | null>(null);
  const [deleting, setDeleting] = useState<IssueReportWithReporter | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  function reload() {
    setLoading(true);
    listIssueReports()
      .then(setIssues)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeletingLoading(true);
    const { error } = await deleteIssueReport(deleting.id);
    setDeletingLoading(false);
    if (error) return;
    setIssues((prev) => prev.filter((i) => i.id !== deleting.id));
    setDeleteSuccess(true);
    setTimeout(() => {
      setDeleteSuccess(false);
      setDeleting(null);
    }, 1200);
  }

  const openCount = issues.filter((i) => i.status !== "resolved").length;

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.accent2} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.toolbar}>
        <Text style={styles.summary}>
          {openCount} abierto{openCount === 1 ? "" : "s"} de {issues.length}
        </Text>
        <Pressable style={styles.addBtn} onPress={() => setFormFor({ existing: null })}>
          <Ionicons name="add" size={16} color={colors.bg} />
          <Text style={styles.addBtnText}>Agregar</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {issues.length === 0 ? (
          <Text style={styles.emptyText}>No hay issues cargados.</Text>
        ) : (
          issues.map((issue) => (
            <Pressable key={issue.id} style={styles.row} onPress={() => setFormFor({ existing: issue })}>
              <View style={styles.rowHead}>
                <Text style={[styles.severityBadge, { color: SEVERITY_COLOR[issue.severity as IssueSeverity] }]}>{ISSUE_SEVERITY_LABELS[issue.severity as IssueSeverity]}</Text>
                <Text style={styles.statusBadge}>{ISSUE_STATUS_LABELS[issue.status as IssueStatus]}</Text>
              </View>
              <Text style={styles.rowTitle}>{issue.title}</Text>
              {issue.page && <Text style={styles.rowSub}>{issue.page}</Text>}
              {issue.reporterName && <Text style={styles.rowSub}>Reportado por {issue.reporterName}</Text>}
              <Pressable style={styles.deleteBtn} onPress={() => setDeleting(issue)} hitSlop={8}>
                <Ionicons name="trash-outline" size={16} color={colors.dangerText} />
              </Pressable>
            </Pressable>
          ))
        )}
      </ScrollView>

      {formFor && (
        <IssueFormModal
          existing={formFor.existing}
          adminId={adminId}
          onClose={() => setFormFor(null)}
          onSaved={() => {
            setFormFor(null);
            reload();
          }}
        />
      )}

      {deleting && (
        <ConfirmModal
          visible
          title={`¿Eliminar "${deleting.title}"?`}
          subtitle="Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          loadingText="Eliminando..."
          successText="Issue eliminado."
          loading={deletingLoading}
          success={deleteSuccess}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </View>
  );
}

function IssueFormModal({
  existing,
  adminId,
  onClose,
  onSaved,
}: {
  existing: IssueReportWithReporter | null;
  adminId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [page, setPage] = useState(existing?.page ?? "");
  const [severity, setSeverity] = useState<IssueSeverity>((existing?.severity as IssueSeverity) ?? "medium");
  const [status, setStatus] = useState<IssueStatus>((existing?.status as IssueStatus) ?? "open");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    const validationError = validateIssueReport(title);
    if (validationError) {
      setError(validationError === "title_short" ? "El título es muy corto." : "El título es muy largo.");
      return;
    }
    setError("");
    setSaving(true);
    const result = existing
      ? await updateIssueReport(existing.id, { title, description: description || null, page: page || null, severity, status })
      : await addIssueReport(adminId, title, description ?? "", page ?? "", severity);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.formWrap} edges={["bottom"]}>
        <ScreenHeader title={existing ? "Editar issue" : "Nuevo issue"} onBack={onClose} avatarUrl={null} />
        <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
          <AlertMessage message={error} />
          <FormField label="Título" value={title} onChangeText={setTitle} />
          <FormField label="Página" value={page ?? ""} onChangeText={setPage} placeholder="ej. /pesos" />
          <FormField
            label="Descripción"
            value={description ?? ""}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            style={{ minHeight: 90, textAlignVertical: "top" }}
          />

          <View style={styles.field}>
            <Text style={styles.label}>Severidad</Text>
            <View style={styles.chipRow}>
              {ISSUE_SEVERITY_OPTIONS.map((s) => (
                <Pressable key={s} style={[styles.chip, severity === s && styles.chipActive]} onPress={() => setSeverity(s)}>
                  <Text style={[styles.chipText, severity === s && styles.chipTextActive]}>{ISSUE_SEVERITY_LABELS[s]}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {existing && (
            <View style={styles.field}>
              <Text style={styles.label}>Estado</Text>
              <View style={styles.chipRow}>
                {ISSUE_STATUS_OPTIONS.map((s) => (
                  <Pressable key={s} style={[styles.chip, status === s && styles.chipActive]} onPress={() => setStatus(s)}>
                    <Text style={[styles.chipText, status === s && styles.chipTextActive]}>{ISSUE_STATUS_LABELS[s]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <PrimaryButton title="Guardar" onPress={handleSubmit} loading={saving} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  toolbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingBottom: 0 },
  summary: { color: colors.textMuted, fontSize: 12.5, fontWeight: "600" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.accent2, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText: { color: colors.bg, fontSize: 12.5, fontWeight: "700" },
  scroll: { padding: 16, paddingBottom: 48, gap: 10 },
  emptyText: { color: colors.textMuted, fontSize: 13.5, textAlign: "center", paddingVertical: 24 },
  row: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 14, gap: 4 },
  rowHead: { flexDirection: "row", gap: 8 },
  severityBadge: { fontSize: 11, fontWeight: "700" },
  statusBadge: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  rowSub: { color: colors.textMuted, fontSize: 11.5 },
  deleteBtn: { position: "absolute", top: 12, right: 12 },
  formWrap: { flex: 1, backgroundColor: colors.bg },
  formScroll: { padding: 20, gap: 4, paddingBottom: 48 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent2 },
  chipText: { fontSize: 12.5, fontWeight: "600", color: colors.textMuted },
  chipTextActive: { color: colors.accent2 },
});
