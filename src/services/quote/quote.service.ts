import { Logger } from "@/lib/utils/logger";
import { OpenAIClient } from "@/lib/llm/openai";
import { LLMMessage } from "@/lib/llm/client";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

export class QuoteService {
  private llmClient: OpenAIClient;

  constructor() {
    this.llmClient = new OpenAIClient();
  }

  /**
   * 取得今日占卜（使用 LLM 生成，每次都不一樣）
   */
  async getDailyQuote(userId: string, date: Date = new Date()): Promise<string> {
    try {
      const today = dayjs(date).tz("Asia/Taipei");
      const dayOfWeek = today.format("dddd");
      const dateStr = today.format("YYYY年M月D日");
      
      // 生成隨機的占卜主題和元素，確保每次都不一樣
      const themes = [
        "學業運勢",
        "作業運勢",
        "考試運勢",
        "時間管理",
        "學習效率",
        "期末運勢",
        "專題運勢",
        "報告運勢",
        "讀書運勢",
        "Deadline運勢",
        "熬夜運勢",
        "拖延運勢",
      ];
      const elements = [
        "星星",
        "月亮",
        "太陽",
        "風",
        "水",
        "火",
        "土",
        "雲",
        "彩虹",
        "閃電",
        "霧",
        "雨",
      ];
      const randomTheme = themes[Math.floor(Math.random() * themes.length)];
      const randomElement = elements[Math.floor(Math.random() * elements.length)];
      const randomNumber = Math.floor(Math.random() * 100) + 1;
      const randomSeed = Math.floor(Math.random() * 10000); // 額外的隨機種子確保每次都不一樣

      const prompt = `你是一個幽默的占卜師，專門為大學生提供每日占卜，風格輕鬆有趣，會說幹話。

**今日資訊：**
- 日期：${dateStr}（${dayOfWeek}）
- 占卜主題：${randomTheme}
- 占卜元素：${randomElement}
- 隨機數字：${randomNumber}
- 隨機種子：${randomSeed}

**占卜要求：**
1. 生成一個關於「${randomTheme}」的占卜內容
2. 內容要輕鬆、有趣，像朋友在聊天，不要太正式
3. 風格要幽默，可以說幹話，但不要太過分
4. 內容要針對大學生和學習相關
5. **非常重要：每次都要完全不一樣，絕對不要重複！使用不同的比喻、不同的說法、不同的角度**
6. **中間的占卜內容要簡短，控制在 30-50 字左右，一兩句話就好**
7. 幸運時段和建議也要簡短，各一句話就好

**輸出格式：**
請直接輸出占卜內容，不要有其他說明文字。格式如下：

📚 今日宜讀書指數：${randomNumber}% / 100%
🛋️ 今日宜耍廢指數：${100 - randomNumber}% / 100%

${randomElement}告訴我，今天你的${randomTheme}...

[占卜內容，一兩句輕鬆的幹話，30-50字左右，不要太正式，不要太長]

✨ 今日幸運時段：[時段，一句話]
💡 建議：[具體建議，一句話，也要輕鬆一點]

[一句鼓勵的話，也要輕鬆幽默，不要太長]

**重要提醒：**
- 中間的占卜內容一定要簡短，30-50字就好
- 每次都要用不同的比喻、不同的說法，絕對不要重複
- 風格要輕鬆幽默，像朋友在聊天

請只返回占卜內容，不要有其他文字。`;

      const messages: LLMMessage[] = [
        {
          role: "system",
          content:
            "你是一個幽默的占卜師，專門為大學生提供每日占卜。風格要輕鬆有趣，會說幹話，不要太正式。請只返回占卜內容，不要有其他文字。**每次都要生成完全不同的內容，使用不同的比喻、不同的說法、不同的角度，絕對不要重複。中間的占卜內容要簡短，30-50字就好。**",
        },
        {
          role: "user",
          content: prompt,
        },
      ];

      const response = await this.llmClient.chat(messages);
      const fortune = response.trim();

      Logger.info("取得今日占卜", { userId, date: date.toISOString() });
      return fortune;
    } catch (error) {
      Logger.error("取得今日占卜失敗", { error, userId });
      const fallbackRandom = Math.floor(Math.random() * 100) + 1;
      return `📚 今日宜讀書指數：${fallbackRandom}% / 100%\n🛋️ 今日宜耍廢指數：${100 - fallbackRandom}% / 100%\n\n星星告訴我，今天你的學業運勢還行，該讀書就讀書，該耍廢就耍廢，別太勉強自己。\n\n✨ 今日幸運時段：下午\n💡 建議：想讀書就讀，不想讀就休息，別有壓力\n\n反正日子還是要過，加油啦！💪`;
    }
  }
}

