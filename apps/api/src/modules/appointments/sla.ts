import { Priority } from '@oams/shared';

const WORK_START_HOUR = 9;
const WORK_START_MINUTE = 30;
const WORK_END_HOUR = 18;
const WORK_END_MINUTE = 30;

/**
 * Calculates SLA due date based strictly on org working hours (09:30–18:30 IST)
 * excluding weekends and public holidays per §9 and §24 Q8.
 *
 * @param submittedAt Date the appointment was submitted
 * @param priority Priority enum (LOW, MEDIUM, HIGH, URGENT)
 * @param holidayDates List of holiday date strings in 'YYYY-MM-DD'
 * @returns Date when the SLA expires
 */
export function calculateSlaDueDate(
  submittedAt: Date,
  priority: Priority,
  holidayDates: string[] = [],
): Date {
  // Priority to total required working minutes
  let remainingMinutes: number;
  switch (priority) {
    case Priority.HIGH:
      remainingMinutes = 4 * 60; // 4 working hours = 240 mins
      break;
    case Priority.LOW:
      remainingMinutes = 3 * 9 * 60; // 3 working days (9h/day) = 1620 mins
      break;
    case Priority.URGENT:
      remainingMinutes = 30; // 30 minutes for urgent staff requests
      break;
    case Priority.MEDIUM:
    default:
      remainingMinutes = 1 * 9 * 60; // 1 working day (9h/day) = 540 mins
      break;
  }

  // Work with a mutable date starting from submittedAt
  const current = new Date(submittedAt.getTime());

  const isWorkingDay = (d: Date): boolean => {
    const day = d.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false;
    const dateStr = d.toISOString().substring(0, 10);
    return !holidayDates.includes(dateStr);
  };

  const getDayWorkStart = (d: Date): Date => {
    const start = new Date(d);
    start.setHours(WORK_START_HOUR, WORK_START_MINUTE, 0, 0);
    return start;
  };

  const getDayWorkEnd = (d: Date): Date => {
    const end = new Date(d);
    end.setHours(WORK_END_HOUR, WORK_END_MINUTE, 0, 0);
    return end;
  };

  // If initial time is before today's start, jump to start
  // If after today's end or on a non-working day, advance to next working day start
  while (!isWorkingDay(current) || current.getTime() >= getDayWorkEnd(current).getTime()) {
    current.setDate(current.getDate() + 1);
    current.setHours(WORK_START_HOUR, WORK_START_MINUTE, 0, 0);
  }

  const todayStart = getDayWorkStart(current);
  if (current.getTime() < todayStart.getTime()) {
    current.setTime(todayStart.getTime());
  }

  // Now consume remaining minutes across working days
  while (remainingMinutes > 0) {
    const todayEnd = getDayWorkEnd(current);
    const availableMinutesToday = Math.max(
      0,
      Math.floor((todayEnd.getTime() - current.getTime()) / (60 * 1000)),
    );

    if (remainingMinutes <= availableMinutesToday) {
      current.setTime(current.getTime() + remainingMinutes * 60 * 1000);
      remainingMinutes = 0;
    } else {
      remainingMinutes -= availableMinutesToday;
      // Advance to next day at 09:30
      do {
        current.setDate(current.getDate() + 1);
        current.setHours(WORK_START_HOUR, WORK_START_MINUTE, 0, 0);
      } while (!isWorkingDay(current));
    }
  }

  return current;
}
