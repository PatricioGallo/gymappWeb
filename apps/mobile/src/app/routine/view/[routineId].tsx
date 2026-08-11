import { useLocalSearchParams } from "expo-router";

import { ViewRoutineScreen } from "@/components/routine/ViewRoutineScreen";

export default function ViewRoutineRoute() {
  const { routineId } = useLocalSearchParams<{ routineId: string }>();
  return <ViewRoutineScreen routineId={routineId} />;
}
