import { StateCreator } from 'zustand';
import { PresenceState, PresenceDiff } from '@/services/socket';

function patchSet(s: Set<number>, id: number, add: boolean): Set<number> {
  const next = new Set(s);
  add ? next.add(id) : next.delete(id);
  return next;
}

export interface PresenceSlice {
  onlineUserIds: Set<number>;
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
  lastSeenAt: {},
  typingPartnerIds: new Set(),

  applyPresenceState: (state) => {
    const ids = new Set(
      Object.keys(state).map(Number).filter((n) => !isNaN(n))
    );
    set({ onlineUserIds: ids });
  },

  applyPresenceDiff: (diff) =>
    set((storeState: any) => {
      const next = new Set(storeState.onlineUserIds);
      for (const id of Object.keys(diff.joins))  { const n = Number(id); if (!isNaN(n)) next.add(n);    }
      for (const id of Object.keys(diff.leaves)) { const n = Number(id); if (!isNaN(n)) next.delete(n); }
      return { onlineUserIds: next };
    }),

  setLastSeenAt: (userId, lastSeenAt) =>
    set((state: any) => ({
      lastSeenAt: { ...state.lastSeenAt, [userId]: lastSeenAt },
    })),

  setTyping:   (partnerId) => set((state: any) => ({ typingPartnerIds: patchSet(state.typingPartnerIds, partnerId, true)  })),
  clearTyping: (partnerId) => set((state: any) => ({ typingPartnerIds: patchSet(state.typingPartnerIds, partnerId, false) })),
});
