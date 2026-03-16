import { OpenAIClient } from "@/lib/llm/openai";
import { Logger } from "@/lib/utils/logger";
import { getTodayChinese, getCurrentDateTimeChinese } from "@/lib/utils/date";
import { APP_CONFIG } from "@/lib/config/app.config";

export type Intent = "check_in" | "daily_quote" | "view_schedule" | "add_deadline" | "update_deadline" | "delete_deadline" | "modify_schedule" | "other";

export interface IntentResult {
  intent: Intent;
  entities: {
    date?: string; // ISO date string (YYYY-MM-DD)
    title?: string;
    estimatedHours?: number;
    type?: "exam" | "assignment" | "project" | "other";
  };
  confidence: number;
  // 對於 view_schedule 意圖，區分是直接打開還是詢問式
  actionType?: "direct_open" | "inquiry"; // direct_open: 直接打開頁面, inquiry: 先回答再給按鈕
}

export class IntentService {
  private llmClient: OpenAIClient;

  constructor() {
    this.llmClient = new OpenAIClient();
  }

  /**
   * 識別用戶意圖並提取實體
   */
  async detectIntentAndExtract(text: string): Promise<IntentResult> {
    try {
      const prompt = `你是一個 Coby LINE Bot 的意圖識別系統，專門處理台灣大學生的對話。

請分析以下使用者訊息，識別意圖並提取相關實體。

意圖類型：
1. "check_in" - 簽到相關（例如：我要簽到、簽到一下、報到、簽到）
2. "daily_quote" - 今日占卜相關（例如：來一句、我要占卜、今日占卜、給我占卜、抽!!!）
3. "view_schedule" - 查看時程相關（例如：今天要幹嘛、我的行程、查看時程表、明天的待辦、有什麼作業、我想看行事曆、打開行事曆）
   **重要：如果用戶問到「已存在的 deadline 的學習時間分配」、「你幫我分配到哪些時間」、「分配在哪裡」等問題，應該識別為 "view_schedule" 或 "other"，而不是 "add_deadline"**
4. "add_deadline" - 新增 Deadline 相關（例如：我有一個作業、新增 deadline、下週三要交作業）
   **重要：只有在用戶明確要「新增」、「建立」、「加入」新的 deadline 時，才識別為 "add_deadline"**
   **如果用戶問到已存在的 deadline（例如：「我網服作業的8小時，你幫我分配到哪些時間」），這不是新增，應該識別為 "view_schedule" 或 "other"**
5. "update_deadline" - 修改 Deadline 相關（例如：我想要更改我的deadline、修改deadline、更改截止時間、我想改deadline的時間）
   **重要：只有在用戶明確要「修改」、「更改」、「更新」、「改」已存在的 deadline 的截止時間時，才識別為 "update_deadline"**
6. "delete_deadline" - 刪除 Deadline 相關（例如：我不需要這個deadline了、刪除deadline、取消deadline、移除deadline）
   **重要：只有在用戶明確要「刪除」、「取消」、「移除」、「不需要」deadline 時，才識別為 "delete_deadline"**
7. "modify_schedule" - 修改時程安排相關（例如：我想要把做專題的時間都擺在早上、把XX改成YY、修改XX的時程、想要把XX時間都擺在YY、一次三小時、今天不要排、今天不要、我明天開始才有時間等）
   **重要：當用戶提到想要修改已存在的 deadline 的時程安排（不是截止時間），應該識別為 "modify_schedule"**
   **範例：「我想要把做專題的時間都擺在早上然後一次三小時」、「把網服作業改成下午」、「修改時程」、「今天不要排」、「今天不要」、「我明天開始才有時間」等**
8. "other" - 其他對話（包括查詢已存在的 deadline 的學習時間、詢問已安排的時程等）

對於 "view_schedule" 意圖，需要判斷用戶的意圖類型：
- "direct_open": 用戶明確要求「打開」、「開啟」、「顯示」行事曆/時程表頁面
  範例：「我想看行事曆」、「打開行事曆」、「開啟時程表」、「給我看行事曆」、「顯示時程表」
- "inquiry": 用戶以詢問方式想知道有什麼事、要做什麼，或查詢已存在的 deadline 的學習時間分配
  範例：「我今天有什麼事」、「明天要做什麼」、「可以給我看明天我要讀哪些書嗎」、「今天要幹嘛」、「有什麼作業」
  **特別注意：如果用戶問「我XX作業的X小時，你幫我分配到哪些時間」或「XX作業的時間分配在哪裡」，這是查詢已存在的 deadline 的學習時間，應該識別為 "view_schedule" 的 "inquiry" 類型，而不是 "add_deadline"**

實體提取規則：
- 如果意圖是 "view_schedule" 或 "add_deadline"，嘗試提取日期（date）
- 如果意圖是 "add_deadline"，提取：
  - title（標題）
  - dueDate（日期，YYYY-MM-DD 格式，如果無法確定則為 null）
  - estimatedHours（預估小時數，如果沒有提到則為 null）
  - type（exam/assignment/project/other，如果無法確定則為 null）
- 如果意圖是 "update_deadline" 或 "delete_deadline"，嘗試提取：
  - title（deadline 標題，用於識別要修改/刪除的 deadline）
  - date（如果是 update_deadline，嘗試提取新的截止日期時間）

日期時間解析規則（非常重要：當前日期時間是 ${getCurrentDateTimeChinese()}，${APP_CONFIG.CURRENT_YEAR} 年）：

日期解析：
- "今天"、"今日" → 今天的日期（必須是 ${APP_CONFIG.CURRENT_YEAR} 年）
- "明天"、"明日" → 明天的日期（必須是 ${APP_CONFIG.CURRENT_YEAR} 年）
- "下週X"、"下星期X" → 計算下週對應的日期（必須是 ${APP_CONFIG.CURRENT_YEAR} 年）
- "X月X日"、"X/X" → 轉換為 ${APP_CONFIG.CURRENT_YEAR} 年對應日期
- 所有日期都必須使用 ${APP_CONFIG.CURRENT_YEAR} 年，絕對不要使用其他年份

時間解析：
- "早上"、"上午" → 08:00-11:59（如果沒有具體時間，預設 09:00）
- "下午" → 12:00-17:59（如果沒有具體時間，預設 14:00）
- "晚上"、"傍晚" → 18:00-22:59（如果沒有具體時間，預設 20:00）
- "凌晨" → 00:00-05:59（如果沒有具體時間，預設 02:00）
- 具體時間（例如"6點"、"18:00"、"晚上8點"、"早上6點"）→ 直接使用
- 如果沒有提到時間，預設為當天 23:59

輸出格式：
- dueDate 應該是完整的日期時間格式：YYYY-MM-DDTHH:mm（例如：2025-12-02T18:00）
- 如果無法確定日期，設為 null

請以 JSON 格式輸出：
{
  "intent": "check_in" | "daily_quote" | "view_schedule" | "add_deadline" | "update_deadline" | "delete_deadline" | "modify_schedule" | "other",
  "entities": {
    "date": "YYYY-MM-DDTHH:mm" | null, // 完整的日期時間格式（ISO 8601）
    "title": "string" | null, // deadline 標題（用於識別要修改/刪除的 deadline）
    "estimatedHours": number | null,
    "type": "exam" | "assignment" | "project" | "other" | null
  },
  "confidence": 0.0-1.0,
  "actionType": "direct_open" | "inquiry" | null
}

注意：
- 如果 intent 是 "view_schedule"，actionType 必須是 "direct_open" 或 "inquiry"
- 如果 intent 不是 "view_schedule"，actionType 為 null

使用者訊息：${text}

**關鍵判斷規則：**
1. 如果用戶問到「你幫我分配到哪些時間」、「分配在哪裡」、「時間分配」、「學習時間」等，且提到了已存在的 deadline 名稱（例如「網服作業」），這是**查詢已存在的 deadline 的學習時間**，應該識別為 "view_schedule" 或 "other"，**絕對不是 "add_deadline"**
2. 只有在用戶明確要「新增」、「建立」、「加入」新的 deadline 時，才識別為 "add_deadline"
3. 如果用戶問到已存在的 deadline 的相關問題（學習時間、進度、截止日期等），應該識別為 "view_schedule" 或 "other"

重要提醒：
- 當前日期時間：${getCurrentDateTimeChinese()}（${APP_CONFIG.CURRENT_YEAR}年）
- 必須解析完整的日期時間（年、月、日、時、分），不能只有日期
- 所有日期解析都必須使用 ${APP_CONFIG.CURRENT_YEAR} 年作為基準年份。`;

      const response = await this.llmClient.chat([
        {
          role: "system",
          content: "你是一個 JSON 解析器，只輸出有效的 JSON 格式，不要包含任何其他文字。",
        },
        {
          role: "user",
          content: prompt,
        },
      ]);

      // 清理回應並解析 JSON
      const cleaned = response
        .trim()
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const parsed = JSON.parse(cleaned);

      // 驗證和標準化結果
      const intent: Intent = this.validateIntent(parsed.intent);
      const entities = {
        date: parsed.entities?.date || null,
        title: parsed.entities?.title || null,
        estimatedHours: parsed.entities?.estimatedHours || null,
        type: parsed.entities?.type || null,
      };

      // 驗證日期格式
      if (entities.date && !/^\d{4}-\d{2}-\d{2}$/.test(entities.date)) {
        entities.date = null;
      }

      // 驗證 estimatedHours
      if (entities.estimatedHours !== null && typeof entities.estimatedHours !== "number") {
        entities.estimatedHours = null;
      }

      const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));

