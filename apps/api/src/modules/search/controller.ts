import { Request, Response } from 'express';
import { searchService } from './service.js';
import { searchQuerySchema } from '@oams/shared';

export class SearchController {
  async search(req: Request, res: Response): Promise<void> {
    const query = searchQuerySchema.parse(req.query);
    const result = await searchService.search(req.user!.orgId, query, req.user);
    res.json({ success: true, data: result });
  }
}

export const searchController = new SearchController();
