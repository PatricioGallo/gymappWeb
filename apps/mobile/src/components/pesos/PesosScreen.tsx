import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ActionMenu, type ActionMenuItem } from "@/components/ActionMenu";
import { AuthOverlay } from "@/components/AuthOverlay";
import { PrimaryButton } from "@/components/PrimaryButton";
import { OutlineButton } from "@/components/OutlineButton";
import { ReportErrorModal } from "@/components/profile/ReportErrorModal";
import { RingProgress } from "@/components/RingProgress";
import { ScreenHeader } from "@/components/ScreenHeader";
import { deleteExerciseComment, getTodayComments, upsertExerciseComment, MAX_COMMENT_LENGTH, type ExerciseComment } from "@/lib/commentService";
import { dayDisplayLabel } from "@/lib/dias";
import { getProfile, getProfileBasicById } from "@/lib/profileService";
import { formatRepe } from "@/lib/reps";
import { getRoutineDetail, type RoutineDetail, type RoutineDetailDay, type RoutineExerciseWithAuthor } from "@/lib/routineService";
import { supabase } from "@/lib/supabaseClient";
import {
  deleteTodayWeightLog,
  getExerciseHistory,
  getLatestWeights,
  insertWeightLogs,
  type LatestWeightEntry,
  type LatestWeightsMap,
  type WeightUnit,
} from "@/lib/weightLogService";
import { colors, radius } from "@/theme/colors";

const UNIT_LABELS: Record<WeightUnit, string> = { kg: "Kg", lb: "Lb", bloques: "Bloques" };
const UNITS: WeightUnit[] = ["kg", "lb", "bloques"];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const TODAY = todayISO();

function previousValuesText(entries: LatestWeightEntry[] | undefined): string {
  if (!entries || entries.length === 0) return "sin registro";
  return entries.map((e) => `${e.peso} ${UNIT_LABELS[e.unidad]}${e.repe ? ` x ${e.repe} reps` : ""}`).join(" · ");
}
function todayEntry(entries: LatestWeightEntry[] | undefined): LatestWeightEntry | null {
  return entries?.find((e) => e.fecha === TODAY) ?? null;
}
function defaultUnit(entries: LatestWeightEntry[] | undefined): WeightUnit {
  return entries && entries.length > 0 ? entries[0].unidad : "kg";
}
function exerciseDefaultUnit(bySerie: Map<number, LatestWeightEntry[]> | undefined, serieCount: number): WeightUnit {
  let best: LatestWeightEntry | null = null;
  for (let i = 1; i <= serieCount; i++) {
    const top = bySerie?.get(i)?.[0];
    if (top && (!best || top.fecha > best.fecha)) best = top;
  }
  return best ? best.unidad : "kg";
}

function isExerciseDone(e: { id: string; serie: number; mismo_peso: boolean }, latestWeights: LatestWeightsMap): boolean {
  const bySerie = latestWeights.get(e.id);
  if (!bySerie) return false;
  const requiredSeries = e.mismo_peso ? 1 : e.serie;
  for (let i = 1; i <= requiredSeries; i++) {
    if (!bySerie.get(i)?.length) return false;
  }
  return true;
}
function dayProgress(dia: RoutineDetailDay, latestWeights: LatestWeightsMap): number {
  const trackable = dia.ejercicios.filter((e) => e.es_medible);
  if (trackable.length === 0) return 100;
  const done = trackable.filter((e) => isExerciseDone(e, latestWeights)).length;
  return Math.round((done / trackable.length) * 100);
}
function weekProgress(semana: RoutineDetail["semanas"][number], latestWeights: LatestWeightsMap): number {
  let total = 0;
  let done = 0;
  semana.dias.forEach((dia) =>
    dia.ejercicios.forEach((e) => {
      total++;
      if (isExerciseDone(e, latestWeights)) done++;
    })
  );
  return total === 0 ? 0 : Math.round((done / total) * 100);
}
function routineProgress(routine: RoutineDetail, latestWeights: LatestWeightsMap): number {
  let total = 0;
  let done = 0;
  routine.semanas.forEach((s) =>
    s.dias.forEach((dia) =>
      dia.ejercicios.forEach((e) => {
        total++;
        if (isExerciseDone(e, latestWeights)) done++;
      })
    )
  );
  return total === 0 ? 0 : Math.round((done / total) * 100);
}
function currentWeekIndex(routine: RoutineDetail, latestWeights: LatestWeightsMap): number {
  let found = -1;
  routine.semanas.forEach((semana, index) =>
    semana.dias.forEach((dia) =>
      dia.ejercicios.forEach((e) => {
        if (isExerciseDone(e, latestWeights)) found = index;
      })
    )
  );
  return found === -1 ? 0 : found;
}

