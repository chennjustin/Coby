import { BotContext } from "@/types/bot";
import { DeadlineService } from "@/services/deadline/deadline.service";
import { UserStateService } from "@/services/user-state/user-state.service";
import { LLMUtilsService } from "@/services/llm/llm-utils.service";
import { buildDeadlineDetailFlexMessage } from "@/lib/line/flex-messages";
import { LineMessagingClient } from "@/lib/line/client";
import { UserTokenService } from "@/services/user/user-token.service";
import { StudyBlockService } from "@/services/study-block/study-block.service";
import { Logger } from "@/lib/utils/logger";
import User from "@/models/User";
import { IDeadline } from "@/models/Deadline";
import connectDB from "@/lib/db/mongoose";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { parseTaipeiInputToUtc } from "@/lib/utils/date";

dayjs.extend(utc);
dayjs.extend(timezone);

const deadlineService = new DeadlineService();
const userStateService = new UserStateService();
const llmUtilsService = new LLMUtilsService();
const lineClient = new LineMessagingClient();
const userTokenService = new UserTokenService();
const studyBlockService = new StudyBlockService();

// Quick Reply 按鈕配置
const QUICK_REPLY_ITEMS = [
  { label: "🍀 每日簽到", text: "簽到" },
  { label: "🔮 抽!!!", text: "今日占卜" },
  { label: "📅 查看時程", text: "查看時程" },
  { label: "📝 新增死線", text: "新增 Deadline" },
];

/**
 * 發送帶有 Quick Reply 的文字訊息
 */
async function sendTextMessageWithQuickReply(replyToken: string, text: string) {
  await lineClient.sendQuickReply(replyToken, text, QUICK_REPLY_ITEMS);
}

/**
 * 發送排程成功訊息
 */
