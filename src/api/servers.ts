import { get, post, del } from './base';
import { Server, Channel, ServerMember, ResourceRef } from '@/shared/types';

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

  createChannel(serverRef: ResourceRef, name: string): Promise<Channel> {
    return post<Channel>(`/servers/${serverRef}/channels`, { name });
  },

  getMembers(serverRef: ResourceRef): Promise<ServerMember[]> {
    return get<ServerMember[]>(`/servers/${serverRef}/members`);
  },

  addMember(serverRef: ResourceRef, userRef: ResourceRef): Promise<void> {
    return post<void>(`/servers/${serverRef}/members`, { user_id: userRef });
  },

  removeMember(serverRef: ResourceRef, userRef: ResourceRef): Promise<void> {
    return del<void>(`/servers/${serverRef}/members/${userRef}`);
  },

  delete(serverRef: ResourceRef): Promise<void> {
    return del<void>(`/servers/${serverRef}`);
  }
};
