import { QuoteService } from "@/services/quote/quote.service";
import { sendQuickReplyWithMenu } from "@/bot/constants";
import { Logger } from "@/lib/utils/logger";

const quoteService = new QuoteService();

export async function handleDailyQuote(userId: string, replyToken: string) {
  try {
    const fortune = await quoteService.getDailyQuote(userId);
    await sendQuickReplyWithMenu(replyToken, fortune);
    Logger.info("發送今日占卜", { userId });
  } catch (error) {
    Logger.error("處理今日占卜失敗", { error, userId });
    await sendQuickReplyWithMenu(replyToken, "取得占卜時發生錯誤，請稍後再試。");
  }
}