async function sendScheduleSuccessMessage(
  userId: string,
  replyToken: string,
  deadline: IDeadline
): Promise<void> {
  try {
    // 取得或創建 viewToken
    const viewToken = await userTokenService.getOrCreateViewToken(userId);

    // 取得應用程式 URL
    let appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      if (process.env.VERCEL_URL) {
        const vercelUrl = process.env.VERCEL_URL;
        if (vercelUrl.startsWith("http://") || vercelUrl.startsWith("https://")) {
          appUrl = vercelUrl;
        } else {
          appUrl = `https://${vercelUrl}`;
        }
      } else {
        appUrl = "http://localhost:3000";
      }
    }
    appUrl = appUrl.replace(/\/$/, "");
    if (!appUrl.startsWith("http://") && !appUrl.startsWith("https://")) {
      appUrl = `https://${appUrl}`;
    }

    const scheduleUrl = `${appUrl}/schedule?token=${viewToken}`;

    // 檢查是否有排程的 blocks
    const allBlocks = await studyBlockService.getStudyBlocksByDeadline(deadline._id.toString());
    
    // 驗證並過濾不合法的 blocks（凌晨時段、死線之後）
    const now = dayjs().tz("Asia/Taipei");
    const dueDate = dayjs(deadline.dueDate).tz("Asia/Taipei");
    const FORBIDDEN_HOURS = [
      { start: 0, end: 8 }, // 00:00-08:00
      { start: 23, end: 24 }, // 23:00-24:00
    ];
    
    const invalidBlockIds: string[] = [];
    const validBlocks = allBlocks.filter((block) => {
      const startTime = dayjs(block.startTime).tz("Asia/Taipei");
      const endTime = dayjs(block.endTime).tz("Asia/Taipei");
      
      // 檢查是否在過去
      if (startTime.isBefore(now)) {
        invalidBlockIds.push(block._id.toString());
        return false;
      }
      
      // 檢查是否在死線之後
      if (startTime.isAfter(dueDate)) {
        invalidBlockIds.push(block._id.toString());
        return false;
      }
      
      // 檢查是否跨越禁止時段
      for (const { start, end } of FORBIDDEN_HOURS) {
        const forbiddenStart = startTime.startOf("day").add(start, "hour");
        const forbiddenEnd = startTime.startOf("day").add(end, "hour");
        if (startTime.isBefore(forbiddenEnd) && endTime.isAfter(forbiddenStart)) {
          invalidBlockIds.push(block._id.toString());
          return false;
        }
      }
      
      return true;
    });
    
    // 刪除不合法的 blocks
    if (invalidBlockIds.length > 0) {
      Logger.warn("發現不合法的 blocks，正在刪除", {
        deadlineId: deadline._id,
        invalidBlockIds,
        invalidCount: invalidBlockIds.length,
      });
      for (const blockId of invalidBlockIds) {
        try {
          await studyBlockService.deleteStudyBlock(blockId);
        } catch (error) {
          Logger.error("刪除不合法 block 失敗", { error, blockId });
        }
      }
    }
    
    // 發送成功訊息
    let message = `我收到你要建立「${deadline.title}」，預估需要 ${deadline.estimatedHours} 小時。\n\n`;
    
    if (validBlocks.length > 0) {
      const totalHours = validBlocks.reduce((sum, b) => sum + b.duration, 0);
      
      // 按日期分組顯示排程（使用 dayjs 確保時區正確）
      const blocksByDate = new Map<string, typeof validBlocks>();
      validBlocks.forEach((block) => {
        const dateKey = dayjs(block.startTime).tz("Asia/Taipei").format("M/D");
        if (!blocksByDate.has(dateKey)) {
          blocksByDate.set(dateKey, []);
        }
        blocksByDate.get(dateKey)!.push(block);
      });

      message += `我幫你排了一份學習計畫囉！📘\n\n`;
      
      // 顯示排程詳情（日期排在時間前面）
      if (blocksByDate.size > 0) {
        message += `**排程詳情：**\n\n`;
        // 按日期排序（使用實際的 startTime 來排序，確保跨年也能正確）
        const sortedEntries = Array.from(blocksByDate.entries()).sort((a, b) => {
          // 取每個日期組的第一個 block 的 startTime 來比較
          const dateA = dayjs(a[1][0].startTime).tz("Asia/Taipei").valueOf();
          const dateB = dayjs(b[1][0].startTime).tz("Asia/Taipei").valueOf();
          return dateA - dateB;
        });
        
        sortedEntries.forEach(([dateKey, dayBlocks]) => {
          // 按開始時間排序
          dayBlocks.sort((a, b) => {
            return dayjs(a.startTime).tz("Asia/Taipei").valueOf() - dayjs(b.startTime).tz("Asia/Taipei").valueOf();
          });
          
          dayBlocks.forEach((block) => {
            const startTime = dayjs(block.startTime).tz("Asia/Taipei");
            const endTime = dayjs(block.endTime).tz("Asia/Taipei");
            const start = startTime.format("HH:mm");
            const end = endTime.format("HH:mm");
            // 日期排在時間前面
            message += `${dateKey} ${start}-${end}（${block.duration}小時）\n`;
          });
        });
      }
      
      message += `\n總共安排了 ${totalHours} 小時`;
      if (totalHours < deadline.estimatedHours) {
        message += `（預估 ${deadline.estimatedHours} 小時，剩餘 ${deadline.estimatedHours - totalHours} 小時請手動調整）`;
      }
      
      // 如果有不合法的 blocks，提示用戶
      if (validBlocks.length < allBlocks.length) {
        const invalidCount = allBlocks.length - validBlocks.length;
        message += `\n\n⚠️ 已過濾 ${invalidCount} 個不合法的時段（凌晨時段或死線之後）`;
      }
      
      message += `\n\n你可以在下面查看：\n🔗「開啟我的時程表」`;
    } else {
      if (allBlocks.length > 0) {
        message += `⚠️ 已建立 Deadline，但所有排程時段都不合法（凌晨時段或死線之後），請手動調整。`;
      } else {
        message += `✅ 已成功建立 Deadline！`;
      }
    }

    await sendTextMessageWithQuickReply(replyToken, message);

    // 如果有排程，發送時程表連結按鈕
    if (validBlocks.length > 0) {
      await lineClient.sendMessages(replyToken, [
        {
          type: "template",
          altText: "開啟我的時程表",
          template: {
            type: "buttons",
            text: "📅 開啟我的時程表",
            actions: [
              {
                type: "uri",
                label: "開啟我的時程表",
                uri: scheduleUrl,
              },
            ],
          },
        },
      ]);
    }
  } catch (error) {
    Logger.error("發送排程成功訊息失敗", { error, userId, deadlineId: deadline._id });
    // 如果發送失敗，至少發送基本成功訊息
    await sendTextMessageWithQuickReply(
      replyToken,
      `✅ 已成功建立 Deadline：${deadline.title}`
    );
  }
}

/**
 * 處理逐步輸入 Deadline 的流程
 */
