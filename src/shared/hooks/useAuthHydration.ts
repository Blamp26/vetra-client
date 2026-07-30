import { useEffect } from "react";
import { connectSocket } from "@/services/socket";
import { useAppStore } from "@/store";
import { reconcileUnreadLists } from "@/features/messaging/services/unreadReconciliation";

/**
 * Re-fetches room previews, conversation previews, servers, and connects the
 * socket whenever the app has a currentUser but no socket.
 */
export function useAuthHydration() {
  const currentUser = useAppStore((s) => s.currentUser);
  const authToken = useAppStore((s) => s.authToken);
  const socketManager = useAppStore((s) => s.socketManager);
  const setSocketManager = useAppStore((s) => s.setSocketManager);
  const setPreviews = useAppStore((s) => s.setPreviews);
  const setRoomPreviews = useAppStore((s) => s.setRoomPreviews);
  const setServers = useAppStore((s) => s.setServers);
  const setServerChannels = useAppStore((s) => s.setServerChannels);

  useEffect(() => {
    if (!currentUser || !authToken || socketManager !== null) return;

    let cancelled = false;

    (async () => {
      try {
        const manager = await connectSocket(
          authToken,
          currentUser.id,
          currentUser.public_id ?? currentUser.id,
        );
        if (cancelled) {
          manager.disconnect();
          return;
        }
        setSocketManager(manager);

        await reconcileUnreadLists({
          setPreviews,
          setRoomPreviews,
          setServers,
          setServerChannels,
        });
      } catch (err) {
        console.error("Hydration failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    currentUser,
    authToken,
    socketManager,
    setSocketManager,
    setPreviews,
    setRoomPreviews,
    setServers,
    setServerChannels,
  ]);
}
