import connectDB from "@/lib/db/mongoose";
import Deadline, { IDeadline, DeadlineStatus, DeadlineType } from "@/models/Deadline";
import User from "@/models/User";
import { Logger } from "@/lib/utils/logger";
import { SmartSchedulerService } from "@/services/scheduler/smart-scheduler.service";
import { StudyBlockService } from "@/services/study-block/study-block.service";
import { SchedulerLLMService } from "@/services/llm/scheduler-llm.service";
import { ScheduleValidatorService } from "@/services/scheduler/schedule-validator.service";
import { PreferenceExtractorService } from "@/services/llm/preference-extractor.service";
import { UserStateService } from "@/services/user-state/user-state.service";
import StudyBlock from "@/models/StudyBlock";
import mongoose from "mongoose";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { DeadlineRepository } from "@/repositories/deadline.repository";
import { calculateDaysLeftInTaipei, getTodayInTaiwan } from "@/lib/utils/date";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface CreateDeadlineData {
  userId: string;
  title: string;
  type: DeadlineType;
  dueDate: Date;
  estimatedHours?: number;
}

export interface UpdateDeadlineData {
  title?: string;
  type?: DeadlineType;
  dueDate?: Date;
  estimatedHours?: number;
  status?: DeadlineStatus;
}

export class DeadlineService {
  private deadlineRepository = new DeadlineRepository();

  /**
   * 建立新的 Deadline
   */
  async createDeadline(data: CreateDeadlineData): Promise<IDeadline> {
    try {
      await connectDB();
      const user = await User.findOne({ lineUserId: data.userId });
      if (!user) {
        throw new Error("User not found");
      }

      const deadline = await this.deadlineRepository.create({
        userId: user._id,
        title: data.title,
        type: data.type,
        dueDate: data.dueDate,
        estimatedHours: data.estimatedHours || 2,
        status: "pending",
      });

      // 自動排程：先嘗試 LLM 排程，失敗則使用備用方案
      try {
        await this.scheduleDeadlineWithLLM(deadline, data.userId);
      } catch (scheduleError) {
        // 排程失敗不影響 deadline 建立，只記錄錯誤
        Logger.error("自動排程失敗", {
          error: scheduleError,
          deadlineId: deadline._id,
        });
      }

      return deadline;
    } catch (error) {
      Logger.error("建立 Deadline 失敗", { error, data });
      throw error;
    }
  }

  /**
   * 取得使用者的所有 Deadline
   */
  async getDeadlinesByUser(
    userId: string,
    status?: DeadlineStatus
  ): Promise<IDeadline[]> {
    try {
      await connectDB();
      const user = await User.findOne({ lineUserId: userId });
      if (!user) {
        return [];
      }

      return this.deadlineRepository.findByUserId(user._id, status);
    } catch (error) {
      Logger.error("取得 Deadline 列表失敗", { error, userId });
      return [];
    }
  }

  /**
   * 取得今天的 Deadline（台灣時區）
   */
  async getTodayDeadlines(userId: string): Promise<IDeadline[]> {
    try {
      await connectDB();
      const user = await User.findOne({ lineUserId: userId });
      if (!user) {
        return [];
      }

      // 取得台灣時區的今天日期
      const taiwanTime = getTodayInTaiwan();
      const tomorrow = new Date(taiwanTime);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return this.deadlineRepository.findTodayByUserId(user._id, taiwanTime, tomorrow);
    } catch (error) {
      Logger.error("取得今天 Deadline 列表失敗", { error, userId });
      return [];
    }
  }

  /**
   * 根據 ID 取得 Deadline
   */
  async getDeadlineById(id: string): Promise<IDeadline | null> {
    try {
      await connectDB();
      return this.deadlineRepository.findById(id);
    } catch (error) {
      Logger.error("取得 Deadline 失敗", { error, id });
      return null;
    }
  }

  async getDeadlinesByIds(ids: string[]): Promise<IDeadline[]> {
    try {
      await connectDB();
      return this.deadlineRepository.findByIds(ids);
    } catch (error) {
      Logger.error("批次取得 Deadline 失敗", { error, idsCount: ids.length });
      return [];
    }
  }

