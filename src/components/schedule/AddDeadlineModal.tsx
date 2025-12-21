"use client";

import { useState } from "react";
import dayjs from "dayjs";

interface AddDeadlineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  token: string;
  initialDate?: Date | null;
}

export default function AddDeadlineModal({
  isOpen,
  onClose,
  onSuccess,
  token,
  initialDate,
}: AddDeadlineModalProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"exam" | "assignment" | "project" | "other">("assignment");
  const [dueDate, setDueDate] = useState(
    initialDate ? dayjs(initialDate).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD")
  );
  const [estimatedHours, setEstimatedHours] = useState(2);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const response = await fetch(
        `${baseUrl}/api/deadlines?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({
            title,
            type,
            // 如果 dueDate 沒有時間部分，加上 23:59
            dueDate: dueDate.includes("T") ? dueDate : `${dueDate}T23:59`,
            estimatedHours,
          }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "建立失敗，請稍後再試");
        return;
      }

      // 重置表單
      setTitle("");
      setType("assignment");
      setDueDate(dayjs().format("YYYY-MM-DD"));
      setEstimatedHours(2);
      setError(null);

      // 關閉模態框並刷新列表
      onClose();
      onSuccess();
    } catch (err) {
      setError("建立時發生錯誤，請稍後再試");
      console.error("Failed to create deadline", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setTitle("");
      setType("assignment");
      setDueDate(dayjs().format("YYYY-MM-DD"));
      setEstimatedHours(2);
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />

      {/* 模態框 */}
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">新增 Deadline</h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <svg
              className="w-6 h-6 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* 標題 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              標題 *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f8cff] focus:border-transparent outline-none transition-all"
              placeholder="例如：OS HW4"
            />
          </div>

          {/* 類型 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              類型 *
            </label>
            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as "exam" | "assignment" | "project" | "other")
              }
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f8cff] focus:border-transparent outline-none transition-all"
            >
              <option value="exam">📝 考試</option>
              <option value="assignment">📄 作業</option>
              <option value="project">📦 專題</option>
              <option value="other">📌 其他</option>
            </select>
          </div>

          {/* 截止日期 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              截止日期 *
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f8cff] focus:border-transparent outline-none transition-all"
            />
          </div>

          {/* 預估時間 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              預估時間（小時）*
            </label>
            <select
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(Number(e.target.value))}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f8cff] focus:border-transparent outline-none transition-all"
            >
              <option value={1}>1 小時</option>
              <option value={2}>2 小時</option>
              <option value={3}>3 小時</option>
              <option value={4}>4 小時</option>
              <option value={8}>8 小時</option>
            </select>
          </div>

          {/* 錯誤訊息 */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* 按鈕 */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="flex-1 px-4 py-2 bg-[#4f8cff] text-white rounded-lg font-medium hover:bg-[#3d7ae8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "建立中..." : "建立"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

