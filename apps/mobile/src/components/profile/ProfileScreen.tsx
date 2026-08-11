import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";

import { ActionMenu, type ActionMenuItem } from "@/components/ActionMenu";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getFollowCounts } from "@/lib/followService";
import {
  computeWeeklyFrequency,
  finishRoutine,
  getProfile,
  getProfilesBasicByIds,
  lastTrainingLabel,
  listRoutines,
  listWeightLogsWithContext,
  mostFrequentExercise,
  parseProfileLinks,
  reactivateRoutine,
  trainingDaysCount,
  uploadAvatarFromUri,
  type Profile,
  type ProfileBasic,
  type RoutineListMode,
  type RoutineWithCounts,
  type WeightLogEntry,
} from "@/lib/profileService";
import { getSubscriberCount } from "@/lib/subscriptionService";
import { getPlatform } from "@/lib/socialLinks";
import { getUserTypeLabel } from "@/lib/verifiedBadge";
import { colors, radius } from "@/theme/colors";

import { Avatar } from "./Avatar";
import { FrequencyChart, ProgressChart } from "./Charts";
import { ConfirmModal } from "./ConfirmModal";
import { ReportErrorModal } from "./ReportErrorModal";
import { RoutineCard } from "./RoutineCard";
import { VerifiedBadge } from "./VerifiedBadge";

const PLATFORM_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  instagram: "logo-instagram",
  facebook: "logo-facebook",
  whatsapp: "logo-whatsapp",
  tiktok: "logo-tiktok",
  youtube: "logo-youtube",
  x: "logo-twitter",
  other: "link",
};

function notImplemented() {
  Alert.alert("Próximamente", "Esta función todavía no está disponible en la app.");
}

type ConfirmAction = { kind: "finalize" | "reactivate"; routine: RoutineWithCounts };