  /**
   * 更新 Deadline
   */
  async updateDeadline(
    id: string,
    updates: UpdateDeadlineData
  ): Promise<IDeadline | null> {
    try {
      await connectDB();
      return this.deadlineRepository.updateById(id, updates as Partial<IDeadline>);
    } catch (error) {
      Logger.error("更新 Deadline 失敗", { error, id, updates });
      return null;
    }
  }

  /**
   * 刪除 Deadline
   */
  async deleteDeadline(id: string): Promise<void> {
    try {
      await connectDB();
      
      // 同時刪除相關的 study blocks
      const studyBlockService = new StudyBlockService();
      await studyBlockService.deleteStudyBlocksByDeadline(id);
      
      await this.deadlineRepository.deleteById(id);
    } catch (error) {
      Logger.error("刪除 Deadline 失敗", { error, id });
      throw error;
    }
  }

  /**
   * 標記 Deadline 為完成
   */
  async markAsDone(id: string): Promise<IDeadline | null> {
    try {
      await connectDB();
      return this.deadlineRepository.updateById(id, { status: "done" } as Partial<IDeadline>);
    } catch (error) {
      Logger.error("標記 Deadline 完成失敗", { error, id });
      return null;
    }
  }

  /**
   * 更新 Deadline 並重新排程
   * @param id Deadline ID
   * @param updates 要更新的欄位
   * @param lineUserId LINE 用戶 ID
   * @param preferences 用戶偏好設定（可選）
   */
  async updateDeadlineAndReschedule(
    id: string,
    updates: UpdateDeadlineData,
    lineUserId: string,
    preferences?: { excludeHours?: number[]; preferHours?: number[]; maxHoursPerDay?: number; excludeDays?: string[] }
  ): Promise<IDeadline | null> {
    try {
      await connectDB();
      
      // 更新 deadline
      const deadline = await this.deadlineRepository.updateById(id, updates as Partial<IDeadline>);
      
      if (!deadline) {
        return null;
      }

      // 刪除舊的 study blocks
      const studyBlockService = new StudyBlockService();
      await studyBlockService.deleteStudyBlocksByDeadline(id);

      // 重新排程（傳遞偏好設定）
      try {
        await this.scheduleDeadlineWithLLM(deadline, lineUserId, preferences);
      } catch (scheduleError) {
        // 排程失敗不影響 deadline 更新，只記錄錯誤
        Logger.error("重新排程失敗", {
          error: scheduleError,
          deadlineId: deadline._id,
        });
      }

      return deadline;
    } catch (error) {
      Logger.error("更新 Deadline 並重新排程失敗", { error, id, updates });
      return null;
    }
  }

  /**
   * 計算剩餘天數（負數表示已過期）
   */
  calculateDaysLeft(dueDate: Date): number {
    return calculateDaysLeftInTaipei(dueDate);
  }

  async isDeadlineOwnedByUser(deadlineId: string, lineUserId: string): Promise<boolean> {
    await connectDB();
    const user = await User.findOne({ lineUserId });
    if (!user) {
      return false;
    }
    return this.deadlineRepository.isOwnedByUser(deadlineId, user._id);
  }

