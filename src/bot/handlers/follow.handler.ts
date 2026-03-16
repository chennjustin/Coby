import { BotContext } from "@/types/bot";
import { LineMessagingClient } from "@/lib/line/client";
import { Logger } from "@/lib/utils/logger";

const lineClient = new LineMessagingClient();

export async function handleFollow(context: BotContext) {
  try {
    const userId = context.event.source.userId;
    const replyToken = context.event.replyToken;

    Logger.info("處理關注事件", { userId, hasReplyToken: !!replyToken });

    if (!replyToken) {
      Logger.warn("No replyToken in follow event", { userId });
      return;
    }

    // 發送歡迎訊息（帶 Quick Reply）
    const welcomeMessage =
`🎉 歡迎使用「Coby」！

我是 Coby，你的 LINE 學習時程助手，幫你更穩定地管理作業、專題與考試！

📌 主要功能介紹

🍀 每日簽到：每天記得來找我一下嘿嘿～
簽到後我會告訴你：
✔ 今天要做什麼
✔ 還有哪些待辦事項
✔ 你的連續簽到天數

🔮 抽卡！！：當你感到厭煩時可以來這邊占卜一下，看看你今天和讀書的愛恨分數

📅 查看時程：會有連結跳到你自己專屬的行事曆，在裡面你可以看到：
✔ 系統為你規畫的讀書時段
✔ 管理你所有的 deadline
✔ 在網頁版介面自由新增、修改、刪除

📝 新增死線：當你接收到作業/專題/考試等死線，怕自己忘記，就可以來這邊輸入，系統會幫你安排讀書計畫

📱 你可以：
✔ 使用下方的快速回覆按鈕快速操作
✔ 用自然語言聊天，像是：「我要簽到」、「今天要幹嘛」、「我有個作業下禮拜三要交」、「我想看行事曆」

我會自動判斷你的需求。

🌟 希望 Coby 能陪你一起成為時間管理大師，不再被 deadline 追著跑！`;

    // 發送歡迎訊息並附上 Quick Reply
    await lineClient.sendQuickReply(replyToken, welcomeMessage, [
      { label: "🍀 每日簽到", text: "簽到" },
      { label: "🔮 抽!!!", text: "今日占卜" },
      { label: "📅 查看時程", text: "查看時程" },
      { label: "📝 新增死線", text: "新增 Deadline" },
    ]);
    
    if (userId) {
      Logger.info("發送歡迎訊息（Quick Reply）", { userId });
    }
  } catch (error) {
    Logger.error("處理關注事件時發生錯誤", { error });
    const replyToken = context.event.replyToken;
    if (replyToken) {
      try {
        await lineClient.sendQuickReply(replyToken, "歡迎使用 Coby！", [
          { label: "🍀 每日簽到", text: "簽到" },
          { label: "🔮 抽!!!", text: "今日占卜" },
          { label: "📅 查看時程", text: "查看時程" },
          { label: "📝 新增死線", text: "新增 Deadline" },
        ]);
      } catch (sendError) {
        Logger.error("無法發送歡迎訊息", { error: sendError });
      }
    }
  }
}

