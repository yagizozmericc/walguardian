import type { ScheduleStatus } from "@/modules/savings/savings.types";

export const SCHEDULE_LABEL: Record<ScheduleStatus, string> = {
  completed: "Completed",
  ahead: "Ahead of plan",
  on_track: "On track",
  behind: "Behind plan",
  overdue: "Overdue",
  not_applicable: "—",
};

export const SCHEDULE_TEXT: Record<ScheduleStatus, string> = {
  completed: "text-positive",
  ahead: "text-foreground",
  on_track: "text-foreground",
  behind: "text-warning",
  overdue: "text-critical",
  not_applicable: "text-subtle",
};
