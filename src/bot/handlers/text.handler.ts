import { BotContext } from "@/types/bot";
import { UserStateService } from "@/services/user-state/user-state.service";
import { IntentService } from "@/services/llm/intent.service";
import {
  handleAddDeadlineStepByStep,
  handleAddDeadlineNLP,
  handleConfirmNLPDeadline,
  handleEditDeadline,
  handleDeleteDeadline,
  handleMarkDeadlineDone,
} from "./deadline.handler";
import { handleUpdateDeadlineFlow } from "./deadline-update.handler";
import { handleDeleteDeadlineFlow } from "./deadline-delete.handler";
import { Logger } from "@/lib/utils/logger";
import { LineMessagingClient } from "@/lib/line/client";
import { sendTextMessageWithQuickReply, sendMainMenu } from "../utils";

const lineClient = new LineMessagingClient();
import { handleCheckIn, handleDailyQuote, handleResetData } from "../controllers/checkin.controller";
import { handleViewSchedule, handleViewDeadlineDetail, handleModifyScheduleFlow } from "../controllers/schedule.controller";
import { handleAddDeadlinePrompt, handleAddDeadlineFromIntent } from "../controllers/deadline.controller";
import { handleDefaultChat } from "../controllers/chat.controller";

const userStateService = new UserStateService();
const intentService = new IntentService();

