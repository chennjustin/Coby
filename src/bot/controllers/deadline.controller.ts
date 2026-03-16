import { BotContext } from "@/types/bot";
import { UserStateService } from "@/services/user-state/user-state.service";
import { LineMessagingClient } from "@/lib/line/client";
import { Logger } from "@/lib/utils/logger";
import { sendTextMessageWithQuickReply } from "../utils";
import { handleAddDeadlineNLP } from "../handlers/deadline.handler";

const userStateService = new UserStateService();
const lineClient = new LineMessagingClient();

export async function handleAddDeadlinePrompt(userId: string, replyToken: string) {
  await userStateService.clearConversationHistory(userId);
  const promptText = "你想怎麼輸入？";
  await lineClient.sendQuickReply(replyToken, promptText, [
    { label: "逐步填入", text: "逐步填入" },
    { label: "一句話輸入", text: "一句話輸入" },
  ]);
  await userStateService.addToConversationHistory(userId, "assistant", promptText);
}

export async function handleAddDeadlineFromIntent(
  userId: string,
  replyToken: string,
  entities: { date?: string | null; title?: string | null; estimatedHours?: number | null; type?: "exam" | "assignment" | "project" | "other" | null },
  originalText: string
) {
  try {
    await userStateService.clearConversationHistory(userId);
    await userStateService.addToConversationHistory(userId, "user", originalText);
    if (!entities.title) {
      await handleAddDeadlineNLP({ event: { source: { userId }, replyToken } } as BotContext, originalText);
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
      await sendTextMessageWithQuickReply(replyToken, promptText);
      await userStateService.addToConversationHistory(userId, "assistant", promptText);
      return;
    }
    const dateStr = new Date(entities.date).toLocaleDateString("zh-TW");
    const typeName = entities.type === "exam" ? "考試" : entities.type === "assignment" ? "作業" : entities.type === "project" ? "專題" : "其他";
    const summary = `我解析到以下資訊：\n\n名稱：${entities.title}\n類型：${typeName}\n截止日期：${dateStr}\n預估時間：${entities.estimatedHours || 2} 小時`;
    await lineClient.sendQuickReply(replyToken, summary, [
      { label: "確認", text: `確認建立 NLP ${entities.title}|${entities.type || "other"}|${entities.date}|${entities.estimatedHours || 2}` },
      { label: "重填", text: "輸入 Deadline" },
    ]);
    await userStateService.addToConversationHistory(userId, "assistant", summary);
  } catch (error) {
    Logger.error("從意圖建立 Deadline 失敗", { error, userId, entities });
    await sendTextMessageWithQuickReply(replyToken, "處理時發生錯誤，請稍後再試。");
  }
}
