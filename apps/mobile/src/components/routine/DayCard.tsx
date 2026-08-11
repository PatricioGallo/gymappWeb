import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors, radius } from "@/theme/colors";

import { ExerciseBlock } from "./ExerciseBlock";
import type { DayFormState, ExerciseFormState } from "./types";

export function DayCard({
  day,
  onChangeName,
  onAddExercise,
  onChangeExercise,
  onPickExercise,
  onRemoveExercise,
  onMoveExercise,
}: {
  day: DayFormState;
  onChangeName: (name: string) => void;
  onAddExercise: () => void;
  onChangeExercise: (index: number, patch: Partial<ExerciseFormState>) => void;
  onPickExercise: (index: number) => void;
  onRemoveExercise: (index: number) => void;
  onMoveExercise: (index: number, direction: -1 | 1) => void;
}) {
  return (
    <View style={styles.card}>
      <TextInput style={styles.dayNameInput} value={day.nombre} onChangeText={onChangeName} maxLength={40} placeholderTextColor={colors.textMuted} />

      {day.exercises.map((exercise, index) => (
        <ExerciseBlock
          key={exercise.key}
          exercise={exercise}
          index={index}
          total={day.exercises.length}
          onChange={(patch) => onChangeExercise(index, patch)}
          onPickExercise={() => onPickExercise(index)}
          onRemove={() => onRemoveExercise(index)}
          onMoveUp={() => onMoveExercise(index, -1)}
          onMoveDown={() => onMoveExercise(index, 1)}
        />
      ))}

      <Pressable style={styles.addBtn} onPress={onAddExercise}>
        <Text style={styles.addBtnText}>+ Agregar ejercicio</Text>
      </Pressable>
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
  dayNameInput: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    borderRadius: radius.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  addBtn: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 14,
  },
  addBtnText: { color: colors.textMuted, fontWeight: "700", fontSize: 13.5 },
});
