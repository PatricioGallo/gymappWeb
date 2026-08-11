import { useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, View } from "react-native";
import { BarChart } from "react-native-chart-kit";

import { formatFechaCorta } from "@/lib/dias";
import { getAdminDailyVisits, getAdminSiteStats, USER_TYPE_LABELS, USER_TYPE_OPTIONS, type AdminDailyVisit, type AdminSiteStats } from "@/lib/adminService";
import { colors, radius } from "@/theme/colors";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function StatsTab() {
  const [stats, setStats] = useState<AdminSiteStats | null>(null);
  const [daily, setDaily] = useState<AdminDailyVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAdminSiteStats(), getAdminDailyVisits(14)])
      .then(([s, d]) => {
        if (cancelled) return;
        setStats(s);
        setDaily(d);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudieron cargar las estadísticas.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.accent2} />
      </View>
    );
  }

  if (error || !stats) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.errorText}>{error || "No se pudieron cargar las estadísticas."}</Text>
      </View>
    );
  }

  const byType = stats.users_by_type ?? {};
  const cards: { label: string; value: number | string }[] = [
    { label: "Usuarios registrados", value: stats.total_users },
    { label: "Nuevos (30 días)", value: stats.new_users_last_30_days },
    { label: "Rutinas creadas", value: stats.total_routines },
    { label: "Rutinas activas", value: stats.active_routines },
    { label: "Ejercicios en catálogo", value: stats.total_exercises },
    { label: "Ejercicios de usuarios", value: stats.custom_exercises },
    { label: "Pesos registrados", value: stats.total_weight_logs },
    { label: "Visitas totales", value: stats.total_visits },
    { label: "Visitas hoy", value: stats.visits_today },
    { label: "Visitas (7 días)", value: stats.visits_last_7_days },
  ];

  const chartWidth = Dimensions.get("window").width - 32;
  const hasVisitData = daily.some((d) => d.count > 0);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.grid}>
        {cards.map((c) => (
          <View key={c.label} style={styles.card}>
            <Text style={styles.cardLabel}>{c.label}</Text>
            <Text style={styles.cardValue}>{c.value}</Text>
          </View>
        ))}
        <View style={[styles.card, styles.cardWide]}>
          <Text style={styles.cardLabel}>Última visita</Text>
          <Text style={styles.cardValueSmall}>{formatDateTime(stats.last_visit_at)}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Usuarios por rol</Text>
        <Text style={styles.sectionSub}>Distribución de roles en toda la plataforma.</Text>
        <View style={styles.badgeRow}>
          {USER_TYPE_OPTIONS.map((t) => (
            <View key={t} style={styles.badge}>
              <Text style={styles.badgeText}>
                {USER_TYPE_LABELS[t]}: {byType[t] ?? 0}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Visitas por día</Text>
        <Text style={styles.sectionSub}>Últimos 14 días.</Text>
        {hasVisitData ? (
          <BarChart
            data={{
              labels: daily.map((d) => formatFechaCorta(d.day)),
              datasets: [{ data: daily.map((d) => d.count) }],
            }}
            width={chartWidth}
            height={220}
            fromZero
            withInnerLines={false}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={{
              backgroundGradientFrom: colors.surface,
              backgroundGradientTo: colors.surface,
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(255, 138, 61, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(182, 189, 199, ${opacity})`,
              barPercentage: 0.55,
              propsForBackgroundLines: { stroke: colors.border },
            }}
            style={styles.chart}
          />
        ) : (
          <Text style={styles.emptyText}>Todavía no hay visitas registradas en este período.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { color: colors.textMuted, fontSize: 14, textAlign: "center" },
  scroll: { padding: 16, paddingBottom: 48, gap: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: {
    width: "47%",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 14,
    gap: 6,
  },
  cardWide: { width: "100%" },
  cardLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  cardValue: { color: colors.text, fontSize: 24, fontWeight: "800" },
  cardValueSmall: { color: colors.text, fontSize: 15, fontWeight: "700" },
  section: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 16,
    gap: 4,
  },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  sectionSub: { color: colors.textMuted, fontSize: 12.5, marginBottom: 10 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: { color: colors.text, fontSize: 12.5, fontWeight: "600" },
  chart: { borderRadius: radius.card, marginTop: 4 },
  emptyText: { color: colors.textMuted, fontSize: 13 },
});