type RowKey = string;
function rowKey(exerciseId: string, serie: number): RowKey {
  return `${exerciseId}:${serie}`;
}

interface RowInputs {
  units: Map<string, WeightUnit>;
  values: Map<RowKey, { peso: string; repe: string }>;
}

function buildDayInputs(dia: RoutineDetailDay, latestWeights: LatestWeightsMap, exerciseHistory: LatestWeightsMap): RowInputs {
  const units = new Map<string, WeightUnit>();
  const values = new Map<RowKey, { peso: string; repe: string }>();
  dia.ejercicios
    .filter((e) => e.es_medible)
    .forEach((exc) => {
      const last = latestWeights.get(exc.id);
      const history = exerciseHistory.get(exc.exercise_id);
      units.set(exc.id, exc.mismo_peso ? defaultUnit(history?.get(1)) : exerciseDefaultUnit(history, exc.serie));
      const rows = exc.mismo_peso ? [1] : Array.from({ length: exc.serie }, (_, i) => i + 1);
      rows.forEach((serie) => {
        const today = todayEntry(last?.get(serie));
        const repeValue = today ? (today.repe ?? exc.repe) : exc.repe;
        values.set(rowKey(exc.id, serie), { peso: today ? String(today.peso) : "", repe: repeValue ? String(repeValue) : "" });
      });
    });
  return { units, values };
}

