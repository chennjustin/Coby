import { CheckinService } from "@/services/checkin/checkin.service";
import { DeadlineService } from "@/services/deadline/deadline.service";
import { UserTokenService } from "@/services/user/user-token.service";
import { QuoteService } from "@/services/quote/quote.service";
import { LineMessagingClient } from "@/lib/line/client";
import { buildScheduleViewFlexMessage } from "@/lib/line/flex-messages";
import { sendQuickReplyWithMenu, QUICK_REPLY_ITEMS } from "@/bot/constants";
import { getAppUrl } from "@/lib/utils/app-url";
import { Logger } from "@/lib/utils/logger";

const checkinService = new CheckinService();
const deadlineService = new DeadlineService();
const userTokenService = new UserTokenService();
const lineClient = new LineMessagingClient();
const quoteService = new QuoteService();

export async function handleCheckIn(userId: string, replyToken: string) {
  try {
    const result = await checkinService.checkIn(userId);
    const todayDeadlines = await deadlineService.getTodayDeadlines(userId);
    const viewToken = await userTokenService.getOrCreateViewToken(userId);
    const appUrl = getAppUrl();

    if (result.alreadyChecked) {
      let message = `你今天已經簽到過囉，連續簽到 ${result.consecutiveDays} 天`;

      if (todayDeadlines.length > 0) {
        message += `\n\n📅 今天的待辦事項：\n`;
        todayDeadlines.forEach((deadline, index) => {
          const typeEmoji =
            deadline.type === "exam"
              ? "📝"
              : deadline.type === "assignment"
              ? "📄"
              : deadline.type === "project"
              ? "📦"
              : "📌";
          message += `${index + 1}. ${typeEmoji} ${deadline.title}\n`;
        });
      }

      await sendQuickReplyWithMenu(replyToken, message);
      Logger.info("簽到回應（已簽到）", { userId, consecutiveDays: result.consecutiveDays });
    } else {
      const fortune = await quoteService.getDailyQuote(userId);
      let message = `✔ 今天已成功簽到！你已連續簽到 ${result.consecutiveDays} 天\n\n${fortune}`;

      if (todayDeadlines.length > 0) {
        message += `\n\n📅 今天的待辦事項：\n`;
        todayDeadlines.forEach((deadline, index) => {
          const typeEmoji =
            deadline.type === "exam"
              ? "📝"
              : deadline.type === "assignment"
              ? "📄"
              : deadline.type === "project"
              ? "📦"
              : "📌";
          message += `${index + 1}. ${typeEmoji} ${deadline.title}\n`;
        });
      } else {
        message += `\n\n📅 今天沒有任何待辦事項，可以好好休息！`;
      }

      await sendQuickReplyWithMenu(replyToken, message);
      Logger.info("簽到回應（成功）", { userId, consecutiveDays: result.consecutiveDays });
    }

    const scheduleMessage = buildScheduleViewFlexMessage(
      viewToken,
      appUrl,
      todayDeadlines.length
    );
    await lineClient.sendFlexMessage(replyToken, scheduleMessage.altText, scheduleMessage.contents);

    await lineClient.sendQuickReply(replyToken, "", QUICK_REPLY_ITEMS);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error("處理簽到失敗", { error, userId });
    await sendQuickReplyWithMenu(
      replyToken,
      `簽到時發生錯誤：${errorMessage}\n\n請稍後再試或聯繫管理員。`
    );
  }
}