export function ProfileScreen({ userId }: { userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [logs, setLogs] = useState<WeightLogEntry[]>([]);
  const [activeRoutinesCount, setActiveRoutinesCount] = useState(0);

  const [routineTab, setRoutineTab] = useState<RoutineListMode>("active");
  const [routines, setRoutines] = useState<RoutineWithCounts[]>([]);
  const [routinesLoading, setRoutinesLoading] = useState(false);
  const [ownerNames, setOwnerNames] = useState<Map<string, ProfileBasic>>(new Map());

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmSuccess, setConfirmSuccess] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const routinesSectionY = useRef(0);

  function scrollToRoutines() {
    scrollRef.current?.scrollTo({ y: Math.max(routinesSectionY.current - 16, 0), animated: true });
  }

  const loadRoutinesForTab = useCallback(
    async (tab: RoutineListMode) => {
      setRoutinesLoading(true);
      // Junta toda la data primero y recien al final actualiza el estado de una:
      // así la lista vieja se reemplaza por la nueva (o el estado vacío) en un
      // solo paso, que es lo que la transición animada de abajo necesita.
      let list: RoutineWithCounts[] = [];
      let names = new Map<string, ProfileBasic>();
      try {
        list = await listRoutines(userId, tab);
        const ids = list.flatMap((r) => [r.assigned_by, r.copied_from_user_id]);
        names = await getProfilesBasicByIds(ids);
      } finally {
        setRoutines(list);
        setOwnerNames(names);
        setRoutinesLoading(false);
      }
    },
    [userId]
  );

  const loadAll = useCallback(async () => {
    const [profileData, counts, weightLogs, activeList] = await Promise.all([
      getProfile(userId),
      getFollowCounts(userId),
      listWeightLogsWithContext(userId),
      listRoutines(userId, "active"),
    ]);
    setProfile(profileData);
    setFollowCounts(counts);
    setLogs(weightLogs);
    setActiveRoutinesCount(activeList.length);

    if (profileData?.user_type === "entrenador") {
      setSubscriberCount(await getSubscriberCount(userId));
    } else {
      setSubscriberCount(null);
    }

    setRoutineTab("active");
    setRoutines(activeList);
    const ids = activeList.flatMap((r) => [r.assigned_by, r.copied_from_user_id]);
    setOwnerNames(await getProfilesBasicByIds(ids));
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  function handleTabChange(tab: RoutineListMode) {
    setRoutineTab(tab);
    loadRoutinesForTab(tab);
  }

  async function handleAvatarPress() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permiso necesario", "Necesitamos acceso a tus fotos para cambiar tu foto de perfil.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    setAvatarUploading(true);
    const asset = result.assets[0];
    const { url, error } = await uploadAvatarFromUri(userId, asset.uri, asset.mimeType);
    setAvatarUploading(false);
    if (error) {
      Alert.alert("No se pudo subir la foto", error);
      return;
    }
    if (url) setProfile((prev) => (prev ? { ...prev, avatar_url: url } : prev));
  }

  async function handleShare() {
    if (!profile?.username) return;
    await Share.share({ message: `https://gymsocial.com.ar/${profile.username}` });
  }

  async function handleConfirm() {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      if (confirmAction.kind === "finalize") {
        await finishRoutine(confirmAction.routine.id);
      } else {
        await reactivateRoutine(confirmAction.routine.id);
      }
      setConfirmLoading(false);
      setConfirmSuccess(true);
      setTimeout(async () => {
        setConfirmSuccess(false);
        setConfirmAction(null);
        await loadRoutinesForTab("active");
        setRoutineTab("active");
        const activeList = await listRoutines(userId, "active");
        setActiveRoutinesCount(activeList.length);
      }, 1400);
    } catch {
      setConfirmLoading(false);
      Alert.alert("No se pudo completar", "Probá de nuevo en unos segundos.");
    }
  }

  if (loading || !profile) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.accent2} />
      </View>
    );
  }

  const links = parseProfileLinks(profile.links);
  const roleLabel = getUserTypeLabel(profile.user_type, profile.is_verified ?? false);
  const bio = profile.bio?.trim() ?? "";
  const canHaveSavedTab = profile.user_type === "usuario" || profile.user_type === "entrenador" || profile.user_type === "admin";
  const isEntrenador = profile.user_type === "entrenador";

  const top = mostFrequentExercise(logs);
  const excProgress = top ? logs.filter((l) => l.exerciseId === top.id) : [];

  const menuItems: ActionMenuItem[] = [
    { label: "Compartir perfil", onPress: handleShare },
    { label: "Configuración", onPress: () => router.push("/settings") },
    { label: "Reportar un error", onPress: () => setReportModalOpen(true) },
  ];

  const routinesTitle = routineTab === "active" ? "Rutinas activas" : routineTab === "historic" ? "Rutinas históricas" : "Rutinas guardadas";

  return (
    <View style={styles.flex}>
      <ScreenHeader avatarUrl={profile.avatar_url} />

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent2} />}
      >
        {/* ---------- Hero ---------- */}
        <View style={styles.heroRow}>
          <Avatar uri={profile.avatar_url} size={84} editable uploading={avatarUploading} onPress={handleAvatarPress} />

          <View style={styles.heroInfo}>
            <View style={styles.usernameRow}>
              <Text style={styles.username}>@{profile.username}</Text>
              <VerifiedBadge userType={profile.user_type} isVerified={profile.is_verified ?? false} />
              <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} style={styles.heroMenuButton}>
                <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.fullname}>
              {profile.nombre} {profile.apellido}
            </Text>
            {roleLabel && <Text style={styles.roleLabel}>{roleLabel}</Text>}

            <View style={styles.statsRow}>
              <Text style={styles.statPill}>
                <Text style={styles.statPillNumber}>0</Text> publicaciones
              </Text>
              <Pressable onPress={() => router.push({ pathname: "/followers/[username]", params: { username: profile.username, tab: "followers" } })}>
                <Text style={styles.statPill}>
                  <Text style={styles.statPillNumber}>{followCounts.followers}</Text> seguidores
                </Text>
              </Pressable>
              <Pressable onPress={() => router.push({ pathname: "/followers/[username]", params: { username: profile.username, tab: "following" } })}>
                <Text style={styles.statPill}>
                  <Text style={styles.statPillNumber}>{followCounts.following}</Text> seguidos
                </Text>
              </Pressable>
              {isEntrenador && subscriberCount !== null && (
                <Pressable onPress={() => router.push({ pathname: "/followers/[username]", params: { username: profile.username, tab: "subscribers" } })}>
                  <Text style={styles.statPill}>
                    <Text style={styles.statPillNumber}>{subscriberCount}</Text> suscriptores
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {bio.length > 0 && <Text style={styles.bio}>{bio}</Text>}

        {links.length > 0 && (
          <View style={styles.linksRow}>
            {links.map((link) => {
              const platform = getPlatform(link.platform);
              return (
                <Pressable key={link.url} style={styles.linkChip} onPress={() => Linking.openURL(link.url)}>
                  <Ionicons name={PLATFORM_ICON[platform.key] ?? "link"} size={14} color={colors.accent2} />
                  <Text style={styles.linkChipText}>{link.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.profileActions}>
          <Pressable style={styles.outlineActionButton} onPress={() => router.push("/settings")}>
            <Text style={styles.outlineActionText}>Editar perfil</Text>
          </Pressable>
          <Pressable style={styles.outlineActionButton} onPress={handleShare}>
            <Text style={styles.outlineActionText}>Compartir perfil</Text>
          </Pressable>
        </View>

        {/* ---------- Quick actions ---------- */}
      <View style={styles.section}>
        <View style={styles.quickGrid}>
          <QuickCard icon="barbell" title="Tus rutinas" subtitle="Ver y gestionar tus rutinas activas" onPress={scrollToRoutines} />
          <QuickCard icon="stats-chart" title="Progreso completo" subtitle="Gráficos detallados por ejercicio" onPress={() => router.push("/progress")} />
          <QuickCard icon="add-circle" title="Nueva rutina" subtitle="Armá una rutina desde cero" onPress={() => router.push("/routine/new")} />
          {isEntrenador && <QuickCard icon="people" title="Tus alumnos" subtitle="Rutinas, progreso y comentarios de tus suscriptores" onPress={notImplemented} />}
        </View>
      </View>

      {/* ---------- Stats ---------- */}
      <View style={styles.section}>
        <Text style={styles.eyebrow}>TU ACTIVIDAD</Text>
        <Text style={styles.sectionTitle}>Estadísticas</Text>
        <Text style={styles.sectionSubtitle}>Un resumen de cómo venís entrenando.</Text>

        {logs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="stats-chart-outline" size={28} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Todavía no tenés estadísticas</Text>
            <Text style={styles.emptyBody}>
              Por ahora no tenés ningún entrenamiento registrado. Cuando cargues el peso de tus ejercicios, tu progreso va a aparecer acá.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.statCardGrid}>
              <StatCard label="Último entrenamiento" value={lastTrainingLabel(logs)} />
              <StatCard label="Ejercicio más entrenado" value={top?.name ?? "—"} />
              <StatCard label="Entrenamientos registrados" value={String(trainingDaysCount(logs))} />
              <StatCard label="Rutinas activas" value={String(activeRoutinesCount)} />
            </View>

            <View style={styles.chartCard} onLayout={() => {}}>
              <Text style={styles.chartTitle}>Frecuencia de entrenamiento</Text>
              <Text style={styles.chartSub}>Entrenamientos registrados por semana, últimas 8 semanas.</Text>
              <ChartWidth>{(width) => <FrequencyChart buckets={computeWeeklyFrequency(logs)} width={width} />}</ChartWidth>
            </View>

            {excProgress.length >= 2 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Progreso: {top?.name}</Text>
                <Text style={styles.chartSub}>Evolución del peso registrado en tu ejercicio más entrenado.</Text>
                <ChartWidth>{(width) => <ProgressChart entries={excProgress} width={width} />}</ChartWidth>
              </View>
            )}
          </>
        )}
      </View>

      {/* ---------- Rutinas ---------- */}
      <View style={styles.rutinasPanel} onLayout={(e) => (routinesSectionY.current = e.nativeEvent.layout.y)}>
        <View style={styles.section}>
          <Text style={styles.eyebrow}>TUS RUTINAS</Text>
          <Text style={styles.sectionTitle}>{routinesTitle}</Text>

          <View style={styles.tabsContainer}>
            <RoutineTabButton label="Activas" active={routineTab === "active"} onPress={() => handleTabChange("active")} />
            <RoutineTabButton label="Históricas" active={routineTab === "historic"} onPress={() => handleTabChange("historic")} />
            {canHaveSavedTab && <RoutineTabButton label="Guardadas" active={routineTab === "saved"} onPress={() => handleTabChange("saved")} />}
          </View>

          <Animated.View layout={LinearTransition.duration(250)}>
            {routines.length === 0 && !routinesLoading ? (
              <Animated.View key="routines-empty" entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
                <RoutinesEmptyState mode={routineTab} isEntrenador={isEntrenador} onCreatePress={() => router.push("/routine/new")} />
              </Animated.View>
            ) : (
              <Animated.View key="routines-list" entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.routinesList}>
                {routines.map((routine) => {
                  const ownerId = routine.assigned_by ?? routine.copied_from_user_id;
                  const owner = ownerId ? ownerNames.get(ownerId) : null;
                  const ownerName = owner ? `${owner.nombre} ${owner.apellido}` : null;
                  return (
                    <RoutineCard
                      key={routine.id}
                      routine={routine}
                      mode={routineTab}
                      logs={logs}
                      ownerName={ownerName}
                      onFinalize={(r) => setConfirmAction({ kind: "finalize", routine: r })}
                      onReactivate={(r) => setConfirmAction({ kind: "reactivate", routine: r })}
                      onDeleted={async () => {
                        await loadRoutinesForTab(routineTab);
                        if (routineTab === "active") setActiveRoutinesCount((await listRoutines(userId, "active")).length);
                      }}
                    />
                  );
                })}
              </Animated.View>
            )}
          </Animated.View>
        </View>
      </View>
      </ScrollView>

      <ActionMenu visible={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems} />
      <ReportErrorModal visible={reportModalOpen} userId={userId} onClose={() => setReportModalOpen(false)} />
      <ConfirmModal
        visible={confirmAction !== null}
        title={confirmAction?.kind === "finalize" ? "Finalizar rutina" : "Reactivar rutina"}
        subtitle={
          confirmAction?.kind === "finalize"
            ? `"${confirmAction.routine.nombre}" va a pasar a Históricas. Vas a poder reactivarla cuando quieras.`
            : `Vas a volver a verla en Activas, con todo tu historial de pesos intacto.`
        }
        confirmLabel={confirmAction?.kind === "finalize" ? "Finalizar" : "Reactivar"}
        loadingText={confirmAction?.kind === "finalize" ? "Finalizando..." : "Reactivando..."}
        successText={confirmAction?.kind === "finalize" ? "¡Rutina finalizada! Pasó a Históricas." : "¡Rutina reactivada! Volvió a Activas."}
        loading={confirmLoading}
        success={confirmSuccess}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </View>
  );
}

function QuickCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.quickCard} onPress={onPress}>
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={20} color={colors.accent2} />
      </View>
      <Text style={styles.quickTitle}>{title}</Text>
      <Text style={styles.quickSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statCardLabel}>{label}</Text>
      <Text style={styles.statCardValue}>{value}</Text>
    </View>
  );
}

function RoutineTabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  if (active) {
    return (
      <Pressable style={styles.tabButtonWrap} onPress={onPress}>
        <LinearGradient colors={[colors.accent, colors.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tabButtonInner}>
          <Text style={styles.tabButtonTextActive}>{label}</Text>
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable style={[styles.tabButtonWrap, styles.tabButtonInner]} onPress={onPress}>
      <Text style={styles.tabButtonText}>{label}</Text>
    </Pressable>
  );
}

function RoutinesEmptyState({ mode, isEntrenador, onCreatePress }: { mode: RoutineListMode; isEntrenador: boolean; onCreatePress: () => void }) {
  const copy =
    mode === "active"
      ? {
          title: "Todavía no tenés rutinas activas",
          body: "Creá tu primera rutina para empezar a entrenar con Gym Social.",
          button: "Crear nueva rutina",
        }
      : mode === "historic"
        ? { title: "Todavía no tenés rutinas históricas", body: "Cuando finalices una rutina activa, va a aparecer acá.", button: null }
        : isEntrenador
          ? {
              title: "Todavía no tenés rutinas guardadas",
              body: "Armá una plantilla y despues asignásela a cualquiera de tus suscriptores aceptados.",
              button: "Crear plantilla",
            }
          : {
              title: "Todavía no tenés rutinas guardadas",
              body: "Cuando creás una rutina nueva, te preguntamos si la querés activar ya. Si elegís que no, queda acá para que la actives cuando quieras.",
              button: "Crear rutina",
            };
  return (
    <View style={styles.emptyState}>
      <Ionicons name="barbell-outline" size={28} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>{copy.title}</Text>
      <Text style={styles.emptyBody}>{copy.body}</Text>
      {copy.button && (
        <Pressable style={styles.emptyStateButton} onPress={onCreatePress}>
          <Text style={styles.emptyStateButtonText}>{copy.button}</Text>
        </Pressable>
      )}
    </View>
  );
}

function ChartWidth({ children }: { children: (width: number) => ReactNode }) {
  const [width, setWidth] = useState(0);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ marginHorizontal: -18 }}>
      {width > 0 ? children(width) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 48, gap: 20 },
  heroRow: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  heroInfo: { flex: 1, gap: 4, paddingTop: 4 },
  usernameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroMenuButton: { marginLeft: "auto", padding: 4 },
  username: { color: colors.text, fontSize: 20, fontWeight: "800" },
  fullname: { color: colors.textMuted, fontSize: 14 },
  roleLabel: { color: colors.textMuted, fontSize: 11.5, opacity: 0.9 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  statPill: { color: colors.textMuted, fontSize: 12.5 },
  statPillNumber: { color: colors.text, fontWeight: "800" },
  bio: { color: colors.text, fontSize: 14, lineHeight: 19, marginTop: 4 },
  linksRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  linkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  linkChipText: { color: colors.text, fontSize: 12.5 },
  profileActions: { flexDirection: "row", gap: 10 },
  outlineActionButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
  },
  outlineActionText: { color: colors.text, fontWeight: "700", fontSize: 14 },
  section: { gap: 12 },
  rutinasPanel: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingVertical: 24,
    backgroundColor: colors.surface,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: colors.accent2,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    alignSelf: "center",
    overflow: "hidden",
  },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "700", textAlign: "center" },
  sectionSubtitle: { color: colors.textMuted, fontSize: 13.5, marginTop: -8, textAlign: "center" },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  quickCard: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 16,
    gap: 8,
  },
  quickIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  quickTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  quickSubtitle: { color: colors.textMuted, fontSize: 12 },
  emptyState: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "700", marginTop: 4 },
  emptyBody: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  emptyStateButton: {
    marginTop: 6,
    backgroundColor: colors.accent2,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  emptyStateButtonText: { color: colors.bg, fontWeight: "700", fontSize: 13.5 },
  statCardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 16,
  },
  statCardLabel: { color: colors.textMuted, fontSize: 12 },
  statCardValue: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 4 },
  chartCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 18,
    overflow: "hidden",
  },
  chartTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  chartSub: { color: colors.textMuted, fontSize: 12.5, marginTop: 2 },
  tabsContainer: {
    flexDirection: "row",
    gap: 4,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    padding: 4,
    alignSelf: "stretch",
  },
  tabButtonWrap: { flex: 1, borderRadius: radius.pill, overflow: "hidden" },
  tabButtonInner: { paddingVertical: 11, alignItems: "center", justifyContent: "center" },
  tabButtonText: { color: colors.textMuted, fontWeight: "700", fontSize: 13.5 },
  tabButtonTextActive: { color: colors.bg, fontWeight: "800", fontSize: 13.5 },
  routinesList: { gap: 14 },
});
