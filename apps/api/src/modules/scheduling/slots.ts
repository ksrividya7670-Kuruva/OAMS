import { db } from '../../core/db.js';
import {
  Requirement,
  type SmartSlotInput,
  type SmartSlotResponse,
  type SmartSlotResult,
} from '@oams/shared';
import { schedulingEngine } from './engine.js';

interface TimeInterval {
  start: Date;
  end: Date;
}

export class SmartSlotEngine {
  /**
   * Smart Slot Recommendation Algorithm (§11.3)
   */
  async recommendSlots(orgId: string, input: SmartSlotInput): Promise<SmartSlotResponse> {
    const now = new Date();
    const durationMin = input.durationMin || 30;
    const durationMs = durationMin * 60 * 1000;

    // 1. Calculate Search Range (§11.3 Step 1): default next 14 days, max 31 days
    const rangeStartDate = input.rangeStart
      ? new Date(input.rangeStart)
      : new Date(now.getTime() + (input.respectMinNotice ? 24 * 60 * 60 * 1000 : 0));

    // Normalize to beginning of day
    rangeStartDate.setHours(9, 0, 0, 0);

    const maxEnd = new Date(rangeStartDate.getTime() + 31 * 24 * 60 * 60 * 1000);
    const requestedEnd = input.rangeEnd
      ? new Date(input.rangeEnd)
      : new Date(rangeStartDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const rangeEndDate = requestedEnd < maxEnd ? requestedEnd : maxEnd;
    rangeEndDate.setHours(18, 0, 0, 0);

    const requiredOfficials = input.officials.filter(
      (o) => (o.requirement || Requirement.REQUIRED) === Requirement.REQUIRED,
    );
    const optionalOfficials = input.officials.filter((o) => o.requirement === Requirement.OPTIONAL);

    // Fetch rooms if room required
    const candidateRooms = input.roomRequired
      ? await db('rooms')
          .where('org_id', orgId)
          .where('is_active', true)
          .andWhere((qb) => {
            if (input.minCapacity) {
              qb.where('capacity', '>=', input.minCapacity);
            }
          })
          .orderBy('capacity', 'asc')
      : [];

    const candidateSlots: SmartSlotResult[] = [];
    const totalDays = Math.max(
      1,
      Math.round((rangeEndDate.getTime() - rangeStartDate.getTime()) / (24 * 60 * 60 * 1000)),
    );

    // Iterate through each day in range
    const currentDay = new Date(rangeStartDate);
    let dayIndex = 0;

    while (currentDay <= rangeEndDate) {
      const dayWeekday = currentDay.getDay() === 0 ? 7 : currentDay.getDay(); // 1=Mon..7=Sun
      const dateStr = currentDay.toISOString().substring(0, 10);

      // Skip weekends if no availability rules exist for weekend
      if (dayWeekday > 5) {
        currentDay.setDate(currentDay.getDate() + 1);
        dayIndex++;
        continue;
      }

      // Check non-optional holidays for this day
      const holiday = await db('holidays')
        .where({ org_id: orgId, date: dateStr, is_optional: false })
        .first();

      if (holiday) {
        currentDay.setDate(currentDay.getDate() + 1);
        dayIndex++;
        continue;
      }

      // 2. Build free intervals for all REQUIRED officials (§11.3 Step 2)
      // Standard working hours window: 09:30 - 17:30
      const workDayStart = new Date(currentDay);
      workDayStart.setHours(9, 30, 0, 0);
      const workDayEnd = new Date(currentDay);
      workDayEnd.setHours(17, 30, 0, 0);

      // Slide 15-min intervals (§11.3 Step 4)
      const slotStepMs = 15 * 60 * 1000;
      let slotCursor = new Date(workDayStart);
      let dayCandidates = 0;

      while (slotCursor.getTime() + durationMs <= workDayEnd.getTime()) {
        const slotStart = new Date(slotCursor);
        const slotEnd = new Date(slotStart.getTime() + durationMs);

        // Don't recommend slots in the past
        if (slotStart <= now) {
          slotCursor = new Date(slotCursor.getTime() + slotStepMs);
          continue;
        }

        // 5. Evaluate conflicts against scheduling check
        const conflictCheck = await schedulingEngine.checkConflicts(orgId, {
          officials: input.officials,
          startAt: slotStart.toISOString(),
          endAt: slotEnd.toISOString(),
          durationMin,
          roomId: candidateRooms[0]?.id || null,
          minCapacity: input.minCapacity,
          priority: input.priority,
          meetingMode: input.meetingMode,
          respectMinNotice: input.respectMinNotice,
        });

        // Drop candidates failing any HARD check (§11.3 Step 5)
        const hasHardConflict = conflictCheck.conflicts.some((c) => c.severity === 'HARD');

        if (!hasHardConflict) {
          // 6. Score candidate (§11.3 Step 6)
          let score = 50; // base score
          const reasons: string[] = ['All required officials free'];

          // +40 inside requester-preferred window
          if (input.preferredWindows && input.preferredWindows.length > 0) {
            const matchesPreferred = input.preferredWindows.some((pw) => {
              if (pw.date !== dateStr) return false;
              const [prefStartH, prefStartM] = pw.from.split(':').map(Number);
              const [prefEndH, prefEndM] = pw.to.split(':').map(Number);
              const prefStart = new Date(currentDay);
              prefStart.setHours(prefStartH, prefStartM, 0, 0);
              const prefEnd = new Date(currentDay);
              prefEnd.setHours(prefEndH, prefEndM, 0, 0);
              return slotStart >= prefStart && slotEnd <= prefEnd;
            });

            if (matchesPreferred) {
              score += 40;
              reasons.push('Inside your preferred window');
            }
          }

          // +20 earlier date (linear decay over range)
          const dateWeight = Math.max(0, Math.round(20 * (1 - dayIndex / totalDays)));
          score += dateWeight;
          if (dateWeight >= 15) {
            reasons.push('Earlier available date');
          }

          // +15 all OPTIONAL officials free
          if (optionalOfficials.length > 0) {
            const hasOptionalConflict = conflictCheck.conflicts.some((c) => c.optional);
            if (!hasOptionalConflict) {
              score += 15;
              reasons.push('All optional officials free');
            }
          }

          // +10 preferred room free
          let selectedRoomId: string | null = null;
          let selectedRoomName: string | null = null;
          if (input.roomRequired && candidateRooms.length > 0) {
            const freeRoom = candidateRooms[0];
            selectedRoomId = freeRoom.id;
            selectedRoomName = freeRoom.name;
            score += 10;
            reasons.push(`${freeRoom.name} available`);
          }

          // +10 keeps >= 15 min gap either side
          const hasBufferConflict = conflictCheck.conflicts.some((c) => c.code === 'BUFFER');
          if (!hasBufferConflict) {
            score += 10;
            reasons.push('15-min buffer kept before next meeting');
          }

          candidateSlots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            roomId: selectedRoomId,
            roomName: selectedRoomName,
            score,
            reasons,
          });

          dayCandidates++;
          if (dayCandidates >= 3) {
            break;
          }
        }

        slotCursor = new Date(slotCursor.getTime() + slotStepMs);
      }

      if (candidateSlots.length >= 10) {
        break;
      }

      currentDay.setDate(currentDay.getDate() + 1);
      dayIndex++;
    }

    // 7. Sort by score descending and return top 5 (max 10) (§11.3 Step 7)
    candidateSlots.sort((a, b) => b.score - a.score);
    const topSlots = candidateSlots.slice(0, 5);

    return { slots: topSlots };
  }
}

export const smartSlotEngine = new SmartSlotEngine();
