import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenHeader } from "@/components/ScreenHeader";
import { getProfile, type Profile } from "@/lib/profileService";
import { supabase } from "@/lib/supabaseClient";
import { colors, radius } from "@/theme/colors";

import { ExercisesTab } from "./ExercisesTab";
import { IssuesTab } from "./IssuesTab";
import { MessagesTab } from "./MessagesTab";
import { NotificationsTab } from "./NotificationsTab";
import { RoadmapTab } from "./RoadmapTab";
import { StatsTab } from "./StatsTab";
import { UsersTab } from "./UsersTab";
import { ValidationTab } from "./ValidationTab";

type AdminTab = "stats" | "users" | "exercises" | "roadmap" | "issues" | "messages" | "validation" | "notifs";

const TABS: { key: AdminTab; label: string }[] = [
  { key: "stats", label: "Estadísticas" },
  { key: "users", label: "Usuarios" },
  { key: "exercises", label: "Ejercicios" },
  { key: "roadmap", label: "Roadmap" },
  { key: "issues", label: "Issues" },
  { key: "messages", label: "Mensajes" },
  { key: "validation", label: "Validación" },
  { key: "notifs", label: "Notificaciones" },
];

/** Panel de administracion: mismo alcance que la web (pages/admin.html) pero
 * adaptado a pantalla de celular, con tabs horizontales tipo chip en vez de
 * la barra de tabs de escritorio. Colaborador entra al mismo panel pero con
 * Usuarios y Roadmap en modo solo lectura (igual que en la web). */
export function AdminScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AdminTab>("stats");

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id ?? null;
      if (!uid) {
        router.replace("/");
        return;
      }
      const p = await getProfile(uid);
      if (cancelled) return;
      const staff = p?.user_type === "admin" || p?.user_type === "colaborador";
      if (!p || !staff) {
        router.replace("/");
        return;
      }
      setUserId(uid);
      setProfile(p);
      setIsAdmin(p.user_type === "admin");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading || !profile || !userId) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Administrar" onBack={() => router.back()} avatarUrl={null} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent2} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Administrar" onBack={() => router.back()} avatarUrl={profile.avatar_url} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsRow}>
        {TABS.map((t) => (
          <Pressable key={t.key} style={[styles.tabChip, tab === t.key && styles.tabChipActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabChipText, tab === t.key && styles.tabChipTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {tab === "stats" && <StatsTab />}
      {tab === "users" && <UsersTab isAdmin={isAdmin} />}
      {tab === "exercises" && <ExercisesTab userId={userId} />}
      {tab === "roadmap" && <RoadmapTab isAdmin={isAdmin} adminId={userId} />}
      {tab === "issues" && <IssuesTab adminId={userId} />}
      {tab === "messages" && <MessagesTab adminId={userId} />}
      {tab === "validation" && <ValidationTab />}
      {tab === "notifs" && <NotificationsTab />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabsScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabsRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tabChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent2 },
  tabChipText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  tabChipTextActive: { color: colors.accent2 },
});
