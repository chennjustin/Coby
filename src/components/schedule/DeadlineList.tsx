"use client";

import dayjs from "dayjs";
import DeadlineCard from "./DeadlineCard";

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

interface DeadlineListProps {
  selectedDate: Date | null;
  deadlines: Deadline[];
  onDeadlineClick: (deadline: Deadline) => void;
}

export default function DeadlineList({
  selectedDate,
  deadlines,
  onDeadlineClick,
}: DeadlineListProps) {
  // 過濾選中日期的 deadlines
  const filteredDeadlines = selectedDate
    ? deadlines.filter((deadline) => {
        const deadlineDate = dayjs(deadline.dueDate).startOf("day");
        const selected = dayjs(selectedDate).startOf("day");
        return deadlineDate.isSame(selected, "day");
      })
    : deadlines;

  // 按日期排序
  const sortedDeadlines = [...filteredDeadlines].sort((a, b) => {
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const getTitle = () => {
    if (!selectedDate) {
      return `所有待辦事項（${deadlines.length} 個）`;
    }

    const selected = dayjs(selectedDate);
    const today = dayjs();
    
    if (selected.isSame(today, "day")) {
      return `今天的待辦事項（${sortedDeadlines.length} 個）`;
    } else if (selected.isBefore(today, "day")) {
      return `${selected.format("YYYY 年 M 月 D 日")} 的待辦事項（${sortedDeadlines.length} 個）`;
    } else {
      return `${selected.format("YYYY 年 M 月 D 日")} 的待辦事項（${sortedDeadlines.length} 個）`;
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] p-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-6">{getTitle()}</h2>

      {sortedDeadlines.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">🌈</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            目前沒有任何待辦事項
          </h3>
          <p className="text-sm text-gray-500">
            {selectedDate
              ? "這一天可以好好休息！"
              : "你的人生一片光明！"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDeadlines.map((deadline) => (
            <DeadlineCard
              key={deadline.id}
              deadline={deadline}
              onClick={() => onDeadlineClick(deadline)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

