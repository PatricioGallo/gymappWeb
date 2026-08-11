import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AlertMessage } from "@/components/AlertMessage";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { addBuiltinExercise, updateExercise, type AdminExerciseRow } from "@/lib/adminExerciseService";
import { addExercise, CATEGORY_LABELS, EXERCISE_CATEGORIES, uploadExerciseImageFromUri, validateNewExercise, type ExerciseCategory } from "@/lib/exerciseService";
import { colors, radius } from "@/theme/colors";

const VALIDATION_MESSAGES = {
  name_short: "Nombre del ejercicio muy corto.",
  name_long: "Nombre del ejercicio muy largo.",
  info_short: "Descripción del ejercicio muy corta (mínimo 100 caracteres).",
  info_long: "Descripción del ejercicio muy larga (máximo 600 caracteres).",
  category_missing: "Elegí una categoría para el ejercicio.",
} as const;

export function ExerciseFormModal({
  visible,
  existing,
  isBuiltinSubTab,
  adminId,
  avatarUrl,
  onClose,
  onSaved,
}: {
  visible: boolean;
  existing: AdminExerciseRow | null;
  isBuiltinSubTab: boolean;
  adminId: string;
  avatarUrl: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isBuiltin = existing ? existing.is_builtin : isBuiltinSubTab;
  const [name, setName] = useState(existing?.name ?? "");
  const [info, setInfo] = useState(existing?.info ?? "");
  const [category, setCategory] = useState<ExerciseCategory | null>(existing?.category ?? null);
  const [isPublic, setIsPublic] = useState(existing?.is_public !== false);
  const [imageUri, setImageUri] = useState<string | null>(existing?.image_url ?? null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [imageChanged, setImageChanged] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handlePickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    setImageUri(result.assets[0].uri);
    setImageMimeType(result.assets[0].mimeType ?? null);
    setImageChanged(true);
  }

  async function handleSubmit() {
    const validationError = validateNewExercise(name.trim(), info.trim(), category ?? "");
    if (validationError) {
      setError(VALIDATION_MESSAGES[validationError]);
      return;
    }
    setError("");
    setSaving(true);

    let imageUrl: string | null = existing?.image_url ?? null;
    if (imageChanged && imageUri) {
      const uploadResult = await uploadExerciseImageFromUri(adminId, imageUri, imageMimeType);
      if (uploadResult.error) {
        setSaving(false);
        setError(uploadResult.error);
        return;
      }
      imageUrl = uploadResult.url ?? null;
    } else if (imageChanged && !imageUri) {
      imageUrl = null;
    }

    if (existing) {
      const { error: saveError } = await updateExercise(existing.id, {
        name: name.trim(),
        info: info.trim(),
        category: category as ExerciseCategory,
        image_url: imageUrl,
        ...(isBuiltin ? {} : { is_public: isPublic }),
      });
      setSaving(false);
      if (saveError) {
        setError(saveError);
        return;
      }
    } else if (isBuiltin) {
      const { error: saveError } = await addBuiltinExercise(name.trim(), info.trim(), category as ExerciseCategory, imageUrl ?? undefined);
      setSaving(false);
      if (saveError) {
        setError(saveError);
        return;
      }
    } else {
      const { error: saveError } = await addExercise(adminId, name.trim(), info.trim(), category as ExerciseCategory, isPublic, imageUrl ?? undefined);
      setSaving(false);
      if (saveError) {
        setError(saveError);
        return;
      }
    }

    onSaved();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.wrap} edges={["bottom"]}>
        <ScreenHeader title={existing ? "Editar ejercicio" : "Agregar ejercicio"} onBack={onClose} avatarUrl={avatarUrl} />
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.subtitle}>{isBuiltin ? "Ejercicio del catálogo de Gym Social." : "Ejercicio creado por un usuario."}</Text>

          <AlertMessage message={error} />

          <FormField label="Nombre" value={name} onChangeText={setName} placeholder="Ej: Press inclinado con mancuernas" />
          <FormField
            label="Descripción"
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
            {imageUri && (
              <Pressable
                onPress={() => {
                  setImageUri(null);
                  setImageChanged(true);
                }}
              >
                <Text style={styles.removeImageText}>Quitar imagen</Text>
              </Pressable>
            )}
            <Text style={styles.hint}>JPG, PNG o WEBP · hasta 2MB</Text>
          </View>

          {!isBuiltin && (
            <View style={styles.field}>
              <Text style={styles.label}>Visibilidad</Text>
              <View style={styles.visibilityRow}>
                <Pressable style={[styles.visibilityOption, !isPublic && styles.visibilityOptionActive]} onPress={() => setIsPublic(false)}>
                  <Text style={[styles.visibilityText, !isPublic && styles.visibilityTextActive]}>Privado</Text>
                  <Text style={styles.visibilityHint}>Solo el autor lo puede agregar</Text>
                </Pressable>
                <Pressable style={[styles.visibilityOption, isPublic && styles.visibilityOptionActive]} onPress={() => setIsPublic(true)}>
                  <Text style={[styles.visibilityText, isPublic && styles.visibilityTextActive]}>Público</Text>
                  <Text style={styles.visibilityHint}>Cualquiera lo puede agregar</Text>
                </Pressable>
              </View>
            </View>
          )}

          <PrimaryButton title="Guardar" onPress={handleSubmit} loading={saving} />
        </ScrollView>
      </SafeAreaView>
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
  removeImageText: { color: colors.accent2, fontSize: 12.5, fontWeight: "600", marginTop: 8 },
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