export async function handleAddDeadlineStepByStep(
  context: BotContext,
  step: string,
  userInput: string
): Promise<void> {
  const userId = context.event.source.userId;
  const replyToken = context.event.replyToken;
  if (!userId || !replyToken) return;

  try {
    const state = await userStateService.getState(userId);
    if (!state || state.currentFlow !== "add_deadline_step") {
      return;
    }

    // 記錄用戶輸入到歷史
    await userStateService.addToConversationHistory(userId, "user", userInput);

    const flowData = (state.flowData || {}) as Record<string, any>;
    const currentStep = flowData.step || "type";

    // 處理取消或返回主選單（包括「離開」）
    const cancelKeywords = ["取消", "主選單", "menu", "help", "幫助", "離開"];
    if (cancelKeywords.some(keyword => userInput.includes(keyword))) {
      await userStateService.clearState(userId);
      const replyToken = context.event.replyToken;
      if (replyToken) {
        const cancelMessage = "已取消輸入。";
        await sendTextMessageWithQuickReply(replyToken, cancelMessage);
        // 記錄 Bot 回應到歷史
        await userStateService.addToConversationHistory(userId, "assistant", cancelMessage);
      }
      return;
    }

    // 獲取對話歷史，用於 LLM 理解用戶輸入
    const conversationHistory = await userStateService.getConversationHistory(userId);

    // 先嘗試使用 LLM 理解用戶輸入並更新資料（如果輸入不符合當前步驟）
    let shouldUseLLM = false;

    // 檢查輸入是否符合當前步驟的預期格式
    if (currentStep === "type" && !["考試", "作業", "專題", "其他"].includes(userInput)) {
      shouldUseLLM = true;
    } else if (currentStep === "title" && userInput.length < 2) {
      shouldUseLLM = true;
    } else if (currentStep === "dueDate" && !/(\d{1,2}\/\d{1,2}|\d{4}\/\d{1,2}\/\d{1,2})/.test(userInput)) {
      shouldUseLLM = true;
    } else if (currentStep === "estimatedHours" && !["1", "2", "3", "4", "8"].includes(userInput)) {
      shouldUseLLM = true;
    }

    // 如果輸入不符合預期，使用 LLM 理解
    if (shouldUseLLM) {
      const llmResult = await llmUtilsService.understandAndUpdateDeadlineInFlow(
        userInput,
        currentStep,
        flowData,
        conversationHistory
      );

      // 如果 LLM 成功更新了資料
      if (llmResult.updated && llmResult.data) {
        const updatedData = { ...flowData, ...llmResult.data };
        await userStateService.updateFlowData(userId, updatedData);
        
        // 根據更新後的步驟繼續處理
        const newStep = updatedData.step || currentStep;
        if (newStep !== currentStep) {
          // 步驟已更新，重新獲取狀態並繼續處理下一步
          const updatedState = await userStateService.getState(userId);
          if (updatedState) {
            const updatedFlowData = (updatedState.flowData || {}) as Record<string, any>;
            const nextStep = updatedFlowData.step || newStep;
            
            // 根據新步驟發送對應的提示
            await sendStepPrompt(userId, replyToken, nextStep, updatedFlowData);
            return;
          }
        } else {
          // 步驟沒變，但資料已更新，繼續當前步驟
          const updatedState = await userStateService.getState(userId);
          if (updatedState) {
            const updatedFlowData = (updatedState.flowData || {}) as Record<string, any>;
            await sendStepPrompt(userId, replyToken, currentStep, updatedFlowData);
            return;
          }
        }
      } else if (llmResult.message) {
        // LLM 認為用戶在詢問或聊天，提醒用戶當前需要填寫的資訊
        const reminderMessage = `${llmResult.message}\n\n目前需要填寫：${getStepPrompt(currentStep)}`;
        await context.sendText(reminderMessage);
        await userStateService.addToConversationHistory(userId, "assistant", reminderMessage);
        return;
      }
    }

    // 如果 LLM 沒有更新資料或輸入符合預期，繼續原有的流程處理
    switch (currentStep) {
      case "type": {
        // 選擇類型
        const typeMap: Record<string, "exam" | "assignment" | "project" | "other"> = {
          考試: "exam",
          作業: "assignment",
          專題: "project",
          其他: "other",
        };

        const type = typeMap[userInput] || "other";
        await userStateService.updateFlowData(userId, {
          step: "title",
          type,
        });

        const responseText = "請輸入 Deadline 的名稱：";
        await context.sendText(responseText);
        // 記錄 Bot 回應到歷史
        await userStateService.addToConversationHistory(userId, "assistant", responseText);
        break;
      }

      case "title": {
        // 輸入標題
        await userStateService.updateFlowData(userId, {
          step: "dueDate",
          title: userInput,
        });

        const responseText = "請輸入截止日期（格式：YYYY/MM/DD 或 12/20）：";
        await context.sendText(responseText);
        // 記錄 Bot 回應到歷史
        await userStateService.addToConversationHistory(userId, "assistant", responseText);
        break;
      }

      case "dueDate": {
        // 解析日期時間
        let dueDate: Date | null = null;

        // 嘗試簡單解析（支援日期和時間）
        const dateTimeMatch = userInput.match(/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):?(\d{2})?)?/);
        if (dateTimeMatch) {
          const month = parseInt(dateTimeMatch[1]);
          const day = parseInt(dateTimeMatch[2]);
          // 使用台灣時區的當前年份
          const { getTaiwanNow } = await import("@/lib/utils/date");
          const year = getTaiwanNow().year();
          const hour = dateTimeMatch[3] ? parseInt(dateTimeMatch[3]) : 23;
          const minute = dateTimeMatch[4] ? parseInt(dateTimeMatch[4]) : 59;
          dueDate = parseTaipeiInputToUtc(`${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}T${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`);
        } else {
          // 使用 LLM 解析（支援完整日期時間）
          const parsedDateTime = await llmUtilsService.parseDateFromText(userInput);
          if (parsedDateTime) {
            // parsedDateTime 現在是 YYYY-MM-DDTHH:mm 格式
            dueDate = parseTaipeiInputToUtc(parsedDateTime);
          }
        }

        if (!dueDate || isNaN(dueDate.getTime())) {
          const errorText = "無法解析日期時間，請重新輸入（格式：YYYY/MM/DD HH:mm 或 12/20 18:00）：";
          await sendTextMessageWithQuickReply(replyToken, errorText);
          // 記錄 Bot 回應到歷史
          await userStateService.addToConversationHistory(userId, "assistant", errorText);
          return;
        }

        await userStateService.updateFlowData(userId, {
          step: "estimatedHours",
          dueDate: dueDate.toISOString(),
        });

        const responseText = "請選擇預估時間（小時）：";
        await lineClient.sendQuickReply(
          replyToken,
          responseText,
          [
            { label: "1 小時", text: "1" },
            { label: "2 小時", text: "2" },
            { label: "3 小時", text: "3" },
            { label: "4 小時", text: "4" },
            { label: "8 小時", text: "8" },
            { label: "離開", text: "離開" },
          ]
        );
        // 記錄 Bot 回應到歷史
        await userStateService.addToConversationHistory(userId, "assistant", responseText);
        break;
      }

      case "estimatedHours": {
        // 輸入預估時間
        const hours = parseInt(userInput) || 2;

        await userStateService.updateFlowData(userId, {
          step: "confirm",
          estimatedHours: hours,
        });

        // 顯示確認資訊
        const dueDateObj = new Date(flowData.dueDate);
        const dateStr = dueDateObj.toLocaleDateString("zh-TW");
        const timeStr = dueDateObj.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
        const summary = `請確認以下資訊：\n\n名稱：${flowData.title}\n類型：${flowData.type}\n截止日期時間：${dateStr} ${timeStr}\n預估時間：${hours} 小時`;

        await lineClient.sendQuickReply(
          replyToken,
          summary,
          [
            { label: "確認", text: "確認建立" },
            { label: "取消", text: "取消" },
            { label: "離開", text: "離開" },
          ]
        );
        // 記錄 Bot 回應到歷史
        await userStateService.addToConversationHistory(userId, "assistant", summary);
        break;
      }

      case "confirm": {
        // 確認建立
        if (userInput === "確認建立") {
          await connectDB();
          const user = await User.findOne({ lineUserId: userId });
          if (!user) {
            await context.sendText("找不到使用者資訊，請重新開始。");
            await userStateService.clearState(userId);
            return;
          }

          const deadline = await deadlineService.createDeadline({
            userId,
            title: flowData.title,
            type: flowData.type,
            dueDate: parseTaipeiInputToUtc(flowData.dueDate),
            estimatedHours: flowData.estimatedHours || 2,
          });

          await userStateService.clearState(userId); // clearState 會清除歷史記錄
          
          // 發送排程成功訊息
          await sendScheduleSuccessMessage(userId, replyToken, deadline);
        } else {
          const cancelMessage = "已取消建立。";
          await userStateService.clearState(userId); // clearState 會清除歷史記錄
          await context.sendText(cancelMessage);
        }
        break;
      }
    }
  } catch (error) {
    Logger.error("處理逐步輸入 Deadline 失敗", { error, userId, step });
    await context.sendText("處理時發生錯誤，請稍後再試。");
    await userStateService.clearState(userId);
  }
}

