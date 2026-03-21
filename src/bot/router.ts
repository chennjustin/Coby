import { BotContext } from "@/types/bot";
import { UserStateService } from "@/services/user-state/user-state.service";
import { IntentService } from "@/services/llm/intent.service";
import { LineMessagingClient } from "@/lib/line/client";
import { sendQuickReplyWithMenu, QUICK_REPLY_ITEMS } from "@/bot/constants";
import { Logger } from "@/lib/utils/logger";

import { handleCheckIn } from "./handlers/checkin.handler";
import { handleDailyQuote } from "./handlers/quote.handler";
import { handleViewSchedule, handleViewDeadlineDetail } from "./handlers/schedule.handler";
import { handleDefaultChat } from "./handlers/chat.handler";
import {
  handleAddDeadlineStepByStep,
  handleAddDeadlineNLP,
  handleConfirmNLPDeadline,
  handleEditDeadline,
  handleDeleteDeadline,
  handleMarkDeadlineDone,
} from "./handlers/deadline.handler";
import { handleUpdateDeadlineFlow } from "./handlers/deadline-update.handler";
import { handleDeleteDeadlineFlow } from "./handlers/deadline-delete.handler";
import { handleModifyScheduleFlow } from "./handlers/modify-schedule.handler";

import connectDB from "@/lib/db/mongoose";
import User from "@/models/User";
import Deadline from "@/models/Deadline";
import Checkin from "@/models/Checkin";
import { getMemoryProvider } from "@/memory/memory.factory";
import { SavedItemRepository } from "@/repositories/saved-item.repository";

const userStateService = new UserStateService();
const intentService = new IntentService();
const lineClient = new LineMessagingClient();

