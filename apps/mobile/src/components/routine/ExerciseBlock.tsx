import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors, radius } from "@/theme/colors";

import type { ExerciseFormState } from "./types";

export function ExerciseBlock({
  exercise,
  index,
  total,
  onChange,
  onPickExercise,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  exercise: ExerciseFormState;
  index: number;
  total: number;
  onChange: (patch: Partial<ExerciseFormState>) => void;
  onPickExercise: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <View style={[styles.block, index > 0 && styles.blockBorder]}>
      <View style={styles.topRow}>
        <View style={styles.reorderCol}>
          <Pressable disabled={isFirst} onPress={onMoveUp} hitSlop={4} style={[styles.reorderBtn, isFirst && styles.reorderBtnDisabled]}>
            <Ionicons name="caret-up" size={12} color={isFirst ? colors.border : colors.textMuted} />
          </Pressable>
          <Pressable disabled={isLast} onPress={onMoveDown} hitSlop={4} style={[styles.reorderBtn, isLast && styles.reorderBtnDisabled]}>
            <Ionicons name="caret-down" size={12} color={isLast ? colors.border : colors.textMuted} />
          </Pressable>
        </View>

        <Pressable style={styles.pickerBtn} onPress={onPickExercise}>
          <Text style={styles.pickerBtnText} numberOfLines={1}>
            {exercise.exerciseName ?? "Elegir ejercicio"}
          </Text>
        </Pressable>

        {total > 1 && (
          <Pressable onPress={onRemove} hitSlop={8} style={styles.removeBtn}>
            <Ionicons name="close" size={16} color={colors.dangerText} />
          </Pressable>
        )}
      </View>

      <View style={styles.fieldsRow}>
        <View style={styles.miniField}>
          <Text style={styles.miniLabel}>Series</Text>
          <TextInput
            style={styles.miniInput}
            keyboardType="number-pad"
            placeholder="Ej: 3"
            placeholderTextColor={colors.textMuted}
            value={exercise.serie}
            onChangeText={(v) => onChange({ serie: v })}
          />
        </View>
        <Text style={styles.sep}>x</Text>
        <View style={styles.miniField}>
          <Text style={styles.miniLabel}>Repeticiones</Text>
          <TextInput
            style={styles.miniInput}
            keyboardType="number-pad"
            placeholder="Ej: 10"
            placeholderTextColor={colors.textMuted}
            value={exercise.repe}
            onChangeText={(v) => onChange({ repe: v })}
          />
        </View>
        <Text style={styles.sep}>-</Text>
        <View style={styles.miniField}>
          <Text style={styles.miniLabel}>Hasta</Text>
          <TextInput
            style={styles.miniInput}
            keyboardType="number-pad"
            placeholder="Rango"
            placeholderTextColor={colors.textMuted}
            value={exercise.repeMax}
            onChangeText={(v) => onChange({ repeMax: v })}
          />
        </View>
      </View>

      <Pressable style={styles.checkRow} onPress={() => onChange({ sinPeso: !exercise.sinPeso })}>
        <View style={[styles.checkbox, exercise.sinPeso && styles.checkboxChecked]}>
          {exercise.sinPeso && <Ionicons name="checkmark" size={12} color={colors.bg} />}
        </View>
        <Text style={styles.checkLabel}>Sin peso</Text>
      </Pressable>
      <Pressable style={styles.checkRow} onPress={() => onChange({ mismoPeso: !exercise.mismoPeso })}>
        <View style={[styles.checkbox, exercise.mismoPeso && styles.checkboxChecked]}>
          {exercise.mismoPeso && <Ionicons name="checkmark" size={12} color={colors.bg} />}
        </View>
        <Text style={styles.checkLabel}>Mismo peso en todas las series</Text>
      </Pressable>

      <TextInput
        style={styles.notaInput}
        placeholder="Nota para este ejercicio (opcional)"
        placeholderTextColor={colors.textMuted}
        value={exercise.nota}
        onChangeText={(v) => onChange({ nota: v })}
        maxLength={140}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingTop: 16, paddingBottom: 4, gap: 10 },
  blockBorder: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  reorderCol: { gap: 2 },
  reorderBtn: {
    width: 22,
    height: 15,
    borderRadius: 4,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  reorderBtnDisabled: { opacity: 0.4 },
  pickerBtn: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  pickerBtnText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  removeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldsRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  miniField: { flex: 1, gap: 4 },
  miniLabel: { color: colors.textMuted, fontSize: 11.5, fontWeight: "600" },
  miniInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: colors.text,
    fontSize: 14,
    textAlign: "center",
  },
  sep: { color: colors.textMuted, fontSize: 14, paddingBottom: 10 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: colors.accent2, borderColor: colors.accent2 },
  checkLabel: { color: colors.textMuted, fontSize: 13 },
  notaInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 13.5,
    marginTop: 2,
  },
});
