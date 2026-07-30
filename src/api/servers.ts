import { get, post, del, put } from "./base";
import {
  Server,
  Channel,
  ServerMember,
  ServerRole,
  PermissionCatalogItem,
  ChannelAccess,
  ResourceRef,
} from "@/shared/types";

export const serversApi = {
  getList(): Promise<Server[]> {
    return get<Server[]>("/servers");
  },

  create(name: string): Promise<Server> {
    return post<Server>("/servers", { name });
  },

  getChannels(serverRef: ResourceRef): Promise<Channel[]> {
    return get<Channel[]>(`/servers/${serverRef}/channels`);
  },

  createChannel(
    serverRef: ResourceRef,
    name: string,
    access: {
      mode: "all_members" | "selected_roles";
      roleIds?: number[];
      permissions?: string[];
    } = { mode: "all_members" },
  ): Promise<Channel> {
    return post<Channel>(`/servers/${serverRef}/channels`, {
      name,
      access: access.mode,
      role_ids: access.roleIds,
      permissions: access.permissions,
    });
  },

  getMembers(serverRef: ResourceRef): Promise<ServerMember[]> {
    return get<ServerMember[]>(`/servers/${serverRef}/members`);
  },

  getRoles(serverRef: ResourceRef): Promise<ServerRole[]> {
    return get<ServerRole[]>(`/servers/${serverRef}/roles`);
  },
  getPermissionCatalog(): Promise<{
    server_management: PermissionCatalogItem[];
    channel: PermissionCatalogItem[];
    reserved: PermissionCatalogItem[];
  }> {
    return get(`/servers/permissions/catalog`);
  },
  createRole(
    serverRef: ResourceRef,
    attrs: {
      name: string;
      color?: string;
      position?: number;
      permissions: string[];
    },
  ): Promise<ServerRole> {
    return post(`/servers/${serverRef}/roles`, attrs);
  },
  updateRole(
    serverRef: ResourceRef,
    roleId: number,
    attrs: Partial<{
      name: string;
      color: string;
      position: number;
      permissions: string[];
    }>,
  ): Promise<ServerRole> {
    return put(`/servers/${serverRef}/roles/${roleId}`, attrs);
  },
  deleteRole(serverRef: ResourceRef, roleId: number): Promise<void> {
    return del(`/servers/${serverRef}/roles/${roleId}`);
  },
  assignRole(
    serverRef: ResourceRef,
    userRef: ResourceRef,
    roleId: number,
  ): Promise<void> {
    return post(`/servers/${serverRef}/members/${userRef}/roles/${roleId}`, {});
  },
  unassignRole(
    serverRef: ResourceRef,
    userRef: ResourceRef,
    roleId: number,
  ): Promise<void> {
    return del(`/servers/${serverRef}/members/${userRef}/roles/${roleId}`);
  },
  getChannelAccess(
    serverRef: ResourceRef,
    roomRef: ResourceRef,
  ): Promise<ChannelAccess> {
    return get(`/servers/${serverRef}/channels/${roomRef}/access`);
  },
  updateEveryoneAccess(
    serverRef: ResourceRef,
    roomRef: ResourceRef,
    allow: string[],
    deny: string[],
  ): Promise<void> {
    return put(`/servers/${serverRef}/channels/${roomRef}/access/everyone`, {
      allow,
      deny,
    });
  },
  updateRoleAccess(
    serverRef: ResourceRef,
    roomRef: ResourceRef,
    roleId: number,
    allow: string[],
    deny: string[],
  ): Promise<void> {
    return put(
      `/servers/${serverRef}/channels/${roomRef}/access/roles/${roleId}`,
      { allow, deny },
    );
  },
  deleteRoleAccess(
    serverRef: ResourceRef,
    roomRef: ResourceRef,
    roleId: number,
  ): Promise<void> {
    return del(
      `/servers/${serverRef}/channels/${roomRef}/access/roles/${roleId}`,
    );
  },
  updateMemberAccess(
    serverRef: ResourceRef,
    roomRef: ResourceRef,
    userRef: ResourceRef,
    allow: string[],
    deny: string[],
  ): Promise<void> {
    return put(
      `/servers/${serverRef}/channels/${roomRef}/access/members/${userRef}`,
      { allow, deny },
    );
  },
  deleteMemberAccess(
    serverRef: ResourceRef,
    roomRef: ResourceRef,
    userRef: ResourceRef,
  ): Promise<void> {
    return del(
      `/servers/${serverRef}/channels/${roomRef}/access/members/${userRef}`,
    );
  },

  addMember(serverRef: ResourceRef, userRef: ResourceRef): Promise<void> {
    return post<void>(`/servers/${serverRef}/members`, { user_id: userRef });
  },

  removeMember(serverRef: ResourceRef, userRef: ResourceRef): Promise<void> {
    return del<void>(`/servers/${serverRef}/members/${userRef}`);
  },

  delete(serverRef: ResourceRef): Promise<void> {
    return del<void>(`/servers/${serverRef}`);
  },
};
