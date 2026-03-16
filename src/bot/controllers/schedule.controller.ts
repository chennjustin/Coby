import { BotContext } from "@/types/bot";
import { DeadlineService } from "@/services/deadline/deadline.service";
import { UserTokenService } from "@/services/user/user-token.service";
import { IntentService } from "@/services/llm/intent.service";
import { StudyBlockService } from "@/services/study-block/study-block.service";
import { buildDeadlineDetailFlexMessage } from "@/lib/line/flex-messages";
import { LineMessagingClient } from "@/lib/line/client";
import { Logger } from "@/lib/utils/logger";
import Deadline from "@/models/Deadline";
import connectDB from "@/lib/db/mongoose";
import User from "@/models/User";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { sendTextMessageWithQuickReply, QUICK_REPLY_ITEMS } from "../utils";
import { handleDefaultChat } from "./chat.controller";

dayjs.extend(utc);
dayjs.extend(timezone);

const deadlineService = new DeadlineService();
const userTokenService = new UserTokenService();
const intentService = new IntentService();
const lineClient = new LineMessagingClient();

function getAppUrl(): string {
  let appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    if (process.env.VERCEL_URL) {
      const vercelUrl = process.env.VERCEL_URL;
      appUrl = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    } else {
      appUrl = "http://localhost:3000";
    }
  }
  appUrl = appUrl.replace(/\/$/, "");
  if (!appUrl.startsWith("http")) appUrl = `https://${appUrl}`;
  return appUrl;
}

