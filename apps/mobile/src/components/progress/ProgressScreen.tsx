import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ActionMenu, type ActionMenuItem } from "@/components/ActionMenu";
import { FrequencyChart, ProgressChart } from "@/components/profile/Charts";
import { ScreenHeader } from "@/components/ScreenHeader";
import { formatFechaCorta } from "@/lib/dias";
import { getProfile, getProfileBasicById, listRoutines, listWeightLogsWithContext, type WeightLogEntry } from "@/lib/profileService";
import { supabase } from "@/lib/supabaseClient";
import { colors, radius } from "@/theme/colors";

const RECENT_WINDOW = 5;
const PROJECTION_DAYS = 28;

interface ExerciseGroup {
  id: string;
  name: string;
  authorName: string;
  entries: (WeightLogEntry & { date: Date })[];
}

function parseFechaISO(fecha: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function groupByExercise(logs: WeightLogEntry[]): ExerciseGroup[] {
  const map = new Map<string, ExerciseGroup>();
  logs.forEach((log) => {
    const group = map.get(log.exerciseId) ?? { id: log.exerciseId, name: log.exerciseName, authorName: log.authorName, entries: [] };
    group.entries.push({ ...log, date: parseFechaISO(log.fecha) });
    map.set(log.exerciseId, group);
  });
  return Array.from(map.values());
}

function sesionesLabel(n: number): string {
  return `${n} ${n === 1 ? "sesión" : "sesiones"}`;
}
function oneRepMax(peso: number, repe: number): number {
  if (!repe || repe <= 1) return peso;
  return Math.round(peso * (1 + repe / 30));
}
function bestOneRepMax(points: ExerciseGroup["entries"]): number | null {
  const withReps = points.filter((p) => p.repe);
  if (withReps.length === 0) return null;
  return Math.max(...withReps.map((p) => oneRepMax(p.peso, p.repe!)));
}
function projectWeight(points: ExerciseGroup["entries"], daysAhead: number): number | null {
  if (points.length < 2) return null;
  const x0 = points[0].date.getTime();
  const xs = points.map((p) => (p.date.getTime() - x0) / 86400000);
  const ys = points.map((p) => p.peso);
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const projX = xs[xs.length - 1] + daysAhead;
  return Math.round(slope * projX + intercept);
}

type Tab = "overview" | "detail";

export function ProgressScreen({ uid }: { uid?: string }) {
  const router = useRouter();
  const [viewerAvatarUrl, setViewerAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [targetName, setTargetName] = useState("tu");
  const [isOwnRoutine, setIsOwnRoutine] = useState(true);
  const [activeRoutineId, setActiveRoutineId] = useState<string | null>(null);

  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const myId = session?.user.id ?? "";
      const target = uid ?? myId;
      setTargetUserId(target);
      setIsOwnRoutine(target === myId);
      getProfile(myId).then((p) => setViewerAvatarUrl(p?.avatar_url ?? null));

      const profile = uid ? await getProfileBasicById(uid).catch(() => null) : await getProfile(myId).catch(() => null);
      if (!profile) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setTargetName(profile.nombre ?? "tu");

      const [logs, activeRoutines] = await Promise.all([listWeightLogsWithContext(target), listRoutines(target, "active")]);
      const built = groupByExercise(logs);
      setGroups(built);
      setSelectedId(built[0]?.id ?? null);
      setActiveRoutineId(activeRoutines[0]?.id ?? null);
      setLoading(false);
    })();
  }, [uid]);

  if (loading) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Progreso" onBack={() => router.back()} avatarUrl={viewerAvatarUrl} />
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.accent2} />
        </View>
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Progreso" onBack={() => router.back()} avatarUrl={viewerAvatarUrl} />
        <View style={styles.centerWrap}>
          <Text style={styles.emptyTitle}>No se encontró este perfil.</Text>
        </View>
      </View>
    );
  }

  const selected = groups.find((g) => g.id === selectedId) ?? null;
  const pickerItems: ActionMenuItem[] = groups.map((g) => ({ label: g.name, onPress: () => setSelectedId(g.id) }));

  return (
    <View style={styles.flex}>
      <ScreenHeader title={`Progreso de ${targetName}`} onBack={() => router.back()} avatarUrl={viewerAvatarUrl} />

      {groups.length === 0 ? (
        <View style={styles.centerWrap}>
          <Ionicons name="stats-chart-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>{isOwnRoutine ? "Todavía no tenés estadísticas" : `${targetName} todavía no tiene estadísticas`}</Text>
          <Text style={styles.emptyBody}>Cuando {isOwnRoutine ? "cargues" : "cargue"} el peso de un ejercicio en "Entrenar hoy", el progreso va a aparecer acá.</Text>
        </View>
      ) : (
        <>
          <View style={styles.tabsRow}>
            <TabChip label="Resumen" active={tab === "overview"} onPress={() => setTab("overview")} />
            <TabChip label="Detalle por ejercicio" active={tab === "detail"} onPress={() => setTab("detail")} />
          </View>

          <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
            {activeRoutineId && (
              <Pressable
                style={styles.routineBanner}
                onPress={() =>
                  router.push({ pathname: "/pesos/[routineId]", params: uid ? { routineId: activeRoutineId, uid } : { routineId: activeRoutineId } })
                }
              >
                <Ionicons name="barbell" size={18} color={colors.accent2} />
                <Text style={styles.routineBannerText}>Ver detalle de {isOwnRoutine ? "tu" : `la`} rutina activa {isOwnRoutine ? "" : `de ${targetName}`} y cargar pesos</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            )}

            {tab === "overview" ? <OverviewTab groups={groups} /> : selected ? <DetailTab group={selected} onPickPress={() => setPickerOpen(true)} /> : null}
          </ScrollView>
        </>
      )}

      <ActionMenu visible={pickerOpen} onClose={() => setPickerOpen(false)} items={pickerItems} />
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

function OverviewTab({ groups }: { groups: ExerciseGroup[] }) {
  const data = groups.map((g) => {
    const weights = g.entries.map((p) => p.peso);
    const max = Math.max(...weights);
    const delta = g.entries[g.entries.length - 1].peso - g.entries[0].peso;
    return { name: g.name, max, delta, entries: g.entries.length };
  });
  const topByMax = [...data].sort((a, b) => b.max - a.max).slice(0, 5);
  const topByProgress = data
    .filter((d) => d.entries >= 2 && d.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);
  const maxOfMax = Math.max(...topByMax.map((d) => d.max), 1);
  const maxOfProgress = Math.max(...topByProgress.map((d) => d.delta), 1);

  return (
    <View style={{ gap: 16 }}>
      <SectionCard title="Mejores ejercicios" subtitle="Por peso máximo levantado.">
        {topByMax.map((d) => (
          <BarRow key={d.name} label={d.name} value={d.max} max={maxOfMax} unit="kg" color={colors.accent2} />
        ))}
      </SectionCard>

      <SectionCard title="Mayor progreso" subtitle={topByProgress.length === 0 ? "Todavía no hay suficientes registros para comparar progreso." : "Kilos ganados desde tu primer registro."}>
        {topByProgress.map((d) => (
          <BarRow key={d.name} label={d.name} value={d.delta} max={maxOfProgress} unit="kg" color={colors.live} prefix="+" />
        ))}
      </SectionCard>
    </View>
  );
}

function BarRow({ label, value, max, unit, color, prefix }: { label: string; value: number; max: number; unit: string; color: string; prefix?: string }) {
  const pct = Math.max(4, Math.round((value / max) * 100));
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.barValue}>
        {prefix ?? ""}
        {value} {unit}
      </Text>
    </View>
  );
}

