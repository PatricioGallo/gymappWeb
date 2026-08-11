import { useLocalSearchParams } from "expo-router";

import { ProgressScreen } from "@/components/progress/ProgressScreen";

export default function ProgressRoute() {
  const { uid } = useLocalSearchParams<{ uid?: string }>();
  return <ProgressScreen uid={uid} />;
}
