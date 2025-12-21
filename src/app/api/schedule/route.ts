import { NextRequest, NextResponse } from "next/server";
import { UserTokenService } from "@/services/user/user-token.service";
import { DeadlineService } from "@/services/deadline/deadline.service";
import { Logger } from "@/lib/utils/logger";

export const dynamic = 'force-dynamic';

const userTokenService = new UserTokenService();
const deadlineService = new DeadlineService();

export async function GET(request: NextRequest) {
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

    // 獲取該用戶的 deadlines
    const deadlines = await deadlineService.getDeadlinesByUser(
      userInfo.lineUserId,
      "pending"
    );

    // 格式化 deadlines（不包含敏感資訊）
    const formattedDeadlines = deadlines.map((deadline: any) => {
      const dueDate = deadline.dueDate instanceof Date
        ? deadline.dueDate
        : new Date(deadline.dueDate);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(dueDate);
      due.setHours(0, 0, 0, 0);
      const diffTime = due.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const typeMap: Record<string, string> = {
        exam: "考試",
        assignment: "作業",
        project: "專題",
        other: "其他",
      };
      
      return {
        id: deadline._id.toString(),
        title: deadline.title,
        type: deadline.type,
        typeName: typeMap[deadline.type] || "其他",
        dueDate: dueDate.toISOString(),
        dueDateFormatted: dueDate.toLocaleDateString("zh-TW", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        estimatedHours: deadline.estimatedHours,
        daysLeft: diffDays,
        isOverdue: diffDays < 0,
        isToday: diffDays === 0,
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedDeadlines,
    });
  } catch (error) {
    Logger.error("Get schedule error", { error });
    return NextResponse.json(
      { success: false, error: "Failed to get schedule" },
      { status: 500 }
    );
  }
}

