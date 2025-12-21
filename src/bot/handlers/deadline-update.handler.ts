import { BotContext } from "@/types/bot";
import { DeadlineService } from "@/services/deadline/deadline.service";
import { UserStateService } from "@/services/user-state/user-state.service";
import { LLMUtilsService } from "@/services/llm/llm-utils.service";
import { DeadlineMatcherService } from "@/services/deadline/deadline-matcher.service";
import { LineMessagingClient } from "@/lib/line/client";
import { Logger } from "@/lib/utils/logger";
import User from "@/models/User";
import { IDeadline } from "@/models/Deadline";
import connectDB from "@/lib/db/mongoose";

const deadlineService = new DeadlineService();
const userStateService = new UserStateService();
const llmUtilsService = new LLMUtilsService();
const deadlineMatcher = new DeadlineMatcherService();
const lineClient = new LineMessagingClient();

// Quick Reply 按鈕配置
const QUICK_REPLY_ITEMS = [
  { label: "🍀 每日簽到", text: "簽到" },
  { label: "🔮 抽!!!", text: "今日占卜" },
  { label: "📅 查看時程", text: "查看時程" },
  { label: "📝 新增死線", text: "新增 Deadline" },
];

const QUICK_REPLY_WITH_EXIT = [
  ...QUICK_REPLY_ITEMS,
  { label: "離開", text: "離開" },
];

/**
 * 發送帶有 Quick Reply 的文字訊息
 */
async function sendTextMessageWithQuickReply(
  replyToken: string,
  text: string,
  withExit: boolean = false
) {
  const items = withExit ? QUICK_REPLY_WITH_EXIT : QUICK_REPLY_ITEMS;
  await lineClient.sendQuickReply(replyToken, text, items);
}

/**
 * 處理修改 Deadline 流程
 */
