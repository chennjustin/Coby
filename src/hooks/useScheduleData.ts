import { useState, useEffect } from "react";
import dayjs from "dayjs";

export interface Deadline {
  id: string;
  title: string;
  type: "exam" | "assignment" | "project" | "other";
  dueDate: string; // ISO string
  estimatedHours: number;
  status: "pending" | "done";
}

export interface StudyBlock {
  id: string;
  deadlineId: string;
  date: string; // ISO string
  startTime: string; // ISO string
  endTime: string; // ISO string
  duration: number; // hours
  title: string;
  blockIndex: number;
  totalBlocks: number;
  status: "pending" | "done";
  type: "exam" | "assignment" | "project" | "other";
}

interface UseDeadlinesResult {
  deadlines: Deadline[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface UseStudyBlocksResult {
  studyBlocks: StudyBlock[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDeadlines(
  token: string | null,
  weekStart?: Date,
  weekEnd?: Date
): UseDeadlinesResult {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeadlines = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 確保在客戶端環境中執行
      if (typeof window === "undefined") {
        setLoading(false);
        return;
      }

      const url = new URL(`${window.location.origin}/api/deadlines`);
      url.searchParams.set("token", token);
      url.searchParams.set("status", "pending");

      console.log("Fetching deadlines from:", url.toString());
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || "Failed to fetch deadlines" };
        }
        throw new Error(errorData.error || "Failed to fetch deadlines");
      }
      
      const data = await response.json();
      console.log("Deadlines API response:", { ok: response.ok, status: response.status, data });

      // 如果提供了週範圍，過濾 deadlines
      let filteredDeadlines = data.data || [];
      if (weekStart && weekEnd) {
        filteredDeadlines = filteredDeadlines.filter((deadline: Deadline) => {
          const dueDate = dayjs(deadline.dueDate);
          return (
            dueDate.isAfter(dayjs(weekStart).subtract(1, "day")) &&
            dueDate.isBefore(dayjs(weekEnd).add(1, "day"))
          );
        });
      }

      setDeadlines(filteredDeadlines);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setDeadlines([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeadlines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, weekStart, weekEnd]);

  return {
    deadlines,
    loading,
    error,
    refetch: fetchDeadlines,
  };
}

export function useStudyBlocks(
  token: string | null,
  weekStart?: Date,
  weekEnd?: Date
): UseStudyBlocksResult {
  const [studyBlocks, setStudyBlocks] = useState<StudyBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStudyBlocks = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 確保在客戶端環境中執行
      if (typeof window === "undefined") {
        setLoading(false);
        return;
      }

      const url = new URL(`${window.location.origin}/api/study-blocks`);
      url.searchParams.set("token", token);
      
      if (weekStart) {
        url.searchParams.set("startDate", weekStart.toISOString());
      }
      if (weekEnd) {
        url.searchParams.set("endDate", weekEnd.toISOString());
      }

      console.log("Fetching study blocks from:", url.toString());
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || "Failed to fetch study blocks" };
        }
        throw new Error(errorData.error || "Failed to fetch study blocks");
      }
      
      const data = await response.json();
      console.log("Study blocks API response:", { ok: response.ok, status: response.status, data });

      setStudyBlocks(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStudyBlocks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudyBlocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, weekStart, weekEnd]);

  return {
    studyBlocks,
    loading,
    error,
    refetch: fetchStudyBlocks,
  };
}

