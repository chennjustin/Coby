import { NextRequest, NextResponse } from "next/server";
import { DeadlineService } from "@/services/deadline/deadline.service";
import { UserTokenService } from "@/services/user/user-token.service";
import { Logger } from "@/lib/utils/logger";
import { parseToUTC } from "@/lib/utils/timezone";

export const dynamic = 'force-dynamic';

const deadlineService = new DeadlineService();
const userTokenService = new UserTokenService();

/**
 * 驗證用戶是否有權限操作該 deadline
 */
async function verifyDeadlineOwnership(
  deadlineId: string,
  lineUserId: string
): Promise<boolean> {
  try {
    const deadline = await deadlineService.getDeadlineById(deadlineId);
    if (!deadline) {
      return false;
    }

    // 獲取用戶的所有 deadlines 來驗證所有權
    const userDeadlines = await deadlineService.getDeadlinesByUser(
      lineUserId,
      undefined // 不限制狀態
    );
    const userDeadlineIds = userDeadlines.map((d) => d._id.toString());
    
    return userDeadlineIds.includes(deadlineId);
  } catch (error) {
    Logger.error("Verify deadline ownership error", { error, deadlineId, lineUserId });
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

    // 驗證所有權
    const hasPermission = await verifyDeadlineOwnership(deadlineId, userInfo.lineUserId);
    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, type, dueDate, estimatedHours, status } = body;

    // 構建更新對象
    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (type !== undefined) {
      const validTypes = ["exam", "assignment", "project", "other"];
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { success: false, error: "Invalid type" },
          { status: 400 }
        );
      }
      updates.type = type;
    }
    if (dueDate !== undefined) updates.dueDate = typeof dueDate === "string" ? parseToUTC(dueDate) : new Date(dueDate);
    if (estimatedHours !== undefined) updates.estimatedHours = estimatedHours;
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

    // 更新 deadline
    const deadline = await deadlineService.updateDeadline(deadlineId, updates);
    if (!deadline) {
      return NextResponse.json(
        { success: false, error: "Failed to update deadline" },
        { status: 500 }
      );
    }

    // 格式化回應
    const formattedDeadline = {
      id: deadline._id.toString(),
      title: deadline.title,
      type: deadline.type,
      dueDate: deadline.dueDate instanceof Date
        ? deadline.dueDate.toISOString()
        : new Date(deadline.dueDate).toISOString(),
      estimatedHours: deadline.estimatedHours,
      status: deadline.status,
    };

    return NextResponse.json({
      success: true,
      data: formattedDeadline,
    });
  } catch (error) {
    Logger.error("Update deadline error", { error });
    return NextResponse.json(
      { success: false, error: "Failed to update deadline" },
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

    // 驗證所有權
    const hasPermission = await verifyDeadlineOwnership(deadlineId, userInfo.lineUserId);
    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access" },
        { status: 403 }
      );
    }

    // 刪除 deadline
    await deadlineService.deleteDeadline(deadlineId);

    return NextResponse.json({
      success: true,
      message: "Deadline deleted successfully",
    });
  } catch (error) {
    Logger.error("Delete deadline error", { error });
    return NextResponse.json(
      { success: false, error: "Failed to delete deadline" },
      { status: 500 }
    );
  }
}

