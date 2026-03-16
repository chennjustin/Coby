import { NextRequest, NextResponse } from "next/server";
import { UserTokenService } from "@/services/user/user-token.service";
import { DeadlineService } from "@/services/deadline/deadline.service";
import { Logger } from "@/lib/utils/logger";
import { formatUtcToTaipei } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

const userTokenService = new UserTokenService();
const deadlineService = new DeadlineService();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const deadlineId = params.id;

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

    // 獲取 deadline
    const deadline = await deadlineService.getDeadlineById(deadlineId);

    if (!deadline) {
      return NextResponse.json(
        { success: false, error: "Deadline not found" },
        { status: 404 }
      );
    }

    // 驗證 deadline 屬於該用戶
    const hasPermission = await deadlineService.isDeadlineOwnedByUser(deadlineId, userInfo.lineUserId);
    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access" },
        { status: 403 }
      );
    }

    // 格式化 deadline
    const dueDate =
      deadline.dueDate instanceof Date
        ? deadline.dueDate
        : new Date(deadline.dueDate);

    const diffDays = deadlineService.calculateDaysLeft(dueDate);

    const typeMap: Record<string, string> = {
      exam: "考試",
      assignment: "作業",
      project: "專題",
      other: "其他",
    };

    const formattedDeadline = {
      id: deadline._id.toString(),
      title: deadline.title,
      type: deadline.type,
      typeName: typeMap[deadline.type] || "其他",
      dueDate: dueDate.toISOString(),
      dueDateFormatted: formatUtcToTaipei(dueDate, "YYYY 年 M 月 D 日 HH:mm"),
      estimatedHours: deadline.estimatedHours,
      daysLeft: diffDays,
      isOverdue: diffDays < 0,
      isToday: diffDays === 0,
      status: deadline.status,
      createdAt: deadline.createdAt
        ? new Date(deadline.createdAt).toISOString()
        : null,
    };

    return NextResponse.json({
      success: true,
      data: formattedDeadline,
    });
  } catch (error) {
    Logger.error("Get deadline detail error", { error });
    return NextResponse.json(
      { success: false, error: "Failed to get deadline detail" },
      { status: 500 }
    );
  }
}

