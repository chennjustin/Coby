import connectDB from "@/lib/db/mongoose";
import User from "@/models/User";
import Deadline from "@/models/Deadline";
import StudyBlock from "@/models/StudyBlock";
import Checkin from "@/models/Checkin";
import UserState from "@/models/UserState";
import mongoose from "mongoose";
import { Logger } from "@/lib/utils/logger";

export class UserDeletionService {
  /**
   * 刪除用戶的所有資料
   * @param lineUserId LINE 用戶 ID
   */
  async deleteAllUserData(lineUserId: string): Promise<{
    success: boolean;
    deleted: {
      user: number;
      deadlines: number;
      studyBlocks: number;
      checkins: number;
      userStates: number;
      sessions: number;
    };
  }> {
    try {
      await connectDB();

      // 先找到用戶
      const user = await User.findOne({ lineUserId });
      if (!user) {
        Logger.warn("用戶不存在，無需刪除", { lineUserId });
        // 即使用戶不存在，也嘗試刪除可能存在的 sessions 和 userStates
        const db = mongoose.connection.db;
        let sessionsDeleted = 0;
        if (db) {
          const sessionsCollection = db.collection("sessions");
          const sessionsResult = await sessionsCollection.deleteMany({ sessionId: lineUserId });
          sessionsDeleted = sessionsResult.deletedCount || 0;
        }
        const userStatesResult = await UserState.deleteMany({ userId: lineUserId });
        return {
          success: true,
          deleted: {
            user: 0,
            deadlines: 0,
            studyBlocks: 0,
            checkins: 0,
            userStates: userStatesResult.deletedCount || 0,
            sessions: sessionsDeleted,
          },
        };
      }

      const userId = user._id;
      const results = {
        user: 0,
        deadlines: 0,
        studyBlocks: 0,
        checkins: 0,
        userStates: 0,
        sessions: 0,
      };

      // 1. 刪除所有 StudyBlocks（先刪除，因為它們依賴 Deadline）
      const studyBlocksResult = await StudyBlock.deleteMany({ userId });
      results.studyBlocks = studyBlocksResult.deletedCount || 0;

      // 2. 刪除所有 Deadlines（會自動處理相關的 StudyBlocks，但我們已經手動刪除了）
      const deadlinesResult = await Deadline.deleteMany({ userId });
      results.deadlines = deadlinesResult.deletedCount || 0;

      // 3. 刪除所有 Checkins
      const checkinsResult = await Checkin.deleteMany({ userId });
      results.checkins = checkinsResult.deletedCount || 0;

      // 4. 刪除 UserState（包含 conversationHistory，即 bot messages）
      const userStatesResult = await UserState.deleteMany({ userId: lineUserId });
      results.userStates = userStatesResult.deletedCount || 0;

      // 5. 刪除 Sessions（如果存在）
      const db = mongoose.connection.db;
      if (db) {
        try {
          const sessionsCollection = db.collection("sessions");
          const sessionsResult = await sessionsCollection.deleteMany({ sessionId: lineUserId });
          results.sessions = sessionsResult.deletedCount || 0;
        } catch (error) {
          Logger.warn("刪除 sessions 失敗（可能不存在）", { error, lineUserId });
        }
      }

      // 6. 最後刪除 User
      await User.deleteOne({ _id: userId });
      results.user = 1;

      Logger.info("已刪除用戶所有資料", {
        lineUserId,
        deleted: results,
      });

      return {
        success: true,
        deleted: results,
      };
    } catch (error) {
      Logger.error("刪除用戶資料失敗", { error, lineUserId });
      throw error;
    }
  }
}

