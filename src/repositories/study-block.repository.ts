import mongoose from "mongoose";
import StudyBlock, { IStudyBlock } from "@/models/StudyBlock";

export interface CreateStudyBlockRecord {
  userId: mongoose.Types.ObjectId;
  deadlineId: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  duration: number;
  title: string;
  blockIndex: number;
  totalBlocks: number;
  status: "pending" | "done";
}

export class StudyBlockRepository {
  async create(data: CreateStudyBlockRecord): Promise<IStudyBlock> {
    return StudyBlock.create(data);
  }

  async findByUserId(
    userId: mongoose.Types.ObjectId,
    startDate?: Date,
    endDate?: Date
  ): Promise<IStudyBlock[]> {
    const query: Record<string, unknown> = { userId };
    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) {
        (query.startTime as Record<string, Date>).$gte = startDate;
      }
      if (endDate) {
        (query.startTime as Record<string, Date>).$lte = endDate;
      }
    }

    return StudyBlock.find(query).sort({ startTime: 1 }).exec();
  }

  async findByDeadlineId(deadlineId: string): Promise<IStudyBlock[]> {
    return StudyBlock.find({ deadlineId }).sort({ blockIndex: 1 }).exec();
  }

  async findById(id: string): Promise<IStudyBlock | null> {
    return StudyBlock.findById(id).exec();
  }

  async updateById(id: string, updates: Partial<IStudyBlock>): Promise<IStudyBlock | null> {
    return StudyBlock.findByIdAndUpdate(id, updates, { new: true }).exec();
  }

  async deleteById(id: string): Promise<void> {
    await StudyBlock.findByIdAndDelete(id).exec();
  }

  async deleteByDeadlineId(deadlineId: string): Promise<void> {
    await StudyBlock.deleteMany({ deadlineId }).exec();
  }

  async isOwnedByUser(blockId: string, userId: mongoose.Types.ObjectId): Promise<boolean> {
    const found = await StudyBlock.findOne({ _id: blockId, userId }).select("_id").exec();
    return !!found;
  }
}
