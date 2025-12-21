"use client";

import { useState, useEffect } from "react";
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

interface DeadlineModalProps {
  isOpen: boolean;
  deadline: Deadline | null;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
  token: string;
}

const TYPE_EMOJIS: Record<string, string> = {
  exam: "📝",
  assignment: "📄",
  project: "📦",
  other: "📌",
};

export default function DeadlineModal({
  isOpen,
  deadline,
  onClose,
  onUpdate,
  onDelete,
  token,
}: DeadlineModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 編輯表單狀態
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"exam" | "assignment" | "project" | "other">("assignment");
  const [dueDate, setDueDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState(2);
  const [status, setStatus] = useState<"pending" | "done">("pending");

  // 當 deadline 改變時，更新表單狀態
  useEffect(() => {
    if (deadline) {
      setTitle(deadline.title);
      setType(deadline.type);
      setDueDate(dayjs(deadline.dueDate).format("YYYY-MM-DD"));
      setEstimatedHours(deadline.estimatedHours);
      setStatus(deadline.status);
    }
  }, [deadline]);

  const handleEdit = () => {
    setIsEditing(true);
    setError(null);
  };

  const handleCancelEdit = () => {
    if (deadline) {
      setTitle(deadline.title);
      setType(deadline.type);
      setDueDate(dayjs(deadline.dueDate).format("YYYY-MM-DD"));
      setEstimatedHours(deadline.estimatedHours);
      setStatus(deadline.status);
    }
    setIsEditing(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!deadline) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const response = await fetch(
        `${baseUrl}/api/deadlines/${deadline.id}?token=${encodeURIComponent(token)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({
            title,
            type,
            dueDate,
            estimatedHours,
            status,
          }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "更新失敗，請稍後再試");
        return;
      }

      setIsEditing(false);
      setError(null);
      onUpdate();
    } catch (err) {
      setError("更新時發生錯誤，請稍後再試");
      console.error("Failed to update deadline", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deadline) return;

    if (!confirm("確定要刪除這個 Deadline 嗎？此操作無法復原。")) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const response = await fetch(
        `${baseUrl}/api/deadlines/${deadline.id}?token=${encodeURIComponent(token)}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
        }
      );

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "刪除失敗，請稍後再試");
        return;
      }

      onDelete();
      onClose();
    } catch (err) {
      setError("刪除時發生錯誤，請稍後再試");
      console.error("Failed to delete deadline", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting && !isDeleting) {
      setIsEditing(false);
      setError(null);
      onClose();
    }
  };

  if (!isOpen || !deadline) return null;

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
          <h2 className="text-xl font-semibold text-gray-800">
            {isEditing ? "編輯 Deadline" : "Deadline 詳情"}
          </h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting || isDeleting}
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
        <div className="p-6 space-y-6">
          {isEditing ? (
            /* 編輯模式 */
            <>
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

              {/* 狀態 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  狀態 *
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "pending" | "done")}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f8cff] focus:border-transparent outline-none transition-all"
                >
                  <option value="pending">進行中</option>
                  <option value="done">已完成</option>
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
                  onClick={handleCancelEdit}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSubmitting || !title.trim()}
                  className="flex-1 px-4 py-2 bg-[#4f8cff] text-white rounded-lg font-medium hover:bg-[#3d7ae8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "儲存中..." : "儲存"}
                </button>
              </div>
            </>
          ) : (
            /* 詳情模式 */
            <>
              {/* 圖標和標題 */}
              <div className="flex items-center gap-4">
                <div className="text-5xl">{emoji}</div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-800 mb-2">
                    {deadline.title}
                  </h3>
                  <span className="inline-block px-3 py-1 bg-gray-100 rounded-lg text-sm text-gray-700">
                    {deadline.typeName}
                  </span>
                </div>
              </div>

              {/* 詳細資訊 */}
              <div className="space-y-4 pt-4 border-t border-gray-200">
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
                    className={`px-3 py-1 rounded-lg text-sm font-semibold ${
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
                    {deadline.isToday && !deadline.isOverdue && "⏰ "}
                    {!deadline.isOverdue && !deadline.isToday && "⏳ "}
                    {getDaysLeftText()}
                  </span>
                </div>
              </div>

              {/* 錯誤訊息 */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* 操作按鈕 */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleEdit}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 border border-[#4f8cff] text-[#4f8cff] rounded-lg font-medium hover:bg-[#e8f1ff] transition-colors disabled:opacity-50"
                >
                  編輯
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 border border-red-500 text-red-500 rounded-lg font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? "刪除中..." : "刪除"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

