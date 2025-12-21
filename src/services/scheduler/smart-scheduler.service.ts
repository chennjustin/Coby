import connectDB from "@/lib/db/mongoose";
import { IDeadline } from "@/models/Deadline";
import { IStudyBlock } from "@/models/StudyBlock";
import StudyBlock from "@/models/StudyBlock";
import User from "@/models/User";
import { Logger } from "@/lib/utils/logger";
import mongoose from "mongoose";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

// 排程規則配置
const SCHEDULE_CONFIG = {
  // 禁止時段（小時）
  FORBIDDEN_HOURS: [
    { start: 0, end: 8 }, // 00:00-08:00
    { start: 23, end: 24 }, // 23:00-24:00
  ],
  // 晚餐時段（可選）
  DINNER_HOURS: { start: 18, end: 19 }, // 18:00-19:00
  // 睡覺時段（僅允許 1hr block）
  SLEEP_HOURS: { start: 21, end: 23 }, // 21:00-23:00
  // 每天最大讀書時間（小時）
  MAX_HOURS_PER_DAY: 4,
  // 每天最多 blocks 數量
  MAX_BLOCKS_PER_DAY: 2,
};

export interface ScheduleResult {
  blocks: Array<{
    userId: mongoose.Types.ObjectId;
    deadlineId: mongoose.Types.ObjectId;
    date: Date;
    startTime: Date;
    endTime: Date;
    duration: number;
    title: string;
    blockIndex: number;
    totalBlocks: number;
    status: "pending";
  }>;
  warning?: string; // 時間不足的警告訊息
}

export interface SchedulePreferences {
  excludeHours?: number[]; // 排除的小時 [0-23]
  preferHours?: number[]; // 偏好的小時
  excludeDays?: string[]; // 排除的日期（格式：YYYY-MM-DD）
  maxHoursPerDay?: number; // 每天最大時數（覆蓋預設值）
}

export class SmartSchedulerService {
  /**
   * 為一個 Deadline 自動排程（支援偏好）
   */
  async scheduleDeadline(
    deadline: IDeadline,
    userId: string,
    preferences?: SchedulePreferences
  ): Promise<ScheduleResult> {
    try {
      await connectDB();

      // 取得使用者資訊
      const user = await User.findById(deadline.userId);
      if (!user) {
        throw new Error("User not found");
      }

      const estimatedHours = deadline.estimatedHours;
      const dueDate = dayjs(deadline.dueDate).tz("Asia/Taipei");
      const now = dayjs().tz("Asia/Taipei");

      // STEP 1: 計算可用時間區間（使用 user._id 而不是 lineUserId）
      const availableSlots = await this.calculateAvailableSlots(
        user._id.toString(),
        now.toDate(),
        dueDate.toDate(),
        preferences
      );

      // STEP 2: 拆分任務
      const blockDurations = this.splitTask(estimatedHours);

      // STEP 3: 往前回推排程
      const scheduledBlocks = this.scheduleBlocks(
        deadline,
        blockDurations,
        availableSlots,
        dueDate,
        now,
        preferences
      );

      // STEP 4: 檢查時間是否足夠
      const totalScheduledHours = scheduledBlocks.reduce((sum, block) => sum + block.duration, 0);
      let warning: string | undefined;

      if (totalScheduledHours < estimatedHours) {
        warning = `⚠️ 你這份作業需要 ${estimatedHours} 小時，但從現在到截止日剩 ${totalScheduledHours} 小時的可排時間。我幫你排了 ${totalScheduledHours} 小時，其餘部分請手動調整或重新分配 🙏`;
      }

      return {
        blocks: scheduledBlocks,
        warning,
      };
    } catch (error) {
      Logger.error("排程失敗", { error, deadlineId: deadline._id });
      throw error;
    }
  }

