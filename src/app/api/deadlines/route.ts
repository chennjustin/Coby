import { NextRequest, NextResponse } from "next/server";
import { DeadlineService } from "@/services/deadline/deadline.service";
import { UserTokenService } from "@/services/user/user-token.service";
import { Logger } from "@/lib/utils/logger";
import { formatUtcToTaipei, parseTaipeiInputToUtc } from "@/lib/utils/date";

export const dynamic = 'force-dynamic';

const deadlineService = new DeadlineService();
const userTokenService = new UserTokenService();

function formatDeadline(deadline: {
  _id: { toString(): string };
  title: string;
  type: string;
  dueDate: Date | string;
  estimatedHours: number;
  status: string;
}) {
  const dueDateUtc = deadline.dueDate instanceof Date ? deadline.dueDate : new Date(deadline.dueDate);
  return {
    id: deadline._id.toString(),
    title: deadline.title,
    type: deadline.type,
    dueDate: dueDateUtc.toISOString(),
    dueDateTaipei: formatUtcToTaipei(dueDateUtc, "YYYY-MM-DD HH:mm"),
    estimatedHours: deadline.estimatedHours,
    status: deadline.status,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const status = searchParams.get("status") as "pending" | "done" | undefined;

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

    const deadlines = await deadlineService.getDeadlinesByUser(
      userInfo.lineUserId,
      status || "pending"
    );

    Logger.info("Get deadlines API", {
      userId: userInfo.lineUserId,
      status: status || "pending",
      count: deadlines.length,
    });

    // 將 Date 轉換為字符串
    const formattedDeadlines = deadlines.map(formatDeadline);

    return NextResponse.json({
      success: true,
      data: formattedDeadlines,
    });
  } catch (error) {
    Logger.error("Get deadlines error", { error });
    return NextResponse.json(
      { success: false, error: "Failed to get deadlines" },
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
    const { title, type, dueDate, estimatedHours } = body;

    // 驗證必填欄位
    if (!title || !type || !dueDate) {
      return NextResponse.json(
        { success: false, error: "Title, type, and dueDate are required" },
        { status: 400 }
      );
    }

    // 驗證類型
    const validTypes = ["exam", "assignment", "project", "other"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: "Invalid type" },
        { status: 400 }
      );
    }

    // 建立 deadline
    const deadline = await deadlineService.createDeadline({
      userId: userInfo.lineUserId,
      title,
      type,
      dueDate: parseTaipeiInputToUtc(dueDate),
      estimatedHours: estimatedHours || 2,
    });

    return NextResponse.json({
      success: true,
      data: formatDeadline(deadline as any),
    });
  } catch (error) {
    Logger.error("Create deadline error", { error });
    return NextResponse.json(
      { success: false, error: "Failed to create deadline" },
      { status: 500 }
    );
  }
}

