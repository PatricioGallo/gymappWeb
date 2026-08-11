import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AlertMessage } from "@/components/AlertMessage";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ToggleRow } from "@/components/settings/ToggleRow";
import { updateEmail, updatePassword, updateProfileFields, type Profile } from "@/lib/profileService";
import { colors, radius } from "@/theme/colors";

type PrivacyField = "is_public" | "show_last_seen" | "show_read_receipts";

export function PrivacyTab({ profile, userId, onSaved }: { profile: Profile; userId: string; onSaved: (patch: Partial<Profile>) => void }) {
  const [isPublic, setIsPublic] = useState(profile.is_public);
  const [showLastSeen, setShowLastSeen] = useState(profile.show_last_seen);
  const [showReadReceipts, setShowReadReceipts] = useState(profile.show_read_receipts);
  const [privacyError, setPrivacyError] = useState("");
  const [savingField, setSavingField] = useState<PrivacyField | null>(null);

  async function handleToggle(field: PrivacyField, value: boolean, setter: (v: boolean) => void) {
    setPrivacyError("");
    setter(value);
    setSavingField(field);
    const { error } = await updateProfileFields(userId, { [field]: value });
    setSavingField(null);
    if (error) {
      setter(!value);
      setPrivacyError(error);
      return;
    }
    onSaved({ [field]: value });
  }

  const [mail, setMail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [accountError, setAccountError] = useState("");
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountSavedMsg, setAccountSavedMsg] = useState("");

  async function handleSaveAccount() {
    setAccountError("");
    const cleanMail = mail.trim();
    if (!cleanMail && !pass) {
      setAccountError("Ingresá un mail o una contraseña nueva.");
      return;
    }
    if (pass && pass !== pass2) {
      setAccountError("Las contraseñas no coinciden.");
      return;
    }
    setAccountSaving(true);
    if (cleanMail) {
      const { error } = await updateEmail(cleanMail);
      if (error) {
        setAccountSaving(false);
        setAccountError(error);
        return;
      }
    }
    if (pass) {
      const { error } = await updatePassword(pass);
      if (error) {
        setAccountSaving(false);
        setAccountError(error);
        return;
      }
    }
    setAccountSaving(false);
    setAccountSavedMsg(cleanMail ? "¡Guardado! Revisá tu casilla para confirmar el mail nuevo." : "¡Cambios guardados!");
    setMail("");
    setPass("");
    setPass2("");
    setTimeout(() => setAccountSavedMsg(""), cleanMail ? 2600 : 1600);
  }

  return (
    <View style={styles.stack}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Privacidad</Text>
        <ToggleRow
          label="Perfil público"
          hint="Público: cualquiera ve tus rutinas y estadísticas. Privado: solo tu información básica."
          value={isPublic}
          onChange={(v) => handleToggle("is_public", v, setIsPublic)}
          disabled={savingField === "is_public"}
        />
        <ToggleRow
          label="Última conexión"
          hint="Si lo desactivás, dejás de ver la última conexión de los demás (aunque ellos lo tengan activado)."
          value={showLastSeen}
          onChange={(v) => handleToggle("show_last_seen", v, setShowLastSeen)}
          disabled={savingField === "show_last_seen"}
        />
        <ToggleRow
          label="Confirmaciones de lectura"
          hint="Si lo desactivás, dejás de ver cuándo leen tus mensajes (aunque el otro lo tenga activado)."
          value={showReadReceipts}
          onChange={(v) => handleToggle("show_read_receipts", v, setShowReadReceipts)}
          disabled={savingField === "show_read_receipts"}
        />
        <AlertMessage message={privacyError} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cuenta</Text>
        <FormField label="Mail" placeholder={profile.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={mail} onChangeText={setMail} />
        <FormField label="Contraseña nueva" placeholder="••••••••••••" secureTextEntry value={pass} onChangeText={setPass} />
        <FormField label="Repetir contraseña nueva" placeholder="••••••••••••" secureTextEntry value={pass2} onChangeText={setPass2} />
        <AlertMessage message={accountError} />
        <PrimaryButton title="Guardar" onPress={handleSaveAccount} loading={accountSaving} />
        {accountSavedMsg ? <Text style={styles.savedText}>{accountSavedMsg}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 18,
    gap: 4,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 6 },
  savedText: { color: colors.live, fontSize: 13, fontWeight: "600", textAlign: "center", marginTop: 10 },
});
