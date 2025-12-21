import { BotContext } from "@/types/bot";

export async function handleDefault(context: BotContext) {
  await context.sendText("抱歉，我不太理解你的意思。請輸入「幫助」查看使用說明。");
}

