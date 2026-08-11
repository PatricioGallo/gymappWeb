import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";

import { ActionMenu, type ActionMenuItem } from "@/components/ActionMenu";
import { ScreenHeader } from "@/components/ScreenHeader";
import { blockUser, getBlockStatus, unblockUser, type BlockStatus } from "@/lib/blockService";
import { formatFechaCorta } from "@/lib/dias";
import { followUser, getFollowCounts, getFollowStatus, unfollowOrCancel, type FollowStatus } from "@/lib/followService";
import {
  computeWeeklyFrequency,
  getProfile,
  getProfileBasicByUsername,
  getProfileByUsername,
  lastTrainingLabel,
  listRoutines,
  listWeightLogsWithContext,
  mostFrequentExercise,
  parseProfileLinks,
  trainingDaysCount,
  type Profile,
  type ProfileBasic,
  type RoutineWithCounts,
  type WeightLogEntry,
} from "@/lib/profileService";
import { getOrCreateConversation } from "@/lib/chatService";
import { cloneRoutineForUser } from "@/lib/routineService";
import { getPlatform } from "@/lib/socialLinks";
import { getSubscriberCount, getSubscriptionStatus, subscribeToTrainer, unsubscribeOrCancel, type SubscriptionStatus } from "@/lib/subscriptionService";
import { supabase } from "@/lib/supabaseClient";
import { getUserTypeLabel } from "@/lib/verifiedBadge";
import type { Enums, Json } from "@/types/database";
import { colors, radius } from "@/theme/colors";

import { Avatar } from "./Avatar";
import { FrequencyChart, ProgressChart } from "./Charts";
import { ConfirmModal } from "./ConfirmModal";
import { ReportErrorModal } from "./ReportErrorModal";
import { ReportUserModal } from "./ReportUserModal";
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

interface TargetProfile {
  id: string;
  username: string;
  nombre: string;
  apellido: string;
  avatar_url: string | null;
  bio: string | null;
  links: Json;
  nacionalidad: string | null;
  user_type: Enums<"user_type">;
  is_verified: boolean;
  is_public: boolean;
}

function toTargetProfile(full: Profile | null, basic: ProfileBasic | null): TargetProfile | null {
  const src = full ?? basic;
  if (!src || !src.id || !src.username || !src.user_type) return null;
  return {
    id: src.id,
    username: src.username,
    nombre: src.nombre ?? "",
    apellido: src.apellido ?? "",
    avatar_url: src.avatar_url ?? null,
    bio: src.bio ?? null,
    links: src.links ?? [],
    nacionalidad: src.nacionalidad ?? null,
    user_type: src.user_type,
    is_verified: src.is_verified ?? false,
    is_public: src.is_public ?? true,
  };
}

