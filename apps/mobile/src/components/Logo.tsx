import { Image, StyleSheet } from "react-native";

export function Logo({ height = 48 }: { height?: number }) {
  return (
    <Image
      source={require("@/assets/images/logo.png")}
      style={[styles.image, { height, width: height * (251 / 134) }]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  image: {
    // el logo original es negro sobre transparente; se tiñe de blanco
    // para leerse bien sobre el fondo oscuro, igual que en la web
    // (filter: brightness(0) invert(1) en modern.css).
    tintColor: "#ffffff",
  },
});
