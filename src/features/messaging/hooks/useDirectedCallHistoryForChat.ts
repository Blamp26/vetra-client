import { useEffect, useMemo, useRef } from "react";
import { useAppStore, type RootState } from "@/store";
import type { ActiveChat } from "@/shared/types";
import type { DirectedCallHistoryEntry } from "@/api/directedCallHistory";
import { useOptionalPersistentCall } from "@/features/calling/context/PersistentCallContext";

const TERMINAL_STATES = new Set([
  "unavailable",
  "undelivered",
  "busy",
  "declined",
  "cancelled",
  "no_answer",
  "connection_failed",
  "ended",
]);

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
  const observedLifecycleRef = useRef<{
    callId: string;
    state: string;
    stateVersion: number;
  } | null>(null);
  const terminalRefreshKeysRef = useRef(new Set<string>());
  const terminalRefreshCallIdsRef = useRef(new Set<string>());
  const hasMountedRef = useRef(false);
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
  const persistentCall = useOptionalPersistentCall();
  const presentation = persistentCall?.presentation;

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

  const terminalProjection = useMemo(() => {
    if (
      !presentation ||
      !presentation.callId ||
      !presentation.peerPublicId ||
      presentation.stateVersion === null ||
      !presentation.canonicalState ||
      !TERMINAL_STATES.has(presentation.canonicalState)
    ) {
      return null;
    }

    return {
      callId: presentation.callId,
      peerUserId: presentation.peerPublicId,
      state: presentation.canonicalState,
      stateVersion: presentation.stateVersion,
    };
  }, [presentation]);

  useEffect(() => {
    const previous = observedLifecycleRef.current;
    const current = terminalProjection
      ? {
          callId: terminalProjection.callId,
          state: terminalProjection.state,
          stateVersion: terminalProjection.stateVersion,
        }
      : null;

    observedLifecycleRef.current = current;
    const wasMounted = hasMountedRef.current;
    hasMountedRef.current = true;

    if (!terminalProjection || !wasMounted) return;

    // A canonical terminal projection is immutable. A later version for the
    // same call is a duplicate/conflict, not another terminal transition.
    const isNewTerminalTransition =
      !previous ||
      previous.callId !== terminalProjection.callId ||
      TERMINAL_STATES.has(previous.state) === false;
    if (!isNewTerminalTransition || terminalProjection.peerUserId !== peerUserId) return;

    const refreshKey = `${terminalProjection.callId}:${terminalProjection.stateVersion}`;
    if (
      terminalRefreshKeysRef.current.has(refreshKey) ||
      terminalRefreshCallIdsRef.current.has(terminalProjection.callId)
    ) {
      return;
    }

    terminalRefreshKeysRef.current.add(refreshKey);
    terminalRefreshCallIdsRef.current.add(terminalProjection.callId);
    while (terminalRefreshKeysRef.current.size > 64) {
      const oldestKey = terminalRefreshKeysRef.current.values().next().value as string | undefined;
      if (!oldestKey) break;
      terminalRefreshKeysRef.current.delete(oldestKey);
    }
    while (terminalRefreshCallIdsRef.current.size > 64) {
      const oldestCallId = terminalRefreshCallIdsRef.current.values().next().value as string | undefined;
      if (!oldestCallId) break;
      terminalRefreshCallIdsRef.current.delete(oldestCallId);
    }

    if (typeof refreshDirectedCallHistory === "function") {
      void refreshDirectedCallHistory();
    }
  }, [peerUserId, refreshDirectedCallHistory, terminalProjection]);

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
