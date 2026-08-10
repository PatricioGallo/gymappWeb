import { Ionicons } from "@expo/vector-icons";

import { colors } from "@/theme/colors";
import { getVerifiedBadgeColor, type UserType } from "@/lib/verifiedBadge";

export function VerifiedBadge({ userType, isVerified, size = 18 }: { userType: UserType; isVerified: boolean; size?: number }) {
  const color = getVerifiedBadgeColor(userType, isVerified);
  if (!color) return null;
  return <Ionicons name="checkmark-circle" size={size} color={color === "blue" ? colors.verifiedBlue : colors.verifiedGreen} />;
}
