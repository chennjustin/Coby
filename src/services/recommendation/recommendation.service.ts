import { LLMClient } from "@/lib/llm/client";
import { OpenAIClient } from "@/lib/llm/openai";
import { getMemoryProvider } from "@/memory/memory.factory";
import { MemoryProvider } from "@/memory/types";
import { SavedItemRepository } from "@/repositories/saved-item.repository";
import { Logger } from "@/lib/utils/logger";

export class RecommendationService {
  private llmClient: LLMClient;
  private memoryProvider: MemoryProvider;
  private savedItemRepo: SavedItemRepository;

  constructor() {
    this.llmClient = new OpenAIClient();
    this.memoryProvider = getMemoryProvider();
    this.savedItemRepo = new SavedItemRepository();
  }

  /**
   * 根據使用者記憶、歷史對話和目前 deadline 狀況生成學習建議
   */
  async generateRecommendation(
    userId: string,
    currentContext: {
      deadlines?: Array<{
        title: string;
        dueDate: string;
        estimatedHours: number;
        type: string;
      }>;
      userMessage?: string;
    }
  ): Promise<string | null> {
    try {
      const query = currentContext.userMessage || "學習建議 時間安排 效率";

      const [memories, recentItems] = await Promise.all([
        this.memoryProvider.search(query, { userId, limit: 5 }),
        this.savedItemRepo.findRecent(userId, 7),
      ]);

      const memoryText = memories
        .filter((m) => m.score > 0.25)
        .map((m) => `- ${m.memory}`)
        .join("\n");

      const recentTopics = recentItems
        .slice(0, 5)
        .flatMap((item) =>
          item.messages
            .filter((m) => m.role === "user")
            .map((m) => m.content)
        )
        .slice(0, 5)
        .map((c) => `- ${c.substring(0, 60)}`)
        .join("\n");

      let deadlineInfo = "";
      if (currentContext.deadlines && currentContext.deadlines.length > 0) {
        deadlineInfo = currentContext.deadlines
          .map((d) => {
            const dueDate = new Date(d.dueDate).toLocaleDateString("zh-TW");
            return `- ${d.title}（${d.type}）：截止 ${dueDate}，預估 ${d.estimatedHours} 小時`;
          })
          .join("\n");
      }

      const prompt = `你是 Coby，一個智慧學習助手。請根據以下資訊，給使用者一條具體的學習建議（不超過 100 字，繁體中文）。

${memoryText ? `使用者長期記憶：\n${memoryText}\n` : ""}
${recentTopics ? `最近聊天主題：\n${recentTopics}\n` : ""}
${deadlineInfo ? `目前的 Deadlines：\n${deadlineInfo}\n` : ""}

要求：
- 根據實際資料給出具體建議（例如：建議先做哪個作業、什麼時段效率最好）
- 如果記憶中有使用者偏好（如偏好早上讀書），融入建議中
- 不要給出太籠統的建議
- 語氣親切自然`;

      const response = await this.llmClient.chat([
        { role: "system", content: "你是一個學習建議生成器，給出簡短實用的學習建議。" },
        { role: "user", content: prompt },
      ]);

      return response.trim();
    } catch (error) {
      Logger.error("RecommendationService: 生成建議失敗", { error, userId });
      return null;
    }
  }

  /**
   * 判斷是否應該主動給出建議
   */
  shouldRecommend(userMessage: string): boolean {
    const keywords = [
      "建議", "怎麼", "如何", "什麼時候", "安排",
      "讀書", "學習", "計畫", "規劃", "推薦",
      "接下來", "下一步", "該做什麼", "先做哪",
    ];
    return keywords.some((kw) => userMessage.includes(kw));
  }
}
