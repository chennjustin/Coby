import { NextRequest, NextResponse } from "next/server";
import { StudyBlockService } from "@/services/study-block/study-block.service";
import { UserTokenService } from "@/services/user/user-token.service";
import { Logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const studyBlockService = new StudyBlockService();
const userTokenService = new UserTokenService();

export async function GET(
  request: NextRequest,
  { params }: { params: { deadlineId: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const deadlineId = params.deadlineId;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Token is required" },
        { status: 400 }
      );
    }

    if (!deadlineId) {
      return NextResponse.json(
        { success: false, error: "Deadline ID is required" },
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

    // 取得該 deadline 的所有 blocks
    const blocks = await studyBlockService.getStudyBlocksByDeadline(deadlineId);

    // 格式化回應
    const formattedBlocks = blocks.map((block: any) => ({
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
    }));

    return NextResponse.json({
      success: true,
      data: formattedBlocks,
    });
  } catch (error) {
    Logger.error("Get deadline study blocks error", { error });
    return NextResponse.json(
      { success: false, error: "Failed to get deadline study blocks" },
      { status: 500 }
    );
  }
}

