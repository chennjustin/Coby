import { BotContext } from "@/types/bot";
import { ChatService } from "@/services/llm/chat.service";
import { UserStateService } from "@/services/user-state/user-state.service";
import { Logger } from "@/lib/utils/logger";
import connectDB from "@/lib/db/mongoose";
import User from "@/models/User";
import Deadline from "@/models/Deadline";
import { StudyBlockService } from "@/services/study-block/study-block.service";
import { sendTextMessageWithQuickReply } from "../utils";

const userStateService = new UserStateService();

export async function handleDefaultChat(context: BotContext, userId: string, text: string, replyToken: string) {
  try {
    let chatService: ChatService;
    try {
      chatService = new ChatService();
    } catch (initError) {
      const errMsg = initError instanceof Error ? initError.message : String(initError);
      Logger.error("ChatService 初始化失敗", { error: initError });
      await sendTextMessageWithQuickReply(replyToken, `系統錯誤：${errMsg}\n\n請檢查環境變數設定。`);
      return;
    }
    const conversationHistory = await userStateService.getConversationHistory(userId);
    const history = conversationHistory.map((item) => ({ role: item.role, content: item.content }));

    await connectDB();
    const user = await User.findOne({ lineUserId: userId });
    let userData: {
      deadlines?: Array<{ title: string; dueDate: string; estimatedHours: number; type: string; id: string }>;
      studyBlocks?: Array<{ title: string; startTime: string; endTime: string; duration: number; deadlineId: string; deadlineTitle?: string; deadlineEstimatedHours?: number }>;
    } = {};

    if (user) {
      const deadlines = await Deadline.find({ userId: user._id, status: "pending" }).sort({ dueDate: 1 }).limit(20).exec();
      userData.deadlines = deadlines.map((d) => ({
        id: d._id.toString(),
        title: d.title,
        dueDate: d.dueDate.toISOString(),
        estimatedHours: d.estimatedHours,
        type: d.type,
      }));
      const studyBlockService = new StudyBlockService();
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 60);
      const studyBlocks = await studyBlockService.getStudyBlocksByUser(userId, sixtyDaysAgo, futureDate);
      userData.studyBlocks = studyBlocks.map((b) => {
        const deadline = deadlines.find((d) => d._id.toString() === b.deadlineId.toString());
        return {
          title: b.title,
          startTime: b.startTime.toISOString(),
          endTime: b.endTime.toISOString(),
          duration: b.duration,
          deadlineId: b.deadlineId.toString(),
          deadlineTitle: deadline?.title || "未知",
          deadlineEstimatedHours: deadline?.estimatedHours || 0,
        };
      });
    }

    await userStateService.addToConversationHistory(userId, "user", text);

    let rescheduleMessage = "";
    if (user) {
      const { DeadlineRescheduleService } = await import("@/services/deadline/deadline-reschedule.service");
      const rescheduleService = new DeadlineRescheduleService();
      const studyBlockService = new StudyBlockService();
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 60);
      const deadlines = await Deadline.find({ userId: user._id, status: "pending" }).exec();
      const studyBlocks = await studyBlockService.getStudyBlocksByUser(userId, sixtyDaysAgo, futureDate);
      const rescheduleResult = await rescheduleService.checkAndRescheduleIfNeeded(text, userId, deadlines, studyBlocks);
      if (rescheduleResult.rescheduled.length > 0 && rescheduleResult.message) {
        rescheduleMessage = rescheduleResult.message;
      }
    }

    const response = await chatService.generateResponse(text, history, userData);
    await userStateService.addToConversationHistory(userId, "assistant", response);
    let finalResponse = response;
    if (rescheduleMessage) finalResponse = rescheduleMessage + "\n\n" + response;
    await sendTextMessageWithQuickReply(replyToken, finalResponse);
  } catch (error) {
    Logger.error("處理預設聊天失敗", { error, userId });
    await sendTextMessageWithQuickReply(replyToken, "處理訊息時發生錯誤，請稍後再試。");
  }
}
