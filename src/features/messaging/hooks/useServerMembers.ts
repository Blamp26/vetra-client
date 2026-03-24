import { useState, useEffect, useCallback } from "react";
import { serversApi } from "@/api/servers";
import { useAppStore, type RootState } from "@/store";
import type { ServerMember } from "@/shared/types";

export function useServerMembers(serverId: number | null) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);

  const socketManager = useAppStore((s: RootState) => s.socketManager);

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

  useEffect(() => {
    if (!socketManager || !serverId) return;

    const unsubAdded = socketManager.onServerMemberAdded((payload) => {
      if (payload.server_id === serverId) {
        load(); // Просто перегружаем список для простоты
      }
    });

    const unsubRemoved = socketManager.onServerMemberRemoved((payload) => {
      if (payload.server_id === serverId) {
        setMembers((prev) => prev.filter((m) => m.user_id !== payload.user_id));
      }
    });

    return () => {
      unsubAdded();
      unsubRemoved();
    };
  }, [socketManager, serverId, load]);

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
      try {
        await serversApi.removeMember(serverId, userId);
        setMembers((prev) => prev.filter((m) => m.user_id !== userId));
      } catch (err: any) {
        // Если пользователь уже удален (404), просто обновляем локальный список
        if (err?.status === 404 || err?.message?.includes("404")) {
          setMembers((prev) => prev.filter((m) => m.user_id !== userId));
        } else {
          throw err;
        }
      }
    },
    [serverId, currentUser]
  );

  return { members, isLoading, error, addMember, removeMember, reload: load };
}
