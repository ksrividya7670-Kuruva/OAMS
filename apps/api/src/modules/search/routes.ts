import { Router } from 'express';
import { searchController } from './controller.js';
import { requireAuth } from '../../core/auth/middleware.js';

export const searchRouter: Router = Router();

searchRouter.get('/api/v1/search', requireAuth, (req, res, next) =>
  searchController.search(req, res).catch(next),
);
