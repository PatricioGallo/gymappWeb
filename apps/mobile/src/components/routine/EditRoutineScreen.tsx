import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AlertMessage } from "@/components/AlertMessage";
import { AuthOverlay } from "@/components/AuthOverlay";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { dayDisplayLabel } from "@/lib/dias";
import { type Exercise, listExercises } from "@/lib/exerciseService";
import { getProfile, getProfileBasicById } from "@/lib/profileService";
import { addRoutineExercise, deleteRoutineExercise, getRoutineDetail, updateRoutineExercise, type RoutineDetail, type RoutineDetailDay } from "@/lib/routineService";
import { supabase } from "@/lib/supabaseClient";
import { colors, radius } from "@/theme/colors";

import { ExerciseBlock } from "./ExerciseBlock";
import { ExercisePickerModal } from "./ExercisePickerModal";
import { createEmptyExercise, type ExerciseFormState } from "./types";

interface EditExerciseFormState extends ExerciseFormState {
  existingId?: string;
}
interface EditDayFormState {
  dayId: string;
  diaSemana: number;
  nombre: string | null;
  exercises: EditExerciseFormState[];
}

function toEditDay(dia: RoutineDetailDay): EditDayFormState {
  return {
    dayId: dia.id,
    diaSemana: dia.dia_semana,
    nombre: dia.nombre,
    exercises: dia.ejercicios.map((e) => ({
      key: e.id,
      existingId: e.id,
      exerciseId: e.exercise_id,
      exerciseName: e.nombre_snapshot,
      exerciseInfo: e.info_snapshot,
      serie: String(e.serie),
      repe: String(e.repe),
      repeMax: e.repe_max ? String(e.repe_max) : "",
      sinPeso: !e.es_medible,
      mismoPeso: e.mismo_peso,
      nota: e.nota ?? "",
    })),
  };
}

