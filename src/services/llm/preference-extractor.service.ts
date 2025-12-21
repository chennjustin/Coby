import { OpenAIClient } from "@/lib/llm/openai";
import { Logger } from "@/lib/utils/logger";
import { LLMMessage } from "@/lib/llm/client";
import { getTodayString, getCurrentDateTimeChinese } from "@/lib/utils/date";

export interface UserPreferences {
  excludeHours?: number[]; // 排除的小時 [0-23]
  preferHours?: number[]; // 偏好的小時
  excludeDays?: string[]; // 排除的日期（格式：YYYY-MM-DD）
  maxHoursPerDay?: number; // 每天最大時數
}

export class PreferenceExtractorService {
  private llmClient: OpenAIClient;

  constructor() {
    this.llmClient = new OpenAIClient();
  }

  /**
   * 從對話歷史中提取用戶偏好
   * @param conversationHistory 對話歷史
   * @param currentText 當前用戶輸入的文字
   */
  async extractPreferences(
    conversationHistory: Array<{ role: string; content: string }>,
    currentText?: string
  ): Promise<UserPreferences> {
    try {
      // 獲取當前日期（台灣時區）
      const todayString = getTodayString(); // YYYY-MM-DD
      const currentDateTime = getCurrentDateTimeChinese(); // 例如：2025年11月26日 星期三 14:30
      const today = new Date(todayString);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // 合併對話歷史和當前文字
      const allText = [
        ...conversationHistory.map((msg) => `${msg.role}: ${msg.content}`),
        currentText ? `user: ${currentText}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const prompt = `你是一個偏好提取系統，專門從用戶對話中提取時間偏好。

**當前時間：**${currentDateTime}
**今天日期：**${todayString}（${today.toLocaleDateString("zh-TW", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}）
**明天日期：**${tomorrowString}（${tomorrow.toLocaleDateString("zh-TW", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}）

請分析以下對話，提取用戶的時間偏好，並以 JSON 格式輸出。

偏好類型：
1. excludeHours: 排除的小時（0-23），例如用戶說「不要在早上」→ [0,1,2,3,4,5,6,7,8,9,10,11]
2. preferHours: 偏好的小時（0-23），例如用戶說「下午比較好」→ [12,13,14,15,16,17]
3. excludeDays: 排除的日期（YYYY-MM-DD格式），例如用戶說「今天不要排」、「今天不要」→ ["${todayString}"]
4. maxHoursPerDay: 每天最大時數，例如用戶說「一次三小時」→ 3

關鍵字對應：
- 「不要在早上」、「早上不行」、「不要早上」→ excludeHours: [0,1,2,3,4,5,6,7,8,9,10,11]
- 「不要在下午」、「下午不行」→ excludeHours: [12,13,14,15,16,17]
- 「不要在晚上」、「晚上不行」→ excludeHours: [18,19,20,21,22,23]
- 「早上比較好」、「早上可以」、「都擺在早上」→ preferHours: [8,9,10,11]
- 「下午比較好」、「下午可以」、「都擺在下午」→ preferHours: [12,13,14,15,16,17]
- 「晚上比較好」、「晚上可以」、「都擺在晚上」→ preferHours: [18,19,20,21,22]
- 「今天不要排」、「今天不要」、「今天不排」、「今天不行」、「今天不要排東西」→ excludeDays: ["${todayString}"]
- 「明天不要排」、「明天不要」、「明天不排」→ excludeDays: ["${tomorrowString}"]
- 「X號沒時間」、「X日沒時間」、「X跟Y沒時間」、「X和Y沒時間」、「X號跟Y號沒時間」、「X日跟Y日沒時間」→ excludeDays: 需要解析具體日期（例如「29跟30沒時間」→ 根據當前日期解析為 ["2025-11-29", "2025-11-30"]，如果當前是11月，則為11月29和30日；如果當前是12月，則為12月29和30日）
- 「週末不行」、「週末不要」→ excludeDays: 需要根據當前日期計算週末的具體日期
- 「一天不要超過X小時」、「一次X小時」→ maxHoursPerDay: X
- 「幫我排開」、「重新排」、「重新安排」→ 如果用戶提到特定日期沒時間，應該提取那些日期到 excludeDays

**重要：**
- 當用戶說「今天不要排」、「今天不要」等，必須提取 excludeDays: ["${todayString}"]
- 當用戶說「明天不要排」、「明天不要」等，必須提取 excludeDays: ["${tomorrowString}"]
- 日期必須使用 YYYY-MM-DD 格式

如果沒有找到相關偏好，返回空的 JSON 物件 {}。

請只返回 JSON，不要有其他文字。

對話內容：
${allText}`;

      const messages: LLMMessage[] = [
        {
          role: "system",
          content:
            "你是一個偏好提取系統。請只返回 JSON 格式的結果，不要有其他文字。",
        },
        {
          role: "user",
          content: prompt,
        },
      ];

      const response = await this.llmClient.chat(messages);

      // 嘗試解析 JSON（可能包含 markdown code block）
      let jsonStr = response.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      }
      if (jsonStr.startsWith("{")) {
        const preferences = JSON.parse(jsonStr) as UserPreferences;
        Logger.info("提取用戶偏好成功", { preferences });
        return preferences;
      }

      Logger.warn("無法解析偏好 JSON", { response });
      return {};
    } catch (error) {
      Logger.error("提取用戶偏好失敗", { error });
      return {};
    }
  }

  /**
   * 從文字中快速提取簡單偏好（不使用 LLM）
   * @param text 用戶輸入的文字
   */
  extractSimplePreferences(text: string): UserPreferences {
    const preferences: UserPreferences = {};
    const lowerText = text.toLowerCase();

    // 排除早上（0-11）
    if (
      lowerText.includes("不要在早上") ||
      lowerText.includes("早上不行") ||
      lowerText.includes("不要早上") ||
      lowerText.includes("早上不要") ||
      lowerText.includes("不想要早上") ||
      lowerText.includes("不想早上") ||
      lowerText.includes("不要早上做事") ||
      lowerText.includes("不想早上做事")
    ) {
      preferences.excludeHours = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    }

    // 排除下午（12-17）
    if (
      lowerText.includes("不要在下午") ||
      lowerText.includes("下午不行") ||
      lowerText.includes("不要下午") ||
      lowerText.includes("下午不要")
    ) {
      preferences.excludeHours = [
        ...(preferences.excludeHours || []),
        12, 13, 14, 15, 16, 17,
      ];
    }

    // 排除晚上（18-23）
    if (
      lowerText.includes("不要在晚上") ||
      lowerText.includes("晚上不行") ||
      lowerText.includes("不要晚上") ||
      lowerText.includes("晚上不要")
    ) {
      preferences.excludeHours = [
        ...(preferences.excludeHours || []),
        18, 19, 20, 21, 22, 23,
      ];
    }

    // 偏好早上
    if (
      lowerText.includes("早上比較好") ||
      lowerText.includes("早上可以") ||
      lowerText.includes("早上比較")
    ) {
      preferences.preferHours = [8, 9, 10, 11];
    }

    // 偏好下午
    if (
      lowerText.includes("下午比較好") ||
      lowerText.includes("下午可以") ||
      lowerText.includes("下午比較")
    ) {
      preferences.preferHours = [12, 13, 14, 15, 16, 17];
    }

    // 偏好晚上
    if (
      lowerText.includes("晚上比較好") ||
      lowerText.includes("晚上可以") ||
      lowerText.includes("晚上比較")
    ) {
      preferences.preferHours = [18, 19, 20, 21, 22];
    }

    return preferences;
  }
}

