import { StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/theme/colors";

export function AlertMessage({ message }: { message: string }) {
  if (!message) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: colors.errorBorder,
    borderLeftWidth: 3,
    borderLeftColor: colors.errorStripe,
    backgroundColor: colors.errorBg,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  text: {
    color: colors.errorText,
    fontSize: 13.5,
  },
});
