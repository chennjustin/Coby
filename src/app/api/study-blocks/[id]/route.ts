import { NextRequest, NextResponse } from "next/server";
import { StudyBlockService } from "@/services/study-block/study-block.service";
import { UserTokenService } from "@/services/user/user-token.service";
import { Logger } from "@/lib/utils/logger";
import StudyBlock from "@/models/StudyBlock";
import connectDB from "@/lib/db/mongoose";

export const dynamic = "force-dynamic";

const studyBlockService = new StudyBlockService();
const userTokenService = new UserTokenService();

/**
 * 驗證用戶是否有權限操作該 study block
 */
async function verifyBlockOwnership(
  blockId: string,
  lineUserId: string
): Promise<boolean> {
  try {
    await connectDB();
    const block = await StudyBlock.findById(blockId).populate("userId");
    if (!block) {
      return false;
    }

    // 獲取用戶的所有 blocks 來驗證所有權
    const userBlocks = await studyBlockService.getStudyBlocksByUser(lineUserId);
    const userBlockIds = userBlocks.map((b) => b._id.toString());

    return userBlockIds.includes(blockId);
  } catch (error) {
    Logger.error("Verify block ownership error", { error, blockId, lineUserId });
    return false;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const blockId = params.id;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Token is required" },
        { status: 400 }
      );
    }

    if (!blockId) {
      return NextResponse.json(
        { success: false, error: "Block ID is required" },
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

    // 驗證所有權
    const hasPermission = await verifyBlockOwnership(blockId, userInfo.lineUserId);
    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { date, startTime, endTime, duration, title, status } = body;

    // 構建更新對象
    const updates: any = {};
    if (date !== undefined) updates.date = new Date(date);
    if (startTime !== undefined) updates.startTime = new Date(startTime);
    if (endTime !== undefined) {
      updates.endTime = new Date(endTime);
    } else if (startTime !== undefined && duration !== undefined) {
      // 如果只更新了 startTime 和 duration，自動計算 endTime
      const start = new Date(startTime);
      updates.endTime = new Date(start.getTime() + duration * 60 * 60 * 1000);
    }
    if (duration !== undefined) updates.duration = duration;
    if (title !== undefined) updates.title = title;
    if (status !== undefined) {
      const validStatuses = ["pending", "done"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { success: false, error: "Invalid status" },
          { status: 400 }
        );
      }
      updates.status = status;
    }

    // 更新 block
    const block = await studyBlockService.updateStudyBlock(blockId, updates);
    if (!block) {
      return NextResponse.json(
        { success: false, error: "Failed to update study block" },
        { status: 500 }
      );
    }

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
    Logger.error("Update study block error", { error });
    return NextResponse.json(
      { success: false, error: "Failed to update study block" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const blockId = params.id;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Token is required" },
        { status: 400 }
      );
    }

    if (!blockId) {
      return NextResponse.json(
        { success: false, error: "Block ID is required" },
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

    // 驗證所有權
    const hasPermission = await verifyBlockOwnership(blockId, userInfo.lineUserId);
    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access" },
        { status: 403 }
      );
    }

    // 刪除 block
    await studyBlockService.deleteStudyBlock(blockId);

    return NextResponse.json({
      success: true,
      message: "Study block deleted successfully",
    });
  } catch (error) {
    Logger.error("Delete study block error", { error });
    return NextResponse.json(
      { success: false, error: "Failed to delete study block" },
      { status: 500 }
    );
  }
}

