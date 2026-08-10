import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { ActionMenu, type ActionMenuItem } from "@/components/ActionMenu";
import { formatFechaCorta } from "@/lib/dias";
import { routineLastProgressLabel, routineProgressPct, type RoutineListMode, type RoutineWithCounts, type WeightLogEntry } from "@/lib/profileService";
import { setRoutinePublic } from "@/lib/routineService";
import { colors, radius } from "@/theme/colors";

function notImplemented() {
  Alert.alert("Próximamente", "Esta función todavía no está disponible en la app.");
}

export function RoutineCard({
  routine,
  mode,
  logs,
  ownerName,
  onFinalize,
  onReactivate,
}: {
  routine: RoutineWithCounts;
  mode: RoutineListMode;
  logs: WeightLogEntry[];
  ownerName: string | null;
  onFinalize: (routine: RoutineWithCounts) => void;
  onReactivate: (routine: RoutineWithCounts) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isPublic, setIsPublic] = useState(routine.is_public);
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  async function handleToggleVisibility() {
    setTogglingVisibility(true);
    const next = !isPublic;
    try {
      await setRoutinePublic(routine.id, next);
      setIsPublic(next);
    } catch {
      Alert.alert("No se pudo actualizar", "Probá de nuevo en unos segundos.");
    } finally {
      setTogglingVisibility(false);
    }
  }

  const menuItems: ActionMenuItem[] = [
    { label: mode === "active" ? "Mostrar" : "Ver", onPress: notImplemented },
    { label: "Modificar", onPress: notImplemented },
    { label: isPublic ? "Hacer privada" : "Hacer pública", onPress: handleToggleVisibility },
    { label: "Eliminar", onPress: notImplemented, danger: true },
  ];

  const pct = routineProgressPct(routine, logs);
  const lastProgress = routineLastProgressLabel(routine, logs);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.tagsRow}>
          {mode === "active" && <Text style={styles.startedTag}>Iniciada el {formatFechaCorta(routine.fecha_inicio)}</Text>}
          {mode === "historic" && routine.finalizada_at && <Text style={styles.finishedTag}>Finalizada el {formatFechaCorta(routine.finalizada_at)}</Text>}
          {mode === "saved" && <Text style={styles.finishedTag}>Plantilla</Text>}
          <Text style={[styles.visibilityBadge, isPublic && styles.visibilityBadgePublic]}>{isPublic ? "Pública" : "Privada"}</Text>
        </View>
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={10}>
          <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <Text style={styles.title}>{routine.nombre}</Text>
      {ownerName && <Text style={styles.ownerLine}>Rutina de {ownerName}</Text>}

      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Semanas</Text>
          <Text style={styles.statValue}>{routine.semanasCount}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Días por semana</Text>
          <Text style={styles.statValue}>{routine.diasPorSemana}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Ejercicios</Text>
          <Text style={styles.statValue}>{routine.ejerciciosCount}</Text>
        </View>
        {mode !== "saved" && (
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Último progreso</Text>
            <Text style={styles.statValue}>{lastProgress}</Text>
          </View>
        )}
      </View>

      {mode !== "saved" && (
        <View style={styles.progressWrap}>
          <View style={styles.progressHead}>
            <Text style={styles.progressLabel}>Progreso de la rutina</Text>
            <Text style={styles.progressPct}>{pct}%</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
          </View>
        </View>
      )}

      <View style={styles.actions}>
        {mode === "active" && (
          <>
            <SmallGradientButton title="Entrenar hoy" onPress={notImplemented} />
            <Pressable style={styles.successButton} onPress={() => onFinalize(routine)}>
              <Text style={styles.successButtonText}>Finalizar</Text>
            </Pressable>
          </>
        )}
        {mode === "historic" && <SmallGradientButton title="Reactivar" onPress={() => onReactivate(routine)} />}
        {mode === "saved" && <SmallGradientButton title="Activar o asignar" onPress={notImplemented} />}
      </View>

      <ActionMenu visible={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems} />
    </View>
  );
}

function SmallGradientButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable style={styles.smallGradientWrap} onPress={onPress}>
      <LinearGradient colors={[colors.accent, colors.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.smallGradient}>
        <Text style={styles.smallGradientText}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 18,
    gap: 12,
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, flex: 1, marginRight: 12 },
  startedTag: {
    color: colors.accent2,
    backgroundColor: colors.accentSoft,
    fontSize: 11.5,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  finishedTag: {
    color: colors.textMuted,
    backgroundColor: colors.surface2,
    fontSize: 11.5,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  visibilityBadge: {
    color: colors.textMuted,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 11.5,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  visibilityBadgePublic: { color: colors.accent2, borderColor: colors.accent2 },
  title: { color: colors.text, fontSize: 17, fontWeight: "700" },
  ownerLine: { color: colors.accent2, fontSize: 12.5, marginTop: -8 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  statItem: { minWidth: "42%" },
  statLabel: { color: colors.textMuted, fontSize: 12 },
  statValue: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 2 },
  progressWrap: { gap: 6 },
  progressHead: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { color: colors.textMuted, fontSize: 12.5 },
  progressPct: { color: colors.text, fontSize: 12.5, fontWeight: "700" },
  progressBarBg: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: colors.accent2, borderRadius: 4 },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  smallGradientWrap: { flex: 1, borderRadius: radius.pill, overflow: "hidden" },
  smallGradient: { paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  smallGradientText: { color: colors.bg, fontWeight: "700", fontSize: 13.5 },
  successButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(47, 217, 113, 0.4)",
    borderRadius: radius.pill,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  successButtonText: { color: colors.live, fontWeight: "700", fontSize: 13.5 },
});