function DetailTab({ group, onPickPress }: { group: ExerciseGroup; onPickPress: () => void }) {
  const points = group.entries;
  const weights = points.map((p) => p.peso);
  const max = Math.max(...weights);
  const maxEntry = points.find((p) => p.peso === max)!;
  const min = Math.min(...weights);

  const recent = points.slice(-RECENT_WINDOW);
  const recentAvg = Math.round(recent.reduce((a, p) => a + p.peso, 0) / recent.length);

  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.peso - first.peso;
  const deltaPct = first.peso > 0 ? Math.round((delta / first.peso) * 100) : 0;

  const rm = bestOneRepMax(points);
  const projected = projectWeight(points, PROJECTION_DAYS);
  const volumePoints = points.filter((p) => p.serie && p.repe).map((p) => ({ fecha: p.fecha, volumen: p.serie! * p.repe! * p.peso }));
  const recentSessions = points.slice(-10);
  const recentVolume = volumePoints.slice(-10);

  return (
    <View style={{ gap: 16 }}>
      <Pressable style={styles.pickerBtn} onPress={onPickPress}>
        <Text style={styles.pickerBtnText}>{group.name}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </Pressable>

      <View style={styles.statGrid}>
        <StatCard label="Peso máximo" value={`${max} kg`} hint={formatFechaCorta(maxEntry.fecha)} />
        <StatCard label="1RM estimado" value={rm ? `${rm} kg` : "—"} hint={rm ? "Fórmula de Epley" : "Cargá repeticiones para calcularlo"} />
        <StatCard label={`Promedio últimas ${sesionesLabel(recent.length)}`} value={`${recentAvg} kg`} />
        <StatCard label="Peso proyectado (4 semanas)" value={projected !== null ? `${projected} kg` : "—"} hint={projected !== null ? "Según tu ritmo de progreso" : "Necesitás más registros"} />
        <StatCard
          label="Progreso total"
          value={points.length >= 2 ? `${delta >= 0 ? "+" : ""}${delta} kg` : "—"}
          hint={points.length >= 2 ? `${deltaPct >= 0 ? "+" : ""}${deltaPct}% desde el primer registro` : "Necesitás al menos 2 registros"}
        />
        <StatCard label="Veces entrenado" value={String(points.length)} hint={`Mínimo registrado: ${min} kg`} />
      </View>

      <SectionCard title={group.name} subtitle={`Ejercicio de ${group.authorName} · evolución del peso a lo largo del tiempo`}>
        <ChartWidth>{(w) => <ProgressChart entries={points} width={w} />}</ChartWidth>
      </SectionCard>

      <SectionCard title="Peso por sesión" subtitle={`Últimas ${sesionesLabel(Math.min(points.length, 10))} registradas.`}>
        <ChartWidth>{(w) => <FrequencyChart buckets={recentSessions.map((p) => ({ label: formatFechaCorta(p.fecha), count: p.peso }))} width={w} />}</ChartWidth>
      </SectionCard>

      {volumePoints.length >= 2 && (
        <SectionCard title="Volumen por sesión" subtitle={`Series × repeticiones × peso, últimas ${sesionesLabel(Math.min(volumePoints.length, 10))}.`}>
          <ChartWidth>{(w) => <FrequencyChart buckets={recentVolume.map((p) => ({ label: formatFechaCorta(p.fecha), count: p.volumen }))} width={w} />}</ChartWidth>
        </SectionCard>
      )}
    </View>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle && <Text style={styles.cardSub}>{subtitle}</Text>}
      {children}
    </View>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint && <Text style={styles.statHint}>{hint}</Text>}
    </View>
  );
}

function ChartWidth({ children }: { children: (width: number) => ReactNode }) {
  const [width, setWidth] = useState(0);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ marginHorizontal: -18, marginTop: 4 }}>
      {width > 0 ? children(width) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "700", textAlign: "center" },
  emptyBody: { color: colors.textMuted, fontSize: 13.5, textAlign: "center", lineHeight: 19 },
  tabsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  tabChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  tabChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent2 },
  tabChipText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  tabChipTextActive: { color: colors.accent2 },
  scroll: { padding: 16, paddingBottom: 48, gap: 16 },
  routineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent2,
    borderRadius: radius.card,
    padding: 14,
  },
  routineBannerText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "600" },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 18, gap: 10 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  cardSub: { color: colors.textMuted, fontSize: 12.5, marginTop: -6 },
  barRow: { gap: 4 },
  barLabel: { color: colors.text, fontSize: 13, fontWeight: "600" },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  barValue: { color: colors.textMuted, fontSize: 11.5 },
  pickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerBtnText: { color: colors.text, fontSize: 14.5, fontWeight: "700" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: { flexBasis: "47%", flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 16 },
  statLabel: { color: colors.textMuted, fontSize: 12 },
  statValue: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 4 },
  statHint: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});
