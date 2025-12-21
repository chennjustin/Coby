import connectDB from "@/lib/db/mongoose";
import User, { IUser } from "@/models/User";
import { generateViewToken } from "@/lib/utils/token";
import { Logger } from "@/lib/utils/logger";

export class UserTokenService {
  /**
   * 獲取或創建用戶的 viewToken
   * @param lineUserId LINE 用戶 ID
   * @returns viewToken
   */
  async getOrCreateViewToken(lineUserId: string): Promise<string> {
    try {
      await connectDB();

      let user = await User.findOne({ lineUserId });

      if (!user) {
        // 如果用戶不存在，創建新用戶並生成 token
        const token = generateViewToken();
        user = await User.create({
          lineUserId,
          viewToken: token,
        });
        Logger.info("Created new user with viewToken", { lineUserId });
        return token;
      }

      // 如果用戶存在但沒有 token，生成並保存
      if (!user.viewToken) {
        const token = generateViewToken();
        user.viewToken = token;
        await user.save();
        Logger.info("Generated viewToken for existing user", { lineUserId });
        return token;
      }

      // 返回現有的 token
      return user.viewToken;
    } catch (error) {
      Logger.error("Error in getOrCreateViewToken", { error, lineUserId });
      throw error;
    }
  }

  /**
   * 驗證 token 並返回用戶資訊
   * @param token viewToken
   * @returns 用戶資訊或 null（如果 token 無效）
   */
  async validateToken(token: string): Promise<{
    userId: string;
    lineUserId: string;
  } | null> {
    try {
      await connectDB();

      const user = await User.findOne({ viewToken: token }).exec();

      if (!user) {
        Logger.warn("Invalid token attempted", { token: token.substring(0, 8) + "..." });
        return null;
      }

      return {
        userId: user._id.toString(),
        lineUserId: user.lineUserId,
      };
    } catch (error) {
      Logger.error("Error in validateToken", { error });
      return null;
    }
  }
}

