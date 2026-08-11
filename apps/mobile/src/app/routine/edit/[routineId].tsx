import { useLocalSearchParams } from "expo-router";

import { EditRoutineScreen } from "@/components/routine/EditRoutineScreen";

export default function EditRoutineRoute() {
  const { routineId } = useLocalSearchParams<{ routineId: string }>();
  return <EditRoutineScreen routineId={routineId} />;
}
