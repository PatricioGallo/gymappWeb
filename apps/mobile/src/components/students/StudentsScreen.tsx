import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ActionMenu, type ActionMenuItem } from "@/components/ActionMenu";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Avatar } from "@/components/profile/Avatar";
import { ConfirmModal } from "@/components/profile/ConfirmModal";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { formatFechaCorta } from "@/lib/dias";
import { finishRoutine, getProfile, listRoutines, type Profile, type RoutineWithCounts } from "@/lib/profileService";
import { cloneRoutineForUser } from "@/lib/routineService";
import { countAssignedRoutines, getLastTrainedDate, getRoutineProgressPct, listRecentComments, type RecentCommentRow } from "@/lib/studentService";
import {
  deleteHistoricSubscription,
  listHistoricSubscribers,
  listSubscribers,
  removeSubscriber,
  type HistoricSubscriberRow,
  type SubscriberListRow,
} from "@/lib/subscriptionService";
import { supabase } from "@/lib/supabaseClient";
import { colors, radius } from "@/theme/colors";

const DEBOUNCE_MS = 250;

interface StudentCardData {
  row: SubscriberListRow;
  activeRoutine: RoutineWithCounts | null;
  progressPct: number;
  lastTrained: string | null;
  assignedCount: number;
  recentComments: RecentCommentRow[];
}