  /**
   * 計算可用時間區間（公開方法，供 LLM 排程服務使用）
   */
  async calculateAvailableSlots(
    userId: string, // ObjectId string
    startDate: Date,
    endDate: Date,
    preferences?: SchedulePreferences
  ): Promise<Map<string, boolean[]>> {
    // 取得該使用者在此時間範圍內的所有 blocks
    const existingBlocks = await StudyBlock.find({
      userId: userId,
      startTime: {
        $gte: startDate,
        $lte: endDate,
      },
    }).exec();

    // 建立可用時間地圖：date -> hour[] (true = 可用, false = 不可用)
    const availableSlots = new Map<string, boolean[]>();
    const start = dayjs(startDate).tz("Asia/Taipei");
    const end = dayjs(endDate).tz("Asia/Taipei");

    let current = start.startOf("day");
    while (current.isBefore(end) || current.isSame(end, "day")) {
      const dateKey = current.format("YYYY-MM-DD");
      const hours = new Array(24).fill(true);

      // 標記禁止時段
      SCHEDULE_CONFIG.FORBIDDEN_HOURS.forEach(({ start: hStart, end: hEnd }) => {
        for (let h = hStart; h < hEnd; h++) {
          hours[h] = false;
        }
      });

      // 標記今天已過的時間（精確到分鐘）
      const now = dayjs().tz("Asia/Taipei");
      if (current.isSame(now, "day")) {
        const currentHour = now.hour();
        const currentMinute = now.minute();
        // 標記已過的小時（完全過去的時間）
        for (let h = 0; h < currentHour; h++) {
          hours[h] = false;
        }
        // 如果當前小時已經開始（即使只有1分鐘），標記為不可用
        // 這是為了確保不會排程到「現在」或「過去」的時間
        if (currentMinute >= 0) {
          hours[currentHour] = false;
        }
      }

      // 標記已存在的 blocks
      existingBlocks.forEach((block) => {
        const blockDate = dayjs(block.startTime).tz("Asia/Taipei");
        if (blockDate.isSame(current, "day")) {
          const blockStartHour = blockDate.hour();
          const blockEndHour = dayjs(block.endTime).tz("Asia/Taipei").hour();
          for (let h = blockStartHour; h < blockEndHour; h++) {
            hours[h] = false;
          }
        }
      });

      // 標記用戶偏好的排除時段
      if (preferences?.excludeHours && preferences.excludeHours.length > 0) {
        preferences.excludeHours.forEach((h) => {
          if (h >= 0 && h < 24) {
            hours[h] = false;
          }
        });
      }

      // 標記排除的日期
      if (preferences?.excludeDays && preferences.excludeDays.includes(dateKey)) {
        // 將整天的時間都標記為不可用
        for (let h = 0; h < 24; h++) {
          hours[h] = false;
        }
      }

      availableSlots.set(dateKey, hours);
      current = current.add(1, "day");
    }

    return availableSlots;
  }

  /**
   * 拆分任務
   */
  private splitTask(totalHours: number): number[] {
    if (totalHours <= 2) {
      return [totalHours];
    } else if (totalHours <= 4) {
      return [2, totalHours - 2];
    } else if (totalHours <= 8) {
      // 拆成多個 2hr blocks
      const blocks: number[] = [];
      let remaining = totalHours;
      while (remaining > 0) {
        blocks.push(Math.min(2, remaining));
        remaining -= 2;
      }
      return blocks;
    } else {
      // > 8hr: 每段最多 2hr，分散多天
      const blocks: number[] = [];
      let remaining = totalHours;
      while (remaining > 0) {
        blocks.push(Math.min(2, remaining));
        remaining -= 2;
      }
      return blocks;
    }
  }

