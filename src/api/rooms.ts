import { get, post, del } from './base';
import { Message, Room, RoomPreview } from '@/shared/types';

export const roomsApi = {
  create(name: string, memberIds: number[]): Promise<Room> {
    return post<Room>("/rooms", { name, member_ids: memberIds });
  },

  addMember(roomId: number, userId: number): Promise<void> {
    return post<void>(`/rooms/${roomId}/members`, { user_id: userId });
  },

  getList(): Promise<RoomPreview[]> {
    return get<RoomPreview[]>("/rooms");
  },

  getMessages(roomId: number, limit?: number, beforeId?: number): Promise<Message[]> {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set("limit", String(limit));
    if (beforeId !== undefined) params.set("before_id", String(beforeId));
    return get<Message[]>(`/rooms/${roomId}/messages?${params}`);
  },

  search(roomId: number, query: string): Promise<Message[]> {
    const params = new URLSearchParams({ q: query });
    return get<Message[]>(`/rooms/${roomId}/search?${params}`);
  },

  delete(roomId: number): Promise<void> {
    return del<void>(`/rooms/${roomId}`);
  },
};
