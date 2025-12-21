"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";

interface Stats {
  totalUsers: number;
  totalConversations: number;
  todayConversations: number;
  activeUsers: number;
}

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    // 每 30 秒更新一次統計資料
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/stats");
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("獲取統計資料失敗", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">管理後台</h1>
          <p className="text-gray-600 mt-2">查看系統統計和對話記錄</p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="text-gray-500">載入中...</div>
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm font-medium text-gray-500">總用戶數</div>
              <div className="text-3xl font-bold text-gray-900 mt-2">
                {stats.totalUsers}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm font-medium text-gray-500">總對話數</div>
              <div className="text-3xl font-bold text-gray-900 mt-2">
                {stats.totalConversations}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm font-medium text-gray-500">
                今日新增對話
              </div>
              <div className="text-3xl font-bold text-gray-900 mt-2">
                {stats.todayConversations}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm font-medium text-gray-500">
                活躍用戶（7天）
              </div>
              <div className="text-3xl font-bold text-gray-900 mt-2">
                {stats.activeUsers}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-red-500">無法載入統計資料</div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            快速連結
          </h2>
          <div className="flex gap-4">
            <Link
              href="/conversations"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              查看對話記錄
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

