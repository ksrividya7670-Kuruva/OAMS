import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationMetaSchema = z.object({
  nextCursor: z.string().nullable().optional(),
  hasMore: z.boolean().optional(),
  totalCount: z.number().int().optional(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export const errorDetailSchema = z.object({
  field: z.string().optional(),
  message: z.string(),
  code: z.string().optional(),
});

export const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(errorDetailSchema).optional(),
  }),
});

export const createSuccessEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z.record(z.unknown()).optional(),
  });

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  uptimeSec: z.number(),
  timestamp: z.string(),
  version: z.string(),
  services: z.object({
    database: z.object({
      status: z.enum(['ok', 'error', 'disabled']),
      latencyMs: z.number().optional(),
      error: z.string().optional(),
    }),
    redis: z.object({
      status: z.enum(['ok', 'error', 'disabled']),
      latencyMs: z.number().optional(),
      error: z.string().optional(),
    }),
  }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
