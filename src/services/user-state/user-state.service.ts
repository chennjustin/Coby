import connectDB from "@/lib/db/mongoose";
import UserState, { IUserState, FlowType, ConversationHistoryItem } from "@/models/UserState";
import { Logger } from "@/lib/utils/logger";

export class UserStateService {
  /**
   * 取得使用者狀態
   */
  async getState(userId: string): Promise<IUserState | null> {
    try {
      await connectDB();
      const state = await UserState.findOne({ userId }).exec();
      return state;
    } catch (error) {
      Logger.error("取得使用者狀態失敗", { error, userId });
      return null;
    }
  }

  /**
   * 設定使用者狀態
   */
  async setState(
    userId: string,
    flow: FlowType,
    flowData?: Record<string, unknown>
  ): Promise<void> {
    try {
      await connectDB();
      await UserState.findOneAndUpdate(
        { userId },
        {
          userId,
          currentFlow: flow,
          flowData: flowData || {},
        },
        { upsert: true, new: true }
      ).exec();
    } catch (error) {
      Logger.error("設定使用者狀態失敗", { error, userId, flow });
      throw error;
    }
  }

  /**
   * 清除使用者狀態
   */
  async clearState(userId: string): Promise<void> {
    try {
      await connectDB();
      await UserState.findOneAndUpdate(
        { userId },
        {
          currentFlow: null,
          flowData: {},
          conversationHistory: [],
        }
      ).exec();
    } catch (error) {
      Logger.error("清除使用者狀態失敗", { error, userId });
      throw error;
    }
  }

  /**
   * 更新流程資料（不改變 currentFlow）
   */
  async updateFlowData(
    userId: string,
    flowData: Record<string, unknown>
  ): Promise<void> {
    try {
      await connectDB();
      const state = await UserState.findOne({ userId }).exec();
      if (state) {
        state.flowData = { ...state.flowData, ...flowData };
        await state.save();
      }
    } catch (error) {
      Logger.error("更新流程資料失敗", { error, userId });
      throw error;
    }
  }

  /**
   * 添加對話到歷史記錄
   */
  async addToConversationHistory(
    userId: string,
    role: "user" | "assistant",
    content: string
  ): Promise<void> {
    try {
      await connectDB();
      const state = await UserState.findOne({ userId }).exec();
      if (state) {
        const history = state.conversationHistory || [];
        // 最多保留最近 10 條，避免 token 過多
        const newHistory = [
          ...history.slice(-9),
          {
            role,
            content,
            timestamp: new Date(),
          },
        ];
        state.conversationHistory = newHistory;
        await state.save();
      } else {
        // 如果狀態不存在，創建新的
        await UserState.findOneAndUpdate(
          { userId },
          {
            userId,
            conversationHistory: [
              {
                role,
                content,
                timestamp: new Date(),
              },
            ],
          },
          { upsert: true, new: true }
        ).exec();
      }
    } catch (error) {
      Logger.error("添加對話歷史失敗", { error, userId });
      throw error;
    }
  }

  /**
   * 獲取對話歷史
   */
  async getConversationHistory(userId: string): Promise<ConversationHistoryItem[]> {
    try {
      await connectDB();
      const state = await UserState.findOne({ userId }).exec();
      return state?.conversationHistory || [];
    } catch (error) {
      Logger.error("獲取對話歷史失敗", { error, userId });
      return [];
    }
  }

  /**
   * 清除對話歷史
   */
  async clearConversationHistory(userId: string): Promise<void> {
    try {
      await connectDB();
      const state = await UserState.findOne({ userId }).exec();
      if (state) {
        state.conversationHistory = [];
        await state.save();
      }
    } catch (error) {
      Logger.error("清除對話歷史失敗", { error, userId });
      throw error;
    }
  }
}

