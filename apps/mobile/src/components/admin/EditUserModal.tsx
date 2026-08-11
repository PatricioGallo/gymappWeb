import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AlertMessage } from "@/components/AlertMessage";
import { CountryPicker } from "@/components/CountryPicker";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  CONFIGURABLE_VERIFIED_TYPES,
  updateUserAsAdmin,
  USER_TYPE_LABELS,
  USER_TYPE_OPTIONS,
  type AdminUserRow,
  type UserType,
} from "@/lib/adminService";
import { COUNTRIES } from "@/lib/countries";
import { getVerifiedBadgeColor } from "@/lib/verifiedBadge";
import { colors, radius } from "@/theme/colors";

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function verifiedFieldHint(userType: UserType): string | null {
  if (CONFIGURABLE_VERIFIED_TYPES.includes(userType)) return null;
  const mandatoryColor = getVerifiedBadgeColor(userType, false);
  if (!mandatoryColor) return "Este rol no tiene tilde de verificación.";
  return `Este rol tiene tilde ${mandatoryColor === "blue" ? "azul" : "verde"} obligatoria, no configurable.`;
}

function verifiedCheckboxLabel(userType: UserType): string {
  if (userType === "entrenador") return "Tilde verde: presentó la papelería que certifica su actividad.";
  if (userType === "gimnasio") return "Tilde verde: se validó la documentación del gimnasio.";
  return "Tilde azul: cuenta reconocida/famosa.";
}

export function EditUserModal({
  visible,
  user,
  avatarUrl,
  onClose,
  onSaved,
}: {
  visible: boolean;
  user: AdminUserRow;
  avatarUrl: string | null;
  onClose: () => void;
  onSaved: (patch: Partial<AdminUserRow>) => void;
}) {
  const [nombre, setNombre] = useState(user.nombre);
  const [apellido, setApellido] = useState(user.apellido);
  const [username, setUsername] = useState(user.username);
  const [birthdate, setBirthdate] = useState<Date>(parseISODate(user.fecha_nacimiento));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [nacionalidad, setNacionalidad] = useState(user.nacionalidad ?? "");
  const [userType, setUserType] = useState<UserType>(user.user_type);
  const [isVerified, setIsVerified] = useState(user.is_verified);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError("");
    const cleanNombre = nombre.trim();
    const cleanApellido = apellido.trim();
    const cleanUsername = username.trim().toLowerCase();

    if (cleanNombre.length < 2 || cleanApellido.length < 2) {
      setError("Nombre o apellido inválidos.");
      return;
    }
    if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
      setError("El nombre de usuario debe tener 3-30 caracteres: minúsculas, números o guion bajo.");
      return;
    }

    const finalVerified = CONFIGURABLE_VERIFIED_TYPES.includes(userType) ? isVerified : user.is_verified;
    const fechaNacimiento = formatISODate(birthdate);

    setSaving(true);
    const { error: saveError } = await updateUserAsAdmin(user.id, {
      nombre: cleanNombre,
      apellido: cleanApellido,
      username: cleanUsername,
      fecha_nacimiento: fechaNacimiento,
      nacionalidad,
      user_type: userType,
      is_verified: finalVerified,
    });
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }

    onSaved({
      nombre: cleanNombre,
      apellido: cleanApellido,
      username: cleanUsername,
      fecha_nacimiento: fechaNacimiento,
      nacionalidad,
      user_type: userType,
      is_verified: finalVerified,
    });
  }

  const hint = verifiedFieldHint(userType);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.wrap} edges={["bottom"]}>
        <ScreenHeader title="Editar usuario" onBack={onClose} avatarUrl={avatarUrl} />
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.subtitle}>
            @{user.username} · {user.email}
          </Text>

          <AlertMessage message={error} />

          <View style={styles.row2}>
            <View style={styles.half}>
              <FormField label="Nombre" value={nombre} onChangeText={setNombre} />
            </View>
            <View style={styles.half}>
              <FormField label="Apellido" value={apellido} onChangeText={setApellido} />
            </View>
          </View>

          <FormField label="Nombre de usuario" value={username} onChangeText={setUsername} autoCapitalize="none" />

          <View style={styles.field}>
            <Text style={styles.label}>Fecha de nacimiento</Text>
            <Pressable style={styles.dateInput} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.dateText}>{formatISODate(birthdate)}</Text>
            </Pressable>
            {showDatePicker && (
              <>
                <DateTimePicker
                  value={birthdate}
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

          <CountryPicker label="Nacionalidad" placeholder="Elegí la nacionalidad" value={nacionalidad} options={COUNTRIES} onChange={setNacionalidad} />

          <View style={styles.field}>
            <Text style={styles.label}>Rol</Text>
            <View style={styles.chipRow}>
              {USER_TYPE_OPTIONS.map((t) => (
                <Pressable key={t} style={[styles.chip, userType === t && styles.chipActive]} onPress={() => setUserType(t)}>
                  <Text style={[styles.chipText, userType === t && styles.chipTextActive]}>{USER_TYPE_LABELS[t]}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {hint ? (
            <Text style={styles.hint}>{hint}</Text>
          ) : (
            <Pressable style={styles.checkRow} onPress={() => setIsVerified((v) => !v)}>
              <View style={[styles.checkbox, isVerified && styles.checkboxChecked]}>{isVerified && <Text style={styles.checkboxMark}>✓</Text>}</View>
              <Text style={styles.checkLabel}>{verifiedCheckboxLabel(userType)}</Text>
            </Pressable>
          )}

          <PrimaryButton title="Guardar" onPress={handleSave} loading={saving} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, gap: 4, paddingBottom: 48 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: 16 },
  row2: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
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
  dateDoneButton: { alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 4 },
  dateDoneText: { color: colors.accent2, fontWeight: "700", fontSize: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent2 },
  chipText: { fontSize: 12.5, fontWeight: "600", color: colors.textMuted },
  chipTextActive: { color: colors.accent2 },
  hint: { color: colors.textMuted, fontSize: 12.5, marginBottom: 16, lineHeight: 18 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: colors.accent2, borderColor: colors.accent2 },
  checkboxMark: { color: colors.bg, fontSize: 13, fontWeight: "800" },
  checkLabel: { color: colors.text, fontSize: 13, flex: 1, lineHeight: 18 },
});
