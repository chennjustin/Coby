"use client";

import dayjs from "dayjs";

interface Deadline {
  id: string;
  title: string;
  type: "exam" | "assignment" | "project" | "other";
  typeName: string;
  dueDate: string;
  dueDateFormatted: string;
  estimatedHours: number;
  daysLeft: number;
  isOverdue: boolean;
  isToday: boolean;
  status: "pending" | "done";
}

interface DeadlineCardProps {
  deadline: Deadline;
  onClick: () => void;
}

const TYPE_EMOJIS: Record<string, string> = {
  exam: "📝",
  assignment: "📄",
  project: "📦",
  other: "📌",
};

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  exam: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
  },
  assignment: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
  },
  project: {
    bg: "bg-green-50",
    border: "border-green-200",
    text: "text-green-700",
  },
  other: {
    bg: "bg-gray-50",
    border: "border-gray-200",
    text: "text-gray-700",
  },
};

export default function DeadlineCard({ deadline, onClick }: DeadlineCardProps) {
  const typeColor = TYPE_COLORS[deadline.type] || TYPE_COLORS.other;
  const emoji = TYPE_EMOJIS[deadline.type] || TYPE_EMOJIS.other;

  const getDaysLeftText = () => {
    if (deadline.isOverdue) {
      return `已過期 ${Math.abs(deadline.daysLeft)} 天`;
    }
    if (deadline.isToday) {
      return "今天截止";
    }
    return `剩餘 ${deadline.daysLeft} 天`;
  };

  const getStatusColor = () => {
    if (deadline.isOverdue) {
      return "text-red-600";
    }
    if (deadline.isToday) {
      return "text-orange-600";
    }
    return "text-green-600";
  };

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left p-5 rounded-xl border-2 transition-all
        ${typeColor.bg} ${typeColor.border}
        hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]
        focus:outline-none focus:ring-2 focus:ring-[#4f8cff] focus:ring-offset-2
      `}
    >
      <div className="flex items-start gap-4">
        {/* 圖標 */}
        <div className="text-3xl flex-shrink-0">{emoji}</div>

        {/* 內容 */}
        <div className="flex-1 min-w-0">
          {/* 標題和類型 */}
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-lg text-gray-800 truncate">
              {deadline.title}
            </h3>
            <span
              className={`
                px-2 py-0.5 rounded text-xs font-medium flex-shrink-0
                ${typeColor.text} ${typeColor.bg}
              `}
            >
              {deadline.typeName}
            </span>
          </div>

          {/* 日期和時間 */}
          <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-3">
            <div className="flex items-center gap-1">
              <span>📅</span>
              <span>{deadline.dueDateFormatted}</span>
            </div>
            <div className="flex items-center gap-1">
              <span>⏰</span>
              <span>{deadline.estimatedHours} 小時</span>
            </div>
          </div>

          {/* 剩餘時間 */}
          <div className={`text-sm font-semibold ${getStatusColor()}`}>
            {deadline.isOverdue && "⚠️ "}
            {deadline.isToday && !deadline.isOverdue && "⏰ "}
            {!deadline.isOverdue && !deadline.isToday && "⏳ "}
            {getDaysLeftText()}
          </div>
        </div>

        {/* 箭頭 */}
        <div className="flex-shrink-0 text-gray-400">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </button>
  );
}