  /**
   * 往前回推排程
   */
  private scheduleBlocks(
    deadline: IDeadline,
    blockDurations: number[],
    availableSlots: Map<string, boolean[]>,
    dueDate: dayjs.Dayjs,
    now: dayjs.Dayjs,
    preferences?: SchedulePreferences
  ): Array<{
    userId: mongoose.Types.ObjectId;
    deadlineId: mongoose.Types.ObjectId;
    date: Date;
    startTime: Date;
    endTime: Date;
    duration: number;
    title: string;
    blockIndex: number;
    totalBlocks: number;
    status: "pending";
  }> {
    const blocks: Array<{
      userId: mongoose.Types.ObjectId;
      deadlineId: mongoose.Types.ObjectId;
      date: Date;
      startTime: Date;
      endTime: Date;
      duration: number;
      title: string;
      blockIndex: number;
      totalBlocks: number;
      status: "pending";
    }> = [];
    let blockIndex = 1;
    const totalBlocks = blockDurations.length;

    // 從截止日往前排
    // 從截止日當天開始（如果截止日是今天，就從今天開始）
    let currentDate = dueDate.startOf("day");
    // 如果截止日是未來，從截止日前一天開始；如果截止日是今天或過去，從今天開始
    if (currentDate.isAfter(now.startOf("day"))) {
      currentDate = currentDate.subtract(1, "day");
    } else {
      // 如果截止日是今天或過去，從今天開始排程
      currentDate = now.startOf("day");
    }
    
    let dailyHoursUsed = 0;
    let dailyBlocksUsed = 0;
    // 計算每天最大時數（考慮用戶偏好）
    const maxHoursPerDay = preferences?.maxHoursPerDay || SCHEDULE_CONFIG.MAX_HOURS_PER_DAY;

    // 追蹤已嘗試的天數，避免無限循環
    const maxDaysToTry = 30; // 最多嘗試30天
    let daysTried = 0;

    for (const duration of blockDurations) {
      let blockScheduled = false;
      let attempts = 0;
      const maxAttemptsPerBlock = 50; // 每個 block 最多嘗試50次（增加嘗試次數以確保能找到時間）

      // 嘗試安排這個 block，直到成功或超過嘗試次數
      while (!blockScheduled && attempts < maxAttemptsPerBlock) {
        attempts++;
        
        // 如果已經嘗試太多天，停止
        if (daysTried >= maxDaysToTry) {
          Logger.warn("排程時嘗試天數過多，停止排程", {
            deadlineId: deadline._id,
            remainingBlocks: blockDurations.length - blockIndex + 1,
          });
          break;
        }
        
        // 如果已經排到現在之前，停止
        // 檢查日期和時間：如果當前日期在今天之前，或當前日期是今天但所有可用時間都已過，則停止
        if (currentDate.isBefore(now.startOf("day"))) {
          break;
        }
        
        // 如果是今天，確保不排程到過去的時間
        if (currentDate.isSame(now, "day")) {
          const currentHour = now.hour();
          const currentMinute = now.minute();
          // 如果當前時間已經很晚（例如晚上11點），且沒有足夠時間安排這個 block，則停止
          // 這個檢查會在 findAvailableStartHour 中更精確地處理
        }

        // 尋找這一天可以排的時間
        const dateKey = currentDate.format("YYYY-MM-DD");
        const hours = availableSlots.get(dateKey);

        if (!hours) {
          // 如果這一天沒有可用時間，往前一天
          currentDate = currentDate.subtract(1, "day");
          dailyHoursUsed = 0;
          dailyBlocksUsed = 0;
          daysTried++;
          continue;
        }

        // 檢查是否超過每天限制（考慮用戶偏好）
        if (
          dailyHoursUsed + duration > maxHoursPerDay ||
          dailyBlocksUsed >= SCHEDULE_CONFIG.MAX_BLOCKS_PER_DAY
        ) {
          // 往前一天
          currentDate = currentDate.subtract(1, "day");
          dailyHoursUsed = 0;
          dailyBlocksUsed = 0;
          daysTried++;
          continue;
        }

        // 尋找合適的開始時間
        const startHour = this.findAvailableStartHour(
          hours,
          duration,
          currentDate,
          now,
          preferences
        );

        if (startHour === -1) {
          // 這一天找不到合適時間，往前一天
          currentDate = currentDate.subtract(1, "day");
          dailyHoursUsed = 0;
          dailyBlocksUsed = 0;
          daysTried++;
          // 繼續嘗試，不要 break
          continue;
        }

        // 建立 block
        const startTime = currentDate.hour(startHour).minute(0).second(0);
        const endTime = startTime.add(duration, "hour");

        blocks.push({
          userId: deadline.userId as mongoose.Types.ObjectId,
          deadlineId: deadline._id as mongoose.Types.ObjectId,
          date: currentDate.toDate(),
          startTime: startTime.toDate(),
          endTime: endTime.toDate(),
          duration,
          title: `${deadline.title}（進度 ${blockIndex}/${totalBlocks}）`,
          blockIndex,
          totalBlocks,
          status: "pending" as const,
        });

        // 更新可用時間地圖（標記這個時段為已使用）
        for (let h = startHour; h < startHour + duration; h++) {
          if (h < 24) {
            hours[h] = false;
          }
        }

        dailyHoursUsed += duration;
        dailyBlocksUsed += 1;
        blockIndex += 1;
        blockScheduled = true;

        // 如果這一天已經排滿，往前一天（考慮用戶偏好）
        if (
          dailyHoursUsed >= maxHoursPerDay ||
          dailyBlocksUsed >= SCHEDULE_CONFIG.MAX_BLOCKS_PER_DAY
        ) {
          currentDate = currentDate.subtract(1, "day");
          dailyHoursUsed = 0;
          dailyBlocksUsed = 0;
          daysTried++;
        }
      }

      // 如果這個 block 無法安排，記錄警告但繼續下一個
      // 這樣可以確保即使某些 blocks 無法安排，也會嘗試安排其他 blocks
      if (!blockScheduled) {
        // 如果無法安排，跳過這個 block，但 blockIndex 不增加
        // 這樣可以確保已安排的 blocks 序號連續
        Logger.warn("無法安排 block", {
          deadlineId: deadline._id,
          blockIndex,
          duration,
          attempts,
          daysTried,
          currentDate: currentDate.format("YYYY-MM-DD"),
        });
        // 重置 dailyHoursUsed 和 dailyBlocksUsed，以便下一個 block 可以從新的一天開始
        dailyHoursUsed = 0;
        dailyBlocksUsed = 0;
        // 往前一天，為下一個 block 做準備
        if (!currentDate.isBefore(now.startOf("day"))) {
          currentDate = currentDate.subtract(1, "day");
          daysTried++;
        }
      }
    }

    // 按開始時間排序，確保時間較早的 block 序號較小
    blocks.sort((a, b) => {
      const timeA = dayjs(a.startTime).valueOf();
      const timeB = dayjs(b.startTime).valueOf();
      return timeA - timeB;
    });

    // 重新分配 blockIndex，確保時間較早的序號較小
    blocks.forEach((block, index) => {
      block.blockIndex = index + 1;
      block.totalBlocks = blocks.length;
      block.title = `${deadline.title}（進度 ${block.blockIndex}/${block.totalBlocks}）`;
    });

    return blocks;
  }

