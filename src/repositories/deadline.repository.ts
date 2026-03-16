import mongoose from "mongoose";
import Deadline, { DeadlineStatus, IDeadline } from "@/models/Deadline";

export interface CreateDeadlineRecord {
  userId: mongoose.Types.ObjectId;
  title: string;
  type: "exam" | "assignment" | "project" | "other";
  dueDate: Date;
  estimatedHours: number;
  status: DeadlineStatus;
}

export class DeadlineRepository {
  async create(data: CreateDeadlineRecord): Promise<IDeadline> {
    return Deadline.create(data);
  }

  async findById(id: string): Promise<IDeadline | null> {
    return Deadline.findById(id).exec();
  }

  async findByIds(ids: string[]): Promise<IDeadline[]> {
    return Deadline.find({ _id: { $in: ids } }).exec();
  }

  async findByUserId(userId: mongoose.Types.ObjectId, status?: DeadlineStatus): Promise<IDeadline[]> {
    const query: Record<string, unknown> = { userId };
    if (status) {
      query.status = status;
    }

    return Deadline.find(query).sort({ dueDate: 1 }).exec();
  }

  async findTodayByUserId(userId: mongoose.Types.ObjectId, start: Date, end: Date): Promise<IDeadline[]> {
    return Deadline.find({
      userId,
      status: "pending",
      dueDate: { $gte: start, $lt: end },
    })
      .sort({ dueDate: 1 })
      .exec();
  }

  async updateById(id: string, updates: Partial<IDeadline>): Promise<IDeadline | null> {
    return Deadline.findByIdAndUpdate(id, updates, { new: true }).exec();
  }

  async deleteById(id: string): Promise<void> {
    await Deadline.findByIdAndDelete(id).exec();
  }

  async isOwnedByUser(deadlineId: string, userId: mongoose.Types.ObjectId): Promise<boolean> {
    const found = await Deadline.findOne({ _id: deadlineId, userId }).select("_id").exec();
    return !!found;
  }
}
