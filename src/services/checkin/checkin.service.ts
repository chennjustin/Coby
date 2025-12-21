import connectDB from "@/lib/db/mongoose";
import Checkin, { ICheckin } from "@/models/Checkin";
import User from "@/models/User";
import { Logger } from "@/lib/utils/logger";
import { getTodayInTaiwan } from "@/lib/utils/date";

export class CheckinService {

  /**
   * 檢查使用者今天是否已簽到
   */
  async isCheckedInToday(userId: string): Promise<boolean> {
    try {
      await connectDB();
      const user = await User.findOne({ lineUserId: userId });
      if (!user) {
        return false;
      }

      const today = getTodayInTaiwan();
      const checkin = await Checkin.findOne({
        userId: user._id,
        checkinDate: today,
      });

      return !!checkin;
    } catch (error) {
      Logger.error("檢查簽到狀態失敗", { error, userId });
      return false;
    }
  }

  /**
   * 取得使用者連續簽到天數
   */
  async getConsecutiveDays(userId: string): Promise<number> {
    try {
      await connectDB();
      const user = await User.findOne({ lineUserId: userId });
      if (!user) {
        return 0;
      }

      const latestCheckin = await Checkin.findOne({ userId: user._id })
        .sort({ checkinDate: -1 })
        .exec();

      return latestCheckin?.consecutiveDays || 0;
    } catch (error) {
      Logger.error("取得連續簽到天數失敗", { error, userId });
      return 0;
    }
  }

  /**
   * 執行簽到
   */
  async checkIn(userId: string): Promise<{
    success: boolean;
    consecutiveDays: number;
    alreadyChecked: boolean;
  }> {
    try {
      await connectDB();
      
      // 如果用戶不存在，自動創建
      let user = await User.findOne({ lineUserId: userId });
      if (!user) {
        user = await User.create({
          lineUserId: userId,
        });
        Logger.info("簽到時自動創建用戶", { lineUserId: userId });
      }

      const today = getTodayInTaiwan();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // 檢查今天是否已簽到
      const todayCheckin = await Checkin.findOne({
        userId: user._id,
        checkinDate: today,
      });

      if (todayCheckin) {
        return {
          success: false,
          consecutiveDays: todayCheckin.consecutiveDays,
          alreadyChecked: true,
        };
      }

      // 檢查昨天是否簽到
      const yesterdayCheckin = await Checkin.findOne({
        userId: user._id,
        checkinDate: yesterday,
      });

      let consecutiveDays = 1;
      if (yesterdayCheckin) {
        consecutiveDays = yesterdayCheckin.consecutiveDays + 1;
      }

      // 建立今天的簽到記錄
      await Checkin.create({
        userId: user._id,
        checkinDate: today,
        consecutiveDays,
      });

      return {
        success: true,
        consecutiveDays,
        alreadyChecked: false,
      };
    } catch (error) {
      Logger.error("簽到失敗", { error, userId });
      throw error;
    }
  }
}

