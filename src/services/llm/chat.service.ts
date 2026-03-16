import { LLMClient, LLMMessage } from "@/lib/llm/client";
import { OpenAIClient } from "@/lib/llm/openai";
import { handleLLMError } from "@/lib/llm/fallback";
import { Logger } from "@/lib/utils/logger";
import fs from "fs";
import path from "path";

function loadPersonality(): string {
  try {
    const personalityPath = path.join(process.cwd(), "src", "bot", "personality.md");
    return fs.readFileSync(personalityPath, "utf-8");
  } catch {
    Logger.warn("無法讀取 personality.md，使用內建預設");
    return "";
  }
}

const personalityContent = loadPersonality();

const SYSTEM_PROMPT = personalityContent
  ? `${personalityContent}\n\n請根據使用者的問題和提供的資料提供有用的回應。`
  : `你是「Coby」LINE Bot，專門幫助大學生管理期末和作業。風格幽默但溫暖，像一個關心學弟妹的學長。使用繁體中文回應。請根據使用者的問題和提供的資料提供有用的回應。`;

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

