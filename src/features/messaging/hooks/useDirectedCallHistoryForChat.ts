import { useEffect, useMemo, useRef } from "react";
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
  const replayGuardRef = useRef<{ peerUserId: string; replayCandidate: boolean } | null>(null);
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

    const existingGuard = replayGuardRef.current;
    if (existingGuard?.peerUserId === peerUserId && existingGuard.replayCandidate) {
      existingGuard.replayCandidate = false;
    } else {
      if (typeof refreshDirectedCallHistory === "function") {
        void refreshDirectedCallHistory();
      }
      replayGuardRef.current = { peerUserId, replayCandidate: false };
    }

    return () => {
      const guard = replayGuardRef.current;
      if (!guard || guard.peerUserId !== peerUserId) return;

      guard.replayCandidate = true;
      queueMicrotask(() => {
        if (replayGuardRef.current === guard && guard.replayCandidate) {
          replayGuardRef.current = null;
        }
      });
    };
  }, [peerUserId, refreshDirectedCallHistory]);

  const entries = useMemo(() => {
    if (!peerUserId) return [];
    const loadedEntries = typeof getDirectedCallHistoryEntries === "function"
      ? getDirectedCallHistoryEntries()
      : [];
    return loadedEntries.filter(
      (entry: DirectedCallHistoryEntry) => entry.peer?.user_id === peerUserId,
    );
  }, [getDirectedCallHistoryEntries, peerUserId]);

  return { peerUserId, entries };
}
