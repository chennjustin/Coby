import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { LineWebhookSchema } from "@/lib/utils/validation";
import { handleText } from "@/bot/handlers/text.handler";
import { handleFollow } from "@/bot/handlers/follow.handler";
import { handleUnfollow } from "@/bot/handlers/unfollow.handler";
import { Logger } from "@/lib/utils/logger";
import { BotContext } from "@/types/bot";
import { LineMessagingClient } from "@/lib/line/client";

const lineClient = new LineMessagingClient();

function verifySignature(body: string, signature: string, secret: string): boolean {
  const hash = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64");
  return hash === signature;
}

// 創建 Context 物件
function createContext(event: any, replyToken?: string): BotContext {
  return {
    event,
    sendText: async (text: string) => {
      if (replyToken) {
        await lineClient.sendTextMessage(replyToken, text);
      } else {
        Logger.warn("No replyToken available", { eventType: event.type });
      }
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-line-signature");
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    if (!signature || !channelSecret) {
      Logger.warn("Missing LINE signature or channel secret");
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 400 }
      );
    }

    // 驗證簽名
    if (!verifySignature(body, signature, channelSecret)) {
      Logger.warn("Invalid LINE signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // 解析 webhook 事件
    const webhookData = JSON.parse(body);
    const validatedData = LineWebhookSchema.parse(webhookData);

    // 處理每個事件
    for (const event of validatedData.events) {
      const replyToken = (event as any).replyToken;
      const context = createContext(event, replyToken);

      try {
        Logger.info("Processing webhook event", { 
          eventType: event.type,
          messageType: (event as any).message?.type,
        });
        
        if (event.type === "message" && event.message?.type === "text") {
          Logger.info("Routing to handleText");
          const src = (event as { source?: { type?: string; userId?: string } })
            .source;
          if (src?.type === "user" && src.userId) {
            await lineClient.startLoadingAnimation(src.userId);
          }
          await handleText(context);
        } else if (event.type === "follow") {
          Logger.info("Routing to handleFollow");
          await handleFollow(context);
        } else if (event.type === "unfollow") {
          Logger.info("Routing to handleUnfollow");
          await handleUnfollow(context);
        } else {
          Logger.warn("Unhandled event type", { 
            eventType: event.type,
            messageType: (event as any).message?.type,
          });
        }
      } catch (error) {
        Logger.error("Error processing event", { 
          error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          eventType: event.type,
          userId: (event as any).source?.userId,
          replyToken: replyToken ? "exists" : "missing",
        });
        // 嘗試發送錯誤訊息（只有在有 replyToken 且不是 follow 事件時）
        if (replyToken && event.type !== "follow") {
          try {
            await lineClient.sendQuickReply(
              replyToken,
              "抱歉，處理您的訊息時發生錯誤，請稍後再試。",
              [
                { label: "🍀 每日簽到", text: "簽到" },
                { label: "🔮 抽!!!", text: "今日占卜" },
                { label: "📅 查看時程", text: "查看時程" },
                { label: "📝 新增死線", text: "新增 Deadline" },
              ]
            );
          } catch (sendError) {
            Logger.error("Failed to send error message", { sendError });
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    Logger.error("Webhook error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}