export function StudentsScreen() {
  const router = useRouter();
  const [myId, setMyId] = useState<string | null>(null);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"current" | "historic">("current");
  const [query, setQuery] = useState("");

  const [students, setStudents] = useState<StudentCardData[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [historic, setHistoric] = useState<HistoricSubscriberRow[]>([]);

  const [menuFor, setMenuFor] = useState<StudentCardData | null>(null);
  const [historicMenuFor, setHistoricMenuFor] = useState<HistoricSubscriberRow | null>(null);
  const [assignFor, setAssignFor] = useState<StudentCardData | null>(null);
  const [templates, setTemplates] = useState<RoutineWithCounts[]>([]);
  const [historicRoutinesFor, setHistoricRoutinesFor] = useState<{ student: SubscriberListRow; routines: RoutineWithCounts[] } | null>(null);

  const [finalizeFor, setFinalizeFor] = useState<StudentCardData | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeSuccess, setFinalizeSuccess] = useState(false);
  const [cancelFor, setCancelFor] = useState<{ id: string; name: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [deleteHistoricFor, setDeleteHistoricFor] = useState<HistoricSubscriberRow | null>(null);
  const [deletingHistoric, setDeletingHistoric] = useState(false);
  const [deleteHistoricSuccess, setDeleteHistoricSuccess] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestIdRef = useRef(0);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id ?? null;
      if (!uid) {
        router.replace("/");
        return;
      }
      const p = await getProfile(uid);
      if (!p || p.user_type !== "entrenador") {
        router.replace("/");
        return;
      }
      setMyId(uid);
      setMyAvatarUrl(p.avatar_url);
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    if (!myId) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runList(), DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, tab, query]);

  async function runList() {
    if (!myId) return;
    const myRequestId = ++requestIdRef.current;
    setListLoading(true);
    try {
      if (tab === "historic") {
        const rows = await listHistoricSubscribers(myId, query);
        if (myRequestId !== requestIdRef.current) return;
        setHistoric(rows);
      } else {
        const rows = await listSubscribers(myId, query);
        const enriched = await Promise.all(
          rows.map(async (row): Promise<StudentCardData> => {
            const [active, lastTrained, assignedCount, recentComments] = await Promise.all([
              listRoutines(row.id, "active").catch(() => []),
              getLastTrainedDate(row.id).catch(() => null),
              countAssignedRoutines(myId, row.id).catch(() => 0),
              listRecentComments(row.id, 3).catch(() => []),
            ]);
            const activeRoutine = active[0] ?? null;
            const progressPct = activeRoutine ? await getRoutineProgressPct(row.id, activeRoutine.totalRoutineExerciseIds).catch(() => 0) : 0;
            return { row, activeRoutine, progressPct, lastTrained, assignedCount, recentComments };
          })
        );
        if (myRequestId !== requestIdRef.current) return;
        setStudents(enriched);
      }
    } finally {
      if (myRequestId === requestIdRef.current) setListLoading(false);
    }
  }

  async function handleOpenAssign(student: StudentCardData) {
    if (!myId) return;
    setAssignFor(student);
    setTemplates(await listRoutines(myId, "saved").catch(() => []));
  }

  async function handleAssignTemplate(templateId: string) {
    if (!myId || !assignFor) return;
    setAssignFor(null);
    const { id } = await cloneRoutineForUser(templateId, assignFor.row.id);
    if (id) void runList();
  }

  async function handleOpenHistoricRoutines(student: SubscriberListRow) {
    const rows = (await listRoutines(student.id, "historic").catch(() => [])).filter((r) => r.assigned_by === myId);
    setHistoricRoutinesFor({ student, routines: rows });
  }

  async function handleReassign(templateId: string, studentId: string) {
    setHistoricRoutinesFor(null);
    const { id } = await cloneRoutineForUser(templateId, studentId);
    if (id) void runList();
  }

  async function handleConfirmFinalize() {
    if (!finalizeFor?.activeRoutine) return;
    setFinalizing(true);
    try {
      await finishRoutine(finalizeFor.activeRoutine.id);
      setFinalizing(false);
      setFinalizeSuccess(true);
      setTimeout(() => {
        setFinalizeSuccess(false);
        setFinalizeFor(null);
        void runList();
      }, 1200);
    } catch {
      setFinalizing(false);
    }
  }

  async function handleConfirmCancel() {
    if (!myId || !cancelFor) return;
    setCancelling(true);
    const { error } = await removeSubscriber(myId, cancelFor.id);
    setCancelling(false);
    if (error) return;
    setCancelSuccess(true);
    setTimeout(() => {
      setCancelSuccess(false);
      setCancelFor(null);
      void runList();
    }, 1200);
  }

  async function handleConfirmDeleteHistoric() {
    if (!myId || !deleteHistoricFor) return;
    setDeletingHistoric(true);
    const { error } = await deleteHistoricSubscription(myId, deleteHistoricFor.id);
    setDeletingHistoric(false);
    if (error) return;
    setDeleteHistoricSuccess(true);
    setTimeout(() => {
      setDeleteHistoricSuccess(false);
      setDeleteHistoricFor(null);
      void runList();
    }, 1200);
  }

  if (loading || !myId) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Tus alumnos" onBack={() => router.back()} avatarUrl={null} />
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.accent2} />
        </View>
      </View>
    );
  }

  const menuItems: ActionMenuItem[] = menuFor
    ? [
        { label: "Ver progreso", onPress: () => router.push({ pathname: "/progress", params: { uid: menuFor.row.id } }) },
        { label: "Asignarle una rutina", onPress: () => handleOpenAssign(menuFor) },
        ...(menuFor.activeRoutine ? [{ label: "Finalizar su rutina actual", onPress: () => setFinalizeFor(menuFor) }] : []),
        { label: "Rutinas históricas", onPress: () => handleOpenHistoricRoutines(menuFor.row) },
        { label: "Cancelar suscripción", onPress: () => setCancelFor({ id: menuFor.row.id, name: menuFor.row.nombre || menuFor.row.username }), danger: true },
      ]
    : [];

  const historicMenuItems: ActionMenuItem[] = historicMenuFor
    ? [
        { label: "Ver rutinas históricas", onPress: () => handleOpenHistoricRoutines(historicMenuFor) },
        { label: "Eliminar", onPress: () => setDeleteHistoricFor(historicMenuFor), danger: true },
      ]
    : [];

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Tus alumnos" onBack={() => router.back()} avatarUrl={myAvatarUrl} />

      <View style={styles.tabsRow}>
        <TabChip label="Actuales" active={tab === "current"} onPress={() => setTab("current")} />
        <TabChip label="Históricas" active={tab === "historic"} onPress={() => setTab("historic")} />
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput style={styles.searchInput} placeholder="Buscar alumno..." placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} autoCapitalize="none" />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {listLoading ? (
          <ActivityIndicator color={colors.accent2} style={{ marginTop: 20 }} />
        ) : tab === "current" ? (
          students.length === 0 ? (
            <Text style={styles.emptyText}>Todavía no tenés alumnos aceptados.</Text>
          ) : (
            students.map((s) => (
              <View key={s.row.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Pressable
                    style={styles.cardHeadMain}
                    onPress={() => router.push({ pathname: "/profile/[username]", params: { username: s.row.username } })}
                  >
                    <Avatar uri={s.row.avatarUrl} size={44} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={styles.nameLine}>
                        <Text style={styles.name}>{`${s.row.nombre} ${s.row.apellido}`.trim() || s.row.username}</Text>
                        <VerifiedBadge userType={s.row.userType} isVerified={s.row.isVerified} size={14} />
                      </View>
                      <Text style={styles.username}>@{s.row.username}</Text>
                    </View>
                  </Pressable>
                  <Pressable onPress={() => setMenuFor(s)} hitSlop={10}>
                    <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>

                <View style={styles.statsGrid}>
                  <StatItem label="Rutinas asignadas" value={String(s.assignedCount)} />
                  <StatItem label="Alumno desde" value={formatFechaCorta(s.row.subscribedAt)} />
                  <StatItem label="Último entrenamiento" value={s.lastTrained ? formatFechaCorta(s.lastTrained) : "—"} />
                </View>

                {s.activeRoutine ? (
                  <View style={styles.progressWrap}>
                    <View style={styles.progressHead}>
                      <Text style={styles.progressLabel}>{s.activeRoutine.nombre}</Text>
                      <Text style={styles.progressPct}>{s.progressPct}%</Text>
                    </View>
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${s.progressPct}%` }]} />
                    </View>
                  </View>
                ) : (
                  <Text style={styles.noRoutineText}>No tiene una rutina activa.</Text>
                )}

                {s.recentComments.length > 0 && (
                  <View style={styles.commentsWrap}>
                    <Text style={styles.commentsLabel}>Comentarios recientes</Text>
                    {s.recentComments.map((c) => (
                      <Text key={c.id} style={styles.commentText} numberOfLines={2}>
                        "{c.comment}" — {c.exerciseNombre}
                      </Text>
                    ))}
                  </View>
                )}

                {s.activeRoutine && (
                  <Pressable
                    style={styles.primaryBtn}
                    onPress={() => router.push({ pathname: "/pesos/[routineId]", params: { routineId: s.activeRoutine!.id, uid: s.row.id } })}
                  >
                    <Text style={styles.primaryBtnText}>Cargar pesos</Text>
                  </Pressable>
                )}
              </View>
            ))
          )
        ) : historic.length === 0 ? (
          <Text style={styles.emptyText}>Todavía no tenés alumnos históricos.</Text>
        ) : (
          historic.map((h) => (
            <View key={h.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Pressable style={styles.cardHeadMain} onPress={() => router.push({ pathname: "/profile/[username]", params: { username: h.username } })}>
                  <Avatar uri={h.avatarUrl} size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={styles.nameLine}>
                      <Text style={styles.name}>{`${h.nombre} ${h.apellido}`.trim() || h.username}</Text>
                      <VerifiedBadge userType={h.userType} isVerified={h.isVerified} size={14} />
                    </View>
                    <Text style={styles.username}>@{h.username}</Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => setHistoricMenuFor(h)} hitSlop={10}>
                  <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
              <View style={styles.statsGrid}>
                <StatItem label="Alumno desde" value={formatFechaCorta(h.subscribedAt)} />
                <StatItem label="Hasta" value={formatFechaCorta(h.endedAt)} />
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <ActionMenu visible={menuFor !== null} onClose={() => setMenuFor(null)} items={menuItems} />
      <ActionMenu visible={historicMenuFor !== null} onClose={() => setHistoricMenuFor(null)} items={historicMenuItems} />

      <ActionMenu
        visible={assignFor !== null}
        onClose={() => setAssignFor(null)}
        items={
          templates.length === 0
            ? [{ label: "No tenés rutinas guardadas todavía", onPress: () => {} }]
            : templates.map((t) => ({ label: t.nombre, onPress: () => handleAssignTemplate(t.id) }))
        }
      />

      <ActionMenu
        visible={historicRoutinesFor !== null}
        onClose={() => setHistoricRoutinesFor(null)}
        items={
          historicRoutinesFor
            ? historicRoutinesFor.routines.length === 0
              ? [{ label: "No le asignaste rutinas históricas", onPress: () => {} }]
              : historicRoutinesFor.routines.map((r) => ({
                  label: `Volver a asignar "${r.nombre}"`,
                  onPress: () => handleReassign(r.id, historicRoutinesFor.student.id),
                }))
            : []
        }
      />

      <ConfirmModal
        visible={finalizeFor !== null}
        title="Finalizar su rutina actual"
        subtitle={`"${finalizeFor?.activeRoutine?.nombre}" va a pasar a Históricas para ${finalizeFor?.row.nombre ?? "este alumno"}.`}
        confirmLabel="Finalizar"
        loadingText="Finalizando..."
        successText="¡Rutina finalizada!"
        loading={finalizing}
        success={finalizeSuccess}
        onConfirm={handleConfirmFinalize}
        onCancel={() => setFinalizeFor(null)}
      />

      <ConfirmModal
        visible={cancelFor !== null}
        title="Cancelar suscripción"
        subtitle={`${cancelFor?.name} va a dejar de ser tu alumno actual y va a pasar a tu historial.`}
        confirmLabel="Cancelar suscripción"
        loadingText="Cancelando..."
        successText="Suscripción cancelada."
        loading={cancelling}
        success={cancelSuccess}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelFor(null)}
      />

      <ConfirmModal
        visible={deleteHistoricFor !== null}
        title="Eliminar registro histórico"
        subtitle="Esta acción no se puede deshacer. Si vuelve a suscribirse más adelante, va a arrancar como un alumno nuevo."
        confirmLabel="Eliminar"
        loadingText="Eliminando..."
        successText="Registro eliminado."
        loading={deletingHistoric}
        success={deleteHistoricSuccess}
        onConfirm={handleConfirmDeleteHistoric}
        onCancel={() => setDeleteHistoricFor(null)}
      />
    </View>
  );
}

function TabChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tabChip, active && styles.tabChipActive]} onPress={onPress}>
      <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  tabChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  tabChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent2 },
  tabChipText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  tabChipTextActive: { color: colors.accent2 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14.5 },
  scroll: { padding: 16, gap: 12, paddingBottom: 48 },
  emptyText: { color: colors.textMuted, fontSize: 13.5, textAlign: "center", paddingVertical: 24 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 16, gap: 12 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardHeadMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { color: colors.text, fontSize: 14.5, fontWeight: "700" },
  username: { color: colors.textMuted, fontSize: 12.5 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  statItem: { minWidth: "30%" },
  statLabel: { color: colors.textMuted, fontSize: 11.5 },
  statValue: { color: colors.text, fontSize: 13.5, fontWeight: "700", marginTop: 2 },
  progressWrap: { gap: 6 },
  progressHead: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { color: colors.text, fontSize: 12.5, fontWeight: "600", flex: 1, marginRight: 8 },
  progressPct: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700" },
  progressBarBg: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: colors.accent2, borderRadius: 4 },
  noRoutineText: { color: colors.textMuted, fontSize: 12.5, fontStyle: "italic" },
  commentsWrap: { gap: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  commentsLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  commentText: { color: colors.text, fontSize: 12 },
  primaryBtn: { backgroundColor: colors.accent2, borderRadius: radius.pill, paddingVertical: 12, alignItems: "center" },
  primaryBtnText: { color: colors.bg, fontWeight: "700", fontSize: 13.5 },
});
