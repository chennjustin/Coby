import { LineMessagingClient } from "@/lib/line/client";

export const QUICK_REPLY_ITEMS = [
  { label: "🍀 每日簽到", text: "簽到" },
  { label: "🔮 抽!!!", text: "今日占卜" },
  { label: "📅 查看時程", text: "查看時程" },
  { label: "📝 新增死線", text: "新增 Deadline" },
];

const lineClient = new LineMessagingClient();

export async function sendQuickReplyWithMenu(replyToken: string, text: string) {
  await lineClient.sendQuickReply(replyToken, text, QUICK_REPLY_ITEMS);
}
