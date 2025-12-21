"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useParams } from "next/navigation";
import Link from "next/link";

interface Deadline {
  id: string;
  title: string;
  type: string;
  typeName: string;
  dueDate: string;
  dueDateFormatted: string;
  estimatedHours: number;
  daysLeft: number;
  isOverdue: boolean;
  isToday: boolean;
  status: string;
  createdAt: string | null;
}

function DeadlineDetailContent() {
  const searchParams = useSearchParams();
  const params = useParams();
  const token = searchParams.get("token");
  const deadlineId = params.id as string;
  const [deadline, setDeadline] = useState<Deadline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDeadline = async () => {
      if (!token) {
        setError("缺少 token 參數");
        setLoading(false);
        return;
      }

      if (!deadlineId) {
        setError("缺少 deadline ID");
        setLoading(false);
        return;
      }

      try {
        // 使用絕對 URL 以避免在 LINE WebView 中的相對路徑問題
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        const apiUrl = `${baseUrl}/api/schedule/${deadlineId}?token=${encodeURIComponent(token || '')}`;
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
        });
        const data = await response.json();

        if (!data.success) {
          if (response.status === 401) {
            setError("無效的 token，請重新從 LINE Bot 開啟時程表");
          } else if (response.status === 403) {
            setError("無權限訪問此 deadline");
          } else if (response.status === 404) {
            setError("找不到此 deadline");
          } else {
            setError(data.error || "載入 deadline 詳情失敗");
          }
        } else {
          setDeadline(data.data);
        }
      } catch (error) {
        console.error("Failed to fetch deadline", error);
        setError("載入 deadline 詳情時發生錯誤");
      } finally {
        setLoading(false);
      }
    };

    fetchDeadline();
  }, [token, deadlineId]);

  const getTypeEmoji = (type: string) => {
    const emojiMap: Record<string, string> = {
      exam: "📝",
      assignment: "📄",
      project: "📦",
      other: "📌",
    };
    return emojiMap[type] || "📌";
  };

  const getDaysLeftText = (daysLeft: number, isOverdue: boolean, isToday: boolean) => {
    if (isOverdue) {
      return `已過期 ${Math.abs(daysLeft)} 天`;
    }
    if (isToday) {
      return "今天截止";
    }
    return `剩餘 ${daysLeft} 天`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-semibold text-gray-700 mb-2">載入中...</div>
          <div className="text-sm text-gray-500">正在載入 deadline 詳情</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">無法載入詳情</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <Link
            href={`/schedule?token=${token}`}
            className="inline-block mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            返回時程表
          </Link>
        </div>
      </div>
    );
  }

  if (!deadline) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-800">📅 Deadline 詳情</h1>
            <Link
              href={`/schedule?token=${token}`}
              className="text-sm text-blue-500 hover:text-blue-600"
            >
              ← 返回時程表
            </Link>
          </div>
          <p className="text-sm text-gray-600">拯救期末大作戰</p>
        </div>

        {/* Deadline Detail */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div
            className={`p-6 rounded-lg border-2 ${
              deadline.isOverdue
                ? "bg-red-50 border-red-200"
                : deadline.isToday
                ? "bg-orange-50 border-orange-200"
                : "bg-gray-50 border-gray-200"
            }`}
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="text-4xl">{getTypeEmoji(deadline.type)}</span>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-800 mb-1">
                  {deadline.title}
                </h2>
                <span className="inline-block px-3 py-1 bg-gray-200 rounded text-sm text-gray-600">
                  {deadline.typeName}
                </span>
              </div>
            </div>

            <div className="space-y-4 mt-6">
              <div className="flex items-start">
                <span className="font-semibold text-gray-700 w-24">📅 截止日期：</span>
                <span className="text-gray-800">{deadline.dueDateFormatted}</span>
              </div>

              <div className="flex items-start">
                <span className="font-semibold text-gray-700 w-24">⏰ 預估時間：</span>
                <span className="text-gray-800">{deadline.estimatedHours} 小時</span>
              </div>

              <div className="flex items-start">
                <span className="font-semibold text-gray-700 w-24">📊 狀態：</span>
                <span
                  className={`px-3 py-1 rounded text-sm font-semibold ${
                    deadline.status === "done"
                      ? "bg-green-100 text-green-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {deadline.status === "done" ? "已完成" : "進行中"}
                </span>
              </div>

              <div className="flex items-start">
                <span className="font-semibold text-gray-700 w-24">⏳ 剩餘時間：</span>
                <span
                  className={`text-lg font-bold ${
                    deadline.isOverdue
                      ? "text-red-600"
                      : deadline.isToday
                      ? "text-orange-600"
                      : "text-green-600"
                  }`}
                >
                  {deadline.isOverdue && "⚠️ "}
                  {deadline.isToday && "⏰ "}
                  {!deadline.isOverdue && !deadline.isToday && "⏳ "}
                  {getDaysLeftText(
                    deadline.daysLeft,
                    deadline.isOverdue,
                    deadline.isToday
                  )}
                </span>
              </div>

              {deadline.createdAt && (
                <div className="flex items-start">
                  <span className="font-semibold text-gray-700 w-24">📝 建立時間：</span>
                  <span className="text-gray-600">
                    {new Date(deadline.createdAt).toLocaleDateString("zh-TW", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>此頁面為只讀模式，編輯請回到 LINE Bot</p>
        </div>
      </div>
    </div>
  );
}

export default function DeadlineDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="text-xl font-semibold text-gray-700 mb-2">載入中...</div>
            <div className="text-sm text-gray-500">正在載入 deadline 詳情</div>
          </div>
        </div>
      }
    >
      <DeadlineDetailContent />
    </Suspense>
  );
}

