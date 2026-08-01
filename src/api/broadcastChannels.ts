import { del, get, post, put } from "@/api/base";
import type { BroadcastAdmin, BroadcastAuditEvent, BroadcastChannel, BroadcastChannelSummary, BroadcastGovernanceState, BroadcastInvite, BroadcastJoinRequest, BroadcastOwnershipState, BroadcastPublication, BroadcastSubscriber, BroadcastSubscription, SubscribedBroadcastChannelResponse } from "@/features/broadcastChannels/types";

export interface BroadcastFeed { channel: BroadcastChannel; publications: BroadcastPublication[]; next_cursor: string | null; }
export interface BroadcastPinnedPage { channel: BroadcastChannel; publications: BroadcastPublication[]; next_cursor: string | null; }
export interface BroadcastAuditPage { events: BroadcastAuditEvent[]; next_cursor: string | null; }

export const broadcastChannelsApi = {
  create: (body: Record<string, unknown>) => post<BroadcastChannel>("/broadcast-channels", body),
  get: (id: string) => get<BroadcastChannel>(`/broadcast-channels/${encodeURIComponent(id)}`),
  resolveUsername: (username: string) => get<BroadcastChannel>(`/broadcast-channels/by-username/${encodeURIComponent(username)}`),
  search: (query: string) => get<BroadcastChannel[]>(`/broadcast-channels/search?q=${encodeURIComponent(query)}`),
  subscribed: async (): Promise<BroadcastChannelSummary[]> => {
    const channels = await get<SubscribedBroadcastChannelResponse[]>("/broadcast-channels/subscribed");
    return channels.map(({ channel_public_id, ...channel }) => ({
      ...channel,
      public_id: channel_public_id,
    }));
  },
  settings: (id: string, body: Record<string, unknown>) => put<BroadcastChannel>(`/broadcast-channels/${encodeURIComponent(id)}/settings`, body),
  feed: (id: string, cursor?: string | null) => get<BroadcastFeed>(`/broadcast-channels/${encodeURIComponent(id)}/publications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  publication: (id: string, publicationId: string) => get<BroadcastPublication>(`/broadcast-channels/${encodeURIComponent(id)}/publications/${encodeURIComponent(publicationId)}`),
  publish: (id: string, body: Record<string, unknown>) => post<BroadcastPublication>(`/broadcast-channels/${encodeURIComponent(id)}/publications`, body),
  edit: (id: string, publicationId: string, body: Record<string, unknown>) => put<BroadcastPublication>(`/broadcast-channels/${encodeURIComponent(id)}/publications/${encodeURIComponent(publicationId)}`, body),
  removePublication: (id: string, publicationId: string) => del<{ deleted: boolean }>(`/broadcast-channels/${encodeURIComponent(id)}/publications/${encodeURIComponent(publicationId)}`),
  pinned: (id: string) => get<BroadcastPinnedPage>(`/broadcast-channels/${encodeURIComponent(id)}/publications/pinned`),
  pin: (id: string, publicationId: string) => post<BroadcastPublication>(`/broadcast-channels/${encodeURIComponent(id)}/publications/${encodeURIComponent(publicationId)}/pin`, {}),
  unpin: (id: string, publicationId: string) => del<BroadcastPublication>(`/broadcast-channels/${encodeURIComponent(id)}/publications/${encodeURIComponent(publicationId)}/pin`),
  subscription: (id: string) => get<BroadcastSubscription>(`/broadcast-channels/${encodeURIComponent(id)}/subscription`),
  subscribe: (id: string) => post<BroadcastSubscription>(`/broadcast-channels/${encodeURIComponent(id)}/subscribe`, {}),
  unsubscribe: (id: string) => del<BroadcastSubscription>(`/broadcast-channels/${encodeURIComponent(id)}/subscribe`),
  markRead: (id: string) => post<{ read: boolean }>(`/broadcast-channels/${encodeURIComponent(id)}/read`, { current: true }),
  mute: (id: string, muted: boolean) => put<BroadcastSubscription>(`/broadcast-channels/${encodeURIComponent(id)}/mute`, { muted }),
  subscriberCount: (id: string) => get<{ channel_public_id: string; count: number }>(`/broadcast-channels/${encodeURIComponent(id)}/subscribers/count`),
  subscribers: (id: string, limit = 50) => get<BroadcastSubscriber[]>(`/broadcast-channels/${encodeURIComponent(id)}/subscribers?limit=${limit}`),
  block: (id: string, userId: string) => post<void>(`/broadcast-channels/${encodeURIComponent(id)}/blocks/${encodeURIComponent(userId)}`, {}),
  unblock: (id: string, userId: string) => del<void>(`/broadcast-channels/${encodeURIComponent(id)}/blocks/${encodeURIComponent(userId)}`),
  invite: (id: string) => get<BroadcastInvite>(`/broadcast-channels/${encodeURIComponent(id)}/invite-link`),
  createInvite: (id: string) => post<BroadcastInvite>(`/broadcast-channels/${encodeURIComponent(id)}/invite-link`, {}),
  regenerateInvite: (id: string) => post<BroadcastInvite>(`/broadcast-channels/${encodeURIComponent(id)}/invite-link/regenerate`, {}),
  disableInvite: (id: string) => del<void>(`/broadcast-channels/${encodeURIComponent(id)}/invite-link`),
  resolveInvite: (token: string) => get<{ channel_public_id: string; display_name: string; visibility: "private"; status: "active" }>(`/broadcast-channels/invites/${encodeURIComponent(token)}`),
  submitJoinRequest: (token: string) => post<BroadcastJoinRequest>(`/broadcast-channels/invites/${encodeURIComponent(token)}/requests`, {}),
  pendingRequests: (id: string, limit = 50) => get<BroadcastJoinRequest[]>(`/broadcast-channels/${encodeURIComponent(id)}/join-requests?limit=${limit}`),
  approveRequest: (id: string, userId: string) => post<unknown>(`/broadcast-channels/${encodeURIComponent(id)}/join-requests/${encodeURIComponent(userId)}/approve`, {}),
  rejectRequest: (id: string, userId: string) => post<BroadcastJoinRequest>(`/broadcast-channels/${encodeURIComponent(id)}/join-requests/${encodeURIComponent(userId)}/reject`, {}),
  governance: (id: string) => get<BroadcastGovernanceState>(`/broadcast-channels/${encodeURIComponent(id)}/governance`),
  administrators: (id: string) => get<BroadcastAdmin[]>(`/broadcast-channels/${encodeURIComponent(id)}/administrators`),
  appointAdministrator: (id: string, userId: string, tier: "full" | "limited", capabilities: string[] = []) => post<BroadcastAdmin>(`/broadcast-channels/${encodeURIComponent(id)}/administrators`, { user_public_id: userId, tier, capabilities }),
  updateAdministrator: (id: string, userId: string, body: { tier?: "full" | "limited"; capabilities?: string[] }) => put<BroadcastAdmin>(`/broadcast-channels/${encodeURIComponent(id)}/administrators/${encodeURIComponent(userId)}`, body),
  removeAdministrator: (id: string, userId: string) => del<void>(`/broadcast-channels/${encodeURIComponent(id)}/administrators/${encodeURIComponent(userId)}`),
  declineAdministrator: (id: string) => post<void>(`/broadcast-channels/${encodeURIComponent(id)}/administrators/decline`, {}),
  leave: (id: string) => post<void>(`/broadcast-channels/${encodeURIComponent(id)}/leave`, {}),
  ownership: (id: string) => get<BroadcastOwnershipState>(`/broadcast-channels/${encodeURIComponent(id)}/ownership`),
  transferOwnership: (id: string, userId: string) => post<void>(`/broadcast-channels/${encodeURIComponent(id)}/ownership/transfer`, { user_public_id: userId }),
  acceptOwnership: (id: string) => post<void>(`/broadcast-channels/${encodeURIComponent(id)}/ownership/accept`, {}),
  declineOwnership: (id: string) => post<void>(`/broadcast-channels/${encodeURIComponent(id)}/ownership/decline`, {}),
  react: (id: string, publicationId: string, value: string) => put<BroadcastPublication>(`/broadcast-channels/${encodeURIComponent(id)}/publications/${encodeURIComponent(publicationId)}/reaction`, { value }),
  removeReaction: (id: string, publicationId: string) => del<BroadcastPublication>(`/broadcast-channels/${encodeURIComponent(id)}/publications/${encodeURIComponent(publicationId)}/reaction`),
  audit: (id: string, cursor?: string | null) => get<BroadcastAuditPage>(`/broadcast-channels/${encodeURIComponent(id)}/audit${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  forward: (id: string, publicationId: string, destination_type: "direct_chat" | "group" | "server_text", destination_public_id: string) => post<unknown>(`/broadcast-channels/${encodeURIComponent(id)}/publications/${encodeURIComponent(publicationId)}/forward`, { destination_type, destination_public_id }),
};
