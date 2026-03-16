import { LineMessagingClient } from "@/lib/line/client";
import { Logger } from "@/lib/utils/logger";

const lineClient = new LineMessagingClient();

export const QUICK_REPLY_ITEMS = [
  { label: "🍀 每日簽到", text: "簽到" },
  { label: "🔮 抽!!!", text: "今日占卜" },
  { label: "📅 查看時程", text: "查看時程" },
  { label: "📝 新增死線", text: "新增 Deadline" },
];

export async function sendTextMessageWithQuickReply(replyToken: string, text: string) {
  await lineClient.sendQuickReply(replyToken, text, QUICK_REPLY_ITEMS);
}

export async function sendMainMenu(userId: string, replyToken: string) {
  await lineClient.sendQuickReply(replyToken, "請選擇功能：", QUICK_REPLY_ITEMS);
  Logger.info("發送主選單（Quick Reply）", { userId });
}
