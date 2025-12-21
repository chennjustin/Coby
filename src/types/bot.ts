// Bot Context 類型定義（替代 Bottender Context）
export interface BotContext {
  event: {
    type: string;
    timestamp: number;
    source: {
      type: string;
      userId?: string;
    };
    message?: {
      type: string;
      id: string;
      text?: string;
    };
    replyToken?: string;
  };
  sendText: (text: string) => Promise<void>;
}

