import connectDB from "@/lib/db/mongoose";
import StudyBlock, { IStudyBlock, StudyBlockStatus } from "@/models/StudyBlock";
import User from "@/models/User";
import { Logger } from "@/lib/utils/logger";

export interface CreateStudyBlockData {
  userId: string;
  deadlineId: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  duration: number;
  title: string;
  blockIndex: number;
  totalBlocks: number;
}

export interface UpdateStudyBlockData {
  date?: Date;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  title?: string;
  status?: StudyBlockStatus;
}

export class StudyBlockService {
  /**
   * 建立單個 Study Block
   */
  async createStudyBlock(data: CreateStudyBlockData): Promise<IStudyBlock> {
    try {
      await connectDB();
      const user = await User.findOne({ lineUserId: data.userId });
      if (!user) {
        throw new Error("User not found");
      }

      const block = await StudyBlock.create({
        userId: user._id,
        deadlineId: data.deadlineId,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        duration: data.duration,
        title: data.title,
        blockIndex: data.blockIndex,
        totalBlocks: data.totalBlocks,
        status: "pending",
      });

      return block;
    } catch (error) {
      Logger.error("建立 Study Block 失敗", { error, data });
      throw error;
    }
  }

  /**
   * 批次建立 Study Blocks
   */
  async createStudyBlocks(blocks: CreateStudyBlockData[]): Promise<IStudyBlock[]> {
    try {
      await connectDB();
      const createdBlocks: IStudyBlock[] = [];

      for (const blockData of blocks) {
        const block = await this.createStudyBlock(blockData);
        createdBlocks.push(block);
      }

      return createdBlocks;
    } catch (error) {
      Logger.error("批次建立 Study Blocks 失敗", { error });
      throw error;
    }
  }

  /**
   * 取得使用者的 Study Blocks
   */
  async getStudyBlocksByUser(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<IStudyBlock[]> {
    try {
      await connectDB();
      const user = await User.findOne({ lineUserId: userId });
      if (!user) {
        return [];
      }

      const query: any = { userId: user._id };

      if (startDate || endDate) {
        query.startTime = {};
        if (startDate) {
          query.startTime.$gte = startDate;
        }
        if (endDate) {
          query.startTime.$lte = endDate;
        }
      }

      const blocks = await StudyBlock.find(query)
        .sort({ startTime: 1 })
        .exec();

      return blocks;
    } catch (error) {
      Logger.error("取得 Study Blocks 失敗", { error, userId });
      return [];
    }
  }

  /**
   * 取得某個 Deadline 的所有 Study Blocks
   */
  async getStudyBlocksByDeadline(deadlineId: string): Promise<IStudyBlock[]> {
    try {
      await connectDB();
      const blocks = await StudyBlock.find({ deadlineId })
        .sort({ blockIndex: 1 })
        .exec();
      return blocks;
    } catch (error) {
      Logger.error("取得 Deadline 的 Study Blocks 失敗", { error, deadlineId });
      return [];
    }
  }

  /**
   * 更新 Study Block
   */
  async updateStudyBlock(
    id: string,
    updates: UpdateStudyBlockData
  ): Promise<IStudyBlock | null> {
    try {
      await connectDB();
      const block = await StudyBlock.findByIdAndUpdate(id, updates, {
        new: true,
      }).exec();
      return block;
    } catch (error) {
      Logger.error("更新 Study Block 失敗", { error, id, updates });
      return null;
    }
  }

  /**
   * 刪除 Study Block
   */
  async deleteStudyBlock(id: string): Promise<void> {
    try {
      await connectDB();
      await StudyBlock.findByIdAndDelete(id).exec();
    } catch (error) {
      Logger.error("刪除 Study Block 失敗", { error, id });
      throw error;
    }
  }

  /**
   * 刪除某個 Deadline 的所有 Study Blocks
   */
  async deleteStudyBlocksByDeadline(deadlineId: string): Promise<void> {
    try {
      await connectDB();
      await StudyBlock.deleteMany({ deadlineId }).exec();
    } catch (error) {
      Logger.error("刪除 Deadline 的 Study Blocks 失敗", { error, deadlineId });
      throw error;
    }
  }

  /**
   * 標記 Block 為完成
   */
  async markBlockDone(id: string): Promise<IStudyBlock | null> {
    try {
      await connectDB();
      const block = await StudyBlock.findByIdAndUpdate(
        id,
        { status: "done" },
        { new: true }
      ).exec();
      return block;
    } catch (error) {
      Logger.error("標記 Study Block 完成失敗", { error, id });
      return null;
    }
  }

  /**
   * 計算 Deadline 的完成度
   */
  async calculateDeadlineProgress(deadlineId: string): Promise<{
    totalHours: number;
    completedHours: number;
    progress: number; // 0-100
  }> {
    try {
      await connectDB();
      const blocks = await this.getStudyBlocksByDeadline(deadlineId);

      const totalHours = blocks.reduce((sum, block) => sum + block.duration, 0);
      const completedHours = blocks
        .filter((block) => block.status === "done")
        .reduce((sum, block) => sum + block.duration, 0);

      const progress = totalHours > 0 ? (completedHours / totalHours) * 100 : 0;

      return {
        totalHours,
        completedHours,
        progress: Math.round(progress * 100) / 100, // 保留兩位小數
      };
    } catch (error) {
      Logger.error("計算 Deadline 完成度失敗", { error, deadlineId });
      return {
        totalHours: 0,
        completedHours: 0,
        progress: 0,
      };
    }
  }
}

