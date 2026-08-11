import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AlertMessage } from "@/components/AlertMessage";
import { AuthOverlay } from "@/components/AuthOverlay";
import { FormField } from "@/components/FormField";
import { OutlineButton } from "@/components/OutlineButton";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ActionMenu, type ActionMenuItem } from "@/components/ActionMenu";
import { ScreenHeader } from "@/components/ScreenHeader";
import { diaLabel, DIA_LABELS } from "@/lib/dias";
import { type Exercise, listExercises } from "@/lib/exerciseService";
import { getProfile, listRoutines, type Profile, type RoutineWithCounts } from "@/lib/profileService";
import { cloneRoutineForUser, createRoutine, type NewDayInput } from "@/lib/routineService";
import { supabase } from "@/lib/supabaseClient";
import { colors, radius } from "@/theme/colors";

import { BuilderHelpModal } from "./BuilderHelpModal";
import { DayCard } from "./DayCard";
import { ExercisePickerModal } from "./ExercisePickerModal";
import { createEmptyExercise, type DayFormState, type ExerciseFormState } from "./types";

type Step = "chooser" | "setup" | "builder";

type SavePhase =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "ask-activate" }
  | { kind: "activating" }
  | { kind: "success"; message: string };

export function NewRoutineScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [catalog, setCatalog] = useState<Exercise[]>([]);

  const [step, setStep] = useState<Step>("chooser");

  const [name, setName] = useState("");
  const [weeksInput, setWeeksInput] = useState("");
  const [daysInput, setDaysInput] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [setupError, setSetupError] = useState("");

  const [weeks, setWeeks] = useState(0);
  const [days, setDays] = useState<DayFormState[]>([]);
  const [builderError, setBuilderError] = useState("");
  const [helpVisible, setHelpVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{ dayIndex: number; exerciseIndex: number } | null>(null);

  const [savePhase, setSavePhase] = useState<SavePhase>({ kind: "idle" });
  const [ownRoutinesOpen, setOwnRoutinesOpen] = useState(false);
  const [ownRoutines, setOwnRoutines] = useState<RoutineWithCounts[]>([]);
  const [cloningBase, setCloningBase] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id;
      if (!uid) return;
      setUserId(uid);
      const [profileData, exercises] = await Promise.all([getProfile(uid), listExercises()]);
      setProfile(profileData);
      setCatalog(exercises);
    });
  }, []);

  function handleStartFromScratch() {
    setStep("setup");
  }

  async function handleBrowseRoutines() {
    if (!userId) return;
    const [active, historic, saved] = await Promise.all([
      listRoutines(userId, "active").catch(() => []),
      listRoutines(userId, "historic").catch(() => []),
      listRoutines(userId, "saved").catch(() => []),
    ]);
    setOwnRoutines([...active, ...historic, ...saved]);
    setOwnRoutinesOpen(true);
  }

  async function handleUseAsBase(routineId: string) {
    if (!userId || !profile) return;
    setOwnRoutinesOpen(false);
    setCloningBase(true);
    const isTemplate = profile.user_type === "usuario" || profile.user_type === "entrenador" || profile.user_type === "admin";
    const { error } = await cloneRoutineForUser(routineId, userId, { isTemplate });
    setCloningBase(false);
    if (error) {
      Alert.alert("No se pudo crear la rutina", error);
      return;
    }
    setSavePhase({ kind: "success", message: isTemplate ? "¡Rutina guardada con éxito! Espere, será redirigido." : "¡Rutina creada con éxito! Espere, será redirigido." });
    setTimeout(() => router.replace("/"), 1800);
  }

  function handleSetupSubmit() {
    const cleanName = name.trim();
    const weeksNum = parseInt(weeksInput, 10);
    const daysNum = parseInt(daysInput, 10);

    if (cleanName.length < 2) {
      setSetupError("Ingresá un nombre para la rutina.");
      return;
    }
    if (!weeksNum || weeksNum < 1 || weeksNum > 10) {
      setSetupError("La cantidad de semanas tiene que ser entre 1 y 10.");
      return;
    }
    if (!daysNum || daysNum < 1 || daysNum > 7) {
      setSetupError("La cantidad de días tiene que ser entre 1 y 7.");
      return;
    }

    setSetupError("");
    setWeeks(weeksNum);
    setDays(
      Array.from({ length: daysNum }, (_, i) => ({
        diaSemana: (i % 7) + 1,
        nombre: DIA_LABELS[i % 7],
        exercises: [createEmptyExercise()],
      }))
    );
    setStep("builder");
  }

  function updateDay(dayIndex: number, patch: Partial<DayFormState>) {
    setDays((prev) => prev.map((day, i) => (i === dayIndex ? { ...day, ...patch } : day)));
  }

  function updateExercise(dayIndex: number, exerciseIndex: number, patch: Partial<ExerciseFormState>) {
    setDays((prev) =>
      prev.map((day, i) =>
        i === dayIndex ? { ...day, exercises: day.exercises.map((exc, j) => (j === exerciseIndex ? { ...exc, ...patch } : exc)) } : day
      )
    );
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
    updateExercise(pickerTarget.dayIndex, pickerTarget.exerciseIndex, {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      exerciseInfo: exercise.info,
    });
    setPickerTarget(null);
  }

  function handleExerciseCreated(exercise: Exercise) {
    setCatalog((prev) => [...prev, exercise].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function handleSubmitRoutine() {
    let error = "";
    const diasArray: NewDayInput[] = [];

    for (const day of days) {
      const diaSemanaLabel = day.nombre.trim() || diaLabel(day.diaSemana);
      const ejercicios: NewDayInput["ejercicios"] = [];

      for (let orden = 0; orden < day.exercises.length; orden++) {
        const exc = day.exercises[orden];
        const ubicacion = `${diaSemanaLabel}, ejercicio ${orden + 1}`;

        if (!exc.exerciseId || !exc.exerciseName || exc.exerciseInfo === null) {
          error = `Te falta elegir un ejercicio (${ubicacion}). Tocá "Elegir ejercicio" para buscarlo en el catálogo.`;
          break;
        }
        const serie = parseInt(exc.serie, 10);
        if (!serie || serie < 1 || serie > 10) {
          error = `Revisá las series en ${ubicacion}: tienen que ser un número entre 1 y 10.`;
          break;
        }
        const repe = parseInt(exc.repe, 10);
        if (!repe || repe < 1 || repe > 30) {
          error = `Revisá las repeticiones en ${ubicacion}: tienen que ser un número entre 1 y 30.`;
          break;
        }
        const repeMax = exc.repeMax ? parseInt(exc.repeMax, 10) : null;
        if (repeMax !== null && (repeMax < 1 || repeMax > 30 || repeMax < repe)) {
          error = `Revisá el "hasta" en ${ubicacion}: tiene que ser mayor o igual a las repeticiones y como máximo 30.`;
          break;
        }
        if (exc.nota.length > 140) {
          error = `La nota en ${ubicacion} es muy larga: dejala en 140 caracteres o menos.`;
          break;
        }

        ejercicios.push({
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
        });
      }

      if (error) break;
      if (ejercicios.length === 0) {
        error = `Agregá al menos un ejercicio en ${diaSemanaLabel}.`;
        break;
      }
      diasArray.push({ dia_semana: day.diaSemana, nombre: day.nombre.trim() || null, ejercicios });
    }

    if (error) {
      setBuilderError(error);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    setBuilderError("");
    await createAndFinish(diasArray);
  }

  async function createAndFinish(dias: NewDayInput[]) {
    if (!userId || !profile) return;
    setSavePhase({ kind: "creating" });

    const isTemplate = profile.user_type === "usuario" || profile.user_type === "entrenador" || profile.user_type === "admin";
    const { error: createError } = await createRoutine(userId, name.trim(), weeks, dias, isPublic, isTemplate);

    if (createError) {
      setSavePhase({ kind: "idle" });
      setBuilderError(createError);
      return;
    }

    if (isTemplate) {
      setSavePhase({ kind: "ask-activate" });
      return;
    }

    finishWithSuccess("¡Rutina creada con éxito! Espere, será redirigido.");

    async function finishWithSuccess(message: string) {
      setSavePhase({ kind: "success", message });
      setTimeout(() => router.replace("/"), 1800);
    }
  }

  async function handleSkipActivate() {
    setSavePhase({ kind: "success", message: "¡Rutina guardada con éxito! Espere, será redirigido." });
    setTimeout(() => router.replace("/"), 1800);
  }

  async function handleActivateNow() {
    if (!userId) return;
    setSavePhase({ kind: "activating" });

    let error = "";
    const diasArray: NewDayInput[] = [];
    for (const day of days) {
      const ejercicios: NewDayInput["ejercicios"] = day.exercises.map((exc, orden) => ({
        exercise_id: exc.exerciseId!,
        nombre_snapshot: exc.exerciseName!,
        info_snapshot: exc.exerciseInfo!,
        serie: parseInt(exc.serie, 10),
        repe: parseInt(exc.repe, 10),
        repe_max: exc.repeMax ? parseInt(exc.repeMax, 10) : null,
        nota: exc.nota.trim(),
        es_medible: !exc.sinPeso,
        mismo_peso: exc.mismoPeso,
        orden,
      }));
      diasArray.push({ dia_semana: day.diaSemana, nombre: day.nombre.trim() || null, ejercicios });
    }

    const { error: activateError } = await createRoutine(userId, name.trim(), weeks, diasArray, isPublic, false);
    if (activateError) error = activateError;

    if (error) {
      setSavePhase({ kind: "success", message: "La rutina quedó guardada, pero no se pudo activar. Podés activarla luego desde Guardadas." });
    } else {
      setSavePhase({ kind: "success", message: "¡Rutina activada con éxito! Espere, será redirigido." });
    }
    setTimeout(() => router.replace("/"), 1800);
  }

  if (!profile) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.accent2} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenHeader
        title="Nueva rutina"
        onBack={() => (step === "chooser" ? router.back() : setStep(step === "builder" ? "setup" : "chooser"))}
        avatarUrl={profile.avatar_url}
      />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {step === "chooser" && (
          <View style={styles.section}>
            <Text style={styles.eyebrow}>NUEVA RUTINA</Text>
            <Text style={styles.title}>¿Cómo querés armarla?</Text>
            <Text style={styles.subtitle}>Podés empezar de cero o elegir una rutina ya armada como base.</Text>

            <Pressable style={styles.chooserCard} onPress={handleStartFromScratch}>
              <View style={styles.chooserIcon}>
                <Ionicons name="create-outline" size={22} color={colors.accent2} />
              </View>
              <Text style={styles.chooserCardTitle}>Empezar desde cero</Text>
              <Text style={styles.chooserCardSubtitle}>Elegís vos cada ejercicio, serie y repetición</Text>
            </Pressable>

            <Pressable style={styles.chooserCard} onPress={handleBrowseRoutines}>
              <View style={styles.chooserIcon}>
                <Ionicons name="list-outline" size={22} color={colors.accent2} />
              </View>
              <Text style={styles.chooserCardTitle}>Usar una rutina tuya como base</Text>
              <Text style={styles.chooserCardSubtitle}>Elegí entre tus rutinas activas, históricas o guardadas</Text>
            </Pressable>
          </View>
        )}

        {step === "setup" && (
          <View style={styles.card}>
            <Text style={styles.eyebrow}>NUEVA RUTINA</Text>
            <Text style={styles.title}>Creá tu rutina</Text>
            <Text style={styles.subtitle}>Elegí el nombre y cuántas semanas y días vas a entrenar. Después cargás los ejercicios de cada día.</Text>

            <AlertMessage message={setupError} />

            <FormField label="Nombre de la rutina" placeholder="Ej: Full body" value={name} onChangeText={setName} />
            <View style={styles.row}>
              <View style={styles.rowField}>
                <FormField label="Semanas" placeholder="Ej: 4" keyboardType="number-pad" value={weeksInput} onChangeText={setWeeksInput} />
              </View>
              <View style={styles.rowField}>
                <FormField label="Días por semana" placeholder="Ej: 3" keyboardType="number-pad" value={daysInput} onChangeText={setDaysInput} />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Visibilidad de la rutina</Text>
              <View style={styles.visibilityRow}>
                <Pressable style={[styles.visibilityOption, !isPublic && styles.visibilityOptionActive]} onPress={() => setIsPublic(false)}>
                  <Text style={[styles.visibilityText, !isPublic && styles.visibilityTextActive]}>Privada</Text>
                </Pressable>
                <Pressable style={[styles.visibilityOption, isPublic && styles.visibilityOptionActive]} onPress={() => setIsPublic(true)}>
                  <Text style={[styles.visibilityText, isPublic && styles.visibilityTextActive]}>Pública</Text>
                </Pressable>
              </View>
            </View>

            <PrimaryButton title="Continuar" onPress={handleSetupSubmit} />
          </View>
        )}

        {step === "builder" && (
          <View style={styles.section}>
            <Text style={styles.eyebrow}>{name.toUpperCase()}</Text>
            <Text style={styles.title}>Cargá los ejercicios de cada día</Text>
            <View style={styles.builderSubtitleRow}>
              <Text style={styles.subtitle}>
                Se van a repetir en las {weeks} semana{weeks > 1 ? "s" : ""} de la rutina.{" "}
              </Text>
              <Text style={styles.helpLink} onPress={() => setHelpVisible(true)}>
                ¿Cómo cargo esto?
              </Text>
            </View>

            <AlertMessage message={builderError} />

            {days.map((day, dayIndex) => (
              <DayCard
                key={dayIndex}
                day={day}
                onChangeName={(value) => updateDay(dayIndex, { nombre: value })}
                onAddExercise={() => addExerciseToDay(dayIndex)}
                onChangeExercise={(exerciseIndex, patch) => updateExercise(dayIndex, exerciseIndex, patch)}
                onPickExercise={(exerciseIndex) => setPickerTarget({ dayIndex, exerciseIndex })}
                onRemoveExercise={(exerciseIndex) => removeExerciseFromDay(dayIndex, exerciseIndex)}
                onMoveExercise={(exerciseIndex, direction) => moveExerciseInDay(dayIndex, exerciseIndex, direction)}
              />
            ))}

            <PrimaryButton title="Crear rutina" onPress={handleSubmitRoutine} />
          </View>
        )}
      </ScrollView>

      {userId && (
        <ExercisePickerModal
          visible={pickerTarget !== null}
          catalog={catalog}
          userId={userId}
          avatarUrl={profile.avatar_url}
          onSelect={handleExerciseSelected}
          onClose={() => setPickerTarget(null)}
          onExerciseCreated={handleExerciseCreated}
        />
      )}
      <BuilderHelpModal visible={helpVisible} onClose={() => setHelpVisible(false)} />

      {savePhase.kind === "ask-activate" && (
        <View style={styles.backdrop}>
          <View style={styles.askCard}>
            <Text style={styles.askTitle}>¡Rutina guardada!</Text>
            <Text style={styles.askSubtitle}>Quedó en Guardadas. ¿Querés activarla ahora para empezar a entrenar?</Text>
            <View style={styles.askActions}>
              <PrimaryButton title="Activar ahora" onPress={handleActivateNow} />
              <OutlineButton title="Ahora no" onPress={handleSkipActivate} />
            </View>
          </View>
        </View>
      )}

      {(savePhase.kind === "creating" || savePhase.kind === "activating") && (
        <AuthOverlay state={{ kind: "loading", text: savePhase.kind === "creating" ? "Creando rutina..." : "Activando rutina..." }} />
      )}
      {savePhase.kind === "success" && <AuthOverlay state={{ kind: "success", text: savePhase.message }} />}

      <ActionMenu
        visible={ownRoutinesOpen}
        onClose={() => setOwnRoutinesOpen(false)}
        items={
          ownRoutines.length === 0
            ? ([{ label: "Todavía no tenés rutinas propias", onPress: () => {} }] as ActionMenuItem[])
            : ownRoutines.map((r) => ({ label: r.nombre, onPress: () => handleUseAsBase(r.id) }))
        }
      />
      {cloningBase && <AuthOverlay state={{ kind: "loading", text: "Creando rutina..." }} />}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 48, gap: 20 },
  section: { gap: 14 },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: colors.accent2,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
    overflow: "hidden",
  },
  title: { color: colors.text, fontSize: 23, fontWeight: "700" },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  chooserCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 18,
    gap: 6,
  },
  chooserIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  chooserCardTitle: { color: colors.text, fontSize: 15.5, fontWeight: "700" },
  chooserCardSubtitle: { color: colors.textMuted, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 24,
    gap: 4,
  },
  row: { flexDirection: "row", gap: 12 },
  rowField: { flex: 1 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
  visibilityRow: { flexDirection: "row", gap: 10 },
  visibilityOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
  },
  visibilityOptionActive: { borderColor: colors.accent2, backgroundColor: colors.accentSoft },
  visibilityText: { color: colors.textMuted, fontWeight: "700", fontSize: 14 },
  visibilityTextActive: { color: colors.accent2 },
  builderSubtitleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: -8 },
  helpLink: { color: colors.accent2, fontWeight: "700", fontSize: 13.5 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 12, 15, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 1001,
  },
  askCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 24,
    gap: 16,
  },
  askTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  askSubtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  askActions: { gap: 10 },
});
