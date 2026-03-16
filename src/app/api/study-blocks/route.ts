import { NextRequest, NextResponse } from "next/server";
import { StudyBlockService } from "@/services/study-block/study-block.service";
import { UserTokenService } from "@/services/user/user-token.service";
import { DeadlineService } from "@/services/deadline/deadline.service";
import { Logger } from "@/lib/utils/logger";
import { normalizeDateRange, parseTaipeiInputToUtc, formatUtcToTaipei } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

const studyBlockService = new StudyBlockService();
const userTokenService = new UserTokenService();
const deadlineService = new DeadlineService();

function formatStudyBlock(
  block: {
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
  },
  deadlineType: string
) {
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
    type: deadlineType || "other",
  };
}

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
      const { start, end } = normalizeDateRange(startDate || undefined, endDate || undefined);
      
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
    const uniqueDeadlineIds = Array.from(new Set(blocks.map((b: any) => b.deadlineId.toString())));
    const deadlines = await deadlineService.getDeadlinesByIds(uniqueDeadlineIds);
    const deadlineTypeMap = new Map(deadlines.map((d) => [d._id.toString(), d.type]));
    const formattedBlocks = blocks.map((block: any) =>
      formatStudyBlock(block, deadlineTypeMap.get(block.deadlineId.toString()) || "other")
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

    const start = parseTaipeiInputToUtc(startTime);
    const end = new Date(start.getTime() + duration * 60 * 60 * 1000);

    // 建立 block
    const block = await studyBlockService.createStudyBlock({
      userId: userInfo.lineUserId,
      deadlineId,
      date: parseTaipeiInputToUtc(date),
      startTime: start,
      endTime: end,
      duration,
      title,
      blockIndex: blockIndex || 1,
      totalBlocks: totalBlocks || 1,
    });

    return NextResponse.json({
      success: true,
      data: formatStudyBlock(block as any, "other"),
    });
  } catch (error) {
    Logger.error("Create study block error", { error });
    return NextResponse.json(
      { success: false, error: "Failed to create study block" },
      { status: 500 }
    );
  }
}

