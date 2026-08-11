import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenHeader } from "@/components/ScreenHeader";
import { BlockedTab } from "@/components/settings/BlockedTab";
import { EditProfileTab } from "@/components/settings/EditProfileTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { PrivacyTab } from "@/components/settings/PrivacyTab";
import { VerificationTab } from "@/components/settings/VerificationTab";
import { getProfile, type Profile } from "@/lib/profileService";
import { supabase } from "@/lib/supabaseClient";
import { colors, radius } from "@/theme/colors";

type SettingsTab = "edit" | "privacy" | "notifications" | "blocked" | "verification";

const BASE_TABS: { key: SettingsTab; label: string }[] = [
  { key: "edit", label: "Editar perfil" },
  { key: "privacy", label: "Privacidad" },
  { key: "notifications", label: "Notificaciones" },
  { key: "blocked", label: "Bloqueados" },
];

export function SettingsScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<SettingsTab>("edit");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id ?? null;
      if (!uid) {
        router.replace("/");
        return;
      }
      setUserId(uid);
      setProfile(await getProfile(uid));
      setLoading(false);
    });
  }, [router]);

  function handleSaved(patch: Partial<Profile>) {
    setProfile((p) => (p ? { ...p, ...patch } : p));
  }

  if (loading || !profile || !userId) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Configuración" onBack={() => router.back()} avatarUrl={null} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent2} />
        </View>
      </View>
    );
  }

  const canVerify = profile.user_type === "entrenador" || profile.user_type === "gimnasio";
  const TABS = canVerify ? [...BASE_TABS, { key: "verification" as const, label: "Verificación" }] : BASE_TABS;

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Configuración" onBack={() => router.back()} avatarUrl={profile.avatar_url} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsRow}>
        {TABS.map((t) => (
          <Pressable key={t.key} style={[styles.tabChip, tab === t.key && styles.tabChipActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabChipText, tab === t.key && styles.tabChipTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {tab === "edit" && <EditProfileTab profile={profile} userId={userId} onSaved={handleSaved} />}
          {tab === "privacy" && <PrivacyTab profile={profile} userId={userId} onSaved={handleSaved} />}
          {tab === "notifications" && <NotificationsTab profile={profile} userId={userId} onSaved={handleSaved} />}
          {tab === "blocked" && <BlockedTab userId={userId} />}
          {tab === "verification" && canVerify && <VerificationTab profile={profile} userId={userId} />}
        </ScrollView>
      </KeyboardAvoidingView>
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
  scroll: { padding: 16, paddingBottom: 48, gap: 16 },
});
