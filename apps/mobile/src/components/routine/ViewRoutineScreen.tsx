import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenHeader } from "@/components/ScreenHeader";
import { dayDisplayLabel } from "@/lib/dias";
import { getProfile } from "@/lib/profileService";
import { formatRepe } from "@/lib/reps";
import { getRoutineDetail, type RoutineDetail } from "@/lib/routineService";
import { supabase } from "@/lib/supabaseClient";
import { colors, radius } from "@/theme/colors";

/** Vista de solo lectura de una rutina ajena (equivalente a "Ver" en la web) --
 * sin campos de carga de peso, solo la estructura (series/reps por ejercicio). */
export function ViewRoutineScreen({ routineId }: { routineId: string }) {
  const router = useRouter();
  const [viewerAvatarUrl, setViewerAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [routine, setRoutine] = useState<RoutineDetail | null>(null);
  const [weekIndex, setWeekIndex] = useState(0);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user.id) getProfile(session.user.id).then((p) => setViewerAvatarUrl(p?.avatar_url ?? null));
      const detail = await getRoutineDetail(routineId).catch(() => null);
      setRoutine(detail);
      setLoading(false);
    })();
  }, [routineId]);

  if (loading) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Rutina" onBack={() => router.back()} avatarUrl={viewerAvatarUrl} />
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.accent2} />
        </View>
      </View>
    );
  }

  if (!routine) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Rutina" onBack={() => router.back()} avatarUrl={viewerAvatarUrl} />
        <View style={styles.centerWrap}>
          <Text style={styles.emptyText}>No se encontró esta rutina.</Text>
        </View>
      </View>
    );
  }

  const semana = routine.semanas[weekIndex];

  return (
    <View style={styles.flex}>
      <ScreenHeader title={routine.nombre} onBack={() => router.back()} avatarUrl={viewerAvatarUrl} />

      <ScrollView contentContainerStyle={styles.scroll}>
        {routine.semanas.length > 1 && (
          <View style={styles.weekChipsRow}>
            {routine.semanas.map((s, i) => (
              <Pressable key={s.id} style={[styles.weekChip, i === weekIndex && styles.weekChipActive]} onPress={() => setWeekIndex(i)}>
                <Text style={[styles.weekChipText, i === weekIndex && styles.weekChipTextActive]}>Semana {s.numero}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {semana?.dias.map((dia) => (
          <View key={dia.id} style={styles.dayCard}>
            <Text style={styles.dayTitle}>{dayDisplayLabel(dia.dia_semana, dia.nombre)}</Text>
            {dia.ejercicios.map((exc) => (
              <View key={exc.id} style={styles.excRow}>
                <Text style={styles.excName}>{exc.nombre_snapshot}</Text>
                <Text style={styles.excSub}>
                  {exc.serie} series x {formatRepe(exc.repe, exc.repe_max)} repeticiones
                </Text>
                {exc.nota && <Text style={styles.excNota}>{exc.nota}</Text>}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyText: { color: colors.text, fontSize: 15, fontWeight: "700", textAlign: "center" },
  scroll: { padding: 16, paddingBottom: 48, gap: 14 },
  weekChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  weekChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  weekChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent2 },
  weekChipText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700" },
  weekChipTextActive: { color: colors.accent2 },
  dayCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 16, gap: 10 },
  dayTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  excRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 2 },
  excName: { color: colors.text, fontSize: 13.5, fontWeight: "600" },
  excSub: { color: colors.textMuted, fontSize: 12 },
  excNota: { color: colors.textMuted, fontSize: 11.5, fontStyle: "italic" },
});
