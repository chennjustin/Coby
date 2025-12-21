"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/layout/Header";
import dayjs from "dayjs";

interface ConversationHistoryItem {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ConversationDetail {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  conversationHistory: ConversationHistoryItem[];
  currentFlow?: string | null;
  updatedAt: Date;
}

export default function ConversationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;
  const [conversation, setConversation] = useState<ConversationDetail | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  const fetchConversation = useCallback(async () => {
    try {
      const response = await fetch(`/api/conversations/${userId}`);
      if (response.ok) {
        const data = await response.json();
        setConversation(data);
      } else {
        console.error("獲取對話詳情失敗");
      }
    } catch (error) {
      console.error("獲取對話詳情失敗", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchConversation();
    // 每 10 秒更新一次
    const interval = setInterval(fetchConversation, 10000);
    return () => clearInterval(interval);
  }, [fetchConversation]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-4xl mx-auto px-8 py-8">
        <div className="mb-6">
          <Link
            href="/conversations"
            className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
          >
            ← 返回對話列表
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">對話詳情</h1>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="text-gray-500">載入中...</div>
          </div>
        ) : !conversation ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-gray-500">找不到對話記錄</div>
          </div>
        ) : (
          <>
            {/* 用戶資訊 */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex items-center gap-4">
                {conversation.pictureUrl && (
                  <img
                    src={conversation.pictureUrl}
                    alt={conversation.displayName}
                    className="h-16 w-16 rounded-full"
                  />
                )}
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {conversation.displayName}
                  </h2>
                  <p className="text-sm text-gray-500">{conversation.userId}</p>
                  {conversation.currentFlow && (
                    <p className="text-sm text-blue-600 mt-1">
                      當前流程：{conversation.currentFlow}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 對話歷史 */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                對話歷史 ({conversation.conversationHistory.length} 條)
              </h3>
              <div className="space-y-4">
                {conversation.conversationHistory.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    沒有對話記錄
                  </div>
                ) : (
                  conversation.conversationHistory.map((item, index) => (
                    <div
                      key={index}
                      className={`flex ${
                        item.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg px-4 py-2 ${
                          item.role === "user"
                            ? "bg-blue-600 text-white"
                            : "bg-gray-200 text-gray-900"
                        }`}
                      >
                        <div className="text-sm whitespace-pre-wrap break-words">
                          {item.content}
                        </div>
                        <div
                          className={`text-xs mt-1 ${
                            item.role === "user"
                              ? "text-blue-100"
                              : "text-gray-500"
                          }`}
                        >
                          {dayjs(item.timestamp).format("YYYY-MM-DD HH:mm:ss")}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

