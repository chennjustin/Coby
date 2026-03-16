import { DeadlineService } from "@/services/deadline/deadline.service";
import { UserTokenService } from "@/services/user/user-token.service";
import { IntentService } from "@/services/llm/intent.service";
import { LineMessagingClient } from "@/lib/line/client";
import { buildDeadlineDetailFlexMessage } from "@/lib/line/flex-messages";
import { sendQuickReplyWithMenu, QUICK_REPLY_ITEMS } from "@/bot/constants";
import { getAppUrl } from "@/lib/utils/app-url";
import { Logger } from "@/lib/utils/logger";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

const deadlineService = new DeadlineService();
const userTokenService = new UserTokenService();
const intentService = new IntentService();
const lineClient = new LineMessagingClient();

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

    Logger.info("使用應用程式 URL", { appUrl, scheduleUrl, userId, actionType });

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
      Logger.info("發送打開 WebView 訊息", { userId, scheduleUrl });
      return;
    }

    let targetDate: string | null = null;
    if (text) {
      targetDate = await intentService.extractDateFromText(text);
    }

    let deadlines = await deadlineService.getDeadlinesByUser(userId, "pending");

    if (targetDate) {
      const targetDayjs = dayjs(targetDate).tz("Asia/Taipei").startOf("day");
      const nextDayjs = targetDayjs.add(1, "day");

      deadlines = deadlines.filter((deadline) => {
        const dueDayjs = dayjs(deadline.dueDate).tz("Asia/Taipei").startOf("day");
        return (
          (dueDayjs.isSame(targetDayjs) || dueDayjs.isAfter(targetDayjs)) &&
          dueDayjs.isBefore(nextDayjs)
        );
      });

      Logger.info("過濾日期 deadlines", { userId, targetDate, filteredCount: deadlines.length });
    }

    let message = "";
    if (targetDate) {
      const dateFormatted = new Date(targetDate).toLocaleDateString("zh-TW", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      message = `📅 ${dateFormatted} 的待辦事項：\n\n`;
    } else {
      message = `📅 你的待辦事項：\n\n`;
    }

    if (deadlines.length === 0) {
      message += "目前沒有任何待辦事項 🌈";
    } else {
      deadlines.forEach((deadline, index) => {
        const typeEmoji =
          deadline.type === "exam"
            ? "📝"
            : deadline.type === "assignment"
            ? "📄"
            : deadline.type === "project"
            ? "📦"
            : "📌";
        const dueDate =
          deadline.dueDate instanceof Date ? deadline.dueDate : new Date(deadline.dueDate);
        const daysLeft = deadlineService.calculateDaysLeft(dueDate);
        const daysLeftText =
          daysLeft < 0
            ? `已過期 ${Math.abs(daysLeft)} 天`
            : daysLeft === 0
            ? "今天截止"
            : `剩餘 ${daysLeft} 天`;

        message += `${index + 1}. ${typeEmoji} ${deadline.title}\n   ${daysLeftText}\n`;
      });
    }

    await sendQuickReplyWithMenu(replyToken, message);

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

    Logger.info("發送時程表", { userId, deadlineCount: deadlines.length, targetDate, actionType });

    await lineClient.sendQuickReply(replyToken, "", QUICK_REPLY_ITEMS);
  } catch (error) {
    Logger.error("處理查看時程失敗", { error, userId });
    await sendQuickReplyWithMenu(replyToken, "查看時程時發生錯誤，請稍後再試。");
  }
}

export async function handleViewDeadlineDetail(
  userId: string,
  deadlineId: string,
  replyToken: string
) {
  try {
    const deadline = await deadlineService.getDeadlineById(deadlineId);
    if (!deadline) {
      await sendQuickReplyWithMenu(replyToken, "找不到這個 Deadline。");
      return;
    }

    const flexMessage = buildDeadlineDetailFlexMessage(deadline);
    await lineClient.sendFlexMessage(replyToken, flexMessage.altText, flexMessage.contents);
    await lineClient.sendQuickReply(replyToken, "", QUICK_REPLY_ITEMS);

    Logger.info("發送 Deadline 詳情", { userId, deadlineId, title: deadline.title });
  } catch (error) {
    Logger.error("處理查看 Deadline 詳情失敗", { error, deadlineId });
    await sendQuickReplyWithMenu(replyToken, "查看詳情時發生錯誤，請稍後再試。");
  }
}
