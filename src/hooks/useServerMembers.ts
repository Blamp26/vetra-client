import { useState, useEffect, useCallback } from "react";
import { serversApi } from "@/api/servers";
import { useAppStore } from "@/store";
import type { ServerMember } from "@/types";

export function useServerMembers(serverId: number | null) {
  const currentUser = useAppStore((s) => s.currentUser);

  const [members,   setMembers]   = useState<ServerMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!serverId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await serversApi.getMembers(serverId);
      setMembers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки участников");
    } finally {
      setIsLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  const addMember = useCallback(
    async (userId: number) => {
      if (!serverId) return;
      await serversApi.addMember(serverId, userId);
      await load();
    },
    [serverId, load]
  );

  const removeMember = useCallback(
    async (userId: number) => {
      if (!serverId || !currentUser) return;
      await serversApi.removeMember(serverId, userId);
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    },
    [serverId, currentUser]
  );

  return { members, isLoading, error, addMember, removeMember, reload: load };
}
