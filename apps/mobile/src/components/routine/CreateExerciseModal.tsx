import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AlertMessage } from "@/components/AlertMessage";
import { AuthOverlay } from "@/components/AuthOverlay";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  addExercise,
  CATEGORY_LABELS,
  EXERCISE_CATEGORIES,
  uploadExerciseImageFromUri,
  validateNewExercise,
  type Exercise,
  type ExerciseCategory,
} from "@/lib/exerciseService";
import { colors, radius } from "@/theme/colors";

const VALIDATION_MESSAGES = {
  name_short: "Nombre del ejercicio muy corto.",
  name_long: "Nombre del ejercicio muy largo.",
  info_short: "Descripción del ejercicio muy corta (mínimo 100 caracteres).",
  info_long: "Descripción del ejercicio muy larga (máximo 600 caracteres).",
  category_missing: "Elegí una categoría para el ejercicio.",
} as const;

export function CreateExerciseModal({
  visible,
  userId,
  avatarUrl,
  onClose,
  onCreated,
}: {
  visible: boolean;
  userId: string;
  avatarUrl: string | null;
  onClose: () => void;
  onCreated: (exercise: Exercise) => void;
}) {
  const [name, setName] = useState("");
  const [info, setInfo] = useState("");
  const [category, setCategory] = useState<ExerciseCategory | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName("");
      setInfo("");
      setCategory(null);
      setIsPublic(true);
      setImageUri(null);
      setImageMimeType(null);
      setError("");
      setSaving(false);
    }
  }, [visible]);

  async function handlePickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    setImageUri(result.assets[0].uri);
    setImageMimeType(result.assets[0].mimeType ?? null);
  }

  async function handleSubmit() {
    const validationError = validateNewExercise(name.trim(), info.trim(), category ?? "");
    if (validationError) {
      setError(VALIDATION_MESSAGES[validationError]);
      return;
    }
    setError("");
    setSaving(true);

    let imageUrl: string | undefined;
    if (imageUri) {
      const uploadResult = await uploadExerciseImageFromUri(userId, imageUri, imageMimeType);
      if (uploadResult.error) {
        setSaving(false);
        setError(uploadResult.error);
        return;
      }
      imageUrl = uploadResult.url;
    }

    const { exercise, error: createError } = await addExercise(userId, name.trim(), info.trim(), category as ExerciseCategory, isPublic, imageUrl);
    setSaving(false);
    if (createError || !exercise) {
      setError(createError ?? "No se pudo guardar el ejercicio. Probá de nuevo.");
      return;
    }
    onCreated(exercise);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.wrap} edges={["bottom"]}>
        <ScreenHeader title="Agregar un ejercicio" onBack={onClose} avatarUrl={avatarUrl} />

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.subtitle}>Se guarda con tu nombre como autor. Elegís si lo pueden usar todos o solo vos.</Text>

          <AlertMessage message={error} />

          <FormField label="Nombre del ejercicio" placeholder="Ej: Press inclinado con mancuernas" value={name} onChangeText={setName} />
          <FormField
            label="Descripción"
            placeholder="Cómo se hace, en qué fijarse (mínimo 100 caracteres)"
            value={info}
            onChangeText={setInfo}
            multiline
            numberOfLines={5}
            style={{ minHeight: 110, textAlignVertical: "top" }}
          />

          <View style={styles.field}>
            <Text style={styles.label}>Categoría</Text>
            <View style={styles.chipRow}>
              {EXERCISE_CATEGORIES.map((cat) => (
                <Pressable key={cat} style={[styles.chip, category === cat && styles.chipActive]} onPress={() => setCategory(cat)}>
                  <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>{CATEGORY_LABELS[cat]}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Imagen ilustrativa (opcional)</Text>
            <Pressable style={styles.imagePicker} onPress={handlePickImage}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.imagePreview} />
              ) : (
                <>
                  <Ionicons name="image-outline" size={22} color={colors.textMuted} />
                  <Text style={styles.imagePickerText}>Hacé clic para subir una imagen</Text>
                </>
              )}
            </Pressable>
            <Text style={styles.hint}>JPG, PNG o WEBP · hasta 2MB</Text>
            <Text style={styles.hint}>Si no subís nada, se usa una imagen genérica.</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Visibilidad</Text>
            <View style={styles.visibilityRow}>
              <Pressable style={[styles.visibilityOption, !isPublic && styles.visibilityOptionActive]} onPress={() => setIsPublic(false)}>
                <Text style={[styles.visibilityText, !isPublic && styles.visibilityTextActive]}>Privado</Text>
                <Text style={styles.visibilityHint}>Solo vos lo vas a poder agregar a tus rutinas</Text>
              </Pressable>
              <Pressable style={[styles.visibilityOption, isPublic && styles.visibilityOptionActive]} onPress={() => setIsPublic(true)}>
                <Text style={[styles.visibilityText, isPublic && styles.visibilityTextActive]}>Público</Text>
                <Text style={styles.visibilityHint}>Cualquiera lo puede agregar a las suyas</Text>
              </Pressable>
            </View>
          </View>

          <PrimaryButton title="Agregar ejercicio" onPress={handleSubmit} loading={saving} />
        </ScrollView>
      </SafeAreaView>

      {saving && <AuthOverlay state={{ kind: "loading", text: "Subiendo ejercicio nuevo..." }} />}
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, gap: 4, paddingBottom: 48 },
  subtitle: { color: colors.textMuted, fontSize: 13.5, marginBottom: 16 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
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
  imagePicker: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.input,
    minHeight: 110,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    overflow: "hidden",
  },
  imagePickerText: { color: colors.textMuted, fontSize: 13 },
  imagePreview: { width: "100%", height: 150 },
  hint: { color: colors.textMuted, fontSize: 11.5, marginTop: 6 },
  visibilityRow: { flexDirection: "row", gap: 10 },
  visibilityOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    borderRadius: radius.input,
    padding: 12,
    gap: 4,
  },
  visibilityOptionActive: { borderColor: colors.accent2, backgroundColor: colors.accentSoft },
  visibilityText: { color: colors.text, fontWeight: "700", fontSize: 13.5 },
  visibilityTextActive: { color: colors.accent2 },
  visibilityHint: { color: colors.textMuted, fontSize: 11 },
});
