import { db } from '../../core/db.js';
import {
  ReportOverviewQueryInput,
  ReportsOverviewDto,
  AppointmentStatus,
  Visibility,
} from '@oams/shared';

export class ReportsService {
  async getOverview(orgId: string, query: ReportOverviewQueryInput): Promise<ReportsOverviewDto> {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 3600 * 1000); // Past 30 days
    const fromDate = query.from ? new Date(query.from) : defaultFrom;
    const toDate = query.to ? new Date(query.to) : now;

    const fromIso = fromDate.toISOString();
    const toIso = toDate.toISOString();

    // 1. Fetch appointments in range (strictly excluding personal visibility per §17.4, §22 Track 10)
    const baseQuery = db('appointments')
      .where('org_id', orgId)
      .where('created_at', '>=', fromDate)
      .where('created_at', '<=', toDate)
      .whereNot('visibility', Visibility.PERSONAL);

    if (query.officialId) {
      baseQuery.andWhere('primary_official_id', query.officialId);
    }

    const appointments = await baseQuery.select('*');

    // Total volume
    const totalVolume = appointments.length;

    // 2. Average time submit -> confirm (minutes)
    let totalConfirmMinutes = 0;
    let confirmedCount = 0;

    for (const apt of appointments) {
      if (apt.submitted_at && apt.confirmed_at) {
        const subTime = new Date(apt.submitted_at).getTime();
        const confTime = new Date(apt.confirmed_at).getTime();
        if (confTime >= subTime) {
          totalConfirmMinutes += (confTime - subTime) / (1000 * 60);
          confirmedCount++;
        }
      }
    }

    const avgConfirmTimeMin =
      confirmedCount > 0 ? Math.round((totalConfirmMinutes / confirmedCount) * 10) / 10 : 0;

    // 3. No-show rate and cancellation rate
    const concludedCount = appointments.filter((a) =>
      [
        AppointmentStatus.COMPLETED,
        AppointmentStatus.CLOSED,
        AppointmentStatus.NO_SHOW,
        AppointmentStatus.CONFIRMED,
      ].includes(a.status),
    ).length;

    const noShowCount = appointments.filter((a) => a.status === AppointmentStatus.NO_SHOW).length;

    const noShowRate =
      concludedCount > 0 ? Math.round((noShowCount / concludedCount) * 10000) / 100 : 0;

    const cancelledCount = appointments.filter(
      (a) => a.status === AppointmentStatus.CANCELLED,
    ).length;

    const cancellationRate =
      totalVolume > 0 ? Math.round((cancelledCount / totalVolume) * 10000) / 100 : 0;

    // 4. SLA breaches
    let slaBreachCount = 0;
    for (const apt of appointments) {
      if (apt.sla_due_at) {
        const slaDue = new Date(apt.sla_due_at).getTime();
        if (apt.confirmed_at) {
          if (new Date(apt.confirmed_at).getTime() > slaDue) {
            slaBreachCount++;
          }
        } else if (
          [
            AppointmentStatus.UNDER_REVIEW,
            AppointmentStatus.INFO_REQUESTED,
            AppointmentStatus.AWAITING_REQUESTER,
          ].includes(apt.status) &&
          now.getTime() > slaDue
        ) {
          slaBreachCount++;
        }
      }
    }

    // 5. Breakdowns by status & priority
    const statusMap = new Map<string, number>();
    const priorityMap = new Map<string, number>();
    const officialMap = new Map<string, number>();

    for (const apt of appointments) {
      statusMap.set(apt.status, (statusMap.get(apt.status) || 0) + 1);
      priorityMap.set(apt.priority, (priorityMap.get(apt.priority) || 0) + 1);
      officialMap.set(apt.primary_official_id, (officialMap.get(apt.primary_official_id) || 0) + 1);
    }

    const byStatus = Array.from(statusMap.entries()).map(([status, count]) => ({
      status,
      count,
    }));

    const byPriority = Array.from(priorityMap.entries()).map(([priority, count]) => ({
      priority,
      count,
    }));

    // Fetch official titles for official breakdown
    const officials = await db('officials').where('org_id', orgId).select('id', 'title');

    const byOfficial = officials.map((off) => ({
      officialId: off.id,
      title: off.title,
      count: officialMap.get(off.id) || 0,
    }));

    // 6. Room Utilization
    const rooms = await db('rooms')
      .where('org_id', orgId)
      .where('is_active', true)
      .select('id', 'name', 'capacity');

