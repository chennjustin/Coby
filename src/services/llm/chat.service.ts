import { LLMClient, LLMMessage } from "@/lib/llm/client";
import { OpenAIClient } from "@/lib/llm/openai";
import { handleLLMError, getFallbackResponse } from "@/lib/llm/fallback";
import { Logger } from "@/lib/utils/logger";
import { BOT_NAME } from "@/lib/constants";

const SYSTEM_PROMPT = `你是「${BOT_NAME}」LINE Bot，專門幫助大學生管理期末和作業。

你的主要功能包括：
1. 🍀 每日簽到 - 輸入「簽到」或「每日簽到」
2. 🔮 今日占卜 - 輸入「今日占卜」或「抽!!!」
3. 📅 查看時程 - 輸入「查看時程」或「時程」
4. 📝 新增 Deadline - 輸入「新增 Deadline」

**重要：當使用者詢問關於學習時間分配、讀書計畫、已安排的時程等問題時，你必須根據提供的「用戶資料」來回答，而不是給出通用的建議。**

例如：
- 如果用戶問「你這8小時幫我分配到那些時間」或「網服作業的時間有8小時，你分配在哪裡」
- 你應該查看「用戶的 Study Blocks」資料，找出該作業的所有學習時間段，並告訴用戶具體的日期和時間

當使用者詢問功能或選單時，請引導他們使用「主選單」指令。

你的特點：
1. 友善、耐心、樂於助人
2. 回答簡潔明瞭，適合在 Line 訊息中使用
3. 使用繁體中文回應
4. 風格幽默但溫暖，像一個關心學弟妹的學長
5. **當用戶問到已安排的學習時間時，必須根據實際資料回答，不要給出通用建議**

請根據使用者的問題和提供的資料提供有用的回應。`;

export class ChatService {
  private llmClient: LLMClient;

  constructor() {
    try {
      this.llmClient = new OpenAIClient();
    } catch (error) {
      Logger.error("Failed to initialize LLM client", { error });
      throw error;
    }
  }

  async generateResponse(
    userMessage: string,
    history: Array<{ role: string; content: string }> = [],
    userData?: {
      deadlines?: Array<{ title: string; dueDate: string; estimatedHours: number; type: string; id?: string }>;
      studyBlocks?: Array<{ title: string; startTime: string; endTime: string; duration: number; deadlineId: string; deadlineTitle?: string; deadlineEstimatedHours?: number }>;
    }
  ): Promise<string> {
    try {
      // 構建系統提示，包含用戶資料
      let systemContent = SYSTEM_PROMPT;
      
      if (userData) {
        systemContent += "\n\n**用戶資料：**\n";
        
        if (userData.deadlines && userData.deadlines.length > 0) {
          systemContent += "\n**用戶的 Deadlines：**\n";
          userData.deadlines.forEach((deadline, index) => {
            const dueDate = new Date(deadline.dueDate).toLocaleString("zh-TW", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
            systemContent += `${index + 1}. ${deadline.title}（${deadline.type}）\n`;
            systemContent += `   - 截止時間：${dueDate}\n`;
            systemContent += `   - 預估時數：${deadline.estimatedHours} 小時\n`;
          });
        }
        
        if (userData.studyBlocks && userData.studyBlocks.length > 0) {
          systemContent += "\n**用戶的 Study Blocks（已安排的學習時間）：**\n";
          // 按 deadlineId 分組
          const blocksByDeadline = new Map<string, typeof userData.studyBlocks>();
          userData.studyBlocks.forEach((block: any) => {
            if (!blocksByDeadline.has(block.deadlineId)) {
              blocksByDeadline.set(block.deadlineId, []);
            }
            blocksByDeadline.get(block.deadlineId)!.push(block);
          });
          
          blocksByDeadline.forEach((blocks, deadlineId) => {
            const firstBlock = blocks[0] as any;
            const deadlineTitle = firstBlock.deadlineTitle || firstBlock.title.split("（進度")[0];
            const deadlineEstimatedHours = firstBlock.deadlineEstimatedHours || 0;
            
            // 計算該 deadline 的總時數
            const totalHours = blocks.reduce((sum: number, b: any) => sum + b.duration, 0);
            
            systemContent += `\n**${deadlineTitle}**（預估 ${deadlineEstimatedHours} 小時，已安排 ${totalHours} 小時）：\n`;
            blocks.forEach((block: any) => {
              const startTime = new Date(block.startTime).toLocaleString("zh-TW", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              });
              const endTime = new Date(block.endTime).toLocaleString("zh-TW", {
                hour: "2-digit",
                minute: "2-digit",
              });
              systemContent += `  - ${startTime} - ${endTime}（${block.duration} 小時）\n`;
            });
            
            if (totalHours < deadlineEstimatedHours) {
              systemContent += `  ⚠️ 注意：已安排 ${totalHours} 小時，但預估需要 ${deadlineEstimatedHours} 小時，還缺少 ${deadlineEstimatedHours - totalHours} 小時\n`;
            }
          });
        }
        
        systemContent += "\n**重要提醒：**當用戶詢問關於學習時間分配、讀書計畫、已安排的時程等問題時，你必須根據上述「用戶的 Study Blocks」資料來回答，告訴用戶具體的日期和時間，而不是給出通用的時間分配建議。";
      }
      
      // 構建訊息
      const messages: LLMMessage[] = [
        {
          role: "system",
          content: systemContent,
        },
      ];

      // 加入歷史訊息（最多保留最近 10 條）
      const recentHistory = history.slice(-10);
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
        });
      }

      // 加入當前使用者訊息
      messages.push({
        role: "user",
        content: userMessage,
      });
      
      // 添加超時處理（30秒）
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error("Request timeout after 30s")), 30000);
      });

      // 調用 LLM
      const responsePromise = this.llmClient.chat(messages);
      const response = await Promise.race([responsePromise, timeoutPromise]);
      
      return response;
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      Logger.error("生成回應失敗", { 
        error,
        errorMessage: errorMsg,
        userMessage: userMessage.substring(0, 50),
      });
      
      // 返回錯誤訊息
      const fallbackMessage = handleLLMError(error);
      return fallbackMessage;
    }
  }
}