  /**
   * 尋找可用的開始時間
   */
  private findAvailableStartHour(
    hours: boolean[],
    duration: number,
    date: dayjs.Dayjs,
    now: dayjs.Dayjs,
    preferences?: SchedulePreferences
  ): number {
    // 優先時段：根據用戶偏好或預設
    let preferredRanges: Array<{ start: number; end: number }>;
    if (preferences?.preferHours && preferences.preferHours.length > 0) {
      // 使用用戶偏好時段
      const sortedHours = preferences.preferHours.sort((a, b) => a - b);
      preferredRanges = [];
      let rangeStart = sortedHours[0];
      let rangeEnd = sortedHours[0];
      
      for (let i = 1; i < sortedHours.length; i++) {
        if (sortedHours[i] === rangeEnd + 1) {
          rangeEnd = sortedHours[i];
        } else {
          preferredRanges.push({ start: rangeStart, end: rangeEnd + 1 });
          rangeStart = sortedHours[i];
          rangeEnd = sortedHours[i];
        }
      }
      preferredRanges.push({ start: rangeStart, end: rangeEnd + 1 });
    } else {
      // 預設優先時段：09:00-12:00, 14:00-18:00, 19:00-21:00
      preferredRanges = [
        { start: 9, end: 12 },
        { start: 14, end: 18 },
        { start: 19, end: 21 },
      ];
    }

    // 先嘗試優先時段
    for (const range of preferredRanges) {
      for (let h = range.start; h <= range.end - duration; h++) {
        if (this.isSlotAvailable(hours, h, duration, date, now, preferences)) {
          return h;
        }
      }
    }

    // 如果優先時段都不可用，嘗試其他時段（排除禁止時段）
    for (let h = 8; h <= 22 - duration; h++) {
      // 跳過禁止時段
      if (
        SCHEDULE_CONFIG.FORBIDDEN_HOURS.some(
          ({ start, end }) => h >= start && h < end
        )
      ) {
        continue;
      }

      // 睡覺時段只允許 1hr block
      if (
        duration > 1 &&
        h >= SCHEDULE_CONFIG.SLEEP_HOURS.start &&
        h < SCHEDULE_CONFIG.SLEEP_HOURS.end
      ) {
        continue;
      }

      if (this.isSlotAvailable(hours, h, duration, date, now, preferences)) {
        return h;
      }
    }

    return -1; // 找不到可用時間
  }

  /**
   * 檢查時段是否可用
   */
  private isSlotAvailable(
    hours: boolean[],
    startHour: number,
    duration: number,
    date: dayjs.Dayjs,
    now: dayjs.Dayjs,
    preferences?: SchedulePreferences
  ): boolean {
    // 檢查是否在禁止時段內
    for (let h = startHour; h < startHour + duration; h++) {
      if (h >= 24) return false;

      if (!hours[h]) {
        return false;
      }

      // 檢查是否在禁止時段
      if (
        SCHEDULE_CONFIG.FORBIDDEN_HOURS.some(
          ({ start, end }) => h >= start && h < end
        )
      ) {
        return false;
      }

      // 如果是今天，檢查是否已過（精確到分鐘）
      if (date.isSame(now, "day")) {
        const currentHour = now.hour();
        const currentMinute = now.minute();
        // 如果開始時間在當前時間之前，不可用
        if (h < currentHour) {
          return false;
        }
        // 如果開始時間是當前小時，且當前時間已經過了該小時的開始，不可用
        // 為了安全起見，如果當前時間在該小時內，也標記為不可用
        if (h === currentHour && currentMinute >= 0) {
          return false;
        }
      }
    }

    return true;
  }
}