/**
 * 獲取當前步驟的提示訊息
 */
function getStepPrompt(step: string): string {
  const stepPrompts: Record<string, string> = {
    type: "請選擇類型（考試/作業/專題/其他）",
    title: "請輸入 Deadline 的名稱",
    dueDate: "請輸入截止日期（格式：YYYY/MM/DD 或 12/20）",
    estimatedHours: "請選擇預估時間（1/2/3/4/8 小時）",
    confirm: "請確認資訊（確認建立/取消）",
  };
  return stepPrompts[step] || "請按照提示填寫資訊";
}

/**
 * 發送步驟提示訊息
 */
async function sendStepPrompt(
  userId: string,
  replyToken: string,
  step: string,
  flowData: Record<string, any>
): Promise<void> {
  switch (step) {
    case "type": {
      await lineClient.sendQuickReply(
        replyToken,
        "請選擇 Deadline 類型：",
        [
          { label: "考試", text: "考試" },
          { label: "作業", text: "作業" },
          { label: "專題", text: "專題" },
          { label: "其他", text: "其他" },
          { label: "離開", text: "離開" },
        ]
      );
      await userStateService.addToConversationHistory(userId, "assistant", "請選擇 Deadline 類型：");
      break;
    }
    case "title": {
      await lineClient.sendQuickReply(
        replyToken,
        "請輸入 Deadline 的名稱：",
        [
          { label: "離開", text: "離開" },
        ]
      );
      await userStateService.addToConversationHistory(userId, "assistant", "請輸入 Deadline 的名稱：");
      break;
    }
    case "dueDate": {
      await lineClient.sendQuickReply(
        replyToken,
        "請輸入截止日期（格式：YYYY/MM/DD 或 12/20）：",
        [
          { label: "離開", text: "離開" },
        ]
      );
      await userStateService.addToConversationHistory(userId, "assistant", "請輸入截止日期（格式：YYYY/MM/DD 或 12/20）：");
      break;
    }
    case "estimatedHours": {
      await lineClient.sendQuickReply(
        replyToken,
        "請選擇預估時間（小時）：",
        [
          { label: "1 小時", text: "1" },
          { label: "2 小時", text: "2" },
          { label: "3 小時", text: "3" },
          { label: "4 小時", text: "4" },
          { label: "8 小時", text: "8" },
        ]
      );
      await userStateService.addToConversationHistory(userId, "assistant", "請選擇預估時間（小時）：");
      break;
    }
    case "confirm": {
      const summary = `請確認以下資訊：\n\n名稱：${flowData.title}\n類型：${flowData.type}\n截止日期：${new Date(flowData.dueDate).toLocaleDateString("zh-TW")}\n預估時間：${flowData.estimatedHours || 2} 小時`;
      await lineClient.sendQuickReply(
        replyToken,
        summary,
        [
          { label: "確認", text: "確認建立" },
          { label: "取消", text: "取消" },
        ]
      );
      await userStateService.addToConversationHistory(userId, "assistant", summary);
      break;
    }
  }
}

