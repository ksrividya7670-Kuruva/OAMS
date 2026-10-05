import knex, { type Knex } from 'knex';
import knexConfig from '../../knexfile.js';
import { config } from './config.js';
import { logger } from './logger.js';

const environment = config.NODE_ENV;
const dbConfig = knexConfig[environment] || knexConfig.development;

export const db: Knex = knex(dbConfig);

export interface ServiceHealth {
  status: 'ok' | 'error' | 'disabled';
  latencyMs?: number;
  error?: string;
}

export async function checkDbHealth(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await db.raw('SELECT 1');
    return {
      status: 'ok',
      latencyMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, 'Database health check failed');
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: message,
    };
  }
}
