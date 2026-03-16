import { CheckinService } from "@/services/checkin/checkin.service";
import { DeadlineService } from "@/services/deadline/deadline.service";
import { UserTokenService } from "@/services/user/user-token.service";
import { QuoteService } from "@/services/quote/quote.service";
import { buildScheduleViewFlexMessage } from "@/lib/line/flex-messages";
import { LineMessagingClient } from "@/lib/line/client";
import { Logger } from "@/lib/utils/logger";
import connectDB from "@/lib/db/mongoose";
import User from "@/models/User";
import Deadline from "@/models/Deadline";
import Checkin from "@/models/Checkin";
import { sendTextMessageWithQuickReply, QUICK_REPLY_ITEMS } from "../utils";

const checkinService = new CheckinService();
const deadlineService = new DeadlineService();
const userTokenService = new UserTokenService();
const quoteService = new QuoteService();
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
        todayDeadlines.forEach((d, i) => {
          const emoji = d.type === "exam" ? "📝" : d.type === "assignment" ? "📄" : d.type === "project" ? "📦" : "📌";
          message += `${i + 1}. ${emoji} ${d.title}\n`;
        });
      }
      await sendTextMessageWithQuickReply(replyToken, message);
    } else {
      const fortune = await quoteService.getDailyQuote(userId);
      let message = `✔ 今天已成功簽到！你已連續簽到 ${result.consecutiveDays} 天\n\n${fortune}`;
      if (todayDeadlines.length > 0) {
        message += `\n\n📅 今天的待辦事項：\n`;
        todayDeadlines.forEach((d, i) => {
          const emoji = d.type === "exam" ? "📝" : d.type === "assignment" ? "📄" : d.type === "project" ? "📦" : "📌";
          message += `${i + 1}. ${emoji} ${d.title}\n`;
        });
      } else {
        message += `\n\n📅 今天沒有任何待辦事項，可以好好休息！`;
      }
      await sendTextMessageWithQuickReply(replyToken, message);
    }

    const scheduleMessage = buildScheduleViewFlexMessage(viewToken, appUrl, todayDeadlines.length);
    await lineClient.sendFlexMessage(replyToken, scheduleMessage.altText, scheduleMessage.contents);
    await lineClient.sendQuickReply(replyToken, "", QUICK_REPLY_ITEMS);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    Logger.error("處理簽到失敗", { error, userId });
    await sendTextMessageWithQuickReply(replyToken, `簽到時發生錯誤：${errMsg}\n\n請稍後再試或聯繫管理員。`);
  }
}

export async function handleDailyQuote(userId: string, replyToken: string) {
  try {
    const fortune = await quoteService.getDailyQuote(userId);
    await sendTextMessageWithQuickReply(replyToken, fortune);
  } catch (error) {
    Logger.error("處理今日占卜失敗", { error, userId });
    await sendTextMessageWithQuickReply(replyToken, "取得占卜時發生錯誤，請稍後再試。");
  }
}

export async function handleResetData(userId: string, replyToken: string) {
  try {
    await connectDB();
    const user = await User.findOne({ lineUserId: userId });
    if (!user) {
      await sendTextMessageWithQuickReply(replyToken, "找不到使用者資訊。");
      return;
    }
    const { UserStateService } = await import("@/services/user-state/user-state.service");
    const userStateService = new UserStateService();
    const deadlineResult = await Deadline.deleteMany({ userId: user._id });
    const checkinResult = await Checkin.deleteMany({ userId: user._id });
    await userStateService.clearState(userId);
    const { generateViewToken } = await import("@/lib/utils/token");
    user.viewToken = generateViewToken();
    await user.save();
    const message = `✅ 資料已清除完成！\n\n📝 待辦事項：刪除 ${deadlineResult.deletedCount || 0} 筆\n🍀 簽到記錄：刪除 ${checkinResult.deletedCount || 0} 筆\n🔄 用戶狀態：已清除\n🔑 Token：已重置\n\n你的帳號已恢復到初始狀態。`;
    await sendTextMessageWithQuickReply(replyToken, message);
  } catch (error) {
    Logger.error("清除資料失敗", { error, userId });
    await sendTextMessageWithQuickReply(replyToken, "清除資料時發生錯誤，請稍後再試。");
  }
}
