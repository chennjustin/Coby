import { Logger } from "@/lib/utils/logger";

const LINE_MESSAGING_API_URL = "https://api.line.me/v2/bot/message/reply";
const LINE_LOADING_START_URL = "https://api.line.me/v2/bot/chat/loading/start";

/** LINE 只接受 5–60 且為 5 的倍數 */
function snapLineLoadingSeconds(seconds: number): number {
  const clamped = Math.min(60, Math.max(5, seconds));
  return Math.round(clamped / 5) * 5;
}

export class LineMessagingClient {
  private accessToken: string;

  constructor() {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
      throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
    }
    this.accessToken = token;
  }

  async replyMessage(replyToken: string, messages: Array<{ type: string; text: string }>): Promise<void> {
    try {
      const response = await fetch(LINE_MESSAGING_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          replyToken,
          messages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("Line API error", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new Error(`Line API error: ${response.status} ${response.statusText}`);
      }

      Logger.debug("Successfully sent reply", { replyToken });
    } catch (error) {
      Logger.error("Failed to send reply", { error, replyToken });
      throw error;
    }
  }

  async sendTextMessage(replyToken: string, text: string): Promise<void> {
    await this.replyMessage(replyToken, [
      {
        type: "text",
        text,
      },
    ]);
  }

  /**
   * 在與使用者的 1 對 1 聊天中顯示「載入中／準備中」動畫（官方 Loading API）。
   * 僅在 user 正在該聊天畫面時會顯示；群組/多人聊天不支援。
   * 動畫會在指定秒數後消失，或在你發出下一則官方帳號訊息時消失。
   * @see https://developers.line.biz/en/docs/messaging-api/use-loading-indicator/
   */
  async startLoadingAnimation(
    userId: string,
    loadingSeconds?: number
  ): Promise<void> {
    const raw =
      loadingSeconds ??
      parseInt(process.env.LINE_LOADING_SECONDS || "35", 10);
    const seconds = snapLineLoadingSeconds(raw);

    try {
      const response = await fetch(LINE_LOADING_START_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          chatId: userId,
          loadingSeconds: seconds,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.warn("LINE loading animation start failed (non-fatal)", {
          status: response.status,
          error: errorText,
        });
        return;
      }

      Logger.debug("LINE loading animation started", { userId, seconds });
    } catch (error) {
      Logger.warn("LINE loading animation start failed (non-fatal)", {
        error,
        userId,
      });
    }
  }

  /**
   * 發送 Flex Message
   */
  async sendFlexMessage(
    replyToken: string,
    altText: string,
    contents: any
  ): Promise<void> {
    try {
      const response = await fetch(LINE_MESSAGING_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          replyToken,
          messages: [
            {
              type: "flex",
              altText,
              contents,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("Line API error (Flex Message)", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new Error(`Line API error: ${response.status} ${response.statusText}`);
      }

      Logger.debug("Successfully sent Flex Message", { replyToken });
    } catch (error) {
      Logger.error("Failed to send Flex Message", { error, replyToken });
      throw error;
    }
  }

  /**
   * 發送帶有快速回覆的文字訊息
   */
  async sendQuickReply(
    replyToken: string,
    text: string,
    items: Array<{ label: string; text: string }>
  ): Promise<void> {
    try {
      const response = await fetch(LINE_MESSAGING_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          replyToken,
          messages: [
            {
              type: "text",
              text,
              quickReply: {
                items: items.map((item) => ({
                  type: "action",
                  action: {
                    type: "message",
                    label: item.label,
                    text: item.text,
                  },
                })),
              },
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("Line API error (Quick Reply)", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new Error(`Line API error: ${response.status} ${response.statusText}`);
      }

      Logger.debug("Successfully sent Quick Reply", { replyToken });
    } catch (error) {
      Logger.error("Failed to send Quick Reply", { error, replyToken });
      throw error;
    }
  }

  /**
   * 發送多個訊息（支援混合類型）
   */
  async sendMessages(replyToken: string, messages: any[]): Promise<void> {
    try {
      const response = await fetch(LINE_MESSAGING_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          replyToken,
          messages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("Line API error (Multiple Messages)", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new Error(`Line API error: ${response.status} ${response.statusText}`);
      }

      Logger.debug("Successfully sent messages", { replyToken, count: messages.length });
    } catch (error) {
      Logger.error("Failed to send messages", { error, replyToken });
      throw error;
    }
  }

  /**
   * 建立 Rich Menu
   */
  async createRichMenu(richMenuConfig: any): Promise<string> {
    try {
      const response = await fetch("https://api.line.me/v2/bot/richmenu", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify(richMenuConfig),
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("Line API error (Create Rich Menu)", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new Error(`Line API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      Logger.info("Rich Menu created", { richMenuId: data.richMenuId });
      return data.richMenuId;
    } catch (error) {
      Logger.error("Failed to create Rich Menu", { error });
      throw error;
    }
  }

  /**
   * 上傳 Rich Menu 圖片
   */
  async uploadRichMenuImage(richMenuId: string, imageBuffer: Buffer): Promise<void> {
    try {
      // 將 Buffer 轉換為 Uint8Array，然後轉為 ArrayBuffer 以符合 fetch API 的要求
      const uint8Array = new Uint8Array(imageBuffer);
      const arrayBuffer = uint8Array.buffer.slice(
        uint8Array.byteOffset,
        uint8Array.byteOffset + uint8Array.byteLength
      ) as ArrayBuffer;
      
      const response = await fetch(
        `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
        {
          method: "POST",
          headers: {
            "Content-Type": "image/png",
            Authorization: `Bearer ${this.accessToken}`,
          },
          body: arrayBuffer,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("Line API error (Upload Rich Menu Image)", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new Error(`Line API error: ${response.status} ${response.statusText}`);
      }

      Logger.info("Rich Menu image uploaded", { richMenuId });
    } catch (error) {
      Logger.error("Failed to upload Rich Menu image", { error, richMenuId });
      throw error;
    }
  }

  /**
   * 設定預設 Rich Menu
   */
  async setDefaultRichMenu(richMenuId: string): Promise<void> {
    try {
      const response = await fetch("https://api.line.me/v2/bot/user/all/richmenu", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({ richMenuId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("Line API error (Set Default Rich Menu)", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new Error(`Line API error: ${response.status} ${response.statusText}`);
      }

      Logger.info("Default Rich Menu set", { richMenuId });
    } catch (error) {
      Logger.error("Failed to set default Rich Menu", { error, richMenuId });
      throw error;
    }
  }

  /**
   * 刪除 Rich Menu
   */
  async deleteRichMenu(richMenuId: string): Promise<void> {
    try {
      const response = await fetch(`https://api.line.me/v2/bot/richmenu/${richMenuId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("Line API error (Delete Rich Menu)", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new Error(`Line API error: ${response.status} ${response.statusText}`);
      }

      Logger.info("Rich Menu deleted", { richMenuId });
    } catch (error) {
      Logger.error("Failed to delete Rich Menu", { error, richMenuId });
      throw error;
    }
  }

  /**
   * 取得所有 Rich Menu
   */
  async getRichMenuList(): Promise<any[]> {
    try {
      const response = await fetch("https://api.line.me/v2/bot/richmenu/list", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("Line API error (Get Rich Menu List)", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new Error(`Line API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.richmenus || [];
    } catch (error) {
      Logger.error("Failed to get Rich Menu list", { error });
      throw error;
    }
  }
}

