import { Logger } from "@/lib/utils/logger";
import { IDeadline } from "@/models/Deadline";

export class DeadlineMatcherService {
  /**
   * 根據標題模糊匹配 deadline
   * @param title 用戶提供的標題（可能是部分匹配）
   * @param deadlines 所有待匹配的 deadlines
   * @returns 匹配的 deadline，如果有多個匹配項返回 null
   */
  findDeadlineByTitle(title: string, deadlines: IDeadline[]): IDeadline | null {
    if (!title || deadlines.length === 0) {
      return null;
    }

    const normalizedTitle = title.trim().toLowerCase();

    // 完全匹配
    const exactMatch = deadlines.find(
      (d) => d.title.toLowerCase() === normalizedTitle
    );
    if (exactMatch) {
      return exactMatch;
    }

    // 包含匹配（deadline 標題包含用戶輸入）
    const containsMatches = deadlines.filter((d) =>
      d.title.toLowerCase().includes(normalizedTitle)
    );
    if (containsMatches.length === 1) {
      return containsMatches[0];
    }

    // 包含匹配（用戶輸入包含 deadline 標題）
    const reverseMatches = deadlines.filter((d) =>
      normalizedTitle.includes(d.title.toLowerCase())
    );
    if (reverseMatches.length === 1) {
      return reverseMatches[0];
    }

    // 如果有多個匹配項，返回 null（需要用戶選擇）
    if (containsMatches.length > 1 || reverseMatches.length > 1) {
      Logger.info("找到多個匹配的 deadline", {
        title,
        matches: containsMatches.length + reverseMatches.length,
      });
      return null;
    }

    return null;
  }

  /**
   * 根據標題查找所有可能的匹配項
   * @param title 用戶提供的標題
   * @param deadlines 所有待匹配的 deadlines
   * @returns 所有匹配的 deadlines
   */
  findAllMatchesByTitle(title: string, deadlines: IDeadline[]): IDeadline[] {
    if (!title || deadlines.length === 0) {
      return [];
    }

    const normalizedTitle = title.trim().toLowerCase();

    const matches: IDeadline[] = [];

    // 完全匹配
    deadlines.forEach((d) => {
      if (d.title.toLowerCase() === normalizedTitle) {
        matches.push(d);
      }
    });

    // 包含匹配
    deadlines.forEach((d) => {
      const deadlineTitle = d.title.toLowerCase();
      if (
        deadlineTitle.includes(normalizedTitle) ||
        normalizedTitle.includes(deadlineTitle)
      ) {
        // 避免重複
        if (!matches.find((m) => m._id.toString() === d._id.toString())) {
          matches.push(d);
        }
      }
    });

    return matches;
  }
}

