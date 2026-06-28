import { get, post, del } from './base';
import { Message, Room, RoomPreview, ResourceRef } from '@/shared/types';

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

  getMessages(roomRef: ResourceRef, limit?: number, beforeId?: number): Promise<Message[]> {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set("limit", String(limit));
    if (beforeId !== undefined) params.set("before_id", String(beforeId));
    return get<Message[]>(`/rooms/${roomRef}/messages?${params}`);
  },

  search(roomRef: ResourceRef, query: string): Promise<Message[]> {
    const params = new URLSearchParams({ q: query });
    return get<Message[]>(`/rooms/${roomRef}/search?${params}`);
  },

  delete(roomRef: ResourceRef): Promise<void> {
    return del<void>(`/rooms/${roomRef}`);
  },
};
