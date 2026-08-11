import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { AlertMessage } from "@/components/AlertMessage";
import { CountryPicker } from "@/components/CountryPicker";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { LinksEditor } from "@/components/settings/LinksEditor";
import { calcularEdad } from "@/lib/age";
import { COUNTRIES } from "@/lib/countries";
import { MAX_BIO_LENGTH, parseProfileLinks, updateProfileFields, type Profile, type ProfileLink } from "@/lib/profileService";
import { getPlatform } from "@/lib/socialLinks";
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

function buildFinalLinks(links: ProfileLink[]): { links?: ProfileLink[]; error?: string } {
  const result: ProfileLink[] = [];
  for (const l of links) {
    const platform = getPlatform(l.platform);
    if (platform.key === "other") {
      const label = l.label.trim();
      let url = l.url.trim();
      if (!label && !url) continue;
      if (!label || !url) return { error: "Completá el nombre y la URL de cada enlace (o quitalo con la ×)." };
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      try {
        new URL(url);
      } catch {
        return { error: `La URL "${url}" no es válida.` };
      }
      result.push({ platform: "other", label, url });
    } else {
      const handle = l.url.trim();
      if (!handle) continue;
      const url = platform.buildUrl(handle);
      if (!url) continue;
      result.push({ platform: platform.key, label: platform.label, url });
    }
  }
  return { links: result };
}

export function EditProfileTab({ profile, userId, onSaved }: { profile: Profile; userId: string; onSaved: (patch: Partial<Profile>) => void }) {
  const [nombre, setNombre] = useState(profile.nombre);
  const [apellido, setApellido] = useState(profile.apellido);
  const [birthdate, setBirthdate] = useState<Date>(parseISODate(profile.fecha_nacimiento));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [nacionalidad, setNacionalidad] = useState(profile.nacionalidad ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [links, setLinks] = useState<ProfileLink[]>(parseProfileLinks(profile.links));

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setError("");
    const cleanNombre = nombre.trim();
    const cleanApellido = apellido.trim();

    if (cleanNombre.length < 2 || !Number.isNaN(Number(cleanNombre))) {
      setError("Ingresaste un nombre inválido.");
      return;
    }
    if (cleanApellido.length < 2 || !Number.isNaN(Number(cleanApellido))) {
      setError("Ingresaste un apellido inválido.");
      return;
    }
    const fechaNacimiento = formatISODate(birthdate);
    const edad = calcularEdad(fechaNacimiento);
    if (edad < 12 || edad > 100) {
      setError("Ingresá una fecha de nacimiento válida.");
      return;
    }

    const { links: finalLinks, error: linksError } = buildFinalLinks(links);
    if (linksError) {
      setError(linksError);
      return;
    }

    setSaving(true);
    const patch = {
      nombre: cleanNombre,
      apellido: cleanApellido,
      fecha_nacimiento: fechaNacimiento,
      nacionalidad,
      bio: bio.trim() || null,
      links: finalLinks as unknown as Profile["links"],
    };
    const { error: saveError } = await updateProfileFields(userId, patch);
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }

    onSaved(patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  }

  return (
    <View style={styles.card}>
      <AlertMessage message={error} />

      <View style={styles.row2}>
        <View style={styles.half}>
          <FormField label="Nombre" value={nombre} onChangeText={setNombre} />
        </View>
        <View style={styles.half}>
          <FormField label="Apellido" value={apellido} onChangeText={setApellido} />
        </View>
      </View>

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

      <CountryPicker label="Nacionalidad" placeholder="Elegí tu nacionalidad" value={nacionalidad} options={COUNTRIES} onChange={setNacionalidad} />

      <View style={styles.field}>
        <FormField
          label="Biografía"
          placeholder="Contanos algo sobre vos"
          value={bio}
          onChangeText={(v) => setBio(v.slice(0, MAX_BIO_LENGTH))}
          multiline
          numberOfLines={3}
          style={{ minHeight: 70, textAlignVertical: "top" }}
        />
        <Text style={styles.counter}>
          {bio.length}/{MAX_BIO_LENGTH}
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Redes y enlaces</Text>
        <Text style={styles.hint}>Agregá tus redes para que aparezcan como iconos en tu perfil.</Text>
        <LinksEditor links={links} onChange={setLinks} />
      </View>

      <PrimaryButton title="Guardar cambios" onPress={handleSave} loading={saving} />
      {saved && <Text style={styles.savedText}>¡Cambios guardados!</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 18,
    gap: 4,
  },
  row2: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
  hint: { color: colors.textMuted, fontSize: 12.5, marginBottom: 10, marginTop: -2 },
  counter: { color: colors.textMuted, fontSize: 11.5, textAlign: "right", marginTop: 4 },
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
  savedText: { color: colors.live, fontSize: 13, fontWeight: "600", textAlign: "center", marginTop: 10 },
});