async function sendMainMenu(userId: string, replyToken: string) {
  await lineClient.sendQuickReply(replyToken, "請選擇功能：", QUICK_REPLY_ITEMS);
  Logger.info("發送主選單（Quick Reply）", { userId });
}

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
    Logger.info("收到使用者訊息", { userId, text });

    const userState = await userStateService.getState(userId);

    // 1. 取消 / 主選單
    const normalizedText = text.toLowerCase().trim();
    const menuKeywords = [
      "選單", "menu", "主選單", "help", "幫助", "功能",
      "有什麼功能", "回到主選單", "返回主選單", "離開",
    ];
    if (
      text === "取消" ||
      text === "主選單" ||
      text === "離開" ||
      normalizedText === "menu" ||
      normalizedText === "help" ||
      menuKeywords.some((kw) => text.includes(kw))
    ) {
      if (userState && userState.currentFlow) {
        await userStateService.clearState(userId);
      }
      await sendMainMenu(userId, replyToken);
      return;
    }

    // 2. 清除資料
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

    // 3. 確認建立 NLP Deadline
    const confirmNLPMatch = text.match(/^確認建立 NLP (.+)$/);
    if (confirmNLPMatch) {
      await handleConfirmNLPDeadline(context, confirmNLPMatch[1]);
      return;
    }

    // 4. 流程中的輸入
    if (userState && userState.currentFlow) {
      if (userState.currentFlow === "add_deadline_step") {
        await handleAddDeadlineStepByStep(context, "", text);
        return;
      } else if (userState.currentFlow === "add_deadline_nlp") {
        await handleAddDeadlineNLP(context, text);
        return;
      } else if (userState.currentFlow === "edit_deadline") {
        const flowData = userState.flowData as Record<string, any>;
        await handleEditDeadline(context, flowData.deadlineId, flowData.field, text);
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

    // 5. 明確關鍵字匹配
    if (text === "每日簽到" || text === "簽到" || text.includes("簽到")) {
      await handleCheckIn(userId, replyToken);
      return;
    }

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

    if (text === "查看時程") {
      await handleViewSchedule(userId, replyToken, text, "direct_open");
      return;
    }

    const viewDeadlineMatch = text.match(/^查看 Deadline (.+)$/);
    if (viewDeadlineMatch) {
      await handleViewDeadlineDetail(userId, viewDeadlineMatch[1], replyToken);
      return;
    }

    if (text === "輸入 Deadline") {
      await handleAddDeadlinePrompt(userId, replyToken);
      return;
    }

    if (text === "逐步填入") {
      await userStateService.clearConversationHistory(userId);
      await userStateService.setState(userId, "add_deadline_step", { step: "type" });
      const promptText = "請選擇 Deadline 類型：";
      await lineClient.sendQuickReply(replyToken, promptText, [
        { label: "考試", text: "考試" },
        { label: "作業", text: "作業" },
        { label: "專題", text: "專題" },
        { label: "其他", text: "其他" },
        { label: "離開", text: "離開" },
      ]);
      await userStateService.addToConversationHistory(userId, "assistant", promptText);
      return;
    }

    if (text === "一句話輸入") {
      await userStateService.clearConversationHistory(userId);
      await userStateService.setState(userId, "add_deadline_nlp", {});
      const promptText =
        "請直接輸入你的 Deadline 資訊，例如：\n「我下週一有網服作業要交，大概要 80 小時」";
      await lineClient.sendQuickReply(replyToken, promptText, [
        { label: "離開", text: "離開" },
      ]);
      await userStateService.addToConversationHistory(userId, "assistant", promptText);
      return;
    }

    const editDeadlineMatch = text.match(/^修改 Deadline (.+)$/);
    if (editDeadlineMatch) {
      await handleEditDeadline(context, editDeadlineMatch[1]);
      return;
    }

    const editFieldMatch = text.match(/^修改 Deadline (.+) (名稱|日期|時間|類別)$/);
    if (editFieldMatch) {
      await handleEditDeadline(context, editFieldMatch[1], editFieldMatch[2]);
      return;
    }

    const markDoneMatch = text.match(/^標記完成 (.+)$/);
    if (markDoneMatch) {
      await handleMarkDeadlineDone(context, markDoneMatch[1]);
      return;
    }

    const deleteDeadlineMatch = text.match(/^刪除 Deadline (.+)$/);
    if (deleteDeadlineMatch) {
      await handleDeleteDeadline(context, deleteDeadlineMatch[1]);
      return;
    }

    // 6. LLM 意圖識別
    try {
      const intentResult = await intentService.detectIntentAndExtract(text);

      if (intentResult.confidence > 0.5) {
        switch (intentResult.intent) {
          case "check_in":
            await handleCheckIn(userId, replyToken);
            return;
          case "daily_quote":
            await handleDailyQuote(userId, replyToken);
            return;
          case "view_schedule": {
            const actionType = intentResult.actionType || "inquiry";
            await handleViewSchedule(userId, replyToken, text, actionType);
            return;
          }
          case "add_deadline":
            if (intentResult.entities.title) {
              await handleAddDeadlineFromIntent(userId, replyToken, intentResult.entities, text);
              return;
            } else {
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
            await handleModifyScheduleFlow(context, userId, replyToken, text);
            return;
          case "other":
          default:
            break;
        }
      }
    } catch (error) {
      Logger.error("意圖識別失敗", { error, text });
    }

    // 7. 預設 LLM 聊天
    await handleDefaultChat(context, userId, text, replyToken);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    Logger.error("處理文本消息時發生錯誤", { error, userId, text });

    try {
      await sendQuickReplyWithMenu(
        replyToken,
        `處理訊息時發生錯誤：${errorMsg}\n\n請稍後再試或聯繫管理員。`
      );
    } catch (sendError) {
      Logger.error("無法發送錯誤訊息", { error: sendError });
    }
  }
}

// --- 內部輔助函式 ---

async function handleAddDeadlinePrompt(userId: string, replyToken: string) {
  await userStateService.clearConversationHistory(userId);
  const promptText = "你想怎麼輸入？";
  await lineClient.sendQuickReply(replyToken, promptText, [
    { label: "逐步填入", text: "逐步填入" },
    { label: "一句話輸入", text: "一句話輸入" },
  ]);
  await userStateService.addToConversationHistory(userId, "assistant", promptText);
  Logger.info("發送輸入 Deadline 提示", { userId });
}

async function handleResetData(userId: string, replyToken: string) {
  try {
    await connectDB();
    const user = await User.findOne({ lineUserId: userId });
    if (!user) {
      await sendQuickReplyWithMenu(replyToken, "找不到使用者資訊。");
      return;
    }

    const deadlineResult = await Deadline.deleteMany({ userId: user._id });
    const checkinResult = await Checkin.deleteMany({ userId: user._id });
    await userStateService.clearState(userId);

    // 清除 Mem0 記憶和 SavedItem
    const savedItemRepo = new SavedItemRepository();
    const [savedItemCount] = await Promise.allSettled([
      savedItemRepo.deleteByUserId(userId),
      getMemoryProvider().deleteAll({ userId }),
    ]);
    const deletedSavedItems =
      savedItemCount.status === "fulfilled" ? savedItemCount.value : 0;

    const { generateViewToken } = await import("@/lib/utils/token");
    user.viewToken = generateViewToken();
    await user.save();

    const message =
      `✅ 資料已清除完成！\n\n` +
      `📝 待辦事項：刪除 ${deadlineResult.deletedCount || 0} 筆\n` +
      `🍀 簽到記錄：刪除 ${checkinResult.deletedCount || 0} 筆\n` +
      `🧠 對話記錄：刪除 ${deletedSavedItems} 筆\n` +
      `🧠 長期記憶：已清除\n` +
      `🔄 用戶狀態：已清除\n` +
      `🔑 Token：已重置\n\n` +
      `你的帳號已恢復到初始狀態。`;

    await sendQuickReplyWithMenu(replyToken, message);
    Logger.info("清除用戶資料成功", { userId });
  } catch (error) {
    Logger.error("清除資料失敗", { error, userId });
    await sendQuickReplyWithMenu(replyToken, "清除資料時發生錯誤，請稍後再試。");
  }
}

async function handleAddDeadlineFromIntent(
  userId: string,
  replyToken: string,
  entities: {
    date?: string | null;
    title?: string | null;
    estimatedHours?: number | null;
    type?: "exam" | "assignment" | "project" | "other" | null;
  },
  originalText: string
) {
  try {
    await userStateService.clearConversationHistory(userId);
    await userStateService.addToConversationHistory(userId, "user", originalText);

    if (!entities.title) {
      await handleAddDeadlineNLP(
        { event: { source: { userId }, replyToken } } as BotContext,
        originalText
      );
      return;
    }

    if (!entities.date) {
      await userStateService.setState(userId, "add_deadline_step", {
        step: "dueDate",
        title: entities.title,
        type: entities.type || "other",
        estimatedHours: entities.estimatedHours || 2,
      });
      const promptText = `已解析到標題：${entities.title}\n\n請輸入截止日期（格式：YYYY/MM/DD 或 12/20）：`;
      await sendQuickReplyWithMenu(replyToken, promptText);
      await userStateService.addToConversationHistory(userId, "assistant", promptText);
      return;
    }

    const dateStr = new Date(entities.date).toLocaleDateString("zh-TW");
    const typeName =
      entities.type === "exam"
        ? "考試"
        : entities.type === "assignment"
        ? "作業"
        : entities.type === "project"
        ? "專題"
        : "其他";
    const summary = `我解析到以下資訊：\n\n名稱：${entities.title}\n類型：${typeName}\n截止日期：${dateStr}\n預估時間：${entities.estimatedHours || 2} 小時`;

    await lineClient.sendQuickReply(replyToken, summary, [
      {
        label: "確認",
        text: `確認建立 NLP ${entities.title}|${entities.type || "other"}|${entities.date}|${entities.estimatedHours || 2}`,
      },
      { label: "重填", text: "輸入 Deadline" },
    ]);
    await userStateService.addToConversationHistory(userId, "assistant", summary);
  } catch (error) {
    Logger.error("從意圖建立 Deadline 失敗", { error, userId, entities });
    await sendQuickReplyWithMenu(replyToken, "處理時發生錯誤，請稍後再試。");
  }
}
