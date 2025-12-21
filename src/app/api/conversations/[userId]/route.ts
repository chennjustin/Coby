import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongoose";
import UserState from "@/models/UserState";
import User from "@/models/User";
import { Logger } from "@/lib/utils/logger";

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    await connectDB();

    const userId = params.userId;

    // 獲取用戶狀態
    const userState = await UserState.findOne({ userId }).exec();
    if (!userState) {
      return NextResponse.json(
        { error: "找不到該用戶的對話記錄" },
        { status: 404 }
      );
    }

    // 獲取用戶資訊
    const user = await User.findOne({ lineUserId: userId }).exec();

    return NextResponse.json({
      userId: userState.userId,
      displayName: user?.displayName || "未知用戶",
      pictureUrl: user?.pictureUrl,
      conversationHistory: userState.conversationHistory || [],
      currentFlow: userState.currentFlow,
      updatedAt: userState.updatedAt,
    });
  } catch (error) {
    Logger.error("獲取對話詳情失敗", { error, userId: params.userId });
    return NextResponse.json(
      { error: "獲取對話詳情失敗" },
      { status: 500 }
    );
  }
}

