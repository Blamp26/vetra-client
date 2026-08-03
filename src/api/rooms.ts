import { get, post, put, del } from "./base";
import { Message, Room, RoomPreview, ResourceRef } from "@/shared/types";
import { normalizeMessageAttachments } from "@/features/messaging/utils/attachments";

export const roomsApi = {
  create(name: string, memberIds: ResourceRef[]): Promise<Room> {
    return post<Room>("/rooms", { name, member_ids: memberIds });
  },

  addMember(roomRef: ResourceRef, userRef: ResourceRef): Promise<void> {
    return post<void>(`/rooms/${roomRef}/members`, { user_id: userRef });
  },

  getList(): Promise<RoomPreview[]> {
    return get<RoomPreview[]>("/rooms");
  },

  updateProfile(
    roomRef: ResourceRef,
    profile: {
      name: string;
      description: string | null;
      avatar_media_file_id: string | null;
    },
  ): Promise<RoomPreview> {
    return put<RoomPreview>(`/rooms/${roomRef}/profile`, profile);
  },

  getMessages(
    roomRef: ResourceRef,
    limit?: number,
    beforeId?: number,
    signal?: AbortSignal,
  ): Promise<Message[]> {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set("limit", String(limit));
    if (beforeId !== undefined) params.set("before_id", String(beforeId));
    return get<Message[]>(`/rooms/${roomRef}/messages?${params}`, {
      signal,
    }).then((messages) => messages.map(normalizeMessageAttachments));
  },

  search(roomRef: ResourceRef, query: string): Promise<Message[]> {
    const params = new URLSearchParams({ q: query });
    return get<Message[]>(`/rooms/${roomRef}/search?${params}`).then(
      (messages) => messages.map(normalizeMessageAttachments),
    );
  },

  delete(roomRef: ResourceRef): Promise<void> {
    return del<void>(`/rooms/${roomRef}`);
  },

  governance(roomRef: ResourceRef): Promise<GroupGovernance> {
    return get<GroupGovernance>(`/rooms/${roomRef}/governance`);
  },
  governanceMembers(
    roomRef: ResourceRef,
    query?: string,
    limit = 50,
  ): Promise<GovernanceMember[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (query) params.set("q", query);
    return get<GovernanceMember[]>(
      `/rooms/${roomRef}/governance/members?${params}`,
    );
  },
  updateDefaults(
    roomRef: ResourceRef,
    permissions: string[],
  ): Promise<string[]> {
    return put<string[]>(`/rooms/${roomRef}/governance/defaults`, {
      permissions,
    });
  },
  updateSlowMode(roomRef: ResourceRef, seconds: number): Promise<number> {
    return put<number>(`/rooms/${roomRef}/governance/slow-mode`, { seconds });
  },
  promote(
    roomRef: ResourceRef,
    userRef: ResourceRef,
    permissions: string[] = [],
  ): Promise<GovernanceMember> {
    return post<GovernanceMember>(
      `/rooms/${roomRef}/governance/members/${userRef}/promote`,
      { permissions },
    );
  },
  updateAdminRights(
    roomRef: ResourceRef,
    userRef: ResourceRef,
    permissions: string[],
  ) {
    return put<GovernanceMember>(
      `/rooms/${roomRef}/governance/members/${userRef}/admin-rights`,
      { permissions },
    );
  },
  demote(roomRef: ResourceRef, userRef: ResourceRef) {
    return post<GovernanceMember>(
      `/rooms/${roomRef}/governance/members/${userRef}/demote`,
      {},
    );
  },
  removeMember(roomRef: ResourceRef, userRef: ResourceRef) {
    return del<void>(`/rooms/${roomRef}/members/${userRef}`);
  },
  updateOverride(
    roomRef: ResourceRef,
    userRef: ResourceRef,
    allow: string[],
    deny: string[],
  ) {
    return put<GovernanceMember>(
      `/rooms/${roomRef}/governance/members/${userRef}/override`,
      { allow, deny },
    );
  },
  clearOverride(roomRef: ResourceRef, userRef: ResourceRef) {
    return del<void>(
      `/rooms/${roomRef}/governance/members/${userRef}/override`,
    );
  },
  updateMemberTag(roomRef: ResourceRef, userRef: ResourceRef, tag: string) {
    return put<GovernanceMember>(
      `/rooms/${roomRef}/governance/members/${userRef}/tag`,
      { tag },
    );
  },
  updateAdminTitle(roomRef: ResourceRef, userRef: ResourceRef, title: string) {
    return put<GovernanceMember>(
      `/rooms/${roomRef}/governance/members/${userRef}/admin-title`,
      { title },
    );
  },
  updateTemporaryRestriction(
    roomRef: ResourceRef,
    userRef: ResourceRef,
    permissions: string[],
    duration: "forever" | "day" | "week" | "custom",
    expiresAt?: string,
  ) {
    return put<GovernanceMember>(
      `/rooms/${roomRef}/governance/members/${userRef}/temporary-restriction`,
      { permissions, duration, expires_at: expiresAt },
    );
  },
  clearTemporaryRestriction(roomRef: ResourceRef, userRef: ResourceRef) {
    return del<void>(
      `/rooms/${roomRef}/governance/members/${userRef}/temporary-restriction`,
    );
  },
  transferOwnership(roomRef: ResourceRef, userRef: ResourceRef) {
    return post<GovernanceMember>(
      `/rooms/${roomRef}/governance/members/${userRef}/transfer-ownership`,
      {},
    );
  },
  leave(roomRef: ResourceRef) {
    return post<void>(`/rooms/${roomRef}/leave`, {});
  },
  access(roomRef: ResourceRef) { return get<GroupAccessSettings>(`/rooms/${roomRef}/access`); },
  updateAccess(roomRef: ResourceRef, value: Pick<GroupAccessSettings, "visibility" | "history_policy" | "content_protection_enabled" | "public_username">) { return put<GroupAccessSettings>(`/rooms/${roomRef}/access`, value); },
  discover(query: string) { return get<GroupDiscoveryResult[]>(`/groups/discovery?${new URLSearchParams({ q: query })}`); },
  publicPreview(username: string) { return get<GroupDiscoveryResult>(`/groups/by-username/${encodeURIComponent(username)}`); },
  publicJoin(username: string) { return post<GroupJoinResult>(`/groups/by-username/${encodeURIComponent(username)}/join`, {}); },
  resolveInvite(token: string) { return get<GroupInvitePreview>(`/group-invites/${encodeURIComponent(token)}`); },
  joinInvite(token: string) { return post<GroupJoinResult>(`/group-invites/${encodeURIComponent(token)}/join`, {}); },
  invites(roomRef: ResourceRef) { return get<GroupInvite[]>(`/rooms/${roomRef}/invites`); },
  primaryInvite(roomRef: ResourceRef) { return post<GroupInvite>(`/rooms/${roomRef}/invites/primary`, {}); },
  createInvite(roomRef: ResourceRef, value: GroupInviteOptions) { return post<GroupInvite>(`/rooms/${roomRef}/invites`, value); },
  revokeInvite(roomRef: ResourceRef, id: number) { return del<GroupInvite>(`/rooms/${roomRef}/invites/${id}`); },
  regenerateInvite(roomRef: ResourceRef, id: number) { return post<GroupInvite>(`/rooms/${roomRef}/invites/${id}/regenerate`, {}); },
  joinRequests(roomRef: ResourceRef) { return get<GroupJoinRequest[]>(`/rooms/${roomRef}/join-requests`); },
  resolveJoinRequest(roomRef: ResourceRef, id: number, decision: "approve" | "reject") { return post<{ status: string }>(`/rooms/${roomRef}/join-requests/${id}/${decision}`, {}); },
};

