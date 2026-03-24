import { get, post, del } from './base';
import { Server, Channel, ServerMember } from '@/shared/types';

export const serversApi = {
  getList(): Promise<Server[]> {
    return get<Server[]>("/servers");
  },

  create(name: string): Promise<Server> {
    return post<Server>("/servers", { name });
  },

  getChannels(serverId: number): Promise<Channel[]> {
    return get<Channel[]>(`/servers/${serverId}/channels`);
  },

  createChannel(serverId: number, name: string): Promise<Channel> {
    return post<Channel>(`/servers/${serverId}/channels`, { name });
  },

  getMembers(serverId: number): Promise<ServerMember[]> {
    return get<ServerMember[]>(`/servers/${serverId}/members`);
  },

  addMember(serverId: number, userId: number): Promise<void> {
    return post<void>(`/servers/${serverId}/members`, { user_id: userId });
  },

  removeMember(serverId: number, userId: number): Promise<void> {
    return del<void>(`/servers/${serverId}/members/${userId}`);
  },

  delete(serverId: number): Promise<void> {
    return del<void>(`/servers/${serverId}`);
  }
};
