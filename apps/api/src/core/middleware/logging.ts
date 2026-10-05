import { pinoHttp } from 'pino-http';
import type { IncomingMessage, ServerResponse } from 'http';
import { logger } from '../logger.js';

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req: IncomingMessage) =>
    (req.headers['x-request-id'] as string) || (req as unknown as { id?: string }).id || '',
  customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: {
    ignore: (req: IncomingMessage) => req.url === '/health' && process.env.NODE_ENV === 'test',
  },
});
