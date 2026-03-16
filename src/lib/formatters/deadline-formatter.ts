import { IDeadline } from "@/models/Deadline";
import { IStudyBlock } from "@/models/StudyBlock";
import { formatForDisplay, formatForDisplayLocale } from "@/lib/utils/timezone";
import { DeadlineService } from "@/services/deadline/deadline.service";

const deadlineService = new DeadlineService();

export const TYPE_EMOJI: Record<string, string> = {
  exam: "📝",
  assignment: "📄",
  project: "📦",
  other: "📌",
};

export const TYPE_TEXT: Record<string, string> = {
  exam: "考試",
  assignment: "作業",
  project: "專題",
  other: "其他",
};

export function getTypeEmoji(type: string): string {
  return TYPE_EMOJI[type] ?? "📌";
}

export function getTypeText(type: string): string {
  return TYPE_TEXT[type] ?? "其他";
}

export function getDaysLeft(dueDate: Date | string): number {
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  return deadlineService.calculateDaysLeft(due);
}

export function getDaysLeftText(dueDate: Date | string): string {
  const daysLeft = getDaysLeft(dueDate);
  return daysLeft < 0
    ? `已過期 ${Math.abs(daysLeft)} 天`
    : daysLeft === 0
    ? "今天截止"
    : `剩餘 ${daysLeft} 天`;
}

export function formatDeadlineDueDate(dueDate: Date | string): string {
  return formatForDisplayLocale(dueDate);
}

export function formatDeadlineSummary(deadline: IDeadline): string {
  const emoji = getTypeEmoji(deadline.type);
  const daysText = getDaysLeftText(deadline.dueDate);
  return `${emoji} ${deadline.title}\n   ${daysText}`;
}

export function formatStudyBlockTime(block: IStudyBlock): string {
  const start = formatForDisplay(block.startTime, "Asia/Taipei", "HH:mm");
  const end = formatForDisplay(block.endTime, "Asia/Taipei", "HH:mm");
  return `${start}-${end}（${block.duration}小時）`;
}
