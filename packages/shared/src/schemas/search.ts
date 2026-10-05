import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(100),
  types: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchResultItemSchema = z.object({
  id: z.string(),
  type: z.enum(['appointment', 'official', 'task', 'visit']),
  title: z.string(),
  subtitle: z.string().optional(),
  status: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  url: z.string().optional(),
});
export type SearchResultItem = z.infer<typeof searchResultItemSchema>;

export const searchResponseSchema = z.object({
  query: z.string(),
  total: z.number(),
  results: z.array(searchResultItemSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