/**
 * 處理一句話輸入 Deadline（NLP 解析）
 */
export async function handleAddDeadlineNLP(
  context: BotContext,
  userInput: string
): Promise<void> {
  const userId = context.event.source.userId;
  const replyToken = context.event.replyToken;
  if (!userId) return;

  try {
    // 處理確認建立（優先處理）
    const confirmNLPMatch = userInput.match(/^確認建立 NLP (.+)$/);
    if (confirmNLPMatch) {
      await handleConfirmNLPDeadline(context, confirmNLPMatch[1]);
      return;
    }

    // 處理切換到逐步填入模式
    if (userInput === "逐步填入" || userInput.includes("逐步填入")) {
      await userStateService.setState(userId, "add_deadline_step", { step: "type" });
      const promptText = "請選擇 Deadline 類型：";
      await lineClient.sendQuickReply(
        replyToken!,
        promptText,
        [
          { label: "考試", text: "考試" },
          { label: "作業", text: "作業" },
          { label: "專題", text: "專題" },
          { label: "其他", text: "其他" },
          { label: "離開", text: "離開" },
        ]
      );
      await userStateService.addToConversationHistory(userId, "assistant", promptText);
      return;
    }

    // 處理取消或返回主選單（包括「離開」）
    const cancelKeywords = ["取消", "主選單", "menu", "help", "幫助", "離開"];
    if (cancelKeywords.some(keyword => userInput.includes(keyword))) {
      await userStateService.clearState(userId);
      if (replyToken) {
        const cancelMessage = "已取消輸入。";
        await sendTextMessageWithQuickReply(replyToken, cancelMessage);
        await userStateService.addToConversationHistory(userId, "assistant", cancelMessage);
      }
      return;
    }

    // 記錄用戶輸入到歷史
    await userStateService.addToConversationHistory(userId, "user", userInput);

    // 獲取對話歷史和當前狀態
    const conversationHistory = await userStateService.getConversationHistory(userId);
    const state = await userStateService.getState(userId);
    const flowData = (state?.flowData || {}) as Record<string, any>;
    
    // 如果已經有部分解析的資料，使用 LLM 來更新資料（理解用戶的修正）
    if (flowData.title || flowData.type || flowData.dueDate) {
      // 使用 LLM 理解用戶的修正或補充
      const llmResult = await llmUtilsService.understandAndUpdateDeadlineInFlow(
        userInput,
        "confirm", // 當前處於確認階段
        flowData,
        conversationHistory
      );

      if (llmResult.updated && llmResult.data) {
        // 更新資料
        const updatedData = { ...flowData, ...llmResult.data };
        await userStateService.updateFlowData(userId, updatedData);
        
        // 如果更新了日期，重新顯示確認資訊
        if (updatedData.dueDate) {
          const dateStr = new Date(updatedData.dueDate).toLocaleDateString("zh-TW");
          const summary = `已更新！以下是修正後的資訊：\n\n名稱：${updatedData.title || flowData.title}\n類型：${updatedData.type || flowData.type}\n截止日期：${dateStr}\n預估時間：${updatedData.estimatedHours || flowData.estimatedHours || 2} 小時`;
          
          if (replyToken) {
            await lineClient.sendQuickReply(
              replyToken,
              summary,
              [
                { label: "確認", text: `確認建立 NLP ${updatedData.title || flowData.title}|${updatedData.type || flowData.type}|${updatedData.dueDate}|${updatedData.estimatedHours || flowData.estimatedHours || 2}` },
                { label: "重填", text: "輸入 Deadline" },
                { label: "離開", text: "離開" },
              ]
            );
            await userStateService.addToConversationHistory(userId, "assistant", summary);
          }
          return;
        }
      } else if (llmResult.message) {
        // LLM 無法理解，提示用戶
        const reminderMessage = `${llmResult.message}\n\n請告訴我正確的資訊，或點擊「逐步填入」改用逐步模式。`;
        if (replyToken) {
          await lineClient.sendQuickReply(
            replyToken,
            reminderMessage,
            [
              { label: "逐步填入", text: "逐步填入" },
              { label: "離開", text: "離開" },
            ]
          );
          await userStateService.addToConversationHistory(userId, "assistant", reminderMessage);
        }
        return;
      }
    }
    
    // 如果沒有部分資料，使用 LLM 解析完整輸入
    const parsed = await llmUtilsService.parseDeadlineFromText(userInput, conversationHistory);

    if (!parsed || !parsed.title) {
      if (replyToken) {
        const errorMessage = "無法解析你的輸入，請改用逐步填入模式，或重新輸入更清楚的描述。";
        await lineClient.sendQuickReply(
          replyToken,
          errorMessage,
          [
            { label: "逐步填入", text: "逐步填入" },
            { label: "離開", text: "離開" },
          ]
        );
        // 記錄 Bot 回應到歷史
        await userStateService.addToConversationHistory(userId, "assistant", errorMessage);
      }
      return;
    }

    // 如果日期無法解析，提示使用者（保持 NLP 流程狀態）
    if (!parsed.dueDate) {
      const replyToken = context.event.replyToken;
      if (replyToken) {
        const datePromptMessage = "無法從你的描述中確定日期，請輸入日期（格式：YYYY/MM/DD 或 12/20）：";
        await lineClient.sendQuickReply(
          replyToken,
          datePromptMessage,
          [
            { label: "離開", text: "離開" },
          ]
        );
        // 記錄 Bot 回應到歷史
        await userStateService.addToConversationHistory(userId, "assistant", datePromptMessage);
      }
      // 儲存已解析的資料，切換到逐步輸入模式等待日期輸入
      await userStateService.setState(userId, "add_deadline_step", {
        step: "dueDate",
        title: parsed.title,
        type: parsed.type,
        estimatedHours: parsed.estimatedHours,
      });
      return;
    }

    // 儲存解析的資料到 flowData，以便後續修正
    await userStateService.updateFlowData(userId, {
      title: parsed.title,
      type: parsed.type,
      dueDate: parsed.dueDate,
      estimatedHours: parsed.estimatedHours,
    });

    // 顯示確認資訊
    const dueDateObj = new Date(parsed.dueDate);
    const dateStr = dueDateObj.toLocaleDateString("zh-TW");
    const timeStr = dueDateObj.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
    const summary = `我解析到以下資訊：\n\n名稱：${parsed.title}\n類型：${parsed.type}\n截止日期時間：${dateStr} ${timeStr}\n預估時間：${parsed.estimatedHours} 小時`;

    if (replyToken) {
      await lineClient.sendQuickReply(
        replyToken,
        summary,
        [
          { label: "確認", text: `確認建立 NLP ${parsed.title}|${parsed.type}|${parsed.dueDate}|${parsed.estimatedHours}` },
          { label: "重填", text: "輸入 Deadline" },
          { label: "離開", text: "離開" },
        ]
      );
      // 記錄 Bot 回應到歷史
      await userStateService.addToConversationHistory(userId, "assistant", summary);
    }
  } catch (error) {
    Logger.error("處理 NLP 輸入 Deadline 失敗", { error, userId });
    await context.sendText("處理時發生錯誤，請稍後再試。");
  }
}

