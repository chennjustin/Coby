import { BotContext } from "@/types/bot";
import { UserDeletionService } from "@/services/user/user-deletion.service";
import { Logger } from "@/lib/utils/logger";

const userDeletionService = new UserDeletionService();

/**
 * 處理用戶取消關注或封鎖 Bot 的事件
 */
export async function handleUnfollow(context: BotContext) {
  try {
    const userId = context.event.source.userId;

    if (!userId) {
      Logger.warn("No userId in unfollow event");
      return;
    }

    // 刪除用戶的所有資料
    const result = await userDeletionService.deleteAllUserData(userId);

    Logger.info("處理取消關注事件", {
      userId,
      deleted: result.deleted,
    });
  } catch (error) {
    Logger.error("處理取消關注事件時發生錯誤", { error, userId: context.event.source.userId });
    // 不拋出錯誤，因為用戶已經取消關注，無法發送錯誤訊息
  }
}

