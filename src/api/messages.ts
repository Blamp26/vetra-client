import { get } from './base';
import { Message, ConversationPreview } from '@/shared/types';

export interface ConversationParams {
  limit?:    number;
  beforeId?: number;
}

export const messagesApi = {
  // current_user_id убран — токен в заголовке идентифицирует пользователя
  getConversation(otherUserId: number, params: ConversationParams = {}): Promise<Message[]> {
    const searchParams = new URLSearchParams({
      limit: String(params.limit ?? 50),
    });
    if (params.beforeId !== undefined) {
      searchParams.set("before_id", String(params.beforeId));
    }
    return get<Message[]>(`/conversations/${otherUserId}?${searchParams}`);
  },

  getList(): Promise<ConversationPreview[]> {
    return get<ConversationPreview[]>("/conversations");
  },
};