export async function handleUpdateDeadlineFlow(
  context: BotContext,
  userId: string,
  replyToken: string,
  text: string,
  intentTitle?: string
): Promise<void> {
  try {
    await connectDB();
    const user = await User.findOne({ lineUserId: userId });
    if (!user) {
      await sendTextMessageWithQuickReply(
        replyToken,
        "找不到使用者資訊，請重新開始。"
      );
      return;
    }

    // 獲取用戶狀態
    const userState = await userStateService.getState(userId);
    const flowData = userState?.flowData || {};

    // 步驟 1: 選擇要修改的 deadline
    if (!flowData.deadlineId) {
      // 獲取所有 pending deadlines
      const deadlines = await deadlineService.getDeadlinesByUser(
        userId,
        "pending"
      );

      if (deadlines.length === 0) {
        await sendTextMessageWithQuickReply(
          replyToken,
          "你目前沒有待處理的 deadline。"
        );
        return;
      }

      // 如果只有一個 deadline，直接使用
      if (deadlines.length === 1) {
        await userStateService.setState(userId, "update_deadline", {
          deadlineId: deadlines[0]._id.toString(),
        });
        await sendTextMessageWithQuickReply(
          replyToken,
          `找到你的 deadline：「${deadlines[0].title}」\n\n請輸入新的截止時間（例如：下週一晚上8點、12/5 下午3點）：`,
          true
        );
        return;
      }

      // 如果有多個 deadline，嘗試匹配
      if (intentTitle) {
        const matchedDeadline = deadlineMatcher.findDeadlineByTitle(
          intentTitle,
          deadlines
        );
        if (matchedDeadline) {
          await userStateService.setState(userId, "update_deadline", {
            deadlineId: matchedDeadline._id.toString(),
          });
          await sendTextMessageWithQuickReply(
            replyToken,
            `找到你的 deadline：「${matchedDeadline.title}」\n\n請輸入新的截止時間（例如：下週一晚上8點、12/5 下午3點）：`,
            true
          );
          return;
        }

        // 如果有多個匹配項，列出讓用戶選擇
        const matches = deadlineMatcher.findAllMatchesByTitle(
          intentTitle,
          deadlines
        );
        if (matches.length > 1) {
          let message = `找到多個匹配的 deadline，請選擇要修改的：\n\n`;
          matches.forEach((d, index) => {
            const dueDate = new Date(d.dueDate).toLocaleDateString("zh-TW", {
              month: "2-digit",
              day: "2-digit",
            });
            message += `${index + 1}. ${d.title}（${dueDate}）\n`;
          });
          await sendTextMessageWithQuickReply(replyToken, message, true);
          await userStateService.setState(userId, "update_deadline", {
            candidateDeadlines: matches.map((d) => ({
              id: d._id.toString(),
              title: d.title,
            })),
          });
          return;
        }
      }

      // 如果無法確定，列出所有 deadlines
      let message = `你有多個 deadline，請選擇要修改的：\n\n`;
      deadlines.forEach((d, index) => {
        const dueDate = new Date(d.dueDate).toLocaleDateString("zh-TW", {
          month: "2-digit",
          day: "2-digit",
        });
        message += `${index + 1}. ${d.title}（${dueDate}）\n`;
      });
      await sendTextMessageWithQuickReply(replyToken, message, true);
      await userStateService.setState(userId, "update_deadline", {
        candidateDeadlines: deadlines.map((d) => ({
          id: d._id.toString(),
          title: d.title,
        })),
      });
      return;
    }

    // 步驟 2: 處理用戶選擇（如果有多個候選項）
    if (flowData.candidateDeadlines && Array.isArray(flowData.candidateDeadlines)) {
      const index = parseInt(text) - 1;
      if (
        index >= 0 &&
        index < (flowData.candidateDeadlines as any[]).length
      ) {
        const selected = (flowData.candidateDeadlines as any[])[index];
        await userStateService.setState(userId, "update_deadline", {
          deadlineId: selected.id,
        });
        await sendTextMessageWithQuickReply(
          replyToken,
          `已選擇：「${selected.title}」\n\n請輸入新的截止時間（例如：下週一晚上8點、12/5 下午3點）：`,
          true
        );
        return;
      } else {
        await sendTextMessageWithQuickReply(
          replyToken,
          "請輸入有效的選項編號。",
          true
        );
        return;
      }
    }

    // 步驟 3: 獲取新時間並更新
    const deadlineId = flowData.deadlineId as string;
    const deadline = await deadlineService.getDeadlineById(deadlineId);
    if (!deadline) {
      await sendTextMessageWithQuickReply(
        replyToken,
        "找不到這個 deadline。",
        true
      );
      await userStateService.clearState(userId);
      return;
    }

    // 解析新時間
    const parsedDateTime = await llmUtilsService.parseDateFromText(text);
    if (!parsedDateTime) {
      await sendTextMessageWithQuickReply(
        replyToken,
        "無法解析日期時間，請重新輸入（例如：下週一晚上8點、12/5 下午3點）：",
        true
      );
      return;
    }

    const newDueDate = new Date(parsedDateTime);
    if (isNaN(newDueDate.getTime())) {
      await sendTextMessageWithQuickReply(
        replyToken,
        "日期時間格式錯誤，請重新輸入。",
        true
      );
      return;
    }

    // 更新 deadline 並重新排程
    const updatedDeadline = await deadlineService.updateDeadlineAndReschedule(
      deadlineId,
      { dueDate: newDueDate },
      userId
    );

    if (!updatedDeadline) {
      await sendTextMessageWithQuickReply(
        replyToken,
        "更新失敗，請稍後再試。",
        true
      );
      await userStateService.clearState(userId);
      return;
    }

    // 清除狀態
    await userStateService.clearState(userId);

    // 發送成功訊息
    const dateStr = newDueDate.toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const timeStr = newDueDate.toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    });
    await sendTextMessageWithQuickReply(
      replyToken,
      `✅ 已成功更新 deadline「${updatedDeadline.title}」\n\n新的截止時間：${dateStr} ${timeStr}\n\n已重新安排學習計畫！`,
      false
    );
  } catch (error) {
    Logger.error("處理修改 Deadline 流程失敗", { error, userId });
    await sendTextMessageWithQuickReply(
      replyToken,
      "處理時發生錯誤，請稍後再試。",
      true
    );
    await userStateService.clearState(userId);
  }
}

