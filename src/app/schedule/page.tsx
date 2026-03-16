"use client";

import { useState, Suspense, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import dayjs from "dayjs";
import { useDeadlines, useStudyBlocks, Deadline, StudyBlock } from "@/hooks/useScheduleData";

// 時間軸配置
const HOURS = Array.from({ length: 17 }, (_, i) => i + 8); // 08:00 - 24:00
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

// 類型顏色配置
const TYPE_COLORS = {
  exam: {
    bg: "bg-red-100",
    border: "border-red-300",
    text: "text-red-800",
    badge: "bg-red-50 text-red-700",
  },
  assignment: {
    bg: "bg-blue-100",
    border: "border-blue-300",
    text: "text-blue-800",
    badge: "bg-blue-50 text-blue-700",
  },
  project: {
    bg: "bg-purple-100",
    border: "border-purple-300",
    text: "text-purple-800",
    badge: "bg-purple-50 text-purple-700",
  },
  other: {
    bg: "bg-gray-100",
    border: "border-gray-300",
    text: "text-gray-800",
    badge: "bg-gray-50 text-gray-700",
  },
};

// Deadline 紅色提醒顏色（細的樣式）
const DEADLINE_COLORS = {
  bg: "bg-red-100",
  border: "border-red-300",
  text: "text-red-900",
};

const TYPE_NAMES = {
  exam: "考試",
  assignment: "作業",
  project: "專題",
  other: "其他",
};

function ScheduleContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  // 週管理
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = dayjs();
    // 計算包含今天的那一週的星期一
    // dayjs().day() 返回 0-6（0=星期日，1=星期一，...，6=星期六）
    const dayOfWeek = today.day(); // 0=日, 1=一, 2=二, ..., 6=六
    // 計算到星期一的距離：
    // 如果今天是星期日（0），則星期一需要 +1 天（但我們要的是上週一，所以是 -6 天）
    // 如果今天是星期一（1），則星期一是今天（0天前）
    // 如果今天是星期二（2），則星期一是1天前（-1天）
    // 如果今天是星期三（3），則星期一是2天前（-2天）
    // 以此類推
    let daysToMonday: number;
    if (dayOfWeek === 0) {
      // 星期日：回到上週一（-6天）
      daysToMonday = -6;
    } else {
      // 其他日子：回到本週一（1 - dayOfWeek 天前）
      daysToMonday = 1 - dayOfWeek;
    }
    return today.add(daysToMonday, "day").startOf("day").toDate(); // Monday
  });

  // 手機版：單日視圖管理
  const [currentDay, setCurrentDay] = useState(() => dayjs().toDate());
  // 初始化時檢查是否為手機版（避免 SSR 問題）
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < 768; // md breakpoint
    }
    return false;
  });

  // 檢測是否為手機版
  useEffect(() => {
    const checkMobile = () => {
      setIsMobileView(window.innerWidth < 768); // md breakpoint
    };
    // 初始檢查
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const weekEnd = useMemo(() => {
    return dayjs(currentWeekStart).add(6, "day").toDate();
  }, [currentWeekStart]);

  // 手機版：根據 currentDay 計算資料載入範圍（前後各7天，確保切換日期時資料已載入）
  const mobileDateRange = useMemo(() => {
    if (isMobileView) {
      const start = dayjs(currentDay).subtract(7, "day").toDate();
      const end = dayjs(currentDay).add(7, "day").toDate();
      return { start, end };
    }
    return null;
  }, [isMobileView, currentDay]);

  // 載入資料：手機版使用 currentDay 的範圍，桌面版使用 currentWeekStart 的範圍
  // 擴大查詢範圍，確保包含所有相關的 blocks（前後各擴展 7 天）
  const expandedWeekStart = useMemo(() => {
    const base = isMobileView && mobileDateRange ? mobileDateRange.start : currentWeekStart;
    return dayjs(base).subtract(7, "day").toDate();
  }, [isMobileView, mobileDateRange, currentWeekStart]);
  
  const expandedWeekEnd = useMemo(() => {
    const base = isMobileView && mobileDateRange ? mobileDateRange.end : weekEnd;
    return dayjs(base).add(7, "day").toDate();
  }, [isMobileView, mobileDateRange, weekEnd]);

  const { deadlines, loading: deadlinesLoading, error: deadlinesError, refetch: refetchDeadlines } = useDeadlines(
    token, 
    expandedWeekStart,
    expandedWeekEnd
  );
  const { studyBlocks, loading: blocksLoading, error: blocksError, refetch: refetchBlocks } = useStudyBlocks(
    token,
    expandedWeekStart,
    expandedWeekEnd
  );

  // Debug: 檢查載入的資料（僅在客戶端）
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    console.log("Study blocks loaded:", studyBlocks.length, studyBlocks);
    console.log("Deadlines loaded:", deadlines.length, deadlines);
    
    // 檢查每個 deadline 的 blocks 數量
    deadlines.forEach((deadline) => {
      const blocksForDeadline = studyBlocks.filter((b) => b.deadlineId === deadline.id);
      const totalHours = blocksForDeadline.reduce((sum, b) => sum + b.duration, 0);
      console.log(`Deadline "${deadline.title}": ${blocksForDeadline.length} blocks, ${totalHours}/${deadline.estimatedHours} hours`);
    });
  }, [studyBlocks, deadlines]);

  // Modal/Drawer 狀態
  const [selectedItem, setSelectedItem] = useState<{ type: "deadline" | "block"; data: Deadline | StudyBlock } | null>(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [clickedDate, setClickedDate] = useState<{ date: Date; hour: number } | null>(null);
  const [resizingBlockId, setResizingBlockId] = useState<string | null>(null);

  // 計算一週的日期
  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      return dayjs(currentWeekStart).add(i, "day").toDate();
    });
  }, [currentWeekStart]);

  // 判斷是否為今天
  const isToday = useCallback((date: Date) => {
    return dayjs(date).isSame(dayjs(), "day");
  }, []);

  // 獲取某個日期某個小時的 deadlines（紅色提醒，顯示在截止日當天的實際時間）
  // 確保所有 deadline 都會顯示：
  // - 如果時間在 08:00-23:59 範圍內，顯示在對應的小時槽
  // - 如果時間 < 08:00，顯示在 08:00 的時間槽
  // - 如果時間 >= 24:00，顯示在 23:00 的時間槽（23:59）
  const getDeadlinesAtSlot = useCallback((date: Date, hour: number) => {
    if (!deadlines || deadlines.length === 0) return [];
    return deadlines.filter((d) => {
      try {
        if (!d || !d.dueDate) return false;
        const deadlineDateTime = dayjs(d.dueDate);
        if (!deadlineDateTime.isValid()) return false;
        const deadlineDate = deadlineDateTime.format("YYYY-MM-DD");
        const deadlineHour = deadlineDateTime.hour();
        const slotDate = dayjs(date).format("YYYY-MM-DD");
        
        // 確保日期匹配
        if (deadlineDate !== slotDate) return false;
        
        // 如果時間在 HOURS 範圍內（08:00-23:59），直接匹配小時
        if (deadlineHour >= 8 && deadlineHour <= 23) {
          return deadlineHour === hour;
        }
        
        // 如果時間 < 08:00 或 >= 24:00，顯示在 23:00 的時間槽（23:59 的位置）
        if ((deadlineHour < 8 || deadlineHour >= 24) && hour === 23) {
          return true;
        }
        
        return false;
      } catch (error) {
        console.error("Error processing deadline:", error, d);
        return false;
      }
    });
  }, [deadlines]);

  // 獲取某個日期某個小時的 study blocks
  const getStudyBlocksAtSlot = useCallback((date: Date, hour: number) => {
    if (!studyBlocks || studyBlocks.length === 0) return [];
    const dateStr = dayjs(date).format("YYYY-MM-DD");
    return studyBlocks.filter((block) => {
      try {
        if (!block || !block.startTime) return false;
        const blockStartTime = dayjs(block.startTime);
        if (!blockStartTime.isValid()) return false;
        const blockDate = blockStartTime.format("YYYY-MM-DD");
        const blockHour = blockStartTime.hour();
        return blockDate === dateStr && blockHour === hour;
      } catch (error) {
        console.error("Error processing study block:", error, block);
        return false;
      }
    });
  }, [studyBlocks]);

  // 獲取某個日期所有時間的 study blocks（用於計算位置和高度）
  // 按開始時間排序，確保時間較早的 block 序號較小
  const getAllStudyBlocksForDate = useCallback((date: Date) => {
    if (!studyBlocks || studyBlocks.length === 0) return [];
    const dateStr = dayjs(date).format("YYYY-MM-DD");
    const blocks = studyBlocks.filter((block) => {
      try {
        if (!block || !block.startTime) return false;
        const blockStartTime = dayjs(block.startTime);
        if (!blockStartTime.isValid()) return false;
        const blockDate = blockStartTime.format("YYYY-MM-DD");
        return blockDate === dateStr;
      } catch (error) {
        console.error("Error processing study block:", error, block);
        return false;
      }
    });
    // 按開始時間排序，確保時間較早的 block 在前面
    return blocks.sort((a, b) => {
      const timeA = dayjs(a.startTime).valueOf();
      const timeB = dayjs(b.startTime).valueOf();
      return timeA - timeB;
    });
  }, [studyBlocks]);

  // 根據 deadlineId 獲取對應的死線，用於決定顏色
  const getDeadlineById = useCallback((deadlineId: string) => {
    return deadlines.find((d) => d.id === deadlineId);
  }, [deadlines]);

  // 為不同的死線生成不同的顏色（基於 deadlineId 的 hash）
  // 確保同一個 deadline 的所有 blocks 使用相同顏色，不同 deadline 使用不同顏色
  const getBlockColorByDeadlineId = useCallback((deadlineId: string) => {
    const deadline = getDeadlineById(deadlineId);
    if (!deadline) return TYPE_COLORS.other;
    
    // 使用 deadlineId 的 hash 來生成不同的顏色變體
    let hash = 0;
    for (let i = 0; i < deadlineId.length; i++) {
      hash = deadlineId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // 預定義的顏色調色板（基於 type，但每個 deadline 會有不同的色調）
    const colorPalettes = {
      exam: [
        { bg: "bg-red-100", border: "border-red-300", text: "text-red-800", badge: "bg-red-50 text-red-700" },
        { bg: "bg-red-200", border: "border-red-400", text: "text-red-900", badge: "bg-red-100 text-red-800" },
        { bg: "bg-pink-100", border: "border-pink-300", text: "text-pink-800", badge: "bg-pink-50 text-pink-700" },
      ],
      assignment: [
        { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-800", badge: "bg-blue-50 text-blue-700" },
        { bg: "bg-blue-200", border: "border-blue-400", text: "text-blue-900", badge: "bg-blue-100 text-blue-800" },
        { bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-800", badge: "bg-cyan-50 text-cyan-700" },
        { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-800", badge: "bg-indigo-50 text-indigo-700" },
      ],
      project: [
        { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-800", badge: "bg-purple-50 text-purple-700" },
        { bg: "bg-purple-200", border: "border-purple-400", text: "text-purple-900", badge: "bg-purple-100 text-purple-800" },
        { bg: "bg-violet-100", border: "border-violet-300", text: "text-violet-800", badge: "bg-violet-50 text-violet-700" },
        { bg: "bg-fuchsia-100", border: "border-fuchsia-300", text: "text-fuchsia-800", badge: "bg-fuchsia-50 text-fuchsia-700" },
      ],
      other: [
        { bg: "bg-gray-100", border: "border-gray-300", text: "text-gray-800", badge: "bg-gray-50 text-gray-700" },
        { bg: "bg-slate-100", border: "border-slate-300", text: "text-slate-800", badge: "bg-slate-50 text-slate-700" },
      ],
    };
    
    const palette = colorPalettes[deadline.type] || colorPalettes.other;
    const colorIndex = Math.abs(hash) % palette.length;
    
    return palette[colorIndex];
  }, [getDeadlineById]);

  // 手機版：獲取單日的 blocks 和 deadlines
  const getDayBlocks = useCallback((date: Date) => {
    const dateStr = dayjs(date).format("YYYY-MM-DD");
    return studyBlocks.filter((block) => {
      const blockDate = dayjs(block.startTime).format("YYYY-MM-DD");
      return blockDate === dateStr;
    });
  }, [studyBlocks]);

  const getDayDeadlines = useCallback((date: Date) => {
    const dateStr = dayjs(date).format("YYYY-MM-DD");
    return deadlines.filter((deadline) => {
      const deadlineDate = dayjs(deadline.dueDate).format("YYYY-MM-DD");
      return deadlineDate === dateStr;
    });
  }, [deadlines]);

  // 週切換
  const goToPrevWeek = () => {
    setCurrentWeekStart(dayjs(currentWeekStart).subtract(1, "week").toDate());
  };

  const goToNextWeek = () => {
    setCurrentWeekStart(dayjs(currentWeekStart).add(1, "week").toDate());
  };

  // 手機版：單日切換
  const goToPrevDay = () => {
    setCurrentDay(dayjs(currentDay).subtract(1, "day").toDate());
  };

  const goToNextDay = () => {
    setCurrentDay(dayjs(currentDay).add(1, "day").toDate());
  };

  const goToToday = () => {
    setCurrentDay(dayjs().toDate());
    setCurrentWeekStart(dayjs().startOf("week").add(1, "day").toDate());
  };

  // 週範圍文字
  const weekRangeText = () => {
    const start = dayjs(currentWeekStart);
    const end = start.add(6, "day");
    return `${start.format("YYYY 年 M 月 D 日")} – ${end.format("M 月 D 日")}`;
  };

  // 計算剩餘天數
  const getDaysLeft = (dueDate: string) => {
    const days = dayjs(dueDate).diff(dayjs(), "day");
    if (days < 0) return `已過期 ${Math.abs(days)} 天`;
    if (days === 0) return "今天截止";
    return `剩餘 ${days} 天`;
  };

  // 拖曳處理（支援死線和讀書時間）

  // 調整大小處理 - 使用 debounce 優化性能
  const handleResizeStart = (blockId: string) => {
    setResizingBlockId(blockId);
  };

  // 使用 useRef 來存儲 debounce timer
  const resizeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingResizeRef = useRef<{ blockId: string; newDuration: number } | null>(null);

  const handleResize = useCallback((blockId: string, newDuration: number) => {
    if (newDuration < 0.5 || newDuration > 4) return;

    // 保存待處理的 resize 請求
    pendingResizeRef.current = { blockId, newDuration };

    // 清除之前的 timer
    if (resizeTimerRef.current) {
      clearTimeout(resizeTimerRef.current);
    }

    // 設置新的 timer，300ms 後執行實際更新
    resizeTimerRef.current = setTimeout(async () => {
      const pending = pendingResizeRef.current;
      if (!pending || !token) {
        setResizingBlockId(null);
        return;
      }

      const block = studyBlocks.find((b) => b.id === pending.blockId);
      if (!block) {
        setResizingBlockId(null);
        return;
      }

      const startTime = new Date(block.startTime);
      const newEndTime = dayjs(startTime).add(pending.newDuration, "hour").toDate();

      try {
        const url = new URL(`${window.location.origin}/api/study-blocks/${pending.blockId}`);
        url.searchParams.set("token", token);

        const response = await fetch(url.toString(), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endTime: newEndTime.toISOString(),
            duration: pending.newDuration,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to update block");
        }

        // 只在成功後才重新載入資料
        refetchBlocks();
      } catch (error) {
        console.error("Failed to resize block:", error);
        alert("調整失敗，請稍後再試");
      } finally {
        setResizingBlockId(null);
        pendingResizeRef.current = null;
      }
    }, 300);
  }, [studyBlocks, token, refetchBlocks]);

  // 清理 timer
  useEffect(() => {
    return () => {
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
      }
    };
  }, []);

  // 點擊處理
  const handleDeadlineClick = (deadline: Deadline) => {
    setSelectedItem({ type: "deadline", data: deadline });
    setIsDetailPanelOpen(true);
  };

  const handleBlockClick = (block: StudyBlock) => {
    setSelectedItem({ type: "block", data: block });
    setIsDetailPanelOpen(true);
  };

  const handleEmptySlotClick = (date: Date, hour: number) => {
    setClickedDate({ date, hour });
    setIsAddModalOpen(true);
  };

  // 今天的待辦事項：顯示今天有安排的學習時段
  const todayTodos = useMemo(() => {
    const today = dayjs().format("YYYY-MM-DD");
    const todayBlocks = studyBlocks.filter((block) => {
      try {
        if (!block || !block.startTime) return false;
        const blockStartTime = dayjs(block.startTime);
        if (!blockStartTime.isValid()) return false;
        const blockDate = blockStartTime.format("YYYY-MM-DD");
        return blockDate === today;
      } catch (error) {
        return false;
      }
    });

    // 根據 deadlineId 分組，並獲取對應的 deadline 資訊
    const deadlineMap = new Map<string, Deadline>();
    deadlines.forEach((d) => {
      deadlineMap.set(d.id, d);
    });

    // 創建一個 Map 來儲存每個 deadline 的今天時段
    const todosMap = new Map<string, { deadline: Deadline; blocks: StudyBlock[]; totalHours: number }>();

    todayBlocks.forEach((block) => {
      const deadlineId = block.deadlineId;
      const deadline = deadlineMap.get(deadlineId);
      if (!deadline) return;

      if (!todosMap.has(deadlineId)) {
        todosMap.set(deadlineId, {
          deadline,
          blocks: [],
          totalHours: 0,
        });
      }

      const todo = todosMap.get(deadlineId)!;
      todo.blocks.push(block);
      const duration = dayjs(block.endTime).diff(dayjs(block.startTime), "hour", true);
      todo.totalHours += duration;
    });

    // 轉換為陣列並排序（按開始時間）
    return Array.from(todosMap.values()).map((todo) => ({
      ...todo,
      blocks: todo.blocks.sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf()),
    }));
  }, [studyBlocks, deadlines]);

  // 計算 block 的位置和高度
  const calculateBlockPosition = (block: StudyBlock, date: Date) => {
    try {
      if (!block || !block.startTime || !block.endTime) {
        return { top: 0, height: 32 };
      }
      const blockStart = dayjs(block.startTime);
      const blockEnd = dayjs(block.endTime);
      const slotDate = dayjs(date);
      
      if (!blockStart.isValid() || !blockEnd.isValid() || !slotDate.isValid()) {
        return { top: 0, height: 32 };
      }
      
      const startHour = blockStart.hour();
      const startMinute = blockStart.minute();
      const endHour = blockEnd.hour();
      const endMinute = blockEnd.minute();

      // 計算在該日期中的位置（相對於該日期的第一個小時）
      const slotStartHour = HOURS[0]; // 8
      const topOffset = (startHour - slotStartHour) * 64 + (startMinute / 60) * 64; // 64px per hour
      const height = (endHour - startHour) * 64 + ((endMinute - startMinute) / 60) * 64;

      // Debug: 檢查計算結果
      console.log(`Block ${block.title} position:`, {
        startHour,
        startMinute,
        endHour,
        endMinute,
        topOffset,
        height,
        blockStart: blockStart.format("YYYY-MM-DD HH:mm"),
        blockEnd: blockEnd.format("YYYY-MM-DD HH:mm"),
      });

      return { top: topOffset, height: Math.max(height, 32) }; // 最小高度 32px
    } catch (error) {
      console.error("Error calculating block position:", error, block);
      return { top: 0, height: 32 };
    }
  };

  // 載入狀態
  if (!token) {
    return (
      <div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-light text-red-700 mb-2">錯誤</div>
          <div className="text-sm text-gray-500">缺少 token 參數，請從 LINE Bot 開啟時程表</div>
        </div>
      </div>
    );
  }

  if (deadlinesLoading || blocksLoading) {
    return (
      <div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-light text-gray-700 mb-2">載入中...</div>
          <div className="text-sm text-gray-500">正在載入你的時程表</div>
        </div>
      </div>
    );
  }

  // 錯誤狀態
  if (deadlinesError || blocksError) {
    return (
      <div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-light text-red-700 mb-2">載入失敗</div>
          <div className="text-sm text-gray-500 mb-4">{deadlinesError || blocksError}</div>
          <button
            onClick={() => {
              refetchDeadlines();
              refetchBlocks();
            }}
            className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
          >
            重試
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-[#F7F7F7] pb-16 sm:pb-8">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 pt-4 sm:pt-8">
          {/* Header */}
          <div className="mb-4 sm:mb-8 text-center">
            <h1 className="text-2xl sm:text-3xl font-light text-gray-800 mb-1">我的時程表</h1>
            <p className="text-xs sm:text-sm text-gray-500">Coby</p>
          </div>

          {/* 手機版：單日視圖 */}
          {isMobileView ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
              {/* 日期導覽 */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={goToPrevDay}
                  className="p-2 rounded-lg active:bg-gray-50 transition-colors text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex flex-col items-center">
                  <span className="text-sm font-medium text-gray-700">
                    {dayjs(currentDay).format("M 月 D 日")}
                  </span>
                  <span className="text-xs text-gray-500">
                    {WEEKDAYS[dayjs(currentDay).day()]}
                    {isToday(currentDay) && " · 今天"}
                  </span>
                </div>
                <button
                  onClick={goToNextDay}
                  className="p-2 rounded-lg active:bg-gray-50 transition-colors text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <button
                onClick={goToToday}
                className="w-full py-2 text-xs text-blue-600 hover:text-blue-700 active:bg-blue-50 rounded-lg transition-colors mb-4"
              >
                回到今天
              </button>

              {/* 單日時間軸 */}
              <div className="space-y-2">
                {HOURS.map((hour) => {
                  // 獲取該小時的 deadlines，確保所有 deadline 都會顯示
                  const hourDeadlines = getDayDeadlines(currentDay).filter((d) => {
                    const deadlineHour = dayjs(d.dueDate).hour();
                    // 如果時間在 HOURS 範圍內（08:00-23:59），直接匹配小時
                    if (deadlineHour >= 8 && deadlineHour <= 23) {
                      return deadlineHour === hour;
                    }
                    // 如果時間 < 08:00 或 >= 24:00，顯示在 23:00 的時間槽（23:59 的位置）
                    if ((deadlineHour < 8 || deadlineHour >= 24) && hour === 23) {
                      return true;
                    }
                    return false;
                  });
                  const hourBlocks = getDayBlocks(currentDay).filter((b) => {
                    return dayjs(b.startTime).hour() === hour;
                  });

                  return (
                    <div
                      key={hour}
                      className="border border-gray-200 rounded-lg p-2 min-h-[60px] bg-gray-50"
                    >
                      <div className="flex items-start gap-2 mb-1">
                        <span className="text-xs font-medium text-gray-500 w-12 flex-shrink-0">
                          {hour}:00
                        </span>
                        <div className="flex-1 space-y-1">
                          {/* Deadlines（不可拖曳） */}
                          {hourDeadlines.map((deadline) => {
                            const deadlineDateTime = dayjs(deadline.dueDate);
                            return (
                              <div
                                key={`deadline-${deadline.id}`}
                                className={`${DEADLINE_COLORS.bg} ${DEADLINE_COLORS.border} border rounded px-2 py-1 text-xs cursor-pointer hover:shadow-md transition-shadow`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeadlineClick(deadline);
                                }}
                              >
                                <div className="flex items-center gap-1">
                                  <span>⚠️</span>
                                  <span className="font-medium text-red-900 truncate">{deadline.title}</span>
                                  <span className="text-red-700 text-[10px]">
                                    {deadlineDateTime.format("HH:mm")}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          {/* Blocks（不可拖曳） */}
                          {hourBlocks
                            .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf())
                            .map((block) => {
                            const colors = getBlockColorByDeadlineId(block.deadlineId);
                            return (
                              <div
                                key={block.id}
                                className={`${colors.bg} ${colors.border} border rounded px-2 py-1 text-xs cursor-pointer hover:shadow-md transition-all`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleBlockClick(block);
                                }}
                              >
                                <div className="font-medium text-gray-800 truncate">{block.title}</div>
                                <div className="text-[10px] text-gray-600 flex items-center gap-1 mt-0.5">
                                  <span className={colors.badge + " px-1 py-0.5 rounded"}>
                                    {TYPE_NAMES[block.type]}
                                  </span>
                                  <span>{dayjs(block.startTime).format("HH:mm")}</span>
                                </div>
                              </div>
                            );
                          })}
                          {hourDeadlines.length === 0 && hourBlocks.length === 0 && (
                            <div className="text-[10px] text-gray-400">無安排</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* 桌面版：週視圖 */
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 mb-6 sm:mb-8">
              {/* 週導覽 */}
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <button
                  onClick={goToPrevWeek}
                  className="p-2 rounded-lg hover:bg-gray-50 transition-colors text-gray-600 hover:text-gray-800"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm font-medium text-gray-700">{weekRangeText()}</span>
                <button
                  onClick={goToNextWeek}
                  className="p-2 rounded-lg hover:bg-gray-50 transition-colors text-gray-600 hover:text-gray-800"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Calendar Grid */}
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="flex min-w-[800px] px-4 sm:px-0">
                {/* 時間軸 */}
                <div className="w-20 flex-shrink-0 pr-4">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="h-16 border-b border-gray-100 flex items-start justify-end pr-2"
                    >
                      <span className="text-xs text-gray-400 font-light">{hour}:00</span>
                    </div>
                  ))}
                </div>

                {/* 日期欄 */}
                <div className="flex-1 grid grid-cols-7 gap-px bg-gray-100">
                  {weekDates.map((date, colIndex) => {
                    const isTodayColumn = isToday(date);
                    const dateStr = dayjs(date).format("YYYY-MM-DD");
                    const allBlocksForDate = getAllStudyBlocksForDate(date);
                    // 使用實際日期的星期幾，而不是 colIndex
                    const actualDayOfWeek = dayjs(date).day(); // 0=日, 1=一, ..., 6=六

                    return (
                      <div
                        key={colIndex}
                        className={`relative ${isTodayColumn ? "bg-gray-50" : "bg-white"}`}
                          >
                            {/* 日期標題 */}
                            <div className="sticky top-0 z-10 bg-inherit border-b border-gray-100 p-2">
                              <div className="text-center">
                                <div className="text-xs text-gray-500 mb-1">{WEEKDAYS[actualDayOfWeek]}</div>
                                <div className="text-sm font-medium text-gray-700">
                                  {dayjs(date).format("D")}
                                </div>
                                {isTodayColumn && (
                                  <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                                    今天
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 時間格子容器 */}
                            <div className="relative" style={{ height: `${HOURS.length * 64}px` }}>
                              {/* 時間格子 */}
                              {HOURS.map((hour) => {
                                const slotDeadlines = getDeadlinesAtSlot(date, hour);
                                const slotBlocks = getStudyBlocksAtSlot(date, hour);

                                return (
                                  <div
                                    key={hour}
                                    className="h-16 border-b border-gray-100 relative group cursor-pointer"
                                    onClick={() => handleEmptySlotClick(date, hour)}
                                    style={{ minHeight: "64px" }}
                                  >
                                    {/* 空白格子的 hover 效果 */}
                                    {slotDeadlines.length === 0 && slotBlocks.length === 0 && (
                                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-blue-50 transition-opacity" />
                                    )}

                                    {/* Deadline 紅色提醒（顯示在實際截止時間，細的樣式，不可拖曳） */}
                                    {slotDeadlines.map((deadline) => {
                                      const deadlineDateTime = dayjs(deadline.dueDate);
                                      const deadlineHour = deadlineDateTime.hour();
                                      const deadlineMinute = deadlineDateTime.minute();
                                      
                                      // 如果時間 < 08:00，顯示在 23:00 的時間槽（23:59 的位置）
                                      // 如果時間 >= 24:00，也顯示在 23:00 的時間槽
                                      let displayHour = deadlineHour;
                                      let displayMinute = deadlineMinute;
                                      if (deadlineHour < 8 || deadlineHour >= 24) {
                                        displayHour = 23;
                                        displayMinute = 59;
                                      }
                                      
                                      // 計算在該小時槽中的位置（分鐘偏移）
                                      const minuteOffset = (displayMinute / 60) * 64; // 64px per hour
                                      
                                      return (
                                        <div
                                          key={`deadline-${deadline.id}`}
                                          className={`absolute left-2 right-2 ${DEADLINE_COLORS.bg} ${DEADLINE_COLORS.border} border rounded-md shadow-sm px-2 py-1 cursor-pointer hover:shadow-md transition-shadow z-30`}
                                          style={{
                                            top: `${minuteOffset}px`,
                                            height: "32px", // 細的高度
                                            minHeight: "32px",
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeadlineClick(deadline);
                                          }}
                                        >
                                          <div className="flex items-center gap-1.5 h-full">
                                            <span className="text-xs">⚠️</span>
                                            <div className="flex-1 min-w-0">
                                              <div className="text-xs font-semibold text-red-900 truncate leading-tight">
                                                {deadline.title}
                                              </div>
                                              <div className="text-[10px] text-red-700 leading-tight">
                                                截止日 {deadlineDateTime.format("HH:mm")}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })}

                              {/* Study Blocks（絕對定位） */}
                              {allBlocksForDate.map((block, blockIndex) => {
                                const position = calculateBlockPosition(block, date);
                                const { top, height } = position;
                                // 使用對應死線的顏色，而不是 block.type
                                const colors = getBlockColorByDeadlineId(block.deadlineId);
                                
                                // 檢查 block 是否在顯示範圍內
                                const blockStartHour = dayjs(block.startTime).hour();
                                const blockEndHour = dayjs(block.endTime).hour();
                                const minHour = HOURS[0]; // 8
                                const maxHour = HOURS[HOURS.length - 1]; // 24
                                
                                // 如果 block 完全在顯示範圍外，不顯示
                                if (blockEndHour < minHour || blockStartHour > maxHour) {
                                  return null;
                                }

                                // 計算該日期欄中所有可拖動項目的總索引
                                // 死線在前，blocks 在後
                                const blockDateStr = dayjs(date).format("YYYY-MM-DD");
                                const allDeadlinesForDate = deadlines.filter((d) => {
                                  const dDate = dayjs(d.dueDate).format("YYYY-MM-DD");
                                  return dDate === blockDateStr;
                                });
                                const globalBlockIndex = allDeadlinesForDate.length + blockIndex;

                                // 如果是 1 小時的區塊，使用更緊湊的設計
                                const isOneHour = block.duration <= 1;
                                
                                return (
                                  <div
                                    key={block.id}
                                    className={`absolute left-1 right-1 ${colors.bg} ${colors.border} border-2 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-all z-20 ${
                                      isOneHour ? "px-1.5 py-1" : "p-2"
                                    }`}
                                    style={{
                                      top: `${top}px`,
                                      height: `${height}px`,
                                      minHeight: isOneHour ? "48px" : "32px",
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleBlockClick(block);
                                    }}
                                  >
                                        {isOneHour ? (
                                          // 1 小時的緊湊設計
                                          <div className="flex items-center gap-1.5 h-full">
                                            <div className="flex-1 min-w-0">
                                              <div className="text-xs font-medium text-gray-800 truncate leading-tight">
                                                {block.title}
                                              </div>
                                              <div className="text-[10px] text-gray-600 leading-tight flex items-center gap-1 mt-0.5">
                                                <span className={`${colors.badge} px-1 py-0.5 rounded text-[9px]`}>
                                                  {TYPE_NAMES[block.type]}
                                                </span>
                                                <span className="text-gray-500">
                                                  {block.blockIndex}/{block.totalBlocks}
                                                </span>
                                                <span className="text-gray-400">
                                                  {dayjs(block.startTime).format("HH:mm")}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        ) : (
                                          // 多小時的完整設計
                                          <>
                                            <div className="text-xs font-medium text-gray-800 mb-1 truncate leading-tight">
                                              {block.title}
                                            </div>
                                            <div className="text-[10px] text-gray-600 space-y-0.5 leading-tight">
                                              <div className="flex items-center gap-1">
                                                <span className={`${colors.badge} px-1.5 py-0.5 rounded text-[10px]`}>
                                                  {TYPE_NAMES[block.type]}
                                                </span>
                                                <span className="text-gray-500">
                                                  {block.blockIndex}/{block.totalBlocks}
                                                </span>
                                              </div>
                                              <div className="truncate">
                                                {dayjs(block.startTime).format("HH:mm")} - {dayjs(block.endTime).format("HH:mm")}
                                              </div>
                                            </div>
                                          </>
                                        )}

                                        {/* 調整大小 handle */}
                                        <div
                                          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize bg-gray-300 hover:bg-gray-400 rounded-b-lg"
                                          onMouseDown={(e) => {
                                            e.stopPropagation();
                                            handleResizeStart(block.id);
                                            const startY = e.clientY;
                                            const startHeight = height;
                                            const startDuration = block.duration;

                                            const handleMouseMove = (moveEvent: MouseEvent) => {
                                              const deltaY = moveEvent.clientY - startY;
                                              const deltaHours = deltaY / 64; // 64px per hour
                                              const newDuration = Math.max(0.5, Math.min(4, startDuration + deltaHours));
                                              const newHeight = newDuration * 64;
                                              
                                              // 視覺更新（不立即保存）
                                              const element = e.currentTarget.parentElement;
                                              if (element) {
                                                element.style.height = `${newHeight}px`;
                                              }
                                            };

                                            const handleMouseUp = (upEvent: MouseEvent) => {
                                              const deltaY = upEvent.clientY - startY;
                                              const deltaHours = deltaY / 64;
                                              const newDuration = Math.max(0.5, Math.min(4, startDuration + deltaHours));
                                              
                                              handleResize(block.id, newDuration);
                                              document.removeEventListener("mousemove", handleMouseMove);
                                              document.removeEventListener("mouseup", handleMouseUp);
                                            };

                                            document.addEventListener("mousemove", handleMouseMove);
                                            document.addEventListener("mouseup", handleMouseUp);
                                          }}
                                        />
                                      </div>
                                );
                              })}
                            </div>
                          </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          )}

          {/* 今天的待辦事項 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-light text-gray-800 mb-3 sm:mb-4">今天的待辦事項</h2>
            {todayTodos.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                今天沒有任何待辦事項哦～請好好休息！！
              </div>
            ) : (
              <div className="space-y-3">
                {todayTodos.map((todo) => {
                  const colors = TYPE_COLORS[todo.deadline.type];
                  const firstBlock = todo.blocks[0];
                  const lastBlock = todo.blocks[todo.blocks.length - 1];
                  const startTime = dayjs(firstBlock.startTime).format("HH:mm");
                  const endTime = dayjs(lastBlock.endTime).format("HH:mm");
                  
                  return (
                    <div
                      key={todo.deadline.id}
                      className="flex items-center justify-between p-3 sm:p-4 rounded-xl border border-gray-100 active:bg-gray-50 sm:hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => handleDeadlineClick(todo.deadline)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-medium text-gray-800 truncate">{todo.deadline.title}</span>
                          <span className={`${colors.badge} px-2 py-0.5 rounded text-xs flex-shrink-0`}>
                            {TYPE_NAMES[todo.deadline.type]}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 space-y-0.5">
                          <div>
                            {startTime} - {endTime} · 共 {todo.blocks.length} 個時段 · {todo.totalHours.toFixed(1)} 小時
                          </div>
                          <div>
                            截止：{dayjs(todo.deadline.dueDate).format("M 月 D 日 HH:mm")} · {getDaysLeft(todo.deadline.dueDate)}
                          </div>
                        </div>
                      </div>
                      <svg className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 詳細 Panel (Drawer) */}
        {isDetailPanelOpen && selectedItem && (
          <DetailPanel
            item={selectedItem}
            token={token}
            onClose={() => {
              setIsDetailPanelOpen(false);
              setSelectedItem(null);
            }}
            onUpdate={() => {
              refetchDeadlines();
              refetchBlocks();
            }}
          />
        )}

        {/* 新增 Modal */}
        {isAddModalOpen && clickedDate && (
          <AddDeadlineModal
            clickedDate={clickedDate}
            token={token}
            onClose={() => {
              setIsAddModalOpen(false);
              setClickedDate(null);
            }}
            onSuccess={() => {
              refetchDeadlines();
              refetchBlocks();
            }}
          />
        )}
      </div>
    </>
  );
}

// Detail Panel Component
function DetailPanel({
  item,
  token,
  onClose,
  onUpdate,
}: {
  item: { type: "deadline" | "block"; data: Deadline | StudyBlock };
  token: string | null;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>(null);

  useEffect(() => {
    if (item.type === "deadline") {
      const deadline = item.data as Deadline;
      const deadlineDate = dayjs(deadline.dueDate);
      setFormData({
        title: deadline.title,
        type: deadline.type,
        dueDate: deadlineDate.format("YYYY-MM-DD"),
        dueTime: deadlineDate.format("HH:mm"), // 使用實際的截止時間
        estimatedHours: deadline.estimatedHours,
      });
    } else {
      const block = item.data as StudyBlock;
      setFormData({
        startTime: dayjs(block.startTime).format("YYYY-MM-DDTHH:mm"),
        endTime: dayjs(block.endTime).format("YYYY-MM-DDTHH:mm"),
        duration: block.duration,
        title: block.title,
      });
    }
  }, [item]);

  const handleUpdate = async () => {
    if (!token || !formData) return;

    try {
      let url: string;
      let body: any;

      if (item.type === "deadline") {
        const deadline = item.data as Deadline;
        url = `${window.location.origin}/api/deadlines/${deadline.id}?token=${encodeURIComponent(token)}`;
        body = {
          title: formData.title,
          type: formData.type,
          dueDate: new Date(`${formData.dueDate}T${formData.dueTime}:00`).toISOString(),
          estimatedHours: formData.estimatedHours,
        };
      } else {
        const block = item.data as StudyBlock;
        url = `${window.location.origin}/api/study-blocks/${block.id}?token=${encodeURIComponent(token)}`;
        body = {
          startTime: new Date(formData.startTime).toISOString(),
          endTime: new Date(formData.endTime).toISOString(),
          duration: formData.duration,
          title: formData.title,
        };
      }

      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error("更新失敗");
      }

      setIsEditing(false);
      onUpdate();
      onClose();
    } catch (error) {
      console.error("Update error:", error);
      alert("更新失敗，請稍後再試");
    }
  };

  const handleDelete = async () => {
    if (!token || !confirm("確定要刪除嗎？")) return;

    try {
      let url: string;
      if (item.type === "deadline") {
        const deadline = item.data as Deadline;
        url = `${window.location.origin}/api/deadlines/${deadline.id}?token=${encodeURIComponent(token)}`;
      } else {
        const block = item.data as StudyBlock;
        url = `${window.location.origin}/api/study-blocks/${block.id}?token=${encodeURIComponent(token)}`;
      }

      const response = await fetch(url, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("刪除失敗");
      }

      onUpdate();
      onClose();
    } catch (error) {
      console.error("Delete error:", error);
      alert("刪除失敗，請稍後再試");
    }
  };

  if (!formData) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-end">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white w-full sm:w-96 h-[85vh] sm:h-auto rounded-t-2xl sm:rounded-l-2xl shadow-xl p-4 sm:p-6 overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 text-gray-400"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {isEditing ? (
          <div className="space-y-4">
            <h3 className="text-xl font-light text-gray-800 mb-4">編輯</h3>
            {item.type === "deadline" ? (
              <>
                <div>
                  <label className="block text-sm text-gray-600 mb-2">標題</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-2">類型</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="exam">考試</option>
                    <option value="assignment">作業</option>
                    <option value="project">專題</option>
                    <option value="other">其他</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-2">截止日期</label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-2">截止時間</label>
                  <input
                    type="time"
                    value={formData.dueTime}
                    onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-2">預估時間（小時）</label>
                  <input
                    type="number"
                    value={formData.estimatedHours}
                    onChange={(e) => setFormData({ ...formData, estimatedHours: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm text-gray-600 mb-2">標題</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-2">開始時間</label>
                  <input
                    type="datetime-local"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-2">結束時間</label>
                  <input
                    type="datetime-local"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-2">持續時間（小時）</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="4"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </>
            )}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleUpdate}
                className="flex-1 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
              >
                儲存
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h3 className="text-xl font-light text-gray-800 mb-2">
                {item.type === "deadline" ? (item.data as Deadline).title : (item.data as StudyBlock).title}
              </h3>
              {item.type === "deadline" && (
                <div className="flex items-center gap-2 mb-4">
                  <span className={`${TYPE_COLORS[(item.data as Deadline).type].badge} px-3 py-1 rounded-lg text-sm`}>
                    {TYPE_NAMES[(item.data as Deadline).type]}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-4 mb-8 text-sm">
              {item.type === "deadline" ? (
                <>
                  <div>
                    <span className="text-gray-500">截止日期：</span>
                    <span className="text-gray-800 ml-2">
                      {dayjs((item.data as Deadline).dueDate).format("YYYY 年 M 月 D 日 HH:mm")}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">估計時間：</span>
                    <span className="text-gray-800 ml-2">{(item.data as Deadline).estimatedHours} 小時</span>
                  </div>
                  <div>
                    <span className="text-gray-500">剩餘時間：</span>
                    <span className="text-gray-800 ml-2">
                      {(() => {
                        const days = dayjs((item.data as Deadline).dueDate).diff(dayjs(), "day");
                        if (days < 0) return `已過期 ${Math.abs(days)} 天`;
                        if (days === 0) return "今天截止";
                        return `剩餘 ${days} 天`;
                      })()}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="text-gray-500">開始時間：</span>
                    <span className="text-gray-800 ml-2">
                      {dayjs((item.data as StudyBlock).startTime).format("YYYY 年 M 月 D 日 HH:mm")}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">結束時間：</span>
                    <span className="text-gray-800 ml-2">
                      {dayjs((item.data as StudyBlock).endTime).format("YYYY 年 M 月 D 日 HH:mm")}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">持續時間：</span>
                    <span className="text-gray-800 ml-2">{(item.data as StudyBlock).duration} 小時</span>
                  </div>
                  <div>
                    <span className="text-gray-500">進度：</span>
                    <span className="text-gray-800 ml-2">
                      {(item.data as StudyBlock).blockIndex} / {(item.data as StudyBlock).totalBlocks}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setIsEditing(true)}
                className="w-full px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
              >
                編輯
              </button>
              <button
                onClick={handleDelete}
                className="w-full px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
              >
                刪除
              </button>
              <button
                onClick={onClose}
                className="w-full px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                關閉
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Add Deadline Modal Component
function AddDeadlineModal({
  clickedDate,
  token,
  onClose,
  onSuccess,
}: {
  clickedDate: { date: Date; hour: number };
  token: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    title: "",
    type: "assignment" as "exam" | "assignment" | "project" | "other",
    dueDate: dayjs(clickedDate.date).format("YYYY-MM-DD"),
    dueTime: `${clickedDate.hour.toString().padStart(2, "0")}:00`,
    estimatedHours: 2,
  });

  const handleSubmit = async () => {
    if (!token || !formData.title) {
      alert("請填寫標題");
      return;
    }

    try {
      const url = `${window.location.origin}/api/deadlines?token=${encodeURIComponent(token)}`;
      const dueDateTime = new Date(`${formData.dueDate}T${formData.dueTime}:00`);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          type: formData.type,
          dueDate: dueDateTime.toISOString(),
          estimatedHours: formData.estimatedHours,
        }),
      });

      if (!response.ok) {
        throw new Error("建立失敗");
      }

      // 立即刷新資料
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Create error:", error);
      alert("建立失敗，請稍後再試");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-4 sm:p-6 w-full max-w-md h-[90vh] sm:h-auto overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 text-gray-400"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3 className="text-xl font-light text-gray-800 mb-6">新增 Deadline</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-2">標題</label>
            <input
              type="text"
              placeholder="輸入標題..."
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-2">類型</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-transparent text-sm"
            >
              <option value="exam">考試</option>
              <option value="assignment">作業</option>
              <option value="project">專題</option>
              <option value="other">其他</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-2">截止日期</label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-2">截止時間</label>
            <input
              type="time"
              value={formData.dueTime}
              onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-2">預估時間（小時）</label>
            <input
              type="number"
              placeholder="2"
              min="1"
              value={formData.estimatedHours}
              onChange={(e) => setFormData({ ...formData, estimatedHours: parseFloat(e.target.value) || 2 })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-transparent text-sm"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
          >
            建立
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SchedulePage() {
  return (
    <>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center">
            <div className="text-center">
              <div className="text-lg font-light text-gray-700 mb-2">載入中...</div>
              <div className="text-sm text-gray-500">正在載入你的時程表</div>
            </div>
          </div>
        }
      >
        <ScheduleContent />
      </Suspense>
    </>
  );
}
