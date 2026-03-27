import { StateCreator } from 'zustand';
import { PresenceState, PresenceDiff } from '@/services/socket';

function patchSet(s: Set<number>, id: number, add: boolean): Set<number> {
  const next = new Set(s);
  add ? next.add(id) : next.delete(id);
  return next;
}

export interface PresenceSlice {
  onlineUserIds: Set<number>;
  userStatuses: Record<number, 'online' | 'away' | 'dnd' | 'offline'>;
  lastSeenAt: Record<number, string>;
  typingPartnerIds: Set<number>;

  applyPresenceState: (state: PresenceState) => void;
  applyPresenceDiff: (diff: PresenceDiff) => void;
  setLastSeenAt: (userId: number, lastSeenAt: string) => void;
  setTyping: (partnerId: number) => void;
  clearTyping: (partnerId: number) => void;
}

export const createPresenceSlice: StateCreator<any, [], [], PresenceSlice> = (set) => ({
  onlineUserIds: new Set(),
  userStatuses: {},
  lastSeenAt: {},
  typingPartnerIds: new Set(),

  applyPresenceState: (state) => {
    const ids = new Set<number>();
    const statuses: Record<number, 'online' | 'away' | 'dnd' | 'offline'> = {};

    Object.entries(state).forEach(([idStr, presence]) => {
      const id = Number(idStr);
      if (!isNaN(id)) {
        ids.add(id);
        const meta = presence.metas[0];
        if (meta?.status) {
          statuses[id] = meta.status;
        }
      }
    });

    set({ onlineUserIds: ids, userStatuses: statuses });
  },

  applyPresenceDiff: (diff) =>
    set((storeState: any) => {
      const nextIds = new Set(storeState.onlineUserIds);
      const nextStatuses = { ...storeState.userStatuses };

      // Leaves
      Object.keys(diff.leaves).forEach((idStr) => {
        const id = Number(idStr);
        if (!isNaN(id)) {
          // Only remove if not in joins (Presence.update support)
          if (!diff.joins[idStr]) {
            nextIds.delete(id);
            delete nextStatuses[id];
          }
        }
      });

      // Joins
      Object.entries(diff.joins).forEach(([idStr, presence]) => {
        const id = Number(idStr);
        if (!isNaN(id)) {
          nextIds.add(id);
          const meta = presence.metas[0];
          if (meta?.status) {
            nextStatuses[id] = meta.status;
          }
        }
      });

      return { onlineUserIds: nextIds, userStatuses: nextStatuses };
    }),

  setLastSeenAt: (userId, lastSeenAt) =>
    set((state: any) => ({
      lastSeenAt: { ...state.lastSeenAt, [userId]: lastSeenAt },
    })),

  setTyping:   (partnerId) => set((state: any) => ({ typingPartnerIds: patchSet(state.typingPartnerIds, partnerId, true)  })),
  clearTyping: (partnerId) => set((state: any) => ({ typingPartnerIds: patchSet(state.typingPartnerIds, partnerId, false) })),
});
