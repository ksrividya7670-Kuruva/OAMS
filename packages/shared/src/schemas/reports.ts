import { z } from 'zod';

export const reportOverviewQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  officialId: z.string().uuid().optional(),
});
export type ReportOverviewQueryInput = z.infer<typeof reportOverviewQuerySchema>;

export const kpiMetricSchema = z.object({
  value: z.number(),
  unit: z.string(),
  formula: z.string(),
  description: z.string(),
  dateRange: z.object({
    from: z.string(),
    to: z.string(),
  }),
});
export type KpiMetric = z.infer<typeof kpiMetricSchema>;

export const officialVolumeSchema = z.object({
  officialId: z.string().uuid(),
  title: z.string(),
  count: z.number().int(),
});
export type OfficialVolume = z.infer<typeof officialVolumeSchema>;

export const statusVolumeSchema = z.object({
  status: z.string(),
  count: z.number().int(),
});
export type StatusVolume = z.infer<typeof statusVolumeSchema>;

export const priorityVolumeSchema = z.object({
  priority: z.string(),
  count: z.number().int(),
});
export type PriorityVolume = z.infer<typeof priorityVolumeSchema>;

export const roomUtilizationItemSchema = z.object({
  roomId: z.string().uuid(),
  roomName: z.string(),
  capacity: z.number().int(),
  bookedMinutes: z.number(),
  availableMinutes: z.number(),
  utilizationPercent: z.number(),
});
export type RoomUtilizationItem = z.infer<typeof roomUtilizationItemSchema>;

export const reportsOverviewDtoSchema = z.object({
  dateRange: z.object({
    from: z.string(),
    to: z.string(),
  }),
  kpis: z.object({
    volume: kpiMetricSchema,
    averageConfirmTimeMin: kpiMetricSchema,
    noShowRate: kpiMetricSchema,
    cancellationRate: kpiMetricSchema,
    roomUtilization: kpiMetricSchema,
    slaBreaches: kpiMetricSchema,
  }),
  breakdowns: z.object({
    byOfficial: z.array(officialVolumeSchema),
    byStatus: z.array(statusVolumeSchema),
    byPriority: z.array(priorityVolumeSchema),
    roomUtilization: z.array(roomUtilizationItemSchema),
  }),
});
export type ReportsOverviewDto = z.infer<typeof reportsOverviewDtoSchema>;
