import { useLocalSearchParams } from "expo-router";

import { PublicProfileScreen } from "@/components/profile/PublicProfileScreen";

export default function PublicProfileRoute() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <PublicProfileScreen username={username} />;
}
