import { DeadlineService } from "@/services/deadline/deadline.service";
import { StudyBlockService } from "@/services/study-block/study-block.service";
import { PreferenceExtractorService, UserPreferences } from "@/services/llm/preference-extractor.service";
import { UserStateService } from "@/services/user-state/user-state.service";
import { Logger } from "@/lib/utils/logger";
import { IDeadline } from "@/models/Deadline";
import { IStudyBlock } from "@/models/StudyBlock";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

export class DeadlineRescheduleService {
  private deadlineService: DeadlineService;
  private studyBlockService: StudyBlockService;
  private preferenceExtractor: PreferenceExtractorService;
  private userStateService: UserStateService;

  constructor() {
    this.deadlineService = new DeadlineService();
    this.studyBlockService = new StudyBlockService();
    this.preferenceExtractor = new PreferenceExtractorService();
    this.userStateService = new UserStateService();
  }

  /**
   * 檢查是否需要重新排程（基於用戶偏好）
   * @param text 用戶輸入的文字
   * @param deadlines 用戶的所有 deadlines
   * @param studyBlocks 用戶的所有 study blocks
   * @returns 需要重新排程的 deadline 列表
   */
  async checkAndRescheduleIfNeeded(
    text: string,
    userId: string,
    deadlines: IDeadline[],
    studyBlocks: IStudyBlock[]
  ): Promise<{ rescheduled: IDeadline[]; message: string }> {
    try {
      // 提取偏好（從當前文字和對話歷史）
      const conversationHistory = await this.userStateService.getConversationHistory(userId);
      const preferences = await this.preferenceExtractor.extractPreferences(
        conversationHistory.map((item) => ({
          role: item.role,
          content: item.content,
        })),
        text
      );
      
      // 如果沒有提取到偏好，不需要重新排程
      if (!preferences.excludeHours && !preferences.preferHours && !preferences.excludeDays && !preferences.maxHoursPerDay) {
        return { rescheduled: [], message: "" };
      }

      // 檢查哪些 deadline 的 study blocks 違反了偏好
      const deadlinesToReschedule: IDeadline[] = [];
      const violations: Array<{ deadline: IDeadline; blocks: IStudyBlock[] }> = [];

      for (const deadline of deadlines) {
        const deadlineBlocks = studyBlocks.filter(
          (b) => b.deadlineId.toString() === deadline._id.toString()
        );

        // 檢查是否有 blocks 違反偏好
        const violatingBlocks = deadlineBlocks.filter((block) => {
          const startTime = dayjs(block.startTime).tz("Asia/Taipei");
          const startHour = startTime.hour();
          const endHour = dayjs(block.endTime).tz("Asia/Taipei").hour();
          const blockDate = startTime.format("YYYY-MM-DD");

          // 檢查是否在排除日期
          if (preferences.excludeDays && preferences.excludeDays.includes(blockDate)) {
            return true;
          }

          // 檢查是否在排除時段
          if (preferences.excludeHours) {
            for (let h = startHour; h < endHour; h++) {
              if (preferences.excludeHours.includes(h)) {
                return true;
              }
            }
          }

          return false;
        });

        if (violatingBlocks.length > 0) {
          deadlinesToReschedule.push(deadline);
          violations.push({ deadline, blocks: violatingBlocks });
        }
      }

      // 如果沒有違反的 deadline，不需要重新排程
      if (deadlinesToReschedule.length === 0) {
        return { rescheduled: [], message: "" };
      }

      // 重新排程所有違反偏好的 deadlines
      const rescheduledDeadlines: IDeadline[] = [];
      for (const deadline of deadlinesToReschedule) {
        try {
          // 刪除舊的 study blocks
          await this.studyBlockService.deleteStudyBlocksByDeadline(
            deadline._id.toString()
          );

          // 重新排程（不改變 deadline 本身，只重新排程）
          // 使用 updateDeadlineAndReschedule 重新排程（傳入空更新，只重新排程，並傳遞偏好設定）
          const updatedDeadline = await this.deadlineService.updateDeadlineAndReschedule(
            deadline._id.toString(),
            {}, // 不更新 deadline 本身
            userId,
            preferences // 傳遞提取的偏好設定
          );

          if (updatedDeadline) {
            rescheduledDeadlines.push(updatedDeadline);
          }
        } catch (error) {
          Logger.error("重新排程 deadline 失敗", {
            error,
            deadlineId: deadline._id,
          });
        }
      }

      // 構建訊息
      let message = "";
      if (rescheduledDeadlines.length > 0) {
        const deadlineNames = rescheduledDeadlines.map((d) => d.title).join("、");
        message = `✅ 已根據你的偏好重新安排「${deadlineNames}」的學習時間！\n\n`;
        
        const preferenceParts: string[] = [];
        
        if (preferences.excludeDays && preferences.excludeDays.length > 0) {
          const excludeDaysStr = preferences.excludeDays
            .map((d) => dayjs(d).format("M月D日"))
            .join("、");
          preferenceParts.push(`已排除 ${excludeDaysStr} 的時段`);
        }
        
        if (preferences.excludeHours) {
          const excludeHoursStr = preferences.excludeHours
            .filter((h) => h >= 0 && h <= 11)
            .length > 0
            ? "早上"
            : preferences.excludeHours.filter((h) => h >= 12 && h <= 17).length > 0
            ? "下午"
            : "晚上";
          preferenceParts.push(`已排除${excludeHoursStr}時段`);
        }
        
        if (preferenceParts.length > 0) {
          message += preferenceParts.join("，") + "，保持總時數不變。";
        }
      }

      return { rescheduled: rescheduledDeadlines, message };
    } catch (error) {
      Logger.error("檢查並重新排程失敗", { error, userId });
      return { rescheduled: [], message: "" };
    }
  }
}

