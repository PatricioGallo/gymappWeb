import { useLocalSearchParams } from "expo-router";

import { PesosScreen } from "@/components/pesos/PesosScreen";

export default function PesosRoute() {
  const { routineId, uid } = useLocalSearchParams<{ routineId: string; uid?: string }>();
  return <PesosScreen routineId={routineId} uid={uid} />;
}
