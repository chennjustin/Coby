import { NextRequest, NextResponse } from "next/server";
import { StudyBlockService } from "@/services/study-block/study-block.service";
import { UserTokenService } from "@/services/user/user-token.service";
import { Logger } from "@/lib/utils/logger";
import { formatUtcToTaipei, parseTaipeiInputToUtc } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

const studyBlockService = new StudyBlockService();
const userTokenService = new UserTokenService();

function formatStudyBlock(block: {
  _id: { toString(): string };
  userId: { toString(): string };
  deadlineId: { toString(): string };
  date: Date | string;
  startTime: Date | string;
  endTime: Date | string;
  duration: number;
  title: string;
  blockIndex: number;
  totalBlocks: number;
  status: string;
}) {
  const dateUtc = block.date instanceof Date ? block.date : new Date(block.date);
  const startUtc = block.startTime instanceof Date ? block.startTime : new Date(block.startTime);
  const endUtc = block.endTime instanceof Date ? block.endTime : new Date(block.endTime);
  return {
    id: block._id.toString(),
    userId: block.userId.toString(),
    deadlineId: block.deadlineId.toString(),
    date: dateUtc.toISOString(),
    dateTaipei: formatUtcToTaipei(dateUtc, "YYYY-MM-DD"),
    startTime: startUtc.toISOString(),
    startTimeTaipei: formatUtcToTaipei(startUtc, "YYYY-MM-DD HH:mm"),
    endTime: endUtc.toISOString(),
    endTimeTaipei: formatUtcToTaipei(endUtc, "YYYY-MM-DD HH:mm"),
    duration: block.duration,
    title: block.title,
    blockIndex: block.blockIndex,
    totalBlocks: block.totalBlocks,
    status: block.status,
  };
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
    const hasPermission = await studyBlockService.isStudyBlockOwnedByUser(blockId, userInfo.lineUserId);
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
    if (date !== undefined) updates.date = parseTaipeiInputToUtc(date);
    if (startTime !== undefined) updates.startTime = parseTaipeiInputToUtc(startTime);
    if (endTime !== undefined) {
      updates.endTime = parseTaipeiInputToUtc(endTime);
    } else if (startTime !== undefined && duration !== undefined) {
      // 如果只更新了 startTime 和 duration，自動計算 endTime
      const start = parseTaipeiInputToUtc(startTime);
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

    return NextResponse.json({
      success: true,
      data: formatStudyBlock(block as any),
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
    const hasPermission = await studyBlockService.isStudyBlockOwnedByUser(blockId, userInfo.lineUserId);
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

