import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ConfirmModal } from "@/components/profile/ConfirmModal";
import {
  deleteRoadmapTask,
  listRoadmapTasks,
  ROADMAP_CATEGORIES,
  ROADMAP_CATEGORY_LABELS,
  ROADMAP_STATUS_LABELS,
  type RoadmapCategory,
  type RoadmapTask,
} from "@/lib/adminRoadmapService";
import { colors, radius } from "@/theme/colors";

import { RoadmapFormModal } from "./RoadmapFormModal";

export function RoadmapTab({ isAdmin, adminId }: { isAdmin: boolean; adminId: string }) {
  const [tasks, setTasks] = useState<RoadmapTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [formModal, setFormModal] = useState<{ existing: RoadmapTask | null; category: RoadmapCategory } | null>(null);
  const [deleting, setDeleting] = useState<RoadmapTask | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  function reload() {
    setLoading(true);
    listRoadmapTasks()
      .then(setTasks)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, []);

  const sections = useMemo(
    () =>
      ROADMAP_CATEGORIES.map((cat) => {
        const items = tasks.filter((t) => t.category === cat);
        const done = items.filter((t) => t.status === "done").length;
        return { cat, items, pct: items.length === 0 ? 0 : Math.round((done / items.length) * 100) };
      }),
    [tasks]
  );

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeletingLoading(true);
    const { error } = await deleteRoadmapTask(deleting.id);
    setDeletingLoading(false);
    if (error) return;
    setTasks((prev) => prev.filter((t) => t.id !== deleting.id));
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
      <ScrollView contentContainerStyle={styles.scroll}>
        {sections.map(({ cat, items, pct }) => (
          <View key={cat} style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{ROADMAP_CATEGORY_LABELS[cat]}</Text>
              <Text style={styles.sectionPct}>{pct}%</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
            </View>

            {items.length === 0 ? (
              <Text style={styles.emptyText}>Sin tareas todavía.</Text>
            ) : (
              items.map((t) => (
                <View key={t.id} style={styles.taskRow}>
                  <Ionicons
                    name={t.status === "done" ? "checkmark-circle" : t.status === "in_progress" ? "time-outline" : "ellipse-outline"}
                    size={18}
                    color={t.status === "done" ? colors.live : t.status === "in_progress" ? colors.accent2 : colors.textMuted}
                  />
                  <View style={styles.taskInfo}>
                    <Text style={styles.taskTitle}>{t.title}</Text>
                    <Text style={styles.taskStatus}>{ROADMAP_STATUS_LABELS[t.status as keyof typeof ROADMAP_STATUS_LABELS]}</Text>
                  </View>
                  {isAdmin && (
                    <View style={styles.taskActions}>
                      <Pressable style={styles.actionBtn} onPress={() => setFormModal({ existing: t, category: cat })}>
                        <Ionicons name="create-outline" size={16} color={colors.text} />
                      </Pressable>
                      <Pressable style={styles.actionBtn} onPress={() => setDeleting(t)}>
                        <Ionicons name="trash-outline" size={16} color={colors.dangerText} />
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            )}

            {isAdmin && (
              <Pressable style={styles.addBtn} onPress={() => setFormModal({ existing: null, category: cat })}>
                <Ionicons name="add" size={16} color={colors.accent2} />
                <Text style={styles.addBtnText}>Agregar tarea</Text>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>

      {formModal && (
        <RoadmapFormModal
          visible
          existing={formModal.existing}
          defaultCategory={formModal.category}
          adminId={adminId}
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
          title={`¿Eliminar "${deleting.title}"?`}
          subtitle="Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          loadingText="Eliminando tarea..."
          successText="Tarea eliminada."
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
  flex: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  scroll: { padding: 16, paddingBottom: 48, gap: 16 },
  section: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 16, gap: 8 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  sectionPct: { color: colors.accent2, fontSize: 13, fontWeight: "700" },
  progressBarBg: { height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: "hidden", marginBottom: 4 },
  progressBarFill: { height: "100%", backgroundColor: colors.accent2, borderRadius: 3 },
  emptyText: { color: colors.textMuted, fontSize: 12.5 },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  taskInfo: { flex: 1, gap: 1 },
  taskTitle: { color: colors.text, fontSize: 13.5, fontWeight: "600" },
  taskStatus: { color: colors.textMuted, fontSize: 11.5 },
  taskActions: { flexDirection: "row", gap: 6 },
  actionBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 4 },
  addBtnText: { color: colors.accent2, fontSize: 12.5, fontWeight: "700" },
});
