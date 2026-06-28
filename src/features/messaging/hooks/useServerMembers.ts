import { useState, useEffect, useCallback } from "react";
import { serversApi } from "@/api/servers";
import { useAppStore, type RootState } from "@/store";
import type { ResourceRef, Server, ServerMember } from "@/shared/types";
import { serverRef } from "@/shared/utils/refs";

export function useServerMembers(server: Server | null) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);

  const socketManager = useAppStore((s: RootState) => s.socketManager);

  const [members,   setMembers]   = useState<ServerMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const serverId = server?.id ?? null;

  const load = useCallback(async () => {
    if (!server) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await serversApi.getMembers(serverRef(server) ?? server.id);
      setMembers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error loading members");
    } finally {
      setIsLoading(false);
    }
  }, [server]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!socketManager || !serverId) return;

    const unsubAdded = socketManager.onServerMemberAdded((payload) => {
      if (payload.server_id === serverId) {
        load(); // Simply reload the list for simplicity
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
    async (memberRef: ResourceRef) => {
      if (!server) return;
      await serversApi.addMember(serverRef(server) ?? server.id, memberRef);
      await load();
    },
    [server, load]
  );

  const removeMember = useCallback(
    async (memberRef: ResourceRef) => {
      if (!server || !currentUser) return;
      try {
        await serversApi.removeMember(serverRef(server) ?? server.id, memberRef);
        setMembers((prev) => prev.filter((m) => m.user_id !== memberRef && m.user_public_id !== memberRef));
      } catch (err: any) {
        // If user is already removed (404), just update local list
        if (err?.status === 404 || err?.message?.includes("404")) {
          setMembers((prev) => prev.filter((m) => m.user_id !== memberRef && m.user_public_id !== memberRef));
        } else {
          throw err;
        }
      }
    },
    [server, currentUser]
  );

  return { members, isLoading, error, addMember, removeMember, reload: load };
}
