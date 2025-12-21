import { OpenAIClient } from "@/lib/llm/openai";
import { Logger } from "@/lib/utils/logger";
import { LLMMessage } from "@/lib/llm/client";
import { IDeadline } from "@/models/Deadline";
import { IStudyBlock } from "@/models/StudyBlock";
import { UserPreferences } from "./preference-extractor.service";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { getCurrentDateTimeChinese, getTodayString } from "@/lib/utils/date";
import { APP_CONFIG } from "@/lib/config/app.config";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface ScheduleModificationRequest {
  action: "modify" | "delete";
  deadlineId: string;
  deadlineTitle: string;
  newDueDate?: string; // ISO 8601 格式的新截止日期（例如：2025-12-02T23:59:00+08:00）
  newSchedule?: {
    blocks: Array<{
      date: string; // YYYY-MM-DD
      startTime: string; // ISO 8601
      endTime: string; // ISO 8601
      duration: number;
    }>;
    preferences?: {
      excludeHours?: number[];
      preferHours?: number[];
      maxHoursPerDay?: number;
      excludeDays?: string[]; // 排除的日期（格式：YYYY-MM-DD）
    };
  };
  reasoning?: string; // LLM 的推理過程
}

export class ScheduleModifierService {
  private llmClient: OpenAIClient;

  constructor() {
    this.llmClient = new OpenAIClient();
  }

