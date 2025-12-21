import { Logger } from "@/lib/utils/logger";
import { LLMScheduleResult, LLMScheduleBlock } from "@/services/llm/scheduler-llm.service";
import { UserPreferences } from "@/services/llm/preference-extractor.service";
import { IDeadline } from "@/models/Deadline";
import { IStudyBlock } from "@/models/StudyBlock";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

const SCHEDULE_CONFIG = {
  FORBIDDEN_HOURS: [
    { start: 0, end: 8 }, // 00:00-08:00
    { start: 23, end: 24 }, // 23:00-24:00
  ],
  MAX_HOURS_PER_DAY: 4,
  MAX_BLOCKS_PER_DAY: 2,
};

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class ScheduleValidatorService {
  /**
   * 驗證 LLM 返回的排程結果
   */
  validateSchedule(
    scheduleResult: LLMScheduleResult,
    deadline: IDeadline,
    existingStudyBlocks: IStudyBlock[],
    preferences: UserPreferences
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const now = dayjs().tz("Asia/Taipei");
    const dueDate = dayjs(deadline.dueDate).tz("Asia/Taipei");

    // 1. 驗證總時數
    const totalHours = scheduleResult.blocks.reduce(
      (sum, block) => sum + block.duration,
      0
    );
    if (totalHours !== deadline.estimatedHours) {
      errors.push(
        `總時數不符合：預估 ${deadline.estimatedHours} 小時，實際安排 ${totalHours} 小時`
      );
    }

    if (scheduleResult.totalHours !== totalHours) {
      errors.push(
        `totalHours 欄位與實際計算不符：聲稱 ${scheduleResult.totalHours} 小時，實際 ${totalHours} 小時`
      );
    }

    // 2. 驗證每個 block
    const blocksByDate = new Map<string, LLMScheduleBlock[]>();
    scheduleResult.blocks.forEach((block, index) => {
      // 驗證 blockIndex
      if (block.blockIndex !== index + 1) {
        errors.push(
          `Block ${index + 1} 的 blockIndex 錯誤：應為 ${index + 1}，實際為 ${block.blockIndex}`
        );
      }

      // 驗證 totalBlocks
      if (block.totalBlocks !== scheduleResult.blocks.length) {
        errors.push(
          `Block ${index + 1} 的 totalBlocks 錯誤：應為 ${scheduleResult.blocks.length}，實際為 ${block.totalBlocks}`
        );
      }

      // 驗證日期時間格式
      let startTime: dayjs.Dayjs;
      let endTime: dayjs.Dayjs;
      try {
        startTime = dayjs(block.startTime);
        endTime = dayjs(block.endTime);
      } catch (error) {
        errors.push(`Block ${index + 1} 的時間格式錯誤：${block.startTime}`);
        return;
      }

      // 驗證 duration
      const actualDuration = endTime.diff(startTime, "hour", true);
      if (Math.abs(actualDuration - block.duration) > 0.1) {
        errors.push(
          `Block ${index + 1} 的 duration 錯誤：聲稱 ${block.duration} 小時，實際 ${actualDuration.toFixed(1)} 小時`
        );
      }

      // 驗證是否在過去
      if (startTime.isBefore(now)) {
        errors.push(
          `Block ${index + 1} 的時間在過去：${startTime.format("YYYY-MM-DD HH:mm")}`
        );
      }

      // 驗證是否在截止日期之後
      if (startTime.isAfter(dueDate)) {
        errors.push(
          `Block ${index + 1} 的時間在截止日期之後：${startTime.format("YYYY-MM-DD HH:mm")}`
        );
      }

      // 驗證禁止時段（檢查 block 是否與禁止時段重疊）
      SCHEDULE_CONFIG.FORBIDDEN_HOURS.forEach(({ start, end }) => {
        const forbiddenStart = startTime.startOf("day").add(start, "hour");
        const forbiddenEnd = startTime.startOf("day").add(end, "hour");
        
        // 檢查是否有重疊：block 的開始時間在禁止時段結束之前，且 block 的結束時間在禁止時段開始之後
        if (startTime.isBefore(forbiddenEnd) && endTime.isAfter(forbiddenStart)) {
          errors.push(
            `Block ${index + 1} 跨越禁止時段：${start}:00-${end}:00（時間：${startTime.format("YYYY-MM-DD HH:mm")} - ${endTime.format("HH:mm")}）`
          );
        }
      });

      // 驗證時間偏好
      if (preferences.excludeHours) {
        const startHour = startTime.hour();
        const endHour = endTime.hour();
        for (let h = startHour; h < endHour; h++) {
          if (preferences.excludeHours.includes(h)) {
            errors.push(
              `Block ${index + 1} 違反用戶偏好：包含排除時段 ${h}:00`
            );
          }
        }
      }

      // 按日期分組
      const dateKey = startTime.format("YYYY-MM-DD");
      if (!blocksByDate.has(dateKey)) {
        blocksByDate.set(dateKey, []);
      }
      blocksByDate.get(dateKey)!.push(block);
    });

    // 3. 驗證每天限制
    blocksByDate.forEach((blocks, dateKey) => {
      const dailyHours = blocks.reduce((sum, b) => sum + b.duration, 0);
      const dailyBlocks = blocks.length;

      if (dailyHours > SCHEDULE_CONFIG.MAX_HOURS_PER_DAY) {
        errors.push(
          `${dateKey} 超過每天最大時數：${dailyHours} 小時（限制：${SCHEDULE_CONFIG.MAX_HOURS_PER_DAY} 小時）`
        );
      }

      if (dailyBlocks > SCHEDULE_CONFIG.MAX_BLOCKS_PER_DAY) {
        errors.push(
          `${dateKey} 超過每天最大 blocks：${dailyBlocks} 個（限制：${SCHEDULE_CONFIG.MAX_BLOCKS_PER_DAY} 個）`
        );
      }
    });

    // 4. 驗證與現有行程衝突
    scheduleResult.blocks.forEach((block, index) => {
      const blockStart = dayjs(block.startTime);
      const blockEnd = dayjs(block.endTime);

      existingStudyBlocks.forEach((existing) => {
        const existingStart = dayjs(existing.startTime);
        const existingEnd = dayjs(existing.endTime);

        // 檢查時間重疊
        if (
          (blockStart.isBefore(existingEnd) && blockEnd.isAfter(existingStart))
        ) {
          errors.push(
            `Block ${index + 1} 與現有行程衝突：${existing.title}（${existingStart.format("YYYY-MM-DD HH:mm")} - ${existingEnd.format("HH:mm")}）`
          );
        }
      });
    });

    // 5. 驗證排除日期
    if (preferences.excludeDays) {
      scheduleResult.blocks.forEach((block, index) => {
        const dateKey = dayjs(block.startTime).format("YYYY-MM-DD");
        if (preferences.excludeDays!.includes(dateKey)) {
          errors.push(
            `Block ${index + 1} 違反用戶偏好：安排在排除日期 ${dateKey}`
          );
        }
      });
    }

    // 6. 驗證每天最大時數偏好
    if (preferences.maxHoursPerDay) {
      blocksByDate.forEach((blocks, dateKey) => {
        const dailyHours = blocks.reduce((sum, b) => sum + b.duration, 0);
        if (dailyHours > preferences.maxHoursPerDay!) {
          warnings.push(
            `${dateKey} 超過用戶偏好的每天最大時數：${dailyHours} 小時（偏好：${preferences.maxHoursPerDay} 小時）`
          );
        }
      });
    }

    const isValid = errors.length === 0;

    if (!isValid) {
      Logger.warn("排程驗證失敗", {
        deadlineId: deadline._id,
        errors,
        warnings,
      });
    }

    return {
      isValid,
      errors,
      warnings,
    };
  }
}

