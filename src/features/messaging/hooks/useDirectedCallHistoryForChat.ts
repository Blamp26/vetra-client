import { useEffect, useMemo } from "react";
import { useAppStore, type RootState } from "@/store";
import type { ActiveChat } from "@/shared/types";
import type { DirectedCallHistoryEntry } from "@/api/directedCallHistory";

function resolveDirectPeerUserId(
  activeChat: ActiveChat | null,
  currentUser: RootState["currentUser"],
  conversationPreviews: RootState["conversationPreviews"],
): string | null {
  if (!activeChat || activeChat.type !== "direct") return null;
  if (!currentUser || activeChat.partnerId === currentUser.id) return null;

  const preview = conversationPreviews[activeChat.partnerId];
  if (!preview || preview.partner_id !== activeChat.partnerId) return null;

  const peerUserId = preview.partner_public_id;
  if (!peerUserId || peerUserId === currentUser.public_id) return null;

  return peerUserId;
}

export function useDirectedCallHistoryForChat(activeChat: ActiveChat | null) {
  const currentUser = useAppStore((state: RootState) => state.currentUser);
  const conversationPreviews = useAppStore(
    (state: RootState) => state.conversationPreviews,
  );
  const refreshDirectedCallHistory = useAppStore(
    (state: RootState) => state.refreshDirectedCallHistory,
  );
  const getDirectedCallHistoryEntries = useAppStore(
    (state: RootState) => state.getDirectedCallHistoryEntries,
  );

  const peerUserId = useMemo(
    () => resolveDirectPeerUserId(activeChat, currentUser, conversationPreviews),
    [activeChat, currentUser, conversationPreviews],
  );

  useEffect(() => {
    if (!peerUserId) return;
    void refreshDirectedCallHistory();
  }, [peerUserId, refreshDirectedCallHistory]);

  const entries = useMemo(() => {
    if (!peerUserId) return [];
    return getDirectedCallHistoryEntries().filter(
      (entry: DirectedCallHistoryEntry) => entry.peer?.user_id === peerUserId,
    );
  }, [getDirectedCallHistoryEntries, peerUserId]);

  return { peerUserId, entries };
}
