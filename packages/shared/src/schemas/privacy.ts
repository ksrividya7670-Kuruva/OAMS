import { z } from 'zod';

export const privacyExportInputSchema = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().email().optional(),
});
export type PrivacyExportInput = z.infer<typeof privacyExportInputSchema>;

export const privacyEraseInputSchema = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  reason: z.string().min(3).max(500),
});
export type PrivacyEraseInput = z.infer<typeof privacyEraseInputSchema>;

export const privacyExportDtoSchema = z.object({
  exportedAt: z.string(),
  dataPrincipal: z.object({
    id: z.string().optional(),
    email: z.string().optional(),
    fullName: z.string().optional(),
  }),
  appointments: z.array(z.record(z.unknown())),
  visits: z.array(z.record(z.unknown())),
  notifications: z.array(z.record(z.unknown())),
});
export type PrivacyExportDto = z.infer<typeof privacyExportDtoSchema>;