    const daysCount = Math.max(
      1,
      Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 3600 * 24)),
    );
    const standardDailyMinutes = 480; // 8 working hours per day
    const availableMinutesPerRoom = daysCount * standardDailyMinutes;

    // Sum booked minutes per room from calendar events or appointments
    const roomBookings = await db('calendar_events')
      .whereNotNull('room_id')
      .where('status', 'ACTIVE')
      .where('start_at', '>=', fromDate)
      .where('end_at', '<=', toDate)
      .select('room_id', 'start_at', 'end_at');

    const roomBookedMinutesMap = new Map<string, number>();
    for (const b of roomBookings) {
      const durationMin =
        (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / (1000 * 60);
      roomBookedMinutesMap.set(
        b.room_id,
        (roomBookedMinutesMap.get(b.room_id) || 0) + Math.max(0, durationMin),
      );
    }

    let totalRoomUtilizationSum = 0;
    const roomUtilization = rooms.map((r) => {
      const booked = roomBookedMinutesMap.get(r.id) || 0;
      const utilPercent =
        availableMinutesPerRoom > 0
          ? Math.min(100, Math.round((booked / availableMinutesPerRoom) * 10000) / 100)
          : 0;

      totalRoomUtilizationSum += utilPercent;

      return {
        roomId: r.id,
        roomName: r.name,
        capacity: r.capacity || 1,
        bookedMinutes: booked,
        availableMinutes: availableMinutesPerRoom,
        utilizationPercent: utilPercent,
      };
    });

    const avgRoomUtilization =
      rooms.length > 0 ? Math.round((totalRoomUtilizationSum / rooms.length) * 100) / 100 : 0;

    return {
      dateRange: { from: fromIso, to: toIso },
      kpis: {
        volume: {
          value: totalVolume,
          unit: 'appointments',
          formula: 'Count(appointments within date range)',
          description: 'Total number of appointment requests created in the period',
          dateRange: { from: fromIso, to: toIso },
        },
        averageConfirmTimeMin: {
          value: avgConfirmTimeMin,
          unit: 'minutes',
          formula: 'Sum(confirmed_at - submitted_at) / Count(confirmed_appointments)',
          description: 'Average duration between requester submission and final confirmation',
          dateRange: { from: fromIso, to: toIso },
        },
        noShowRate: {
          value: noShowRate,
          unit: '%',
          formula: '(Count(status == NO_SHOW) / Count(attended or concluded meetings)) * 100',
          description: 'Percentage of scheduled appointments marked as No-Show',
          dateRange: { from: fromIso, to: toIso },
        },
        cancellationRate: {
          value: cancellationRate,
          unit: '%',
          formula: '(Count(status == CANCELLED) / Count(total requests)) * 100',
          description: 'Percentage of all requested appointments that were cancelled',
          dateRange: { from: fromIso, to: toIso },
        },
        roomUtilization: {
          value: avgRoomUtilization,
          unit: '%',
          formula: '(Total booked minutes / Total standard operating minutes) * 100',
          description: 'Average facility room utilization across all active meeting rooms',
          dateRange: { from: fromIso, to: toIso },
        },
        slaBreaches: {
          value: slaBreachCount,
          unit: 'breaches',
          formula: 'Count(appointments where confirmed_at > sla_due_at or review exceeded SLA)',
          description: 'Count of appointment reviews that breached the defined SLA target',
          dateRange: { from: fromIso, to: toIso },
        },
      },
      breakdowns: {
        byOfficial,
        byStatus,
        byPriority,
        roomUtilization,
      },
    };
  }

  async exportAppointmentsCsv(orgId: string, query: ReportOverviewQueryInput): Promise<string> {
    const defaultFrom = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const fromDate = query.from ? new Date(query.from) : defaultFrom;
    const toDate = query.to ? new Date(query.to) : new Date();

    const appointments = await db('appointments')
      .where('appointments.org_id', orgId)
      .where('appointments.created_at', '>=', fromDate)
      .where('appointments.created_at', '<=', toDate)
      .whereNot('appointments.visibility', Visibility.PERSONAL)
      .leftJoin('officials', 'appointments.primary_official_id', 'officials.id')
      .select(
        'appointments.reference_no',
        'appointments.status',
        'appointments.priority',
        'appointments.meeting_mode',
        'appointments.created_at',
        'appointments.submitted_at',
        'appointments.confirmed_at',
        'officials.title as official_title',
      )
      .orderBy('appointments.created_at', 'desc');

    const headers = [
      'Reference No',
      'Official',
      'Status',
      'Priority',
      'Meeting Mode',
      'Created At',
      'Submitted At',
      'Confirmed At',
    ];

    const rows = appointments.map((a) => [
      a.reference_no,
      `"${(a.official_title || '').replace(/"/g, '""')}"`,
      a.status,
      a.priority,
      a.meeting_mode,
      a.created_at ? new Date(a.created_at).toISOString() : '',
      a.submitted_at ? new Date(a.submitted_at).toISOString() : '',
      a.confirmed_at ? new Date(a.confirmed_at).toISOString() : '',
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}

export const reportsService = new ReportsService();