  /**
   * 分析用戶的時程修改請求，返回修改建議
   */
  async analyzeModificationRequest(
    userMessage: string,
    deadlines: IDeadline[],
    studyBlocks: IStudyBlock[],
    conversationHistory: Array<{ role: string; content: string }>
  ): Promise<ScheduleModificationRequest | null> {
    try {
      // 獲取當前日期
      const todayString = getTodayString(); // YYYY-MM-DD
      const currentDateTime = getCurrentDateTimeChinese();
      const today = new Date(todayString);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // 格式化所有死線資訊
      const deadlinesText = this.formatDeadlines(deadlines, studyBlocks);

      // 格式化對話歷史（最近10條）
      const recentHistory = conversationHistory.slice(-10);
      const historyText = recentHistory
        .map((msg) => `${msg.role === "user" ? "用戶" : "助手"}: ${msg.content}`)
        .join("\n");

      const prompt = `你是一個時程管理助手，專門幫助用戶修改或刪除學習時程。

**當前時間：**${currentDateTime}（${APP_CONFIG.CURRENT_YEAR}年）
**今天日期：**${todayString}（${new Date(todayString).toLocaleDateString("zh-TW", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}）

**用戶的所有死線和時程資訊：**
${deadlinesText}

**最近的對話歷史：**
${historyText || "無"}

**用戶的當前請求：**
${userMessage}

**你的任務：**
1. 分析用戶的請求，判斷用戶想要：
   - "modify"：修改某個死線的時程安排或截止日期
   - "delete"：刪除某個死線

2. 識別用戶要修改或刪除的死線：
   - 如果用戶明確提到死線名稱（例如「網服期末專題」、「網服作業」、「專題報告」），使用該名稱匹配
   - 如果用戶沒有明確提到，根據上下文推斷（例如「專題」、「作業」等）
   - 如果有多個匹配的死線，選擇最相關的一個

3. 如果 action 是 "modify"：
   - **檢查用戶是否想要修改截止日期**：
     * 如果用戶提到「X月X日以前」、「X/X之前」、「下週X之前」、「X天前」等，表示要修改截止日期
     * 例如：「我可以12/2以前就先把它做完嗎」→ 修改截止日期為 2025-12-02T23:59:00+08:00
     * 例如：「我想在12/1之前完成」→ 修改截止日期為 2025-12-01T23:59:00+08:00
   - **分析用戶的新需求（時程偏好）**：
     * 如果用戶提到「都擺在早上」、「一次三小時」等，提取偏好設定
     * excludeHours：排除的小時（例如：用戶說「不要在早上」→ [0,1,2,3,4,5,6,7,8,9,10,11]）
     * preferHours：偏好的小時（例如：用戶說「都擺在早上」→ [8,9,10,11]）
     * maxHoursPerDay：每天最大時數（例如：用戶說「一次三小時」→ 3）
     * **excludeDays：排除的日期（例如：用戶說「今天不要排」、「今天不要」、「我明天開始才有時間」→ ["${todayString}"]）**
   - **重要：當用戶說「今天不要排」、「今天不要」等，必須提取 excludeDays，並且必須重新排程以確保總時數不變**
   - 如果用戶只修改截止日期，不需要提供 preferences
   - 如果用戶只修改時程偏好，不需要提供 newDueDate
   - 如果用戶同時修改截止日期和時程偏好，兩者都要提供

4. 如果 action 是 "delete"：
   - 確認要刪除的死線

**輸出格式：**
請以 JSON 格式輸出，格式如下：
{
  "action": "modify" | "delete",
  "deadlineId": "deadline_id_string",
  "deadlineTitle": "deadline_title",
  "newDueDate": "2025-12-02T23:59:00+08:00", // ISO 8601 格式，僅當用戶要修改截止日期時需要
  "newSchedule": {
    "preferences": {
      "excludeHours": [0, 1, 2],
      "preferHours": [8, 9, 10, 11],
      "maxHoursPerDay": 3,
      "excludeDays": ["${todayString}"] // 排除的日期，例如用戶說「今天不要排」→ ["${todayString}"]
    }
  }, // 僅當 action 為 "modify" 且用戶要修改時程偏好時需要
  "reasoning": "你的推理過程"
}

**重要規則：**
- 如果用戶只是詢問時程，沒有明確要修改或刪除，返回 null（不輸出 JSON）
- deadlineId 必須是有效的死線 ID（從提供的死線資訊中選擇）
- 如果無法確定用戶意圖，返回 null
- **當用戶說「今天不要排」、「今天不要」、「今天不排」、「我明天開始才有時間」等，必須識別為 modify action，並提取 excludeDays: ["${todayString}"]**
- 如果用戶想要修改時程偏好，newSchedule.preferences 必須包含至少一個偏好設定（excludeHours、preferHours、maxHoursPerDay 或 excludeDays）
- 如果用戶想要修改截止日期，newDueDate 必須是有效的 ISO 8601 格式日期時間（時區 +08:00）
- newDueDate 和 newSchedule.preferences 可以同時存在（用戶同時修改截止日期和時程偏好）
- **重要：當用戶要求排除某個日期（如「今天不要排」）時，必須重新排程以確保總時數不變，只是將時間移到其他日期**
- 日期解析規則：
  * "X月X日"、"X/X" → 轉換為 ${APP_CONFIG.CURRENT_YEAR} 年對應日期，時間預設為 23:59
  * "下週X"、"下星期X" → 計算下週對應的日期，時間預設為 23:59
  * "X天前"、"X天內" → 從當前日期計算，時間預設為 23:59
  * "今天" → ${todayString}
  * "明天" → ${tomorrowString}
  * 所有日期都必須使用 ${APP_CONFIG.CURRENT_YEAR} 年

請只返回 JSON，不要有其他文字。如果無法確定用戶意圖，返回 null。`;

      const messages: LLMMessage[] = [
        {
          role: "system",
          content:
            "你是一個時程管理助手。請只返回有效的 JSON 格式，不要有其他文字。如果無法確定用戶意圖，返回 null。",
        },
        {
          role: "user",
          content: prompt,
        },
      ];

      const response = await this.llmClient.chat(messages);

      // 解析 JSON（可能包含 markdown code block）
      let jsonStr = response.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      }

      // 檢查是否為 null
      if (jsonStr.toLowerCase().trim() === "null" || jsonStr.trim() === "") {
        Logger.info("無法確定用戶修改意圖", { userMessage });
        return null;
      }

      if (jsonStr.startsWith("{")) {
        const result = JSON.parse(jsonStr) as ScheduleModificationRequest;

        // 驗證結果
        if (
          result.action &&
          (result.action === "modify" || result.action === "delete") &&
          result.deadlineId &&
          result.deadlineTitle
        ) {
          // 驗證 deadlineId 是否存在
          const deadlineExists = deadlines.some(
            (d) => d._id.toString() === result.deadlineId
          );
          if (!deadlineExists) {
            Logger.warn("LLM 返回的 deadlineId 不存在", {
              deadlineId: result.deadlineId,
              availableIds: deadlines.map((d) => d._id.toString()),
            });
            return null;
          }

          // 如果是 modify，驗證至少要有 newDueDate 或 newSchedule.preferences（包含 excludeDays）
          if (result.action === "modify") {
            const hasPreferences = result.newSchedule?.preferences && (
              result.newSchedule.preferences.excludeHours ||
              result.newSchedule.preferences.preferHours ||
              result.newSchedule.preferences.maxHoursPerDay ||
              result.newSchedule.preferences.excludeDays
            );
            
            if (!result.newDueDate && !hasPreferences) {
              Logger.warn("LLM 返回的 modify action 缺少 newDueDate 或 newSchedule.preferences", { result });
              return null;
            }
            
            // 驗證 newDueDate 格式（如果存在）
            if (result.newDueDate) {
              const testDate = new Date(result.newDueDate);
              if (isNaN(testDate.getTime())) {
                Logger.warn("LLM 返回的 newDueDate 格式無效", { newDueDate: result.newDueDate });
                return null;
              }
            }
          }

          Logger.info("LLM 分析修改請求成功", {
            action: result.action,
            deadlineId: result.deadlineId,
            deadlineTitle: result.deadlineTitle,
            reasoning: result.reasoning,
          });

          return result;
        }
      }

      Logger.warn("無法解析 LLM 修改請求結果", { response });
      return null;
    } catch (error) {
      Logger.error("分析修改請求失敗", { error, userMessage });
      return null;
    }
  }

  /**
   * 格式化所有死線資訊
   */
  private formatDeadlines(
    deadlines: IDeadline[],
    studyBlocks: IStudyBlock[]
  ): string {
    if (deadlines.length === 0) {
      return "目前沒有任何死線。";
    }

    let text = "";

    deadlines.forEach((deadline) => {
      const deadlineId = deadline._id.toString();
      const dueDate = dayjs(deadline.dueDate).tz("Asia/Taipei");
      const deadlineBlocks = studyBlocks.filter(
        (b) => b.deadlineId.toString() === deadlineId
      );

      text += `\n**死線 ID：${deadlineId}**\n`;
      text += `- 標題：${deadline.title}\n`;
      text += `- 類型：${deadline.type}\n`;
      text += `- 截止日期：${dueDate.format("YYYY年M月D日 HH:mm")}\n`;
      text += `- 預估時數：${deadline.estimatedHours} 小時\n`;

      if (deadlineBlocks.length > 0) {
        text += `- 已安排的學習時間：\n`;
        const blocksByDate = new Map<string, IStudyBlock[]>();
        deadlineBlocks.forEach((b) => {
          const dateKey = dayjs(b.startTime).format("YYYY-MM-DD");
          if (!blocksByDate.has(dateKey)) {
            blocksByDate.set(dateKey, []);
          }
          blocksByDate.get(dateKey)!.push(b);
        });

        blocksByDate.forEach((blocks, dateKey) => {
          text += `  ${dateKey}：\n`;
          blocks.forEach((b) => {
            const start = dayjs(b.startTime).format("HH:mm");
            const end = dayjs(b.endTime).format("HH:mm");
            text += `    - ${start}-${end}（${b.duration}小時）\n`;
          });
        });

        const totalScheduledHours = deadlineBlocks.reduce(
          (sum, b) => sum + b.duration,
          0
        );
        text += `- 已安排總時數：${totalScheduledHours} 小時\n`;
      } else {
        text += `- 已安排的學習時間：無\n`;
      }
    });

    return text;
  }
}