      // 驗證 actionType（僅對 view_schedule 意圖）
      let actionType: "direct_open" | "inquiry" | undefined = undefined;
      if (intent === "view_schedule") {
        if (parsed.actionType === "direct_open" || parsed.actionType === "inquiry") {
          actionType = parsed.actionType;
        } else {
          // 如果 LLM 沒有返回 actionType，根據文字推斷
          const directKeywords = ["打開", "開啟", "顯示", "給我看", "我想看", "我要看"];
          const inquiryKeywords = ["有什麼", "要做什麼", "要幹嘛", "要讀", "有哪些"];
          const hasDirectKeyword = directKeywords.some(kw => text.includes(kw));
          const hasInquiryKeyword = inquiryKeywords.some(kw => text.includes(kw));
          
          if (hasDirectKeyword && !hasInquiryKeyword) {
            actionType = "direct_open";
          } else if (hasInquiryKeyword) {
            actionType = "inquiry";
          } else {
            // 預設為詢問式
            actionType = "inquiry";
          }
        }
      }

      Logger.info("意圖識別結果", { text, intent, entities, confidence, actionType });

      return {
        intent,
        entities,
        confidence,
        actionType,
      };
    } catch (error) {
      Logger.error("意圖識別失敗", { error, text });
      // 返回預設結果
      return {
        intent: "other",
        entities: {},
        confidence: 0.0,
      };
    }
  }

  /**
   * 驗證意圖類型
   */
  private validateIntent(intent: string): Intent {
    const validIntents: Intent[] = ["check_in", "daily_quote", "view_schedule", "add_deadline", "update_deadline", "delete_deadline", "modify_schedule", "other"];
    if (validIntents.includes(intent as Intent)) {
      return intent as Intent;
    }
    return "other";
  }

  /**
   * 從文字中提取日期（改進版本）
   */
  async extractDateFromText(text: string): Promise<string | null> {
    try {
      const prompt = `請將以下中文日期描述轉換為 YYYY-MM-DD 格式的日期。

規則：
1. 如果提到「今天」「今日」→ 使用今天的日期
2. 如果提到「明天」「明日」→ 使用明天的日期
3. 如果提到「下週X」「下星期X」→ 計算下週對應的日期
4. 如果提到「X月X日」「X/X」→ 轉換為今年對應日期
5. 如果無法確定，返回 null
6. 只輸出 JSON 格式：{"date": "YYYY-MM-DD"} 或 {"date": null}
7. 不要輸出其他文字

使用者輸入：${text}

重要：當前年份是 ${APP_CONFIG.CURRENT_YEAR} 年。
注意：今天是 ${getTodayChinese()}（${APP_CONFIG.CURRENT_YEAR}年）。
所有日期解析都必須使用 ${APP_CONFIG.CURRENT_YEAR} 年作為基準年份。`;

      const response = await this.llmClient.chat([
        {
          role: "system",
          content: "你是一個日期解析器，只輸出有效的 JSON 格式。",
        },
        {
          role: "user",
          content: prompt,
        },
      ]);

      const cleaned = response.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);

      if (parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
        return parsed.date;
      }

      return null;
    } catch (error) {
      Logger.error("日期提取失敗", { error, text });
      return null;
    }
  }
}

