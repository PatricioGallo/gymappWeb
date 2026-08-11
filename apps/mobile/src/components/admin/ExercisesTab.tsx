import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ConfirmModal } from "@/components/profile/ConfirmModal";
import { deleteExercise, listExercisesAdmin, type AdminExerciseRow } from "@/lib/adminExerciseService";
import { CATEGORY_LABELS, EXERCISE_CATEGORIES } from "@/lib/exerciseService";
import { colors, radius } from "@/theme/colors";

import { ExerciseFormModal } from "./ExerciseFormModal";

type SubTab = "builtin" | "custom";

export function ExercisesTab({ userId }: { userId: string }) {
  const [exercises, setExercises] = useState<AdminExerciseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<SubTab>("builtin");
  const [search, setSearch] = useState("");
  const [formModal, setFormModal] = useState<{ existing: AdminExerciseRow | null } | null>(null);
  const [deleting, setDeleting] = useState<AdminExerciseRow | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  function reload() {
    setLoading(true);
    listExercisesAdmin()
      .then(setExercises)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const scoped = exercises.filter((e) => (subTab === "builtin" ? e.is_builtin : !e.is_builtin));
    return term ? scoped.filter((e) => e.name.toLowerCase().includes(term)) : scoped;
  }, [exercises, subTab, search]);

  const sections = EXERCISE_CATEGORIES.map((cat) => ({ cat, items: filtered.filter((e) => e.category === cat) })).filter((s) => s.items.length > 0);

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeletingLoading(true);
    const { error } = await deleteExercise(deleting.id);
    setDeletingLoading(false);
    if (error) return;
    setExercises((prev) => prev.filter((e) => e.id !== deleting.id));
    setDeleteSuccess(true);
    setTimeout(() => {
      setDeleteSuccess(false);
      setDeleting(null);
    }, 1200);
  }

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
        <View style={styles.subTabsRow}>
          <Pressable style={[styles.subTabChip, subTab === "builtin" && styles.subTabChipActive]} onPress={() => setSubTab("builtin")}>
            <Text style={[styles.subTabText, subTab === "builtin" && styles.subTabTextActive]}>Gym Social</Text>
          </Pressable>
          <Pressable style={[styles.subTabChip, subTab === "custom" && styles.subTabChipActive]} onPress={() => setSubTab("custom")}>
            <Text style={[styles.subTabText, subTab === "custom" && styles.subTabTextActive]}>Creados por usuarios</Text>
          </Pressable>
        </View>
        <Pressable style={styles.addBtn} onPress={() => setFormModal({ existing: null })}>
          <Ionicons name="add" size={16} color={colors.bg} />
          <Text style={styles.addBtnText}>Agregar</Text>
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar ejercicio..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {sections.length === 0 ? (
          <Text style={styles.emptyText}>No encontramos ejercicios con ese criterio.</Text>
        ) : (
          sections.map(({ cat, items }) => (
            <View key={cat} style={styles.section}>
              <Text style={styles.sectionTitle}>{CATEGORY_LABELS[cat]}</Text>
              {items.map((exc) => (
                <View key={exc.id} style={styles.excRow}>
                  <View style={styles.excThumb}>
                    {exc.image_url ? (
                      <Image source={{ uri: exc.image_url }} style={styles.excThumbImg} />
                    ) : (
                      <Ionicons name="barbell-outline" size={20} color={colors.textMuted} />
                    )}
                  </View>
                  <View style={styles.excInfo}>
                    <Text style={styles.excName} numberOfLines={1}>
                      {exc.name}
                    </Text>
                    {exc.authorName && (
                      <Text style={styles.excAuthor} numberOfLines={1}>
                        {exc.authorName}
                      </Text>
                    )}
                  </View>
                  <View style={styles.excActions}>
                    <Pressable style={styles.actionBtn} onPress={() => setFormModal({ existing: exc })}>
                      <Ionicons name="create-outline" size={17} color={colors.text} />
                    </Pressable>
                    <Pressable style={styles.actionBtn} onPress={() => setDeleting(exc)}>
                      <Ionicons name="trash-outline" size={17} color={colors.dangerText} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {formModal && (
        <ExerciseFormModal
          visible
          existing={formModal.existing}
          isBuiltinSubTab={subTab === "builtin"}
          adminId={userId}
          avatarUrl={null}
          onClose={() => setFormModal(null)}
          onSaved={() => {
            setFormModal(null);
            reload();
          }}
        />
      )}

      {deleting && (
        <ConfirmModal
          visible
          title={`¿Eliminar "${deleting.name}"?`}
          subtitle="Esta acción no se puede deshacer. Si alguna rutina usa este ejercicio, no se va a poder eliminar hasta quitarlo de esa rutina."
          confirmLabel="Eliminar"
          loadingText="Eliminando ejercicio..."
          successText="Ejercicio eliminado."
          loading={deletingLoading}
          success={deleteSuccess}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, padding: 16, gap: 10 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  subTabsRow: { flexDirection: "row", gap: 8, flex: 1 },
  subTabChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  subTabChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent2 },
  subTabText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  subTabTextActive: { color: colors.accent2 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accent2,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addBtnText: { color: colors.bg, fontSize: 12.5, fontWeight: "700" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14.5 },
  scroll: { paddingBottom: 24, gap: 16 },
  emptyText: { color: colors.textMuted, fontSize: 13.5, textAlign: "center", paddingVertical: 24 },
  section: { gap: 8 },
  sectionTitle: { color: colors.text, fontSize: 13.5, fontWeight: "700" },
  excRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 10,
  },
  excThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  excThumbImg: { width: "100%", height: "100%" },
  excInfo: { flex: 1, gap: 2 },
  excName: { color: colors.text, fontSize: 13.5, fontWeight: "700" },
  excAuthor: { color: colors.textMuted, fontSize: 11 },
  excActions: { flexDirection: "row", gap: 6 },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
