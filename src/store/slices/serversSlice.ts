import { StateCreator } from 'zustand';
import { Server, Channel } from '@/shared/types';

export interface ServersSlice {
  servers: Record<number, Server>;
  serverChannels: Record<number, Channel[]>;
  channelsLoading: Record<number, boolean>;

  setServers: (servers: Server[]) => void;
  upsertServer: (server: Server) => void;
  setServerChannels: (serverId: number, channels: Channel[]) => void;
  addServerChannel: (serverId: number, channel: Channel) => void;
  setChannelsLoading: (serverId: number, loading: boolean) => void;
  removeServer: (serverId: number) => void;
}

export const createServersSlice: StateCreator<any, [], [], ServersSlice> = (set) => ({
  servers: {},
  serverChannels: {},
  channelsLoading: {},

  setServers: (servers) =>
    set({ servers: Object.fromEntries(servers.map((s) => [s.id, s])) }),

  upsertServer: (server) =>
    set((state: any) => ({
      servers: { ...state.servers, [server.id]: server },
    })),

  setServerChannels: (serverId, channels) =>
    set((state: any) => ({
      serverChannels: { ...state.serverChannels, [serverId]: channels },
    })),

  addServerChannel: (serverId: number, channel: any) =>
    set((state: any) => {
      const arr = state.serverChannels[serverId] ?? [];

      const exists = arr.some((c: any) => c.id === channel.id);
      const newArr = exists
        ? arr.map((c: any) =>
            c.id === channel.id
              ? {
                  ...c,
                  ...channel,
                  name: channel.name || c.name || "New Channel",
                }
              : c
          )
        : [
            ...arr,
            {
              id: channel.id,
              name: channel.name || "New Channel",
              created_by: channel.created_by,
              server_id: serverId,
              inserted_at: channel.inserted_at,
              ...channel,
            },
          ];

      return {
        serverChannels: {
          ...state.serverChannels,
          [serverId]: newArr,
        },
      };
    }),

  setChannelsLoading: (serverId, loading) =>
    set((state: any) => ({
      channelsLoading: { ...state.channelsLoading, [serverId]: loading },
    })),

  removeServer: (serverId) =>
    set((state: any) => {
      const { [serverId]: _, ...restServers } = state.servers;
      const { [serverId]: __, ...restChannels } = state.serverChannels;
      const { [serverId]: ___, ...restLoading } = state.channelsLoading;
      return {
        servers: restServers,
        serverChannels: restChannels,
        channelsLoading: restLoading,
      };
    }),
});