  /**
   * 使用 LLM 排程，失敗則使用備用方案
   */
  private async scheduleDeadlineWithLLM(
    deadline: IDeadline,
    lineUserId: string,
    providedPreferences?: { excludeHours?: number[]; preferHours?: number[]; maxHoursPerDay?: number; excludeDays?: string[] }
  ): Promise<void> {
    const schedulerLLM = new SchedulerLLMService();
    const validator = new ScheduleValidatorService();
    const preferenceExtractor = new PreferenceExtractorService();
    const userStateService = new UserStateService();
    const smartScheduler = new SmartSchedulerService();
    const studyBlockService = new StudyBlockService();

    try {
      // 1. 獲取用戶現有行程
      const existingDeadlines = await this.getDeadlinesByUser(lineUserId, "pending");
      const existingStudyBlocks = await StudyBlock.find({
        userId: deadline.userId,
      }).exec();

      // 2. 獲取偏好設定（如果提供了就使用，否則從對話歷史提取）
      let preferences: { excludeHours?: number[]; preferHours?: number[]; maxHoursPerDay?: number; excludeDays?: string[] };
      if (providedPreferences) {
        preferences = providedPreferences;
      } else {
        const conversationHistory = await userStateService.getConversationHistory(lineUserId);
        preferences = await preferenceExtractor.extractPreferences(
          conversationHistory.map((item) => ({
            role: item.role,
            content: item.content,
          }))
        );
      }

      // 3. 計算可用時間區間
      const user = await User.findById(deadline.userId);
      if (!user) {
        throw new Error("User not found");
      }

      const now = dayjs().tz("Asia/Taipei");
      const dueDate = dayjs(deadline.dueDate).tz("Asia/Taipei");
      const availableSlots = await smartScheduler.calculateAvailableSlots(
        user._id.toString(),
        now.toDate(),
        dueDate.toDate(),
        preferences // 傳遞偏好設定，包含 excludeDays
      );

      // 4. 嘗試使用 LLM 排程
      const llmResult = await schedulerLLM.generateSchedule(
        deadline,
        existingDeadlines.filter((d) => d._id.toString() !== deadline._id.toString()),
        existingStudyBlocks,
        preferences,
        availableSlots
      );

      if (llmResult) {
        // 5. 驗證 LLM 結果
        const validation = validator.validateSchedule(
          llmResult,
          deadline,
          existingStudyBlocks,
          preferences
        );

        if (validation.isValid) {
          // 6. 轉換 LLM 結果為 StudyBlock 格式並創建
          // 先按開始時間排序，確保時間較早的 block 序號較小
          const sortedBlocks = [...llmResult.blocks].sort((a, b) => {
            const timeA = new Date(a.startTime).getTime();
            const timeB = new Date(b.startTime).getTime();
            return timeA - timeB;
          });
          
          const blocksToCreate = sortedBlocks.map((block, index) => ({
            userId: lineUserId,
            deadlineId: deadline._id.toString(),
            date: new Date(block.date),
            startTime: new Date(block.startTime),
            endTime: new Date(block.endTime),
            duration: block.duration,
            title: `${deadline.title}（進度 ${index + 1}/${sortedBlocks.length}）`,
            blockIndex: index + 1, // 根據排序後的順序重新分配 blockIndex
            totalBlocks: sortedBlocks.length,
          }));

          await studyBlockService.createStudyBlocks(blocksToCreate);

          Logger.info("LLM 排程成功", {
            deadlineId: deadline._id,
            blocksCount: llmResult.blocks.length,
            totalHours: llmResult.totalHours,
            reasoning: llmResult.reasoning,
            warnings: validation.warnings,
          });

          // 儲存 LLM reasoning 到 deadline（如果需要）
          return;
        } else {
          Logger.warn("LLM 排程驗證失敗，使用備用方案", {
            deadlineId: deadline._id,
            errors: validation.errors,
            warnings: validation.warnings,
          });
        }
      }
    } catch (llmError) {
      Logger.warn("LLM 排程失敗，使用備用方案", {
        error: llmError,
        deadlineId: deadline._id,
      });
    }

    // 7. 使用備用方案（SmartSchedulerService）
    try {
      const scheduleResult = await smartScheduler.scheduleDeadline(deadline, lineUserId);

      if (scheduleResult.blocks.length > 0) {
        const studyBlockService = new StudyBlockService();
        const blocksToCreate = scheduleResult.blocks.map((block) => ({
          userId: lineUserId,
          deadlineId: deadline._id.toString(),
          date: block.date,
          startTime: block.startTime,
          endTime: block.endTime,
          duration: block.duration,
          title: block.title,
          blockIndex: block.blockIndex,
          totalBlocks: block.totalBlocks,
        }));

        await studyBlockService.createStudyBlocks(blocksToCreate);
        Logger.info("備用排程成功", {
          deadlineId: deadline._id,
          blocksCount: scheduleResult.blocks.length,
          warning: scheduleResult.warning,
        });
      }
    } catch (fallbackError) {
      Logger.error("備用排程也失敗", {
        error: fallbackError,
        deadlineId: deadline._id,
      });
      throw fallbackError;
    }
  }
}

