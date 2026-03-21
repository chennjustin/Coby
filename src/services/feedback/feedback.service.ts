import { LLMClient } from "@/lib/llm/client";
import { OpenAIClient } from "@/lib/llm/openai";
import { getMemoryProvider } from "@/memory/memory.factory";
import { MemoryProvider } from "@/memory/types";
import { Logger } from "@/lib/utils/logger";

export class FeedbackService {
  private llmClient: LLMClient;
  private memoryProvider: MemoryProvider;

  constructor() {
    this.llmClient = new OpenAIClient();
    this.memoryProvider = getMemoryProvider();
  }

  /**
   * 根據使用者記憶和最近活動生成個人化學習回饋
   */
  async generateFeedback(
    userId: string,
    context: {
      trigger: "checkin" | "view_schedule" | "deadline_complete";
      consecutiveDays?: number;
      completedDeadline?: string;
      pendingDeadlineCount?: number;
    }
  ): Promise<string | null> {
    try {
      const memories = await this.memoryProvider.search(
        "學習習慣 偏好 進度 表現",
        { userId, limit: 5 }
      );

      const memoryText = memories
        .filter((m) => m.score > 0.2)
        .map((m) => `- ${m.memory}`)
        .join("\n");

      if (!memoryText && context.trigger === "view_schedule") {
        return null;
      }

      let contextDescription = "";
      switch (context.trigger) {
        case "checkin":
          contextDescription = `使用者剛完成每日簽到（已連續簽到 ${context.consecutiveDays || 1} 天）。`;
          break;
        case "view_schedule":
          contextDescription = `使用者正在查看時程表（目前有 ${context.pendingDeadlineCount || 0} 個待完成的 deadline）。`;
          break;
        case "deadline_complete":
          contextDescription = `使用者剛完成了一個 deadline：「${context.completedDeadline || "未知"}」。`;
          break;
      }

      const prompt = `你是 Coby，一個友善的學習助手。請根據以下資訊，用一句簡短鼓勵的話回應使用者（不超過 50 字，使用繁體中文）。

觸發情境：${contextDescription}

${memoryText ? `使用者的歷史記憶：\n${memoryText}` : "（尚無歷史記憶）"}

要求：
- 語氣溫暖親切，像學長鼓勵學弟妹
- 如果有記憶資訊，嘗試融入個人化元素
- 簡短有力，適合在 LINE 訊息中顯示`;

      const response = await this.llmClient.chat([
        { role: "system", content: "你是一個簡短回饋生成器，只輸出一句鼓勵的話。" },
        { role: "user", content: prompt },
      ]);

      return response.trim();
    } catch (error) {
      Logger.error("FeedbackService: 生成回饋失敗", { error, userId });
      return null;
    }
  }
}
