import { messagesApi } from "@/api/messages";
import { roomsApi } from "@/api/rooms";
import { serversApi } from "@/api/servers";
import type {
  Channel,
  ConversationPreview,
  RoomPreview,
  Server,
} from "@/shared/types";

type Setters = {
  setPreviews: (items: ConversationPreview[]) => void;
  setRoomPreviews: (items: RoomPreview[]) => void;
  setServers: (items: Server[]) => void;
  setServerChannels?: (serverId: number, items: Channel[]) => void;
  isCurrent?: () => boolean;
};

export async function reconcileUnreadLists(setters: Setters): Promise<void> {
  const [dms, rooms, servers] = await Promise.all([
    messagesApi.getList(),
    roomsApi.getList(),
    serversApi.getList(),
  ]);

  const channelResults = await Promise.all(
    servers.map((server) =>
      serversApi.getChannels(server.public_id ?? server.id),
    ),
  );

  if (setters.isCurrent && !setters.isCurrent()) return;
  setters.setPreviews(dms);
  setters.setServers(servers);
  channelResults.forEach((channels, index) => {
    setters.setServerChannels?.(servers[index].id, channels);
  });

  const channels = channelResults.flat();
  setters.setRoomPreviews([
    ...rooms,
    ...channels.map(
      (channel) =>
        ({
          ...channel,
          unread_count: channel.unread_count ?? 0,
          last_message_at: channel.last_message_at ?? null,
          last_message: channel.last_message ?? null,
        }) as RoomPreview,
    ),
  ]);
}
