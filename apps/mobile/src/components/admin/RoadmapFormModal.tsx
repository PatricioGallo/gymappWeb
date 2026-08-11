import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AlertMessage } from "@/components/AlertMessage";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  addRoadmapTask,
  ROADMAP_CATEGORIES,
  ROADMAP_CATEGORY_LABELS,
  ROADMAP_STATUS_LABELS,
  ROADMAP_STATUS_OPTIONS,
  updateRoadmapTask,
  validateRoadmapTask,
  type RoadmapCategory,
  type RoadmapStatus,
  type RoadmapTask,
} from "@/lib/adminRoadmapService";
import { colors, radius } from "@/theme/colors";

export function RoadmapFormModal({
  visible,
  existing,
  defaultCategory,
  adminId,
  avatarUrl,
  onClose,
  onSaved,
}: {
  visible: boolean;
  existing: RoadmapTask | null;
  defaultCategory: RoadmapCategory;
  adminId: string;
  avatarUrl: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<RoadmapCategory>((existing?.category as RoadmapCategory) ?? defaultCategory);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [status, setStatus] = useState<RoadmapStatus>((existing?.status as RoadmapStatus) ?? "pending");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    const validationError = validateRoadmapTask(title);
    if (validationError) {
      setError(validationError === "title_short" ? "El título es muy corto." : "El título es muy largo.");
      return;
    }
    setError("");
    setSaving(true);

    if (existing) {
      const { error: saveError } = await updateRoadmapTask(existing.id, { category, title, description: description || null, status });
      setSaving(false);
      if (saveError) {
        setError(saveError);
        return;
      }
    } else {
      const { error: saveError } = await addRoadmapTask(adminId, category, title, description, status);
      setSaving(false);
      if (saveError) {
        setError(saveError);
        return;
      }
    }
    onSaved();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.wrap} edges={["bottom"]}>
        <ScreenHeader title={existing ? "Editar tarea" : "Agregar tarea"} onBack={onClose} avatarUrl={avatarUrl} />
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <AlertMessage message={error} />

          <View style={styles.field}>
            <Text style={styles.label}>Categoría</Text>
            <View style={styles.chipRow}>
              {ROADMAP_CATEGORIES.map((c) => (
                <Pressable key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => setCategory(c)}>
                  <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{ROADMAP_CATEGORY_LABELS[c]}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <FormField label="Título" value={title} onChangeText={setTitle} />
          <FormField label="Descripción (opcional)" value={description ?? ""} onChangeText={setDescription} multiline numberOfLines={4} style={{ minHeight: 90, textAlignVertical: "top" }} />

          <View style={styles.field}>
            <Text style={styles.label}>Estado</Text>
            <View style={styles.chipRow}>
              {ROADMAP_STATUS_OPTIONS.map((s) => (
                <Pressable key={s} style={[styles.chip, status === s && styles.chipActive]} onPress={() => setStatus(s)}>
                  <Text style={[styles.chipText, status === s && styles.chipTextActive]}>{ROADMAP_STATUS_LABELS[s]}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <PrimaryButton title="Guardar" onPress={handleSubmit} loading={saving} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, gap: 4, paddingBottom: 48 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent2 },
  chipText: { fontSize: 12.5, fontWeight: "600", color: colors.textMuted },
  chipTextActive: { color: colors.accent2 },
});
