import connectDB from "@/lib/db/mongoose";
import SavedItem, { ISavedItem, SavedItemMessage } from "@/models/SavedItem";
import { Logger } from "@/lib/utils/logger";
import crypto from "crypto";

export class SavedItemRepository {
  async save(
    userId: string,
    messages: SavedItemMessage[],
    metadata?: Record<string, unknown>,
    sessionId?: string
  ): Promise<ISavedItem | null> {
    try {
      await connectDB();
      const item = await SavedItem.create({
        userId,
        sessionId: sessionId || crypto.randomUUID(),
        messages,
        metadata: metadata || {},
      });
      Logger.debug("SavedItem created", { userId, messageCount: messages.length });
      return item;
    } catch (error) {
      Logger.error("Failed to save SavedItem", { error, userId });
      return null;
    }
  }

  async findByUserId(userId: string, limit = 20): Promise<ISavedItem[]> {
    try {
      await connectDB();
      return await SavedItem.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec();
    } catch (error) {
      Logger.error("Failed to find SavedItems", { error, userId });
      return [];
    }
  }

  async findRecent(userId: string, days = 7): Promise<ISavedItem[]> {
    try {
      await connectDB();
      const since = new Date();
      since.setDate(since.getDate() - days);
      return await SavedItem.find({
        userId,
        createdAt: { $gte: since },
      })
        .sort({ createdAt: -1 })
        .exec();
    } catch (error) {
      Logger.error("Failed to find recent SavedItems", { error, userId });
      return [];
    }
  }

  async deleteByUserId(userId: string): Promise<number> {
    try {
      await connectDB();
      const result = await SavedItem.deleteMany({ userId });
      Logger.debug("SavedItems deleted", { userId, count: result.deletedCount });
      return result.deletedCount || 0;
    } catch (error) {
      Logger.error("Failed to delete SavedItems", { error, userId });
      return 0;
    }
  }
}