export function PesosScreen({ routineId, uid }: { routineId: string; uid?: string }) {
  const router = useRouter();
  const [viewerAvatarUrl, setViewerAvatarUrl] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [routine, setRoutine] = useState<RoutineDetail | null>(null);
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [targetName, setTargetName] = useState<string | null>(null);
  const [latestWeights, setLatestWeights] = useState<LatestWeightsMap>(new Map());
  const [exerciseHistory, setExerciseHistory] = useState<LatestWeightsMap>(new Map());
  const [todayComments, setTodayComments] = useState<Map<string, ExerciseComment>>(new Map());

  const [weekIndex, setWeekIndex] = useState(0);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [inputs, setInputs] = useState<RowInputs>({ units: new Map(), values: new Map() });
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [menuFor, setMenuFor] = useState<RoutineExerciseWithAuthor | null>(null);
  const [commentFor, setCommentFor] = useState<RoutineExerciseWithAuthor | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [deleteConfirmFor, setDeleteConfirmFor] = useState<RoutineExerciseWithAuthor | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const isTrainingForOther = Boolean(uid);

  const load = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const myId = session?.user.id ?? "";
    const target = uid ?? myId;
    setViewerId(myId);
    setTargetUserId(target);
    getProfile(myId).then((p) => setViewerAvatarUrl(p?.avatar_url ?? null));
    if (uid) {
      const basic = await getProfileBasicById(uid).catch(() => null);
      setTargetName(basic?.nombre ?? null);
    }

    const detail = await getRoutineDetail(routineId);
    setRoutine(detail);
    if (!detail) {
      setLoading(false);
      return;
    }

    const allExerciseIds = detail.semanas.flatMap((s) => s.dias.flatMap((d) => d.ejercicios.map((e) => e.id)));
    const allCatalogIds = [...new Set(detail.semanas.flatMap((s) => s.dias.flatMap((d) => d.ejercicios.map((e) => e.exercise_id))))];
    const [lw, eh, tc] = await Promise.all([getLatestWeights(allExerciseIds), getExerciseHistory(allCatalogIds), getTodayComments(allExerciseIds, TODAY)]);
    setLatestWeights(lw);
    setExerciseHistory(eh);
    setTodayComments(tc);
    setWeekIndex(currentWeekIndex(detail, lw));
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [routineId, uid]);

  function handleOpenDay(diaIndex: number) {
    if (!routine) return;
    const dia = routine.semanas[weekIndex].dias[diaIndex];
    setInputs(buildDayInputs(dia, latestWeights, exerciseHistory));
    setSaveError("");
    setOpenDay(diaIndex);
  }

  function handleBackToWeek() {
    setOpenDay(null);
  }

  function setUnit(exerciseId: string, unit: WeightUnit) {
    setInputs((prev) => ({ ...prev, units: new Map(prev.units).set(exerciseId, unit) }));
  }
  function setValue(key: RowKey, patch: Partial<{ peso: string; repe: string }>) {
    setInputs((prev) => {
      const values = new Map(prev.values);
      values.set(key, { ...(values.get(key) ?? { peso: "", repe: "" }), ...patch });
      return { ...prev, values };
    });
  }

  async function refreshWeights() {
    if (!routine) return;
    const allExerciseIds = routine.semanas.flatMap((s) => s.dias.flatMap((d) => d.ejercicios.map((e) => e.id)));
    const allCatalogIds = [...new Set(routine.semanas.flatMap((s) => s.dias.flatMap((d) => d.ejercicios.map((e) => e.exercise_id))))];
    const [lw, eh] = await Promise.all([getLatestWeights(allExerciseIds), getExerciseHistory(allCatalogIds)]);
    setLatestWeights(lw);
    setExerciseHistory(eh);
    return lw;
  }

  async function handleSave() {
    if (!routine || openDay === null) return;
    const dia = routine.semanas[weekIndex].dias[openDay];
    const trackable = dia.ejercicios.filter((e) => e.es_medible);

    setSaveError("");
    const entries: { routine_exercise_id: string; exercise_id: string; fecha: string; peso: number; serie: number; repe: number; unidad: WeightUnit }[] = [];
    let invalid = false;

    trackable.forEach((exc) => {
      const rows = exc.mismo_peso ? [1] : Array.from({ length: exc.serie }, (_, i) => i + 1);
      const unit = inputs.units.get(exc.id) ?? "kg";
      rows.forEach((serie) => {
        const val = inputs.values.get(rowKey(exc.id, serie));
        const pesoStr = val?.peso.trim() ?? "";
        if (pesoStr === "") return;
        const peso = Number(pesoStr);
        const repe = Number(val?.repe.trim() ?? "");
        if (Number.isNaN(peso) || peso <= 0 || Number.isNaN(repe) || repe <= 0) {
          invalid = true;
          return;
        }
        entries.push({ routine_exercise_id: exc.id, exercise_id: exc.exercise_id, fecha: TODAY, peso, serie, repe, unidad: unit });
      });
    });

    if (invalid) {
      setSaveError("Ingresá solo números mayores a 0.");
      return;
    }
    if (entries.length === 0) {
      setSaveError("Cargá al menos un peso para guardar.");
      return;
    }

    setSaving(true);
    try {
      await insertWeightLogs(targetUserId, entries);
      const lw = await refreshWeights();
      setSaving(false);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        if (lw) setInputs(buildDayInputs(dia, lw, exerciseHistory));
      }, 1300);
    } catch {
      setSaving(false);
      setSaveError("No se pudo guardar. Probá de nuevo.");
    }
  }

  async function handleConfirmDelete() {
    if (!deleteConfirmFor || !routine || openDay === null) return;
    setDeleting(true);
    try {
      await deleteTodayWeightLog(targetUserId, deleteConfirmFor.id, TODAY);
      const lw = await refreshWeights();
      setDeleting(false);
      setDeleteConfirmFor(null);
      const dia = routine.semanas[weekIndex].dias[openDay];
      if (lw) setInputs(buildDayInputs(dia, lw, exerciseHistory));
    } catch {
      setDeleting(false);
      Alert.alert("No se pudo borrar", "Probá de nuevo en unos segundos.");
    }
  }

  function openCommentModal(exc: RoutineExerciseWithAuthor) {
    setCommentText(todayComments.get(exc.id)?.comment ?? "");
    setCommentFor(exc);
  }

  async function handleSaveComment() {
    if (!commentFor) return;
    const text = commentText.trim();
    if (!text) return;
    setCommentSaving(true);
    const { error } = await upsertExerciseComment(targetUserId, commentFor.id, TODAY, text);
    setCommentSaving(false);
    if (error) {
      Alert.alert("No se pudo guardar", error);
      return;
    }
    const tc = await getTodayComments(
      routine!.semanas.flatMap((s) => s.dias.flatMap((d) => d.ejercicios.map((e) => e.id))),
      TODAY
    );
    setTodayComments(tc);
    setCommentFor(null);
  }

  async function handleDeleteComment() {
    if (!commentFor) return;
    const existing = todayComments.get(commentFor.id);
    if (!existing) return;
    const { error } = await deleteExerciseComment(existing.id);
    if (error) {
      Alert.alert("No se pudo borrar", error);
      return;
    }
    const tc = await getTodayComments(
      routine!.semanas.flatMap((s) => s.dias.flatMap((d) => d.ejercicios.map((e) => e.id))),
      TODAY
    );
    setTodayComments(tc);
    setCommentFor(null);
  }

  function goToStudents() {
    // La ruta /students la esta armando otro agente en paralelo; el push queda
    // listo y funcionara apenas ese archivo de ruta exista.
    router.push("/students" as never);
  }

  if (loading) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Cargando..." onBack={() => router.back()} avatarUrl={viewerAvatarUrl} />
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
          <Text style={styles.emptyTitle}>No se encontró esta rutina.</Text>
        </View>
      </View>
    );
  }

  const semana = routine.semanas[weekIndex];
  const menuItems: ActionMenuItem[] = menuFor
    ? [
        { label: todayComments.has(menuFor.id) ? "Editar comentario" : "Agregar comentario", onPress: () => openCommentModal(menuFor) },
        ...(latestWeights.get(menuFor.id)?.get(1)?.some((e) => e.fecha === TODAY) || (!menuFor.mismo_peso && latestWeights.get(menuFor.id))
          ? [{ label: "Borrar carga actual", onPress: () => setDeleteConfirmFor(menuFor), danger: true }]
          : []),
        { label: "Reportar un error", onPress: () => setReportModalOpen(true) },
      ]
    : [];

  const weekPct = weekProgress(semana, latestWeights);
  const routinePct = routineProgress(routine, latestWeights);

  return (
    <View style={styles.flex}>
      <ScreenHeader title={routine.nombre} onBack={() => (openDay !== null ? handleBackToWeek() : router.back())} avatarUrl={viewerAvatarUrl} />

      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
        {isTrainingForOther && (
          <Pressable style={styles.studentsBackLink} onPress={goToStudents} hitSlop={6}>
            <Ionicons name="chevron-back" size={15} color={colors.accent2} />
            <Text style={styles.studentsBackLinkText}>Volver a tus alumnos</Text>
          </Pressable>
        )}

        {isTrainingForOther && targetName && (
          <View style={styles.trainerBanner}>
            <Ionicons name="person-circle-outline" size={16} color={colors.accent2} />
            <Text style={styles.trainerBannerText}>Estás cargando pesos para {targetName}.</Text>
          </View>
        )}

        {openDay === null ? (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroTop}>
                <RingProgress pct={routinePct} size={64} />
                <View style={styles.heroInfo}>
                  <Text style={styles.heroEyebrow}>Progreso de la rutina</Text>
                  <Text style={styles.heroTitle} numberOfLines={2}>
                    {routine.nombre}
                  </Text>
                  <Text style={styles.heroSub}>
                    Semana {semana.numero} de {routine.semanas.length}
                  </Text>
                </View>
              </View>
              <View style={styles.heroProgressWrap}>
                <View style={styles.heroProgressHead}>
                  <Text style={styles.heroProgressLabel}>Progreso de esta semana</Text>
                  <Text style={styles.heroProgressPct}>{weekPct}%</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${weekPct}%` }]} />
                </View>
              </View>
            </View>

            <View style={styles.weekChipsRow}>
              {routine.semanas.map((s, i) => (
                <Pressable key={s.id} style={[styles.weekChip, i === weekIndex && styles.weekChipActive]} onPress={() => setWeekIndex(i)}>
                  <Text style={[styles.weekChipText, i === weekIndex && styles.weekChipTextActive]}>Semana {s.numero}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Días de esta semana</Text>
            <View style={styles.daysList}>
              {semana.dias.map((dia, diaIndex) => {
                const pct = dayProgress(dia, latestWeights);
                const done = pct >= 100;
                const trackableCount = dia.ejercicios.filter((e) => e.es_medible).length;
                const doneCount = dia.ejercicios.filter((e) => e.es_medible && isExerciseDone(e, latestWeights)).length;
                const subtitle = trackableCount === 0 ? "Sin ejercicios con peso" : `${doneCount} de ${trackableCount} ejercicios con peso cargado`;
                return (
                  <Pressable
                    key={dia.id}
                    style={({ pressed }) => [styles.dayRow, done && styles.dayRowDone, pressed && styles.dayRowPressed]}
                    onPress={() => handleOpenDay(diaIndex)}
                  >
                    <RingProgress pct={pct} size={44} />
                    <View style={styles.dayRowInfo}>
                      <Text style={styles.dayRowTitle}>{dayDisplayLabel(dia.dia_semana, dia.nombre)}</Text>
                      <Text style={styles.dayRowSubtitle}>{subtitle}</Text>
                    </View>
                    <Text style={[styles.dayRowStatus, done && styles.dayRowStatusDone]}>{done ? "Completo" : "Pendiente"}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <Pressable style={styles.backLink} onPress={handleBackToWeek} hitSlop={6}>
              <Ionicons name="chevron-back" size={16} color={colors.accent2} />
              <Text style={styles.backLinkText}>Volver a la semana</Text>
            </Pressable>

            <Text style={styles.dayTitle}>{dayDisplayLabel(semana.dias[openDay].dia_semana, semana.dias[openDay].nombre)}</Text>
            <Pressable
              style={styles.helpLinkWrap}
              onPress={() =>
                Alert.alert(
                  "¿Cómo cargo los pesos?",
                  "Peso: lo que levantaste en esa serie, con la unidad que elijas (Kg, Lb o Bloques).\n\nReps: cuántas repeticiones hiciste. Viene precargado con lo sugerido por la rutina.\n\nAnterior: el último peso y reps que registraste, para comparar tu progreso.\n\nGuardar: guarda todas las series completadas. Podés dejar series vacías y cargarlas después."
                )
              }
            >
              <Text style={styles.helpLinkText}>
                {routine.nombre} · Semana {semana.numero}
              </Text>
              <View style={styles.helpLinkBadge}>
                <Ionicons name="help-circle-outline" size={13} color={colors.accent2} />
                <Text style={styles.helpLinkBadgeText}>¿Cómo cargo esto?</Text>
              </View>
            </Pressable>

            {semana.dias[openDay].ejercicios
              .filter((e) => e.es_medible)
              .map((exc) => {
                const last = latestWeights.get(exc.id);
                const history = exerciseHistory.get(exc.exercise_id);
                const unit = inputs.units.get(exc.id) ?? "kg";
                const rows = exc.mismo_peso ? [{ serie: 1, title: "Peso de hoy" }] : Array.from({ length: exc.serie }, (_, i) => ({ serie: i + 1, title: `Serie ${i + 1}` }));
                const exerciseDone = isExerciseDone(exc, latestWeights);

                return (
                  <View key={exc.id} style={[styles.excCard, exerciseDone && styles.excCardDone]}>
                    <View style={styles.excHead}>
                      <View style={styles.excHeadLeft}>
                        <View style={styles.excNameRow}>
                          {exerciseDone && <Ionicons name="checkmark-circle" size={16} color={colors.live} style={styles.excDoneIcon} />}
                          <Text style={styles.excName}>{exc.nombre_snapshot}</Text>
                        </View>
                        <Text style={styles.excSub}>
                          {exc.serie} series x {formatRepe(exc.repe, exc.repe_max)} repeticiones
                        </Text>
                      </View>
                      <Pressable onPress={() => setMenuFor(exc)} hitSlop={10} style={styles.kebabBtn}>
                        <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
                      </Pressable>
                    </View>

                    <Text style={styles.unitRowLabel}>Unidad</Text>
                    <View style={styles.unitRow}>
                      {UNITS.map((u) => (
                        <Pressable key={u} style={[styles.unitChip, unit === u && styles.unitChipActive]} onPress={() => setUnit(exc.id, u)}>
                          <Text style={[styles.unitChipText, unit === u && styles.unitChipTextActive]}>{UNIT_LABELS[u]}</Text>
                        </Pressable>
                      ))}
                    </View>

                    <View style={styles.seriesWrap}>
                      {rows.map(({ serie, title }) => {
                        const historyEntries = history?.get(serie);
                        const val = inputs.values.get(rowKey(exc.id, serie)) ?? { peso: "", repe: "" };
                        return (
                          <View key={serie} style={styles.serieRow}>
                            <View style={styles.serieInfo}>
                              <Text style={styles.serieLabel}>{title}</Text>
                              <Text style={styles.serieSub}>Anterior: {previousValuesText(historyEntries)}</Text>
                            </View>
                            <View style={styles.serieInputsRow}>
                              <View style={styles.fieldMini}>
                                <Text style={styles.fieldMiniLabel}>{UNIT_LABELS[unit]}</Text>
                                <TextInput
                                  style={styles.fieldMiniInput}
                                  placeholder="0"
                                  placeholderTextColor={colors.textMuted}
                                  keyboardType="numeric"
                                  value={val.peso}
                                  onChangeText={(v) => setValue(rowKey(exc.id, serie), { peso: v })}
                                />
                              </View>
                              <Text style={styles.serieX}>×</Text>
                              <View style={styles.fieldMini}>
                                <Text style={styles.fieldMiniLabel}>Reps</Text>
                                <TextInput
                                  style={styles.fieldMiniInput}
                                  placeholder="0"
                                  placeholderTextColor={colors.textMuted}
                                  keyboardType="numeric"
                                  value={val.repe}
                                  onChangeText={(v) => setValue(rowKey(exc.id, serie), { repe: v })}
                                />
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>

                    {todayComments.has(exc.id) && (
                      <View style={styles.commentNote}>
                        <Text style={styles.commentNoteLabel}>Tu nota de hoy</Text>
                        <Text style={styles.commentNoteText}>{todayComments.get(exc.id)!.comment}</Text>
                      </View>
                    )}
                  </View>
                );
              })}

            {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
            <PrimaryButton title="Guardar" onPress={handleSave} loading={saving} />
          </>
        )}
      </ScrollView>

      <ActionMenu visible={menuFor !== null} onClose={() => setMenuFor(null)} items={menuItems} />

      {commentFor && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Comentario de hoy</Text>
            <Text style={styles.modalSubtitle}>
              "{commentFor.nombre_snapshot}"{isTrainingForOther && targetName ? ` · ${targetName}` : ""}
            </Text>
            <TextInput
              style={styles.commentInput}
              multiline
              numberOfLines={4}
              maxLength={MAX_COMMENT_LENGTH}
              placeholder="¿Cómo te fue con este ejercicio hoy?"
              placeholderTextColor={colors.textMuted}
              value={commentText}
              onChangeText={setCommentText}
            />
            <View style={styles.modalActions}>
              <PrimaryButton title="Guardar" onPress={handleSaveComment} loading={commentSaving} />
              {todayComments.has(commentFor.id) && <OutlineButton title="Borrar" onPress={handleDeleteComment} />}
              <OutlineButton title="Cancelar" onPress={() => setCommentFor(null)} />
            </View>
          </View>
        </View>
      )}

      {deleteConfirmFor && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Borrar carga de hoy</Text>
            <Text style={styles.modalSubtitle}>
              Se va a borrar la carga de hoy que cargaste para "{deleteConfirmFor.nombre_snapshot}". Los registros de días anteriores no se modifican.
            </Text>
            <View style={styles.modalActions}>
              <PrimaryButton title="Borrar" onPress={handleConfirmDelete} loading={deleting} />
              <OutlineButton title="Cancelar" onPress={() => setDeleteConfirmFor(null)} />
            </View>
          </View>
        </View>
      )}

      {viewerId && <ReportErrorModal visible={reportModalOpen} userId={viewerId} onClose={() => setReportModalOpen(false)} />}

      {saved && <AuthOverlay state={{ kind: "success", text: "¡Peso actualizado con éxito!" }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "700", textAlign: "center" },
  scroll: { padding: 16, paddingBottom: 48, gap: 12 },

  studentsBackLink: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 2 },
  studentsBackLinkText: { color: colors.accent2, fontSize: 13.5, fontWeight: "700" },

  trainerBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  trainerBannerText: { color: colors.accent2, fontSize: 12.5, fontWeight: "600", flex: 1 },

  heroCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 18,
    gap: 16,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 16 },
  heroInfo: { flex: 1, gap: 2 },
  heroEyebrow: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  heroTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  heroSub: { color: colors.textMuted, fontSize: 12.5 },
  heroProgressWrap: { gap: 6 },
  heroProgressHead: { flexDirection: "row", justifyContent: "space-between" },
  heroProgressLabel: { color: colors.textMuted, fontSize: 12.5, fontWeight: "600" },
  heroProgressPct: { color: colors.text, fontSize: 12.5, fontWeight: "700" },
  progressBarBg: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: colors.accent2, borderRadius: 4 },

  weekChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  weekChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  weekChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent2 },
  weekChipText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700" },
  weekChipTextActive: { color: colors.accent2 },

  sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 },

  daysList: { gap: 10 },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 14,
    backgroundColor: colors.surface,
  },
  dayRowDone: { borderColor: "rgba(47, 217, 113, 0.35)" },
  dayRowPressed: { borderColor: colors.accent2 },
  dayRowInfo: { flex: 1, gap: 2 },
  dayRowTitle: { color: colors.text, fontSize: 14.5, fontWeight: "700" },
  dayRowSubtitle: { color: colors.textMuted, fontSize: 12 },
  dayRowStatus: {
    color: colors.accent2,
    backgroundColor: colors.accentSoft,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  dayRowStatusDone: { color: colors.live, backgroundColor: colors.liveSoft },

  backLink: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 4 },
  backLinkText: { color: colors.accent2, fontSize: 13.5, fontWeight: "700" },
  dayTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },

  helpLinkWrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 4 },
  helpLinkText: { color: colors.textMuted, fontSize: 12.5 },
  helpLinkBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  helpLinkBadgeText: { color: colors.accent2, fontSize: 11.5, fontWeight: "700" },

  excCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 16, gap: 12 },
  excCardDone: { borderColor: "rgba(47, 217, 113, 0.3)" },
  excHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  excHeadLeft: { flex: 1, gap: 3 },
  excNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  excDoneIcon: { marginTop: -1 },
  excName: { color: colors.text, fontSize: 15.5, fontWeight: "700", flexShrink: 1 },
  excSub: { color: colors.textMuted, fontSize: 12.5 },
  kebabBtn: { padding: 2 },

  unitRowLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  unitRow: { flexDirection: "row", gap: 8, marginTop: -6 },
  unitChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  unitChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent2 },
  unitChipText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  unitChipTextActive: { color: colors.accent2 },

  seriesWrap: { gap: 14 },
  serieRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  serieInfo: { flex: 1, gap: 3 },
  serieLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  serieSub: { color: colors.textMuted, fontSize: 11.5 },
  serieInputsRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, flexShrink: 0 },
  fieldMini: { width: 60, gap: 4 },
  fieldMiniLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.2, textAlign: "center" },
  fieldMiniInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 8,
    paddingVertical: 11,
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  serieX: { color: colors.textMuted, fontSize: 13, fontWeight: "700", paddingBottom: 11 },

  commentNote: { backgroundColor: colors.accentSoft, borderRadius: radius.input, padding: 10, gap: 2 },
  commentNoteLabel: { color: colors.accent2, fontSize: 11, fontWeight: "700" },
  commentNoteText: { color: colors.text, fontSize: 13 },
  errorText: { color: colors.errorText, fontSize: 13, textAlign: "center" },

  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10, 12, 15, 0.7)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { width: "100%", maxWidth: 440, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 24, gap: 10 },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  modalSubtitle: { color: colors.textMuted, fontSize: 13.5, lineHeight: 19 },
  commentInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: "top",
  },
  modalActions: { gap: 10, marginTop: 4 },
});