export interface GroupAccessSettings { visibility: "private" | "public"; history_policy: "visible" | "hidden"; recent_history_count: number; content_protection_enabled: boolean; public_username: string | null; capabilities: { manage_access: boolean; manage_invites: boolean; moderate_requests: boolean }; }
export interface GroupDiscoveryResult { id: number; public_id?: string; name: string; description?: string | null; avatar_url?: string | null; public_username: string; member_count: number; membership: "member" | "none"; }
export interface GroupJoinResult { status: "joined" | "already_member" | "pending"; room_id?: number; request_id?: number; }
export interface GroupInviteOptions { internal_name?: string | null; expires_at?: string | null; max_uses?: number | null; approval_required: boolean; }
export interface GroupInvite extends GroupInviteOptions { id: number; token: string; kind: "primary" | "additional"; use_count: number; revoked_at?: string | null; state: "active" | "revoked" | "expired" | "exhausted"; }
export interface GroupInvitePreview extends GroupDiscoveryResult, GroupInvite {}
export interface GroupJoinRequest { id: number; source: "public" | "invite"; status: string; inserted_at: string; user: { id: number; public_id?: string; username: string; display_name?: string | null }; }

export interface GovernanceMember {
  id: number;
  public_id?: string;
  username: string;
  display_name: string | null;
  role: "owner" | "admin" | "member";
  member_tag?: string | null;
  admin_title?: string | null;
  admin_permissions: string[];
  allow_permissions: string[];
  deny_permissions: string[];
  effective_permissions?: string[];
  can_manage?: boolean;
  can_edit_admin?: boolean;
  can_demote?: boolean;
  can_promote?: boolean;
  can_edit_tag?: boolean;
  can_edit_title?: boolean;
  can_restrict?: boolean;
  can_remove?: boolean;
  can_transfer_ownership?: boolean;
  temporary_restriction?: {
    deny_permissions: string[];
    expires_at: string | null;
    active: boolean;
  };
}
export interface GroupGovernance {
  role: "owner" | "admin" | "member";
  capabilities: string[];
  effective_permissions?: string[];
  action_capabilities?: Record<string, boolean>;
  delegable_admin_permissions?: string[];
  defaults: string[];
  can_edit_defaults?: boolean;
  can_manage_slow_mode?: boolean;
  slow_mode_seconds?: number;
  slow_mode?: {
    applies: boolean;
    seconds: number;
    remaining_seconds: number;
    next_allowed_at: string | null;
  };
  can_leave?: boolean;
  can_delete_group?: boolean;
  members: GovernanceMember[];
}