export function EditRoutineScreen({ routineId }: { routineId: string }) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [routine, setRoutine] = useState<RoutineDetail | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  const [weekIndex, setWeekIndex] = useState(0);
  const [days, setDays] = useState<EditDayFormState[]>([]);
  const [error, setError] = useState("");
  const [pickerTarget, setPickerTarget] = useState<{ dayIndex: number; exerciseIndex: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const myId = session?.user.id ?? "";
      setUserId(myId);
      const [profile, exercises] = await Promise.all([getProfile(myId), listExercises()]);
      setAvatarUrl(profile?.avatar_url ?? null);
      setCatalog(exercises);

      const detail = await getRoutineDetail(routineId);
      setRoutine(detail);
      if (!detail) {
        setLoading(false);
        return;
      }

      const isOwner = detail.user_id === myId;
      const isAssigner = detail.assigned_by === myId;
      const isAdmin = (await getProfileBasicById(myId).catch(() => null))?.user_type === "admin";
      const allowed = isAssigner || (isOwner && (!detail.assigned_by || detail.is_public)) || isAdmin;
      setCanEdit(allowed);
      if (allowed) setDays(detail.semanas[0]?.dias.map(toEditDay) ?? []);
      setLoading(false);
    })();
  }, [routineId]);

  function handleChangeWeek(index: number) {
    if (!routine) return;
    setWeekIndex(index);
    setDays(routine.semanas[index].dias.map(toEditDay));
    setError("");
  }

  function updateExercise(dayIndex: number, exerciseIndex: number, patch: Partial<EditExerciseFormState>) {
    setDays((prev) => prev.map((day, i) => (i === dayIndex ? { ...day, exercises: day.exercises.map((exc, j) => (j === exerciseIndex ? { ...exc, ...patch } : exc)) } : day)));
  }
  function addExerciseToDay(dayIndex: number) {
    setDays((prev) => prev.map((day, i) => (i === dayIndex ? { ...day, exercises: [...day.exercises, createEmptyExercise()] } : day)));
  }
  function removeExerciseFromDay(dayIndex: number, exerciseIndex: number) {
    setDays((prev) =>
      prev.map((day, i) => {
        if (i !== dayIndex || day.exercises.length <= 1) return day;
        return { ...day, exercises: day.exercises.filter((_, j) => j !== exerciseIndex) };
      })
    );
  }
  function moveExerciseInDay(dayIndex: number, exerciseIndex: number, direction: -1 | 1) {
    setDays((prev) =>
      prev.map((day, i) => {
        if (i !== dayIndex) return day;
        const targetIndex = exerciseIndex + direction;
        if (targetIndex < 0 || targetIndex >= day.exercises.length) return day;
        const exercises = [...day.exercises];
        [exercises[exerciseIndex], exercises[targetIndex]] = [exercises[targetIndex], exercises[exerciseIndex]];
        return { ...day, exercises };
      })
    );
  }
  function handleExerciseSelected(exercise: Exercise) {
    if (!pickerTarget) return;
    updateExercise(pickerTarget.dayIndex, pickerTarget.exerciseIndex, { exerciseId: exercise.id, exerciseName: exercise.name, exerciseInfo: exercise.info });
    setPickerTarget(null);
  }
  function handleExerciseCreated(exercise: Exercise) {
    setCatalog((prev) => [...prev, exercise].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function handleSave() {
    if (!routine) return;
    const semana = routine.semanas[weekIndex];

    interface PendingRow {
      exercise_id: string;
      nombre_snapshot: string;
      info_snapshot: string;
      serie: number;
      repe: number;
      repe_max: number | null;
      nota: string;
      es_medible: boolean;
      mismo_peso: boolean;
      orden: number;
    }
    const pending: { dayId: string; keepIds: Set<string>; updates: (PendingRow & { id: string })[]; inserts: PendingRow[] }[] = [];
    let validationError = "";

    days.forEach((day, dayIndex) => {
      const keepIds = new Set<string>();
      const updates: (PendingRow & { id: string })[] = [];
      const inserts: PendingRow[] = [];
      const label = dayDisplayLabel(day.diaSemana, day.nombre);

      day.exercises.forEach((exc, orden) => {
        if (validationError) return;
        const ubicacion = `${label}, ejercicio ${orden + 1}`;
        if (!exc.exerciseId || !exc.exerciseName || exc.exerciseInfo === null) {
          validationError = `Te falta elegir un ejercicio (${ubicacion}). Tocá "Elegir ejercicio" para buscarlo en el catálogo.`;
          return;
        }
        const serie = parseInt(exc.serie, 10);
        if (!serie || serie < 1 || serie > 10) {
          validationError = `Revisá las series en ${ubicacion}: tienen que ser un número entre 1 y 10.`;
          return;
        }
        const repe = parseInt(exc.repe, 10);
        if (!repe || repe < 1 || repe > 30) {
          validationError = `Revisá las repeticiones en ${ubicacion}: tienen que ser un número entre 1 y 30.`;
          return;
        }
        const repeMax = exc.repeMax ? parseInt(exc.repeMax, 10) : null;
        if (repeMax !== null && (repeMax < 1 || repeMax > 30 || repeMax < repe)) {
          validationError = `Revisá el "hasta" en ${ubicacion}: tiene que ser mayor o igual a las repeticiones y como máximo 30.`;
          return;
        }
        if (exc.nota.length > 140) {
          validationError = `La nota en ${ubicacion} es muy larga: dejala en 140 caracteres o menos.`;
          return;
        }

        const row: PendingRow = {
          exercise_id: exc.exerciseId,
          nombre_snapshot: exc.exerciseName,
          info_snapshot: exc.exerciseInfo,
          serie,
          repe,
          repe_max: repeMax,
          nota: exc.nota.trim(),
          es_medible: !exc.sinPeso,
          mismo_peso: exc.mismoPeso,
          orden,
        };
        if (exc.existingId) {
          keepIds.add(exc.existingId);
          updates.push({ id: exc.existingId, ...row });
        } else {
          inserts.push(row);
        }
      });

      if (!validationError && day.exercises.length === 0) validationError = `Agregá al menos un ejercicio en ${label}.`;
      pending.push({ dayId: day.dayId, keepIds, updates, inserts });
    });

    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setSaving(true);
    try {
      for (let i = 0; i < pending.length; i++) {
        const { dayId, keepIds, updates, inserts } = pending[i];
        const original = semana.dias[i];
        const toDelete = original.ejercicios.filter((e) => !keepIds.has(e.id));
        await Promise.all([...updates.map((u) => updateRoutineExercise(u.id, u)), ...inserts.map((row) => addRoutineExercise(dayId, row)), ...toDelete.map((e) => deleteRoutineExercise(e.id))]);
      }
      setSaving(false);
      setSaved(true);
      setTimeout(() => router.back(), 1600);
    } catch {
      setSaving(false);
      setError("No se pudo actualizar la rutina. Probá de nuevo.");
    }
  }

  if (loading) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Cargando..." onBack={() => router.back()} avatarUrl={avatarUrl} />
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.accent2} />
        </View>
      </View>
    );
  }

  if (!routine) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Rutina" onBack={() => router.back()} avatarUrl={avatarUrl} />
        <View style={styles.centerWrap}>
          <Text style={styles.emptyTitle}>No se encontró esta rutina.</Text>
        </View>
      </View>
    );
  }

  if (!canEdit) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title={routine.nombre} onBack={() => router.back()} avatarUrl={avatarUrl} />
        <View style={styles.centerWrap}>
          <Text style={styles.emptyTitle}>No podés modificar esta rutina</Text>
          <Text style={styles.emptyBody}>Esta rutina te la asignó tu entrenador y es privada: solo la podés entrenar y mirar.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title={routine.nombre} onBack={() => router.back()} avatarUrl={avatarUrl} />

      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
        <Text style={styles.subtitle}>Elegí la semana, agregá o quitá ejercicios y editá series, repeticiones o notas de cada día.</Text>

        <View style={styles.weekChipsRow}>
          {routine.semanas.map((s, i) => (
            <Pressable key={s.id} style={[styles.weekChip, i === weekIndex && styles.weekChipActive]} onPress={() => handleChangeWeek(i)}>
              <Text style={[styles.weekChipText, i === weekIndex && styles.weekChipTextActive]}>Semana {s.numero}</Text>
            </Pressable>
          ))}
        </View>

        <AlertMessage message={error} />

        {days.map((day, dayIndex) => (
          <View key={day.dayId} style={styles.dayCard}>
            <Text style={styles.dayTitle}>{dayDisplayLabel(day.diaSemana, day.nombre)}</Text>

            {day.exercises.map((exercise, exerciseIndex) => (
              <ExerciseBlock
                key={exercise.key}
                exercise={exercise}
                index={exerciseIndex}
                total={day.exercises.length}
                onChange={(patch) => updateExercise(dayIndex, exerciseIndex, patch)}
                onPickExercise={() => setPickerTarget({ dayIndex, exerciseIndex })}
                onRemove={() => removeExerciseFromDay(dayIndex, exerciseIndex)}
                onMoveUp={() => moveExerciseInDay(dayIndex, exerciseIndex, -1)}
                onMoveDown={() => moveExerciseInDay(dayIndex, exerciseIndex, 1)}
              />
            ))}

            <Pressable style={styles.addBtn} onPress={() => addExerciseToDay(dayIndex)}>
              <Text style={styles.addBtnText}>+ Agregar ejercicio</Text>
            </Pressable>
          </View>
        ))}

        <PrimaryButton title="Guardar cambios" onPress={handleSave} loading={saving} />
      </ScrollView>

      {userId && (
        <ExercisePickerModal
          visible={pickerTarget !== null}
          catalog={catalog}
          userId={userId}
          avatarUrl={avatarUrl}
          onSelect={handleExerciseSelected}
          onClose={() => setPickerTarget(null)}
          onExerciseCreated={handleExerciseCreated}
        />
      )}

      {saved && <AuthOverlay state={{ kind: "success", text: "¡Rutina actualizada con éxito!" }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "700", textAlign: "center" },
  emptyBody: { color: colors.textMuted, fontSize: 13.5, textAlign: "center", lineHeight: 19 },
  scroll: { padding: 16, paddingBottom: 48, gap: 14 },
  subtitle: { color: colors.textMuted, fontSize: 13.5, lineHeight: 19 },
  weekChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  weekChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  weekChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent2 },
  weekChipText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700" },
  weekChipTextActive: { color: colors.accent2 },
  dayCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 18, gap: 4 },
  dayTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 4 },
  addBtn: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.input, paddingVertical: 12, alignItems: "center", marginTop: 14 },
  addBtnText: { color: colors.textMuted, fontWeight: "700", fontSize: 13.5 },
});