/**
 * 處理確認建立 Deadline（從 NLP 解析）
 */
export async function handleConfirmNLPDeadline(
  context: BotContext,
  dataString: string
): Promise<void> {
  const userId = context.event.source.userId;
  const replyToken = context.event.replyToken;
  if (!userId) return;

  try {
    const [title, type, dueDateStr, estimatedHoursStr] = dataString.split("|");
    // dueDateStr 現在可能是 YYYY-MM-DDTHH:mm 格式或 ISO 字串
    let dueDate: Date;
    if (dueDateStr.includes("T")) {
      dueDate = parseTaipeiInputToUtc(dueDateStr);
    } else {
      // 如果只有日期，加上時間 23:59
      dueDate = parseTaipeiInputToUtc(dueDateStr);
    }
    const estimatedHours = parseInt(estimatedHoursStr) || 2;

    if (isNaN(dueDate.getTime())) {
      if (replyToken) {
        await sendTextMessageWithQuickReply(replyToken, "日期時間格式錯誤，請重新輸入。");
      }
      return;
    }

    await connectDB();
    const user = await User.findOne({ lineUserId: userId });
    if (!user) {
      await context.sendText("找不到使用者資訊，請重新開始。");
      return;
    }

    const deadline = await deadlineService.createDeadline({
      userId,
      title,
      type: type as any,
      dueDate,
      estimatedHours,
    });

    await userStateService.clearState(userId); // clearState 會清除歷史記錄
    
    // 發送排程成功訊息
    if (replyToken) {
      await sendScheduleSuccessMessage(userId, replyToken, deadline);
    }
  } catch (error) {
    Logger.error("確認建立 NLP Deadline 失敗", { error, userId });
    await context.sendText("建立時發生錯誤，請稍後再試。");
  }
}

