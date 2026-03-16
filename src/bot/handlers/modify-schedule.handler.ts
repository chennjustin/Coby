import { BotContext } from "@/types/bot";
import { DeadlineService } from "@/services/deadline/deadline.service";
import { UserStateService } from "@/services/user-state/user-state.service";
import { StudyBlockService } from "@/services/study-block/study-block.service";
import { sendQuickReplyWithMenu } from "@/bot/constants";
import { handleDefaultChat } from "./chat.handler";
import { Logger } from "@/lib/utils/logger";
import connectDB from "@/lib/db/mongoose";
import User from "@/models/User";
import Deadline from "@/models/Deadline";
import type { UserPreferences } from "@/services/llm/preference-extractor.service";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

const deadlineService = new DeadlineService();
const userStateService = new UserStateService();

export async function handleModifyScheduleFlow(
  context: BotContext,
  userId: string,
  replyToken: string,
  text: string
): Promise<void> {
  try {
    await connectDB();
    const user = await User.findOne({ lineUserId: userId });
    if (!user) {
      await sendQuickReplyWithMenu(replyToken, "找不到用戶資訊，請稍後再試。");
      return;
    }

    const deadlines = await Deadline.find({ userId: user._id, status: "pending" })
      .sort({ dueDate: 1 })
      .exec();

    if (deadlines.length === 0) {
      await sendQuickReplyWithMenu(replyToken, "你目前沒有任何待辦事項可以修改時程。");
      return;
    }

    const studyBlockService = new StudyBlockService();
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 60);
    const studyBlocks = await studyBlockService.getStudyBlocksByUser(
      userId,
      sixtyDaysAgo,
      futureDate
    );

    const conversationHistory = await userStateService.getConversationHistory(userId);
    const history = conversationHistory.map((item) => ({
      role: item.role,
      content: item.content,
    }));

    const { ScheduleModifierService } = await import(
      "@/services/llm/schedule-modifier.service"
    );
    const modifierService = new ScheduleModifierService();
    const modificationRequest = await modifierService.analyzeModificationRequest(
      text,
      deadlines,
      studyBlocks,
      history
    );

    if (!modificationRequest) {
      await handleDefaultChat(context, userId, text, replyToken);
      return;
    }

    await userStateService.addToConversationHistory(userId, "user", text);

    if (modificationRequest.action === "delete") {
      await deadlineService.deleteDeadline(modificationRequest.deadlineId);
      await sendQuickReplyWithMenu(
        replyToken,
        `✅ 已刪除死線「${modificationRequest.deadlineTitle}」及其所有相關學習計畫。`
      );
      await userStateService.addToConversationHistory(
        userId,
        "assistant",
        `已刪除死線「${modificationRequest.deadlineTitle}」及其所有相關學習計畫。`
      );
      return;
    }

    if (modificationRequest.action === "modify") {
      const hasDueDateChange = !!modificationRequest.newDueDate;
      const newPreferences = modificationRequest.newSchedule?.preferences;
      const hasScheduleChange =
        !!newPreferences &&
        (!!newPreferences.excludeHours ||
          !!newPreferences.preferHours ||
          !!newPreferences.maxHoursPerDay ||
          !!newPreferences.excludeDays);

      if (!hasDueDateChange && !hasScheduleChange) {
        await handleDefaultChat(context, userId, text, replyToken);
        return;
      }

      const deadline = deadlines.find(
        (d: any) => d._id.toString() === modificationRequest.deadlineId
      );

      if (!deadline) {
        await sendQuickReplyWithMenu(replyToken, "找不到要修改的死線，請稍後再試。");
        return;
      }

      const updateData: { dueDate?: Date } = {};
      if (modificationRequest.newDueDate) {
        try {
          const newDueDate = new Date(modificationRequest.newDueDate);
          if (isNaN(newDueDate.getTime())) {
            await sendQuickReplyWithMenu(replyToken, "無法解析新的截止日期，請稍後再試。");
            return;
          }
          updateData.dueDate = newDueDate;
        } catch {
          await sendQuickReplyWithMenu(replyToken, "無法解析新的截止日期，請稍後再試。");
          return;
        }
      }

      await studyBlockService.deleteStudyBlocksByDeadline(modificationRequest.deadlineId);

      const { PreferenceExtractorService } = await import(
        "@/services/llm/preference-extractor.service"
      );
      const preferenceExtractor = new PreferenceExtractorService();
      const existingPreferences = await preferenceExtractor.extractPreferences(history);

      const mergedPreferences: UserPreferences = {
        excludeHours: newPreferences?.excludeHours || existingPreferences.excludeHours,
        preferHours: newPreferences?.preferHours || existingPreferences.preferHours,
        maxHoursPerDay: newPreferences?.maxHoursPerDay || existingPreferences.maxHoursPerDay,
        excludeDays: newPreferences?.excludeDays || existingPreferences.excludeDays,
      };

      if (
        mergedPreferences.excludeHours ||
        mergedPreferences.preferHours ||
        mergedPreferences.maxHoursPerDay ||
        mergedPreferences.excludeDays
      ) {
        const preferenceText = [
          mergedPreferences.excludeHours
            ? `排除時段：${mergedPreferences.excludeHours.join(", ")}點`
            : "",
          mergedPreferences.preferHours
            ? `偏好時段：${mergedPreferences.preferHours.join(", ")}點`
            : "",
          mergedPreferences.maxHoursPerDay
            ? `每天最大時數：${mergedPreferences.maxHoursPerDay}小時`
            : "",
          mergedPreferences.excludeDays
            ? `排除日期：${mergedPreferences.excludeDays.join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join("，");

        await userStateService.addToConversationHistory(
          userId,
          "user",
          `[系統偏好設定] ${preferenceText}`
        );
      }

      const updatedDeadline = await deadlineService.updateDeadlineAndReschedule(
        modificationRequest.deadlineId,
        updateData,
        userId
      );

      if (updatedDeadline) {
        const newBlocks = await studyBlockService.getStudyBlocksByDeadline(
          modificationRequest.deadlineId
        );

        const reasoning = modificationRequest.reasoning || "";
        let message = `✅ 已根據你的需求`;

        if (modificationRequest.newDueDate) {
          const newDueDateFormatted = dayjs(modificationRequest.newDueDate).format("YYYY年M月D日");
          message += `將「${modificationRequest.deadlineTitle}」的截止日期改為 ${newDueDateFormatted}，並`;
        }

        message += `重新安排「${modificationRequest.deadlineTitle}」的學習時間！\n\n`;

        if (reasoning) {
          message += `${reasoning}\n\n`;
        }

        if (newBlocks.length > 0) {
          const blocksByDate = new Map<string, typeof newBlocks>();
          newBlocks.forEach((b) => {
            const dateKey = dayjs(b.startTime).tz("Asia/Taipei").format("M/D");
            if (!blocksByDate.has(dateKey)) {
              blocksByDate.set(dateKey, []);
            }
            blocksByDate.get(dateKey)!.push(b);
          });

          message += `**排程詳情：**\n\n`;
          const sortedEntries = Array.from(blocksByDate.entries()).sort((a, b) => {
            const dateA = dayjs(a[1][0].startTime).tz("Asia/Taipei").valueOf();
            const dateB = dayjs(b[1][0].startTime).tz("Asia/Taipei").valueOf();
            return dateA - dateB;
          });

          sortedEntries.forEach(([dateKey, blocks]) => {
            blocks.sort(
              (a, b) =>
                dayjs(a.startTime).tz("Asia/Taipei").valueOf() -
                dayjs(b.startTime).tz("Asia/Taipei").valueOf()
            );

            blocks.forEach((b) => {
              const start = dayjs(b.startTime).tz("Asia/Taipei").format("HH:mm");
              const end = dayjs(b.endTime).tz("Asia/Taipei").format("HH:mm");
              message += `${dateKey} ${start}-${end}（${b.duration}小時）\n`;
            });
          });

          const totalHours = newBlocks.reduce((sum, b) => sum + b.duration, 0);
          message += `\n總共安排了 ${totalHours} 小時`;
        } else {
          message += `⚠️ 無法安排新的時程，可能是時間不足或偏好設定過於嚴格。`;
        }

        await sendQuickReplyWithMenu(replyToken, message);
        await userStateService.addToConversationHistory(userId, "assistant", message);
      } else {
        await sendQuickReplyWithMenu(
          replyToken,
          `⚠️ 無法為「${modificationRequest.deadlineTitle}」安排新的時程，請稍後再試。`
        );
      }
      return;
    }

    await handleDefaultChat(context, userId, text, replyToken);
  } catch (error) {
    Logger.error("處理時程修改流程失敗", { error, userId, text });
    await sendQuickReplyWithMenu(replyToken, "處理時程修改時發生錯誤，請稍後再試。");
  }
}
