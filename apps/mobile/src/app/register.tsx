import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AlertMessage } from "@/components/AlertMessage";
import { AuthOverlay } from "@/components/AuthOverlay";
import { CountryPicker } from "@/components/CountryPicker";
import { FormField } from "@/components/FormField";
import { Logo } from "@/components/Logo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { calcularEdad } from "@/lib/age";
import { isUsernameAvailable, isValidUsername, normalizeUsername, signUp } from "@/lib/authService";
import { COUNTRIES } from "@/lib/countries";
import { isReservedUsername } from "@/lib/reservedUsernames";
import { supabase } from "@/lib/supabaseClient";
import { colors, radius } from "@/theme/colors";

type Role = "usuario" | "entrenador";

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function RegisterScreen() {
  const router = useRouter();

  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [username, setUsername] = useState("");
  const [mail, setMail] = useState("");
  const [birthdate, setBirthdate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [nacionalidad, setNacionalidad] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [role, setRole] = useState<Role>("usuario");
  const [terms, setTerms] = useState(false);

  const [error, setError] = useState("");
  const [overlay, setOverlay] = useState<null | { kind: "loading" | "success"; text: string }>(null);

  function showError(message: string) {
    setError(message);
  }

  async function handleSubmit() {
    setError("");

    const cleanNombre = nombre.trim();
    const cleanApellido = apellido.trim();
    const cleanUsername = normalizeUsername(username);
    const cleanMail = mail.trim();

    if (cleanNombre.length < 2 || !Number.isNaN(Number(cleanNombre)) || cleanApellido.length < 2 || !Number.isNaN(Number(cleanApellido))) {
      showError("ERROR! Nombre o apellido inválidos.");
      return;
    }
    if (!isValidUsername(cleanUsername)) {
      showError("ERROR! El usuario debe tener 3-30 caracteres: minúsculas, números o guion bajo.");
      return;
    }
    if (isReservedUsername(cleanUsername)) {
      showError("ERROR! Ese nombre de usuario no está disponible.");
      return;
    }
    if (pass !== pass2 || pass.length < 8) {
      showError("ERROR! Contraseñas no coinciden o muy corta (mínimo 8 caracteres).");
      return;
    }
    const fechaNacimiento = birthdate ? formatDate(birthdate) : "";
    if (!fechaNacimiento || Number.isNaN(Date.parse(fechaNacimiento)) || calcularEdad(fechaNacimiento) < 12 || calcularEdad(fechaNacimiento) > 100) {
      showError("ERROR! Ingresá una fecha de nacimiento válida (entre 12 y 100 años).");
      return;
    }
    if (!nacionalidad) {
      showError("ERROR! Elegí tu nacionalidad.");
      return;
    }
    if (!terms) {
      showError("ERROR! Debés aceptar los Términos y Condiciones para registrarte.");
      return;
    }

    setOverlay({ kind: "loading", text: "Creando cuenta..." });

    try {
      const available = await isUsernameAvailable(cleanUsername);
      if (!available) {
        setOverlay(null);
        showError("ERROR! Ese nombre de usuario ya está en uso.");
        return;
      }

      const { error: signUpError } = await signUp({
        email: cleanMail,
        password: pass,
        nombre: cleanNombre,
        apellido: cleanApellido,
        username: cleanUsername,
        fechaNacimiento,
        nacionalidad,
        userType: role,
      });

      if (signUpError) {
        setOverlay(null);
        showError(`ERROR! ${signUpError}`);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();

      const successMessage = sessionData.session
        ? "¡Usuario registrado con éxito! Espera, serás redirigido."
        : role === "entrenador"
          ? "¡Cuenta creada! Revisá tu mail para confirmar la cuenta. Una vez que ingreses, subí tu documentación desde Configuración > Verificación para tener el tick verde."
          : "¡Cuenta creada! Revisá tu mail para confirmar la cuenta antes de ingresar.";

      setOverlay({ kind: "success", text: successMessage });

      setTimeout(
        () => {
          router.replace("/");
        },
        sessionData.session ? 2500 : 4000
      );
    } catch {
      setOverlay(null);
      showError("ERROR! No se pudo crear la cuenta. Intentá de nuevo.");
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Logo />

        <View style={styles.card}>
          <Text style={styles.eyebrow}>REGISTRO</Text>
          <Text style={styles.title}>Sumate a Gym Social</Text>
          <Text style={styles.subtitle}>Completá tus datos y empezá a armar tu rutina hoy mismo.</Text>

          <AlertMessage message={error} />

          <FormField label="Nombre" placeholder="Tu nombre" value={nombre} onChangeText={setNombre} />
          <FormField label="Apellido" placeholder="Tu apellido" value={apellido} onChangeText={setApellido} />
          <FormField
            label="Nombre de usuario"
            placeholder="Cómo te van a ver en Gym Social"
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
          />
          <FormField
            label="Mail"
            placeholder="tu@mail.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={mail}
            onChangeText={setMail}
          />

          <View style={styles.field}>
            <Text style={styles.label}>Fecha de nacimiento</Text>
            <Pressable style={styles.dateInput} onPress={() => setShowDatePicker(true)}>
              <Text style={birthdate ? styles.dateText : styles.datePlaceholder}>
                {birthdate ? formatDate(birthdate) : "Elegí tu fecha de nacimiento"}
              </Text>
            </Pressable>
            {showDatePicker && (
              <>
                <DateTimePicker
                  value={birthdate ?? new Date(2000, 0, 1)}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  maximumDate={new Date()}
                  onChange={(_event, selected) => {
                    if (Platform.OS !== "ios") setShowDatePicker(false);
                    if (selected) setBirthdate(selected);
                  }}
                />
                {Platform.OS === "ios" && (
                  <Pressable style={styles.dateDoneButton} onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.dateDoneText}>Listo</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>

          <CountryPicker
            label="Nacionalidad"
            placeholder="Elegí tu nacionalidad"
            value={nacionalidad}
            options={COUNTRIES}
            onChange={setNacionalidad}
          />

          <FormField label="Contraseña" placeholder="Mínimo 8 caracteres" secureTextEntry value={pass} onChangeText={setPass} />
          <FormField label="Repetir contraseña" placeholder="Repetí tu contraseña" secureTextEntry value={pass2} onChangeText={setPass2} />

          <View style={styles.field}>
            <Text style={styles.label}>Tipo de cuenta</Text>
            <View style={styles.chipRow}>
              <Pressable style={[styles.chip, role === "usuario" && styles.chipActive]} onPress={() => setRole("usuario")}>
                <Text style={[styles.chipText, role === "usuario" && styles.chipTextActive]}>Usuario</Text>
              </Pressable>
              <Pressable style={[styles.chip, role === "entrenador" && styles.chipActive]} onPress={() => setRole("entrenador")}>
                <Text style={[styles.chipText, role === "entrenador" && styles.chipTextActive]}>Entrenador</Text>
              </Pressable>
            </View>
            {role === "entrenador" && (
              <Text style={styles.trainerHint}>
                Vas a tener todos los beneficios de entrenador apenas te registres. Si querés el tick verde de
                "entrenador certificado", una vez que confirmes tu cuenta vas a poder subir tu documentación desde
                Configuración → Verificación.
              </Text>
            )}
          </View>

          <Pressable style={styles.termsRow} onPress={() => setTerms((value) => !value)}>
            <View style={[styles.checkbox, terms && styles.checkboxChecked]}>
              {terms && <Ionicons name="checkmark" size={14} color={colors.bg} />}
            </View>
            <Text style={styles.termsText}>Leí y acepto los Términos y Condiciones de Gym Social.</Text>
          </Pressable>

          <PrimaryButton title="Crear cuenta" onPress={handleSubmit} />

          <View style={styles.footRow}>
            <Text style={styles.footText}>¿Ya tenés cuenta? </Text>
            <Text style={styles.footLink} onPress={() => router.back()}>
              Ingresá acá
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
  scroll: { flexGrow: 1, alignItems: "center", padding: 24, gap: 24, paddingBottom: 48 },
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
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
  dateInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dateText: { color: colors.text, fontSize: 14.5 },
  datePlaceholder: { color: colors.textMuted, fontSize: 14.5 },
  dateDoneButton: { alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 4 },
  dateDoneText: { color: colors.accent2, fontWeight: "700", fontSize: 14 },
  chipRow: { flexDirection: "row", gap: 10 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent2,
  },
  chipText: { fontSize: 12.5, fontWeight: "600", color: colors.textMuted },
  chipTextActive: { color: colors.accent2 },
  trainerHint: { color: colors.textMuted, fontSize: 12.5, marginTop: 10, lineHeight: 18 },
  termsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.accent2,
    borderColor: colors.accent2,
  },
  termsText: { flex: 1, color: colors.textMuted, fontSize: 13 },
  footRow: { flexDirection: "row", justifyContent: "center", marginTop: 22, flexWrap: "wrap" },
  footText: { fontSize: 13.5, color: colors.textMuted },
  footLink: { fontSize: 13.5, color: colors.accent2, fontWeight: "700" },
  trust: { color: colors.textMuted, fontSize: 12.5 },
});