export async function handleText(context: BotContext) {
  const userId = context.event.source.userId;
  const text = context.event.message?.text;
  const replyToken = context.event.replyToken;

  Logger.info("handleText 被調用", { userId, text, hasReplyToken: !!replyToken });

  if (!userId || !text || !replyToken) {
    Logger.warn("Missing userId, text, or replyToken in event", { userId, text, replyToken });
    return;
  }

  try {
    // 記錄 incoming 訊息（僅記錄到日誌）
    Logger.info("收到使用者訊息", { userId, text });

    // 檢查使用者是否在流程中
    const userState = await userStateService.getState(userId);

    // 處理取消或返回主選單（優先級最高）
    // 支援更寬鬆的匹配：包含「選單」、「menu」、「主選單」、「help」、「離開」等關鍵字
    const normalizedText = text.toLowerCase().trim();
    const menuKeywords = ["選單", "menu", "主選單", "help", "幫助", "功能", "有什麼功能", "回到主選單", "返回主選單", "離開"];
    if (
      text === "取消" || 
      text === "主選單" ||
      text === "離開" ||
      normalizedText === "menu" || 
      normalizedText === "help" ||
      menuKeywords.some(keyword => text.includes(keyword))
    ) {
      if (userState && userState.currentFlow) {
        await userStateService.clearState(userId);
      }
      await sendMainMenu(userId, replyToken);
      return;
    }

    // 處理清除資料
    if (
      text === "清除資料" ||
      text === "清除所有" ||
      text === "reset" ||
      text === "重置" ||
      text.toLowerCase().includes("清除") ||
      text.toLowerCase() === "reset"
    ) {
      await handleResetData(userId, replyToken);
      return;
    }

    // 處理確認建立 NLP Deadline（優先於流程處理）
    const confirmNLPMatch = text.match(/^確認建立 NLP (.+)$/);
    if (confirmNLPMatch) {
      await handleConfirmNLPDeadline(context, confirmNLPMatch[1]);
      return;
    }

    // 處理流程中的輸入（優先於意圖識別）
    if (userState && userState.currentFlow) {
      // 在流程中，必須繼續流程處理，不能跳出
      if (userState.currentFlow === "add_deadline_step") {
        await handleAddDeadlineStepByStep(context, "", text);
        return;
      } else if (userState.currentFlow === "add_deadline_nlp") {
        await handleAddDeadlineNLP(context, text);
        return;
      } else if (userState.currentFlow === "edit_deadline") {
        const flowData = userState.flowData as Record<string, any>;
        const deadlineId = flowData.deadlineId;
        const field = flowData.field;
        await handleEditDeadline(context, deadlineId, field, text);
        // 清除狀態
        await userStateService.clearState(userId);
        return;
      } else if (userState.currentFlow === "update_deadline") {
        await handleUpdateDeadlineFlow(context, userId, replyToken, text);
        return;
      } else if (userState.currentFlow === "delete_deadline") {
        await handleDeleteDeadlineFlow(context, userId, replyToken, text);
        return;
      }
    }

    // 處理明確的關鍵字匹配（保留以確保向後兼容）
    // 處理每日簽到（支援更寬鬆的匹配）
    if (
      text === "每日簽到" || 
      text === "簽到" ||
      text.includes("簽到")
    ) {
      await handleCheckIn(userId, replyToken);
      return;
    }


    // 處理今日占卜（支援更寬鬆的匹配）
    if (
      text === "每日金句" ||
      text === "今日占卜" ||
      text === "占卜" ||
      text.includes("金句") ||
      text.includes("占卜") ||
      text.includes("來一句") ||
      text.includes("我要金句") ||
      text.includes("抽!!!")
    ) {
      await handleDailyQuote(userId, replyToken);
      return;
    }

    // 處理查看時程（支援更寬鬆的匹配）
    // 如果是從 Rich Menu 點擊「查看時程」，直接打開 WebView
    if (text === "查看時程") {
      await handleViewSchedule(userId, replyToken, text, "direct_open");
      return;
    }

    // 檢查是否包含時程相關關鍵字，交給 LLM 意圖識別處理
    const scheduleKeywords = [
      "時程", "行事曆", "deadline", "待辦", "行程", "schedule", "calendar",
      "有什麼事", "要做什麼", "要幹嘛", "有什麼作業", "有什麼考試",
      "要讀哪些", "要讀什麼", "打開行事曆", "開啟行事曆", "顯示行事曆",
      "我想看", "我要看", "給我看"
    ];
    
    if (scheduleKeywords.some(keyword => text.includes(keyword))) {
      // 交給 LLM 意圖識別處理，會自動判斷是 direct_open 還是 inquiry
      // 這裡先不處理，讓它繼續到意圖識別階段
    }

    // 處理查看 Deadline 詳情
    const viewDeadlineMatch = text.match(/^查看 Deadline (.+)$/);
    if (viewDeadlineMatch) {
      const deadlineId = viewDeadlineMatch[1];
      await handleViewDeadlineDetail(userId, deadlineId, replyToken);
      return;
    }

    // 處理輸入 Deadline
    if (text === "輸入 Deadline") {
      await handleAddDeadlinePrompt(userId, replyToken);
      return;
    }

    // 處理逐步填入
    if (text === "逐步填入") {
      // 清除之前的歷史記錄，開始新的流程
      await userStateService.clearConversationHistory(userId);
      await userStateService.setState(userId, "add_deadline_step", { step: "type" });
      const promptText = "請選擇 Deadline 類型：";
      await lineClient.sendQuickReply(
        replyToken,
        promptText,
        [
          { label: "考試", text: "考試" },
          { label: "作業", text: "作業" },
          { label: "專題", text: "專題" },
          { label: "其他", text: "其他" },
          { label: "離開", text: "離開" },
        ]
      );
      // 記錄 Bot 回應到歷史
      await userStateService.addToConversationHistory(userId, "assistant", promptText);
      return;
    }

    // 處理一句話輸入
    if (text === "一句話輸入") {
      // 清除之前的歷史記錄，開始新的流程
      await userStateService.clearConversationHistory(userId);
      await userStateService.setState(userId, "add_deadline_nlp", {});
      const promptText = "請直接輸入你的 Deadline 資訊，例如：\n「我下週一有網服作業要交，大概要 80 小時」";
      // 一句話輸入時不顯示 Quick Reply，但加上離開選項
      await lineClient.sendQuickReply(
        replyToken,
        promptText,
        [
          { label: "離開", text: "離開" },
        ]
      );
      // 記錄 Bot 回應到歷史
      await userStateService.addToConversationHistory(userId, "assistant", promptText);
      return;
    }


    // 處理修改 Deadline
    const editDeadlineMatch = text.match(/^修改 Deadline (.+)$/);
    if (editDeadlineMatch) {
      const deadlineId = editDeadlineMatch[1];
      await handleEditDeadline(context, deadlineId);
      return;
    }

    // 處理修改 Deadline 特定欄位
    const editFieldMatch = text.match(/^修改 Deadline (.+) (名稱|日期|時間|類別)$/);
    if (editFieldMatch) {
      const deadlineId = editFieldMatch[1];
      const field = editFieldMatch[2];
      await handleEditDeadline(context, deadlineId, field);
      return;
    }

    // 處理標記完成
    const markDoneMatch = text.match(/^標記完成 (.+)$/);
    if (markDoneMatch) {
      const deadlineId = markDoneMatch[1];
      await handleMarkDeadlineDone(context, deadlineId);
      return;
    }

    // 處理刪除 Deadline
    const deleteDeadlineMatch = text.match(/^刪除 Deadline (.+)$/);
    if (deleteDeadlineMatch) {
      const deadlineId = deleteDeadlineMatch[1];
      await handleDeleteDeadline(context, deadlineId);
      return;
    }

    // LLM 意圖識別和路由（如果沒有匹配到明確關鍵字）
    try {
      const intentResult = await intentService.detectIntentAndExtract(text);
      
      // 根據意圖路由到對應處理器
      if (intentResult.confidence > 0.5) {
        switch (intentResult.intent) {
          case "check_in":
            await handleCheckIn(userId, replyToken);
            return;
          
          case "daily_quote":
            await handleDailyQuote(userId, replyToken);
            return;
          
          case "view_schedule":
            // 根據 actionType 決定處理方式
            const actionType = intentResult.actionType || "inquiry";
            await handleViewSchedule(userId, replyToken, text, actionType);
            return;
          
          case "add_deadline":
            // 如果有提取到實體，使用 NLP 模式
            if (intentResult.entities.title) {
              // 使用提取的實體建立 deadline
              await handleAddDeadlineFromIntent(userId, replyToken, intentResult.entities, text);
              return;
            } else {
              // 如果沒有提取到完整資訊，提示用戶使用逐步輸入
              await handleAddDeadlinePrompt(userId, replyToken);
              return;
            }
          
          case "update_deadline":
            await handleUpdateDeadlineFlow(
              context,
              userId,
              replyToken,
              text,
              intentResult.entities.title || undefined
            );
            return;
          
          case "delete_deadline":
            await handleDeleteDeadlineFlow(
              context,
              userId,
              replyToken,
              text,
              intentResult.entities.title || undefined
            );
            return;
          
          case "modify_schedule":
            await handleModifyScheduleFlow(
              context,
              userId,
              replyToken,
              text
            );
            return;
          
          case "other":
          default:
            // 繼續到預設 LLM 聊天
            break;
        }
      }
    } catch (error) {
      Logger.error("意圖識別失敗", { error, text });
      // 如果意圖識別失敗，繼續到預設 LLM 聊天
    }

    // 預設：LLM 聊天
    await handleDefaultChat(context, userId, text, replyToken);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    Logger.error("處理文本消息時發生錯誤", { 
      error,
      errorMessage: errorMsg,
      errorStack,
      userId,
      text,
    });

    // 發送錯誤訊息
    try {
      await sendTextMessageWithQuickReply(replyToken, `處理訊息時發生錯誤：${errorMsg}\n\n請稍後再試或聯繫管理員。`);
    } catch (sendError) {
      Logger.error("無法發送錯誤訊息", { error: sendError });
    }
  }
}

