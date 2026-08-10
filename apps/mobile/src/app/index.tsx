import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import type { Session } from "@supabase/supabase-js";

import { AlertMessage } from "@/components/AlertMessage";
import { AuthOverlay } from "@/components/AuthOverlay";
import { FormField } from "@/components/FormField";
import { Logo } from "@/components/Logo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProfileScreen } from "@/components/profile/ProfileScreen";
import { signIn } from "@/lib/authService";
import { supabase } from "@/lib/supabaseClient";
import { colors, radius } from "@/theme/colors";

export default function Index() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "SIGNED_IN") {
        // damos tiempo a que se vea el check de "¡Bienvenido!" antes de cambiar de pantalla
        setTimeout(() => setSession(newSession), 1500);
        return;
      }
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent2} />
      </View>
    );
  }

  if (session) {
    return <ProfileScreen userId={session.user.id} />;
  }

  return <LoginScreen onNavigateRegister={() => router.push("/register")} />;
}

function LoginScreen({ onNavigateRegister }: { onNavigateRegister: () => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [overlay, setOverlay] = useState<null | { kind: "loading" | "success"; text: string }>(null);

  async function handleSubmit() {
    setError("");
    setOverlay({ kind: "loading", text: "Ingresando..." });
    const { error: signInError } = await signIn(identifier, password);
    if (signInError) {
      setOverlay(null);
      setError(signInError);
      return;
    }
    setOverlay({ kind: "success", text: "¡Bienvenido!" });
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Logo />

        <View style={styles.card}>
          <Text style={styles.eyebrow}>INGRESAR</Text>
          <Text style={styles.title}>Ya te extrañábamos</Text>
          <Text style={styles.subtitle}>Ingresá con tu mail o usuario y contraseña para seguir con tu rutina.</Text>

          <AlertMessage message={error} />

          <FormField
            label="Mail o usuario"
            placeholder="Usuario o mail"
            autoCapitalize="none"
            autoCorrect={false}
            value={identifier}
            onChangeText={setIdentifier}
          />
          <FormField
            label="Contraseña"
            placeholder="Tu contraseña"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <PrimaryButton title="Ingresar" onPress={handleSubmit} disabled={!identifier || !password} />

          <View style={styles.footRow}>
            <Text style={styles.footText}>¿Todavía no tenés cuenta? </Text>
            <Text style={styles.footLink} onPress={onNavigateRegister}>
              Registrate gratis
            </Text>
          </View>
        </View>

        <Text style={styles.trust}>100% gratis, sin tarjeta ni suscripción</Text>
      </ScrollView>

      <AuthOverlay state={overlay} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    gap: 16,
  },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 24 },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 28,
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
    alignSelf: "flex-start",
    marginBottom: 14,
    overflow: "hidden",
  },
  title: { fontSize: 25, fontWeight: "700", color: colors.text, marginBottom: 8 },
  subtitle: { fontSize: 14.5, color: colors.textMuted, marginBottom: 26 },
  footRow: { flexDirection: "row", justifyContent: "center", marginTop: 22, flexWrap: "wrap" },
  footText: { fontSize: 13.5, color: colors.textMuted },
  footLink: { fontSize: 13.5, color: colors.accent2, fontWeight: "700" },
  trust: { color: colors.textMuted, fontSize: 12.5 },
});
