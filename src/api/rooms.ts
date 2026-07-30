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
  promote(
    roomRef: ResourceRef,
    userRef: ResourceRef,
  ): Promise<GovernanceMember> {
    return post<GovernanceMember>(
      `/rooms/${roomRef}/governance/members/${userRef}/promote`,
      {},
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
  leave(roomRef: ResourceRef) {
    return post<void>(`/rooms/${roomRef}/leave`, {});
  },
};

export interface GovernanceMember {
  id: number;
  public_id?: string;
  username: string;
  display_name: string | null;
  role: "owner" | "admin" | "member";
  admin_permissions: string[];
  allow_permissions: string[];
  deny_permissions: string[];
  effective_permissions?: string[];
  can_manage?: boolean;
}
export interface GroupGovernance {
  role: "owner" | "admin" | "member";
  capabilities: string[];
  defaults: string[];
  members: GovernanceMember[];
}