export function PublicProfileScreen({ username }: { username: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerAvatarUrl, setViewerAvatarUrl] = useState<string | null>(null);

  const [target, setTarget] = useState<TargetProfile | null>(null);
  const [hasFullAccess, setHasFullAccess] = useState(false);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [followStatus, setFollowStatus] = useState<FollowStatus>("none");
  const [followBusy, setFollowBusy] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>("none");
  const [subscribeBusy, setSubscribeBusy] = useState(false);
  const [blockStatus, setBlockStatus] = useState<BlockStatus>("none");

  const [logs, setLogs] = useState<WeightLogEntry[]>([]);
  const [routines, setRoutines] = useState<RoutineWithCounts[]>([]);
  const [viewerCanCopyToSaved, setViewerCanCopyToSaved] = useState(false);
  const [copyingRoutine, setCopyingRoutine] = useState<RoutineWithCounts | null>(null);
  const [copying, setCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [reportUserOpen, setReportUserOpen] = useState(false);
  const [reportErrorOpen, setReportErrorOpen] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [blockSuccess, setBlockSuccess] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const myId = session?.user.id ?? null;
    setViewerId(myId);
    if (myId)
      getProfile(myId).then((p) => {
        setViewerAvatarUrl(p?.avatar_url ?? null);
        setViewerCanCopyToSaved(p?.user_type === "entrenador" || p?.user_type === "usuario" || p?.user_type === "admin");
      });

    const full = await getProfileByUsername(username);
    const basic = full ? null : await getProfileBasicByUsername(username);
    const resolved = toTargetProfile(full, basic);
    if (!resolved) {
      setNotFound(true);
      setTarget(null);
      return;
    }
    setNotFound(false);
    setTarget(resolved);
    setHasFullAccess(Boolean(full));

    if (myId === resolved.id) {
      // Es mi propio perfil: esa vista completa (con edicion) ya la tiene la home.
      router.replace("/");
      return;
    }

    const [counts, fStatus, bStatus] = await Promise.all([
      getFollowCounts(resolved.id),
      myId ? getFollowStatus(resolved.id).catch(() => "none" as FollowStatus) : Promise.resolve<FollowStatus>("none"),
      myId ? getBlockStatus(resolved.id).catch(() => "none" as BlockStatus) : Promise.resolve<BlockStatus>("none"),
    ]);
    setFollowCounts(counts);
    setFollowStatus(fStatus);
    setBlockStatus(bStatus);

    if (resolved.user_type === "entrenador") {
      setSubscriberCount(await getSubscriberCount(resolved.id).catch(() => 0));
      if (myId && bStatus === "none") {
        const s = await getSubscriptionStatus(resolved.id).catch(() => "none" as SubscriptionStatus);
        setSubscriptionStatus(s === "ended" ? "none" : s);
      } else {
        setSubscriptionStatus("none");
      }
    } else {
      setSubscriberCount(null);
      setSubscriptionStatus("none");
    }

    // Un seguidor aceptado ve el perfil completo aunque sea privado; el resto de
    // rutinas/pesos igual quedan gateados server-side via RLS si algo se filtra acá.
    const isPrivateForViewer = !full && !resolved.is_public && fStatus !== "accepted";
    if (isPrivateForViewer) {
      setLogs([]);
      setRoutines([]);
      return;
    }

    const [weightLogs, activeRoutines] = await Promise.all([
      listWeightLogsWithContext(resolved.id).catch(() => []),
      listRoutines(resolved.id, "active").catch(() => []),
    ]);
    setLogs(weightLogs);
    setRoutines(activeRoutines);
  }, [username, router]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleShare() {
    if (!target) return;
    await Share.share({ message: `https://gymsocial.com.ar/${target.username}` });
  }

  async function handleFollowPress() {
    if (!viewerId || !target) return;
    setFollowBusy(true);
    if (followStatus === "none") {
      const { status, error } = await followUser(viewerId, target.id);
      setFollowBusy(false);
      if (error) {
        Alert.alert("No se pudo seguir", error);
        return;
      }
      setFollowStatus(status ?? "accepted");
      setFollowCounts((c) => ({ ...c, followers: c.followers + 1 }));
    } else {
      const { error } = await unfollowOrCancel(viewerId, target.id);
      // Dejar de seguir puede volver a ocultar bio/rutinas/stats si la cuenta es privada:
      // recargamos todo el perfil en vez de repintar in-place, igual que la web.
      if (error) {
        setFollowBusy(false);
        Alert.alert("No se pudo completar", error);
        return;
      }
      setLoading(true);
      await load();
      setLoading(false);
      setFollowBusy(false);
    }
  }

  async function handleSubscribePress() {
    if (!viewerId || !target) return;
    setSubscribeBusy(true);
    if (subscriptionStatus === "none") {
      const { status, error } = await subscribeToTrainer(target.id);
      setSubscribeBusy(false);
      if (error) {
        Alert.alert("No se pudo suscribir", error);
        return;
      }
      setSubscriptionStatus(status ?? "pending");
    } else {
      const { error } = await unsubscribeOrCancel(viewerId, target.id);
      setSubscribeBusy(false);
      if (error) {
        Alert.alert("No se pudo completar", error);
        return;
      }
      setSubscriptionStatus("none");
    }
  }

  async function handleMessagePress() {
    if (!target) return;
    setMessageBusy(true);
    const { id, error } = await getOrCreateConversation(target.id);
    setMessageBusy(false);
    if (error || !id) {
      Alert.alert("No se pudo abrir la conversación", error ?? "Probá de nuevo.");
      return;
    }
    router.push({ pathname: "/chat/[conversationId]", params: { conversationId: id } });
  }

  async function handleConfirmCopy() {
    if (!viewerId || !copyingRoutine) return;
    setCopying(true);
    const { error } = await cloneRoutineForUser(copyingRoutine.id, viewerId, { isTemplate: true, provenanceUserId: target?.id ?? null });
    setCopying(false);
    if (error) {
      setCopyingRoutine(null);
      Alert.alert("No se pudo copiar", error);
      return;
    }
    setCopySuccess(true);
    setTimeout(() => {
      setCopySuccess(false);
      setCopyingRoutine(null);
    }, 1400);
  }

  async function handleConfirmBlock() {
    if (!viewerId || !target) return;
    setBlockLoading(true);
    const action = blockStatus === "blocked_by_me" ? unblockUser : blockUser;
    const { error } = await action(viewerId, target.id);
    setBlockLoading(false);
    if (error) {
      setBlockConfirmOpen(false);
      Alert.alert("No se pudo completar", error);
      return;
    }
    setBlockSuccess(true);
    setTimeout(async () => {
      setBlockSuccess(false);
      setBlockConfirmOpen(false);
      setLoading(true);
      await load();
      setLoading(false);
    }, 1200);
  }

  if (loading) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Perfil" onBack={() => router.back()} avatarUrl={viewerAvatarUrl} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent2} />
        </View>
      </View>
    );
  }

  if (notFound || !target) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Perfil" onBack={() => router.back()} avatarUrl={viewerAvatarUrl} />
        <View style={styles.loadingWrap}>
          <Ionicons name="person-remove-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No encontramos a @{username}</Text>
        </View>
      </View>
    );
  }

  const links = parseProfileLinks(target.links);
  const roleLabel = getUserTypeLabel(target.user_type, target.is_verified);
  const isEntrenador = target.user_type === "entrenador";
  const isPrivateForViewer = !hasFullAccess && !target.is_public && followStatus !== "accepted";

  const top = mostFrequentExercise(logs);
  const excProgress = top ? logs.filter((l) => l.exerciseId === top.id) : [];

  const showFollowBtn = Boolean(viewerId) && blockStatus === "none";
  const showSubscribeBtn = showFollowBtn && isEntrenador;

  const followLabel = followStatus === "pending" ? "Solicitud enviada" : followStatus === "accepted" ? "Siguiendo" : "+ Seguir";
  const subscribeLabel = subscriptionStatus === "pending" ? "Solicitud enviada" : subscriptionStatus === "accepted" ? "Suscripto" : "Suscribirse";

  const menuItems: ActionMenuItem[] = [{ label: "Compartir perfil", onPress: handleShare }];
  if (viewerId) {
    menuItems.push(
      { label: blockStatus === "blocked_by_me" ? "Desbloquear usuario" : "Bloquear usuario", onPress: () => setBlockConfirmOpen(true), danger: true },
      { label: "Reportar usuario", onPress: () => setReportUserOpen(true) },
      { label: "Reportar un error", onPress: () => setReportErrorOpen(true) }
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title={`@${target.username}`} onBack={() => router.back()} avatarUrl={viewerAvatarUrl} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent2} />}
      >
        {/* ---------- Hero ---------- */}
        <View style={styles.heroRow}>
          <Avatar uri={target.avatar_url} size={84} />

          <View style={styles.heroInfo}>
            <View style={styles.usernameRow}>
              <Text style={styles.username}>@{target.username}</Text>
              <VerifiedBadge userType={target.user_type} isVerified={target.is_verified} />
              <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} style={styles.heroMenuButton}>
                <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.fullname}>
              {target.nombre} {target.apellido}
            </Text>
            {roleLabel && <Text style={styles.roleLabel}>{roleLabel}</Text>}

            <View style={styles.statsRow}>
              {isPrivateForViewer ? (
                <>
                  <Text style={styles.statPill}>
                    <Text style={styles.statPillNumber}>{followCounts.followers}</Text> seguidores
                  </Text>
                  <Text style={styles.statPill}>
                    <Text style={styles.statPillNumber}>{followCounts.following}</Text> seguidos
                  </Text>
                </>
              ) : (
                <>
                  <Pressable onPress={() => router.push({ pathname: "/followers/[username]", params: { username: target.username, tab: "followers" } })}>
                    <Text style={styles.statPill}>
                      <Text style={styles.statPillNumber}>{followCounts.followers}</Text> seguidores
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => router.push({ pathname: "/followers/[username]", params: { username: target.username, tab: "following" } })}>
                    <Text style={styles.statPill}>
                      <Text style={styles.statPillNumber}>{followCounts.following}</Text> seguidos
                    </Text>
                  </Pressable>
                </>
              )}
              {isEntrenador && subscriberCount !== null && (
                <Pressable
                  disabled={isPrivateForViewer}
                  onPress={() => router.push({ pathname: "/followers/[username]", params: { username: target.username, tab: "subscribers" } })}
                >
                  <Text style={styles.statPill}>
                    <Text style={styles.statPillNumber}>{subscriberCount}</Text> suscriptores
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {target.bio && target.bio.length > 0 && <Text style={styles.bio}>{target.bio}</Text>}

        {!isPrivateForViewer && links.length > 0 && (
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
          <Pressable style={styles.outlineActionButton} onPress={handleMessagePress} disabled={messageBusy}>
            <Text style={styles.outlineActionText}>Mensaje</Text>
          </Pressable>
          {showFollowBtn && (
            <Pressable
              style={[styles.outlineActionButton, followStatus === "none" && styles.primaryActionButton]}
              onPress={handleFollowPress}
              disabled={followBusy}
            >
              <Text style={[styles.outlineActionText, followStatus === "none" && styles.primaryActionText]}>{followLabel}</Text>
            </Pressable>
          )}
        </View>

        {showSubscribeBtn && (
          <Pressable
            style={[styles.outlineActionButton, subscriptionStatus === "none" && styles.primaryActionButton]}
            onPress={handleSubscribePress}
            disabled={subscribeBusy}
          >
            <Text style={[styles.outlineActionText, subscriptionStatus === "none" && styles.primaryActionText]}>{subscribeLabel}</Text>
          </Pressable>
        )}

        {isPrivateForViewer ? (
          <View style={styles.privateNotice}>
            <Ionicons name="lock-closed-outline" size={28} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Este perfil es privado</Text>
            <Text style={styles.emptyBody}>{target.nombre || "Esta persona"} decidió que solo se vea su información básica.</Text>
          </View>
        ) : (
          <>
            {/* ---------- Stats ---------- */}
            <View style={styles.section}>
              <Text style={styles.eyebrow}>SU ACTIVIDAD</Text>
              <Text style={styles.sectionTitle}>Estadísticas</Text>
              <Text style={styles.sectionSubtitle}>Un resumen de cómo entrena {target.nombre || target.username}.</Text>

              {logs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="stats-chart-outline" size={28} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>Todavía no tiene estadísticas</Text>
                  <Text style={styles.emptyBody}>Cuando registre entrenamientos, su progreso va a aparecer acá.</Text>
                </View>
              ) : (
                <>
                  <View style={styles.statCardGrid}>
                    <StatCard label="Último entrenamiento" value={lastTrainingLabel(logs)} />
                    <StatCard label="Ejercicio más entrenado" value={top?.name ?? "—"} />
                    <StatCard label="Entrenamientos registrados" value={String(trainingDaysCount(logs))} />
                    <StatCard label="Rutinas activas" value={String(routines.length)} />
                  </View>

                  <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>Frecuencia de entrenamiento</Text>
                    <Text style={styles.chartSub}>Entrenamientos registrados por semana, últimas 8 semanas.</Text>
                    <ChartWidth>{(width) => <FrequencyChart buckets={computeWeeklyFrequency(logs)} width={width} />}</ChartWidth>
                  </View>

                  {excProgress.length >= 2 && (
                    <View style={styles.chartCard}>
                      <Text style={styles.chartTitle}>Progreso: {top?.name}</Text>
                      <Text style={styles.chartSub}>Evolución del peso registrado en su ejercicio más entrenado.</Text>
                      <ChartWidth>{(width) => <ProgressChart entries={excProgress} width={width} />}</ChartWidth>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* ---------- Rutinas ---------- */}
            <View style={styles.rutinasPanel}>
              <View style={styles.section}>
                <Text style={styles.eyebrow}>RUTINAS</Text>
                <Text style={styles.sectionTitle}>Rutinas de {target.nombre || target.username}</Text>

                {routines.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="barbell-outline" size={28} color={colors.textMuted} />
                    <Text style={styles.emptyTitle}>Este usuario no tiene rutinas activas</Text>
                  </View>
                ) : (
                  <View style={styles.routinesList}>
                    {routines.map((routine) => (
                      <ViewOnlyRoutineCard
                        key={routine.id}
                        routine={routine}
                        canCopy={viewerCanCopyToSaved && routine.is_public}
                        onView={() => router.push({ pathname: "/routine/view/[routineId]", params: { routineId: routine.id } })}
                        onCopy={() => setCopyingRoutine(routine)}
                      />
                    ))}
                  </View>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <ActionMenu visible={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems} />
      {viewerId && <ReportErrorModal visible={reportErrorOpen} userId={viewerId} onClose={() => setReportErrorOpen(false)} />}
      {viewerId && (
        <ReportUserModal
          visible={reportUserOpen}
          reporterId={viewerId}
          reportedUserId={target.id}
          reportedUsername={target.username}
          onClose={() => setReportUserOpen(false)}
        />
      )}
      <ConfirmModal
        visible={blockConfirmOpen}
        title={blockStatus === "blocked_by_me" ? "Desbloquear usuario" : "Bloquear usuario"}
        subtitle={
          blockStatus === "blocked_by_me"
            ? `@${target.username} va a poder volver a encontrarte y seguirte.`
            : `Va a dejar de seguirte automáticamente y no van a poder encontrarse en el buscador.`
        }
        confirmLabel={blockStatus === "blocked_by_me" ? "Desbloquear" : "Bloquear"}
        loadingText={blockStatus === "blocked_by_me" ? "Desbloqueando..." : "Bloqueando..."}
        successText={blockStatus === "blocked_by_me" ? "Usuario desbloqueado." : "Usuario bloqueado."}
        loading={blockLoading}
        success={blockSuccess}
        onConfirm={handleConfirmBlock}
        onCancel={() => setBlockConfirmOpen(false)}
      />
      <ConfirmModal
        visible={copyingRoutine !== null}
        title="Copiar a mis guardadas"
        subtitle={`Se va a guardar una copia de "${copyingRoutine?.nombre}" en tus rutinas guardadas, con los mismos ejercicios.`}
        confirmLabel="Guardar copia"
        loadingText="Copiando..."
        successText="¡Copiada a tus guardadas!"
        loading={copying}
        success={copySuccess}
        onConfirm={handleConfirmCopy}
        onCancel={() => setCopyingRoutine(null)}
      />
    </View>
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

function ViewOnlyRoutineCard({
  routine,
  canCopy,
  onView,
  onCopy,
}: {
  routine: RoutineWithCounts;
  canCopy: boolean;
  onView: () => void;
  onCopy: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuItems: ActionMenuItem[] = [{ label: "Ver", onPress: onView }, ...(canCopy ? [{ label: "Copiar a mis guardadas", onPress: onCopy }] : [])];

  return (
    <View style={styles.routineCard}>
      <View style={styles.routineTopRow}>
        <Text style={styles.routineStartedTag}>Iniciada el {formatFechaCorta(routine.fecha_inicio)}</Text>
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={8}>
          <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      <Text style={styles.routineTitle}>{routine.nombre}</Text>
      <View style={styles.routineStatsGrid}>
        <View style={styles.routineStatItem}>
          <Text style={styles.routineStatLabel}>Semanas</Text>
          <Text style={styles.routineStatValue}>{routine.semanasCount}</Text>
        </View>
        <View style={styles.routineStatItem}>
          <Text style={styles.routineStatLabel}>Días por semana</Text>
          <Text style={styles.routineStatValue}>{routine.diasPorSemana}</Text>
        </View>
        <View style={styles.routineStatItem}>
          <Text style={styles.routineStatLabel}>Ejercicios</Text>
          <Text style={styles.routineStatValue}>{routine.ejerciciosCount}</Text>
        </View>
      </View>
      <ActionMenu visible={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems} />
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
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 10, padding: 24 },
  scroll: { padding: 20, paddingBottom: 48, gap: 16 },
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
  bio: { color: colors.text, fontSize: 14, lineHeight: 19 },
  linksRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
  primaryActionButton: { backgroundColor: colors.accent2, borderColor: colors.accent2 },
  primaryActionText: { color: colors.bg },
  privateNotice: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
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
  emptyState: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "700", marginTop: 4, textAlign: "center" },
  emptyBody: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },
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
  routinesList: { gap: 14 },
  routineCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 18,
    gap: 10,
  },
  routineTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  routineStartedTag: {
    color: colors.accent2,
    backgroundColor: colors.accentSoft,
    fontSize: 11.5,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  routineTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  routineStatsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  routineStatItem: { minWidth: "30%" },
  routineStatLabel: { color: colors.textMuted, fontSize: 12 },
  routineStatValue: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 2 },
});
