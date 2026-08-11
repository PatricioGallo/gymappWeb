import { useLocalSearchParams } from "expo-router";

import { FollowListScreen, type FollowListTab } from "@/components/profile/FollowListScreen";

export default function FollowersRoute() {
  const { username, tab } = useLocalSearchParams<{ username: string; tab?: string }>();
  const initialTab: FollowListTab | undefined = tab === "following" || tab === "subscribers" ? tab : tab === "followers" ? "followers" : undefined;
  return <FollowListScreen username={username} initialTab={initialTab} />;
}
