import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongoose";
import UserState, { ConversationHistoryItem } from "@/models/UserState";
import User from "@/models/User";
import { Logger } from "@/lib/utils/logger";
import dayjs from "dayjs";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    // 獲取所有有對話歷史的 UserState
    let userStates = await UserState.find({
      conversationHistory: { $exists: true, $ne: [] },
    }).exec();

    // 構建對話列表，包含用戶資訊
    const conversationsWithUserInfo = await Promise.all(
      userStates.map(async (state) => {
        const user = await User.findOne({ lineUserId: state.userId }).exec();
        return {
          state,
          user,
        };
      })
    );

    // 篩選邏輯
    let filtered = conversationsWithUserInfo.filter(({ state, user }) => {
      // 依使用者篩選
      if (userId && state.userId !== userId) {
        return false;
      }

      // 依日期區間篩選
      if (startDate || endDate) {
        const history = state.conversationHistory || [];
        if (history.length === 0) return false;

        const lastMessageTime = new Date(
          history[history.length - 1].timestamp
        );

        if (startDate && lastMessageTime < new Date(startDate)) {
          return false;
        }
        if (endDate && lastMessageTime > new Date(endDate)) {
          return false;
        }
      }

      // 搜尋對話內容
      if (search) {
        const searchLower = search.toLowerCase();
        const hasMatch = (state.conversationHistory || []).some(
          (item: ConversationHistoryItem) =>
            item.content.toLowerCase().includes(searchLower)
        );
        if (!hasMatch) return false;
      }

      return true;
    });

    // 排序：依 updatedAt 降序
    filtered.sort((a, b) => {
      const timeA = new Date(a.state.updatedAt).getTime();
      const timeB = new Date(b.state.updatedAt).getTime();
      return timeB - timeA;
    });

    // 分頁
    const total = filtered.length;
    const skip = (page - 1) * limit;
    const paginated = filtered.slice(skip, skip + limit);

    // 構建返回數據
    const conversations = paginated.map(({ state, user }) => {
      const history = state.conversationHistory || [];
      const lastMessage =
        history.length > 0 ? history[history.length - 1] : null;

      return {
        userId: state.userId,
        displayName: user?.displayName || "未知用戶",
        pictureUrl: user?.pictureUrl,
        messageCount: history.length,
        lastMessageTime: lastMessage
          ? new Date(lastMessage.timestamp)
          : state.updatedAt,
        conversationHistory: history.slice(-5), // 只返回最近 5 條，完整歷史在詳情頁
      };
    });

    return NextResponse.json({
      conversations,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    Logger.error("獲取對話列表失敗", { error });
    return NextResponse.json(
      { error: "獲取對話列表失敗" },
      { status: 500 }
    );
  }
}