export async function handleViewSchedule(
  userId: string,
  replyToken: string,
  text?: string,
  actionType: "direct_open" | "inquiry" = "inquiry"
) {
  try {
    const viewToken = await userTokenService.getOrCreateViewToken(userId);
    const appUrl = getAppUrl();
    const scheduleUrl = `${appUrl}/schedule?token=${viewToken}`;

    if (actionType === "direct_open") {
      await lineClient.sendMessages(replyToken, [
        {
          type: "template",
          altText: "打開時程表",
          template: {
            type: "buttons",
            text: "📅 正在打開你的時程表...",
            actions: [{ type: "uri", label: "打開時程表", uri: scheduleUrl }],
          },
        },
      ]);
      return;
    }

    let targetDate: string | null = null;
    if (text) targetDate = await intentService.extractDateFromText(text);

    let deadlines = await deadlineService.getDeadlinesByUser(userId, "pending");
    if (targetDate) {
      const targetDateObj = new Date(targetDate);
      targetDateObj.setHours(0, 0, 0, 0);
      const nextDay = new Date(targetDateObj);
      nextDay.setDate(nextDay.getDate() + 1);
      deadlines = deadlines.filter((d) => {
        const due = d.dueDate instanceof Date ? d.dueDate : new Date(d.dueDate);
        due.setHours(0, 0, 0, 0);
        return due >= targetDateObj && due < nextDay;
      });
    }

    let message = targetDate
      ? `📅 ${new Date(targetDate).toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" })} 的待辦事項：\n\n`
      : `📅 你的待辦事項：\n\n`;
    if (deadlines.length === 0) {
      message += "目前沒有任何待辦事項 🌈";
    } else {
      deadlines.forEach((d, i) => {
        const emoji = d.type === "exam" ? "📝" : d.type === "assignment" ? "📄" : d.type === "project" ? "📦" : "📌";
        const due = d.dueDate instanceof Date ? d.dueDate : new Date(d.dueDate);
        const daysLeft = deadlineService.calculateDaysLeft(due);
        const daysText = daysLeft < 0 ? `已過期 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? "今天截止" : `剩餘 ${daysLeft} 天`;
        message += `${i + 1}. ${emoji} ${d.title}\n   ${daysText}\n`;
      });
    }
    await sendTextMessageWithQuickReply(replyToken, message);
    await lineClient.sendMessages(replyToken, [
      {
        type: "template",
        altText: "打開時程表",
        template: {
          type: "buttons",
          text: "📅 詳細的行程在這邊，點擊下方按鈕開啟時程表頁面查看完整資訊",
          actions: [{ type: "uri", label: "📅 打開時程表", uri: scheduleUrl }],
        },
      },
    ]);
    await lineClient.sendQuickReply(replyToken, "", QUICK_REPLY_ITEMS);
  } catch (error) {
    Logger.error("處理查看時程失敗", { error, userId });
    await sendTextMessageWithQuickReply(replyToken, "查看時程時發生錯誤，請稍後再試。");
  }
}

export async function handleViewDeadlineDetail(userId: string, deadlineId: string, replyToken: string) {
  try {
    const deadline = await deadlineService.getDeadlineById(deadlineId);
    if (!deadline) {
      await sendTextMessageWithQuickReply(replyToken, "找不到這個 Deadline。");
      return;
    }
    const flexMessage = buildDeadlineDetailFlexMessage(deadline);
    await lineClient.sendFlexMessage(replyToken, flexMessage.altText, flexMessage.contents);
    await lineClient.sendQuickReply(replyToken, "", QUICK_REPLY_ITEMS);
  } catch (error) {
    Logger.error("處理查看 Deadline 詳情失敗", { error, deadlineId });
    await sendTextMessageWithQuickReply(replyToken, "查看詳情時發生錯誤，請稍後再試。");
  }
}

export async function handleModifyScheduleFlow(context: BotContext, userId: string, replyToken: string, text: string) {
  try {
    await connectDB();
    const user = await User.findOne({ lineUserId: userId });
    if (!user) {
      await sendTextMessageWithQuickReply(replyToken, "找不到用戶資訊，請稍後再試。");
      return;
    }
    const deadlines = await Deadline.find({ userId: user._id, status: "pending" }).sort({ dueDate: 1 }).exec();
    if (deadlines.length === 0) {
      await sendTextMessageWithQuickReply(replyToken, "你目前沒有任何待辦事項可以修改時程。");
      return;
    }
    const studyBlockService = new StudyBlockService();
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 60);
    const studyBlocks = await studyBlockService.getStudyBlocksByUser(userId, sixtyDaysAgo, futureDate);
    const { UserStateService } = await import("@/services/user-state/user-state.service");
    const userStateService = new UserStateService();
    const conversationHistory = await userStateService.getConversationHistory(userId);
    const history = conversationHistory.map((item) => ({ role: item.role, content: item.content }));

    const { ScheduleModifierService } = await import("@/services/llm/schedule-modifier.service");
    const modifierService = new ScheduleModifierService();
    const modificationRequest = await modifierService.analyzeModificationRequest(text, deadlines, studyBlocks, history);

    if (!modificationRequest) {
      await handleDefaultChat(context, userId, text, replyToken);
      return;
    }
    await userStateService.addToConversationHistory(userId, "user", text);

    if (modificationRequest.action === "delete") {
      await deadlineService.deleteDeadline(modificationRequest.deadlineId);
      await sendTextMessageWithQuickReply(replyToken, `✅ 已刪除死線「${modificationRequest.deadlineTitle}」及其所有相關學習計畫。`);
      await userStateService.addToConversationHistory(userId, "assistant", `已刪除死線「${modificationRequest.deadlineTitle}」及其所有相關學習計畫。`);
      return;
    }

    if (modificationRequest.action === "modify") {
      const hasDueDateChange = !!modificationRequest.newDueDate;
      const newPreferences = modificationRequest.newSchedule?.preferences;
      const hasScheduleChange = !!newPreferences && (!!newPreferences.excludeHours || !!newPreferences.preferHours || !!newPreferences.maxHoursPerDay || !!newPreferences.excludeDays);
      if (!hasDueDateChange && !hasScheduleChange) {
        await handleDefaultChat(context, userId, text, replyToken);
        return;
      }
      const deadline = deadlines.find((d) => d._id.toString() === modificationRequest.deadlineId);
      if (!deadline) {
        await sendTextMessageWithQuickReply(replyToken, "找不到要修改的死線，請稍後再試。");
        return;
      }
      const updateData: { dueDate?: Date } = {};
      if (modificationRequest.newDueDate) {
        const { parseToUTC } = await import("@/lib/utils/timezone");
        updateData.dueDate = parseToUTC(modificationRequest.newDueDate);
      }
      await studyBlockService.deleteStudyBlocksByDeadline(modificationRequest.deadlineId);
      const { PreferenceExtractorService } = await import("@/services/llm/preference-extractor.service");
      const preferenceExtractor = new PreferenceExtractorService();
      const existingPreferences = await preferenceExtractor.extractPreferences(history);
      const mergedPreferences = {
        excludeHours: newPreferences?.excludeHours || existingPreferences.excludeHours,
        preferHours: newPreferences?.preferHours || existingPreferences.preferHours,
        maxHoursPerDay: newPreferences?.maxHoursPerDay || existingPreferences.maxHoursPerDay,
        excludeDays: newPreferences?.excludeDays || existingPreferences.excludeDays,
      };
      if (mergedPreferences.excludeHours || mergedPreferences.preferHours || mergedPreferences.maxHoursPerDay || mergedPreferences.excludeDays) {
        const preferenceText = [
          mergedPreferences.excludeHours ? `排除時段：${mergedPreferences.excludeHours.join(", ")}點` : "",
          mergedPreferences.preferHours ? `偏好時段：${mergedPreferences.preferHours.join(", ")}點` : "",
          mergedPreferences.maxHoursPerDay ? `每天最大時數：${mergedPreferences.maxHoursPerDay}小時` : "",
          mergedPreferences.excludeDays ? `排除日期：${mergedPreferences.excludeDays.join(", ")}` : "",
        ].filter(Boolean).join("，");
        await userStateService.addToConversationHistory(userId, "user", `[系統偏好設定] ${preferenceText}`);
      }
      const updatedDeadline = await deadlineService.updateDeadlineAndReschedule(modificationRequest.deadlineId, updateData, userId);
      if (updatedDeadline) {
        const newBlocks = await studyBlockService.getStudyBlocksByDeadline(modificationRequest.deadlineId);
        const reasoning = modificationRequest.reasoning || "";
        let message = `✅ 已根據你的需求`;
        if (modificationRequest.newDueDate) {
          message += `將「${modificationRequest.deadlineTitle}」的截止日期改為 ${dayjs(modificationRequest.newDueDate).format("YYYY年M月D日")}，並`;
        }
        message += `重新安排「${modificationRequest.deadlineTitle}」的學習時間！\n\n`;
        if (reasoning) message += `${reasoning}\n\n`;
        if (newBlocks.length > 0) {
          const blocksByDate = new Map<string, typeof newBlocks>();
          newBlocks.forEach((b) => {
            const dateKey = dayjs(b.startTime).tz("Asia/Taipei").format("M/D");
            if (!blocksByDate.has(dateKey)) blocksByDate.set(dateKey, []);
            blocksByDate.get(dateKey)!.push(b);
          });
          message += `**排程詳情：**\n\n`;
          const sortedEntries = Array.from(blocksByDate.entries()).sort((a, b) =>
            dayjs(a[1][0].startTime).tz("Asia/Taipei").valueOf() - dayjs(b[1][0].startTime).tz("Asia/Taipei").valueOf()
          );
          sortedEntries.forEach(([, blocks]) => {
            blocks.sort((a, b) => dayjs(a.startTime).tz("Asia/Taipei").valueOf() - dayjs(b.startTime).tz("Asia/Taipei").valueOf());
            blocks.forEach((b) => {
              message += `${dayjs(b.startTime).tz("Asia/Taipei").format("M/D")} ${dayjs(b.startTime).tz("Asia/Taipei").format("HH:mm")}-${dayjs(b.endTime).tz("Asia/Taipei").format("HH:mm")}（${b.duration}小時）\n`;
            });
          });
          message += `\n總共安排了 ${newBlocks.reduce((s, b) => s + b.duration, 0)} 小時`;
        } else {
          message += `⚠️ 無法安排新的時程，可能是時間不足或偏好設定過於嚴格。`;
        }
        await sendTextMessageWithQuickReply(replyToken, message);
        await userStateService.addToConversationHistory(userId, "assistant", message);
      } else {
        await sendTextMessageWithQuickReply(replyToken, `⚠️ 無法為「${modificationRequest.deadlineTitle}」安排新的時程，請稍後再試。`);
      }
      return;
    }
    await handleDefaultChat(context, userId, text, replyToken);
  } catch (error) {
    Logger.error("處理時程修改流程失敗", { error, userId, text });
    await sendTextMessageWithQuickReply(replyToken, "處理時程修改時發生錯誤，請稍後再試。");
  }
}