/**
 * 處理修改 Deadline
 */
export async function handleEditDeadline(
  context: BotContext,
  deadlineId: string,
  field?: string,
  newValue?: string
): Promise<void> {
  const userId = context.event.source.userId;
  const replyToken = context.event.replyToken;
  if (!userId) return;

  try {
    const deadline = await deadlineService.getDeadlineById(deadlineId);
    if (!deadline) {
      await context.sendText("找不到這個 Deadline。");
      return;
    }

    // 檢查是否為該使用者的 Deadline
    await connectDB();
    const user = await User.findOne({ lineUserId: userId });
    if (!user || deadline.userId.toString() !== user._id.toString()) {
      await context.sendText("你沒有權限修改這個 Deadline。");
      return;
    }

    if (!field) {
      // 詢問要修改哪一項
      if (replyToken) {
        await lineClient.sendQuickReply(
          replyToken,
          "你想修改哪一項？",
          [
            { label: "名稱", text: `修改 Deadline ${deadlineId} 名稱` },
            { label: "截止日期", text: `修改 Deadline ${deadlineId} 日期` },
            { label: "預估時間", text: `修改 Deadline ${deadlineId} 時間` },
            { label: "類別", text: `修改 Deadline ${deadlineId} 類別` },
          ]
        );
      }
      return;
    }

    // 處理修改
    if (field === "名稱" && newValue) {
      await deadlineService.updateDeadline(deadlineId, { title: newValue });
      await context.sendText(`✅ 已更新名稱：${newValue}`);
    } else if (field === "日期" && newValue) {
      const parsedDateTime = await llmUtilsService.parseDateFromText(newValue);
      if (!parsedDateTime) {
        if (replyToken) {
          await sendTextMessageWithQuickReply(replyToken, "無法解析日期時間，請重新輸入。");
        }
        return;
      }
      const dueDateObj = parseTaipeiInputToUtc(parsedDateTime);
      await deadlineService.updateDeadline(deadlineId, {
        dueDate: dueDateObj,
      });
      const dateStr = dueDateObj.toLocaleDateString("zh-TW");
      const timeStr = dueDateObj.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
      if (replyToken) {
        await sendTextMessageWithQuickReply(replyToken, `✅ 已更新截止日期時間：${dateStr} ${timeStr}`);
      }
    } else if (field === "時間" && newValue) {
      const hours = parseInt(newValue) || 2;
      await deadlineService.updateDeadline(deadlineId, { estimatedHours: hours });
      await context.sendText(`✅ 已更新預估時間：${hours} 小時`);
    } else if (field === "類別" && newValue) {
      const typeMap: Record<string, "exam" | "assignment" | "project" | "other"> = {
        考試: "exam",
        作業: "assignment",
        專題: "project",
        其他: "other",
      };
      const type = typeMap[newValue] || "other";
      await deadlineService.updateDeadline(deadlineId, { type });
      await context.sendText(`✅ 已更新類別：${newValue}`);
    } else {
      // 等待使用者輸入新值
      await userStateService.setState(userId, "edit_deadline", {
        deadlineId,
        field,
      });
      const replyToken = context.event.replyToken;
      if (replyToken) {
        await sendTextMessageWithQuickReply(replyToken, `請輸入新的${field}：`);
      }
    }
  } catch (error) {
    Logger.error("處理修改 Deadline 失敗", { error, userId, deadlineId });
    await context.sendText("處理時發生錯誤，請稍後再試。");
  }
}

