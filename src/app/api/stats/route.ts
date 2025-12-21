import { NextResponse } from "next/server";
import connectDB from "@/lib/db/mongoose";
import User from "@/models/User";
import UserState from "@/models/UserState";
import { Logger } from "@/lib/utils/logger";
import dayjs from "dayjs";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectDB();

    // 總用戶數
    const totalUsers = await User.countDocuments().exec();

    // 總對話數（有對話歷史的用戶數）
    const totalConversations = await UserState.countDocuments({
      conversationHistory: { $exists: true, $ne: [] },
    }).exec();

    // 今日新增對話數（今天有對話的用戶數）
    const today = dayjs().startOf("day").toDate();
    const todayConversations = await UserState.countDocuments({
      conversationHistory: {
        $elemMatch: {
          timestamp: { $gte: today },
        },
      },
    }).exec();

    // 活躍用戶數（最近 7 天有對話的用戶）
    const sevenDaysAgo = dayjs().subtract(7, "day").startOf("day").toDate();
    const activeUsers = await UserState.countDocuments({
      conversationHistory: {
        $elemMatch: {
          timestamp: { $gte: sevenDaysAgo },
        },
      },
    }).exec();

    return NextResponse.json({
      totalUsers,
      totalConversations,
      todayConversations,
      activeUsers,
    });
  } catch (error) {
    Logger.error("獲取統計資料失敗", { error });
    return NextResponse.json(
      { error: "獲取統計資料失敗" },
      { status: 500 }
    );
  }
}

