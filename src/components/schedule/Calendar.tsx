"use client";

import { useState, useMemo } from "react";
import dayjs from "dayjs";
import "dayjs/locale/zh-tw";

dayjs.locale("zh-tw");

interface Deadline {
  id: string;
  dueDate: string;
  type: "exam" | "assignment" | "project" | "other";
}

interface CalendarProps {
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
  deadlines: Deadline[];
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const TYPE_COLORS: Record<string, string> = {
  exam: "#FF6B6B",
  assignment: "#4ECDC4",
  project: "#95E1D3",
  other: "#F38181",
};

export default function Calendar({ selectedDate, onDateSelect, deadlines }: CalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(dayjs());

  // 生成日曆日期數組
  const calendarDays = useMemo(() => {
    const monthStart = currentMonth.startOf("month");
    const monthEnd = currentMonth.endOf("month");
    const startDate = monthStart.startOf("week");
    const endDate = monthEnd.endOf("week");
    
    const days = [];
    let current = startDate;
    while (current.isBefore(endDate) || current.isSame(endDate, "day")) {
      days.push(current);
      current = current.add(1, "day");
    }
    return days;
  }, [currentMonth]);

  // 獲取某個日期的 deadlines
  const getDeadlinesForDate = (date: dayjs.Dayjs) => {
    return deadlines.filter((deadline) => {
      const deadlineDate = dayjs(deadline.dueDate).startOf("day");
      return deadlineDate.isSame(date, "day");
    });
  };

  // 判斷是否為今天
  const isToday = (date: dayjs.Dayjs) => {
    return date.isSame(dayjs(), "day");
  };

  // 判斷是否為選中日期
  const isSelected = (date: dayjs.Dayjs) => {
    if (!selectedDate) return false;
    return date.isSame(dayjs(selectedDate), "day");
  };

  // 判斷是否為當前月份
  const isCurrentMonth = (date: dayjs.Dayjs) => {
    return date.month() === currentMonth.month();
  };

  // 切換月份
  const goToPreviousMonth = () => {
    setCurrentMonth(currentMonth.subtract(1, "month"));
  };

  const goToNextMonth = () => {
    setCurrentMonth(currentMonth.add(1, "month"));
  };

  return (
    <div className="bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] p-6">
      {/* 月份導航 */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={goToPreviousMonth}
          className="p-2 rounded-lg hover:bg-[#e8f1ff] transition-colors"
          aria-label="上一個月"
        >
          <svg
            className="w-5 h-5 text-[#4f8cff]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <h2 className="text-xl font-semibold text-gray-800">
          {currentMonth.format("YYYY 年 M 月")}
        </h2>
        <button
          onClick={goToNextMonth}
          className="p-2 rounded-lg hover:bg-[#e8f1ff] transition-colors"
          aria-label="下一個月"
        >
          <svg
            className="w-5 h-5 text-[#4f8cff]"
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
        </button>
      </div>

      {/* 星期標題 */}
      <div className="grid grid-cols-7 gap-2 mb-2">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="text-center text-sm font-medium text-gray-500 py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* 日期網格 */}
      <div className="grid grid-cols-7 gap-2">
        {calendarDays.map((date, index) => {
          const dateDeadlines = getDeadlinesForDate(date);
          const isCurrentMonthDay = isCurrentMonth(date);
          const isSelectedDay = isSelected(date);
          const isTodayDay = isToday(date);

          return (
            <button
              key={index}
              onClick={() => onDateSelect(date.toDate())}
              className={`
                relative aspect-square p-2 rounded-lg transition-all
                ${!isCurrentMonthDay ? "text-gray-300" : "text-gray-800"}
                ${isSelectedDay ? "bg-[#4f8cff] text-white font-semibold" : ""}
                ${!isSelectedDay && isCurrentMonthDay ? "hover:bg-[#e8f1ff]" : ""}
                ${isTodayDay && !isSelectedDay ? "ring-2 ring-[#4f8cff] ring-offset-1" : ""}
              `}
            >
              <span className="text-sm">{date.date()}</span>
              
              {/* 顯示 deadline 圓點 */}
              {dateDeadlines.length > 0 && (
                <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex gap-0.5">
                  {dateDeadlines.slice(0, 3).map((deadline, idx) => (
                    <div
                      key={idx}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: isSelectedDay
                          ? "white"
                          : TYPE_COLORS[deadline.type] || TYPE_COLORS.other,
                      }}
                    />
                  ))}
                  {dateDeadlines.length > 3 && (
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: isSelectedDay
                          ? "white"
                          : TYPE_COLORS.other,
                      }}
                    />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

