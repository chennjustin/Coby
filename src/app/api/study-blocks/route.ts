import { NextRequest, NextResponse } from "next/server";
import { StudyBlockService } from "@/services/study-block/study-block.service";
import { UserTokenService } from "@/services/user/user-token.service";
import { DeadlineService } from "@/services/deadline/deadline.service";
import { Logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const studyBlockService = new StudyBlockService();
const userTokenService = new UserTokenService();
const deadlineService = new DeadlineService();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const deadlineId = searchParams.get("deadlineId");

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Token is required" },
        { status: 400 }
      );
    }

    // 驗證 token
    const userInfo = await userTokenService.validateToken(token);
    if (!userInfo) {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 }
      );
    }

    let blocks;

    if (deadlineId) {
      // 取得某個 deadline 的所有 blocks
      blocks = await studyBlockService.getStudyBlocksByDeadline(deadlineId);
    } else {
      // 取得使用者的 blocks（可選時間範圍）
      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;
      
      blocks = await studyBlockService.getStudyBlocksByUser(
        userInfo.lineUserId,
        start,
        end
      );
    }

    Logger.info("Get study blocks API", {
      userId: userInfo.lineUserId,
      deadlineId: deadlineId || null,
      startDate: startDate || null,
      endDate: endDate || null,
      count: blocks.length,
    });

    // 格式化回應，並獲取每個 block 對應的 deadline type
    const formattedBlocks = await Promise.all(
      blocks.map(async (block: any) => {
        // 獲取 deadline 資訊以取得 type
        const deadline = await deadlineService.getDeadlineById(block.deadlineId.toString());
        return {
          id: block._id.toString(),
          userId: block.userId.toString(),
          deadlineId: block.deadlineId.toString(),
          date: block.date instanceof Date ? block.date.toISOString() : new Date(block.date).toISOString(),
          startTime: block.startTime instanceof Date ? block.startTime.toISOString() : new Date(block.startTime).toISOString(),
          endTime: block.endTime instanceof Date ? block.endTime.toISOString() : new Date(block.endTime).toISOString(),
          duration: block.duration,
          title: block.title,
          blockIndex: block.blockIndex,
          totalBlocks: block.totalBlocks,
          status: block.status,
          type: deadline?.type || "other", // 從 deadline 獲取 type
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: formattedBlocks,
    });
  } catch (error) {
    Logger.error("Get study blocks error", { error });
    return NextResponse.json(
      { success: false, error: "Failed to get study blocks" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Token is required" },
        { status: 400 }
      );
    }

    // 驗證 token
    const userInfo = await userTokenService.validateToken(token);
    if (!userInfo) {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { deadlineId, date, startTime, duration, title, blockIndex, totalBlocks } = body;

    // 驗證必填欄位
    if (!deadlineId || !date || !startTime || !duration || !title) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const start = new Date(startTime);
    const end = new Date(start.getTime() + duration * 60 * 60 * 1000);

    // 建立 block
    const block = await studyBlockService.createStudyBlock({
      userId: userInfo.lineUserId,
      deadlineId,
      date: new Date(date),
      startTime: start,
      endTime: end,
      duration,
      title,
      blockIndex: blockIndex || 1,
      totalBlocks: totalBlocks || 1,
    });

    // 格式化回應
    const formattedBlock = {
      id: block._id.toString(),
      userId: block.userId.toString(),
      deadlineId: block.deadlineId.toString(),
      date: block.date instanceof Date ? block.date.toISOString() : new Date(block.date).toISOString(),
      startTime: block.startTime instanceof Date ? block.startTime.toISOString() : new Date(block.startTime).toISOString(),
      endTime: block.endTime instanceof Date ? block.endTime.toISOString() : new Date(block.endTime).toISOString(),
      duration: block.duration,
      title: block.title,
      blockIndex: block.blockIndex,
      totalBlocks: block.totalBlocks,
      status: block.status,
    };

    return NextResponse.json({
      success: true,
      data: formattedBlock,
    });
  } catch (error) {
    Logger.error("Create study block error", { error });
    return NextResponse.json(
      { success: false, error: "Failed to create study block" },
      { status: 500 }
    );
  }
}

