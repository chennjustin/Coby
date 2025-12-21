export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface StatsData {
  totalConversations: number;
  totalMessages: number;
  activeUsers: number;
  todayMessages: number;
}

export interface ConversationListResponse {
  conversations: Array<{
    _id: string;
    lineUserId: string;
    createdAt: string;
    updatedAt: string;
    lastMessage?: string;
    messageCount: number;
  }>;
  total: number;
  page: number;
  limit: number;
}

