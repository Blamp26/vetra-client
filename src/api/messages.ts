import { get } from './base';
import { Message, ConversationPreview, ResourceRef } from '@/shared/types';
import { normalizeMessageAttachments } from '@/features/messaging/utils/attachments';

export interface ConversationParams {
  limit?:    number;
  beforeId?: number;
  signal?: AbortSignal;
}

export const messagesApi = {
  // current_user_id убран — токен в заголовке идентифицирует пользователя
  getConversation(otherUserRef: ResourceRef, params: ConversationParams = {}): Promise<Message[]> {
    const searchParams = new URLSearchParams({
      limit: String(params.limit ?? 50),
    });
    if (params.beforeId !== undefined) {
      searchParams.set("before_id", String(params.beforeId));
    }
    return get<Message[]>(`/conversations/${otherUserRef}?${searchParams}`, {
      signal: params.signal,
    }).then((messages) => messages.map(normalizeMessageAttachments));
  },

  getList(): Promise<ConversationPreview[]> {
    return get<ConversationPreview[]>("/conversations");
  },

  search(otherUserRef: ResourceRef, query: string): Promise<Message[]> {
    const params = new URLSearchParams({ q: query });
    return get<Message[]>(`/conversations/${otherUserRef}/search?${params}`)
      .then((messages) => messages.map(normalizeMessageAttachments));
  },
};