/**
 * 處理刪除 Deadline
 */
export async function handleDeleteDeadline(
  context: BotContext,
  deadlineId: string
): Promise<void> {
  const userId = context.event.source.userId;
  if (!userId) return;

  try {
    const deadline = await deadlineService.getDeadlineById(deadlineId);
    if (!deadline) {
      await context.sendText("找不到這個 Deadline。");
      return;
    }

    // 檢查是否為該使用者的 Deadline
    await connectDB();
    const user = await User.findOne({ lineUserId: userId });
    if (!user || deadline.userId.toString() !== user._id.toString()) {
      await context.sendText("你沒有權限刪除這個 Deadline。");
      return;
    }

    await deadlineService.deleteDeadline(deadlineId);
    await context.sendText(`✅ 已刪除 Deadline：${deadline.title}`);
  } catch (error) {
    Logger.error("處理刪除 Deadline 失敗", { error, userId, deadlineId });
    await context.sendText("刪除時發生錯誤，請稍後再試。");
  }
}

/**
 * 處理標記 Deadline 為完成
 */
export async function handleMarkDeadlineDone(
  context: BotContext,
  deadlineId: string
): Promise<void> {
  const userId = context.event.source.userId;
  if (!userId) return;

  try {
    const deadline = await deadlineService.getDeadlineById(deadlineId);
    if (!deadline) {
      await context.sendText("找不到這個 Deadline。");
      return;
    }

    // 檢查是否為該使用者的 Deadline
    await connectDB();
    const user = await User.findOne({ lineUserId: userId });
    if (!user || deadline.userId.toString() !== user._id.toString()) {
      await context.sendText("你沒有權限修改這個 Deadline。");
      return;
    }

    await deadlineService.markAsDone(deadlineId);
    await context.sendText(`✅ 已標記完成：${deadline.title}`);
  } catch (error) {
    Logger.error("處理標記 Deadline 完成失敗", { error, userId, deadlineId });
    await context.sendText("處理時發生錯誤，請稍後再試。");
  }
}

