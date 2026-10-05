import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './core/config.js';
import { requestIdMiddleware } from './core/middleware/requestId.js';
import { httpLogger } from './core/middleware/logging.js';
import { errorHandler, notFoundHandler } from './core/middleware/errorHandler.js';
import { generalApiRateLimiter } from './core/middleware/rateLimiter.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './modules/auth/routes.js';
import { usersRouter } from './modules/users/routes.js';
import { officialsRouter } from './modules/officials/routes.js';
import { notificationsRouter } from './modules/notifications/routes.js';
import { settingsRouter } from './modules/settings/routes.js';
import { calendarsRouter } from './modules/calendars/routes.js';
import { schedulingRouter } from './modules/scheduling/routes.js';
import { roomsRouter } from './modules/rooms/routes.js';
import { holidaysRouter } from './modules/holidays/routes.js';
import { appointmentsRouter } from './modules/appointments/routes.js';
import { tasksRouter } from './modules/tasks/routes.js';
import { visitsRouter } from './modules/visits/routes.js';
import { meetingsRouter } from './modules/meetings/routes.js';
import { delegationsRouter } from './modules/delegations/routes.js';
import { reportsRouter } from './modules/reports/routes.js';
import { auditRouter } from './modules/audit/routes.js';
import { adminOpsRouter } from './modules/adminOps/routes.js';
import { privacyRouter } from './modules/privacy/routes.js';
import { searchRouter } from './modules/search/routes.js';

export function createApp(): express.Application {
  const app = express();

  // Basic security and parsing middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'https:', 'data:'],
          connectSrc: ["'self'", config.WEB_URL, 'http://localhost:5173'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: [config.WEB_URL, 'http://localhost:5173'],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Observability middleware
  app.use(requestIdMiddleware);
  app.use(httpLogger);

  // General rate limit for API endpoints (§17.3: 300/min per user/IP)
  app.use('/api/v1', generalApiRateLimiter);

  // Root endpoint info & portal link
  app.get('/', (_req, res) => {
    res.json({
      success: true,
      service: 'OAMS API Server',
      status: 'online',
      version: '1.0.0',
      webPortal: config.WEB_URL,
      notificationsEndpoint: '/api/v1/notifications',
      health: '/health',
    });
  });

  // Mount API modules
  app.use(healthRouter);
  app.use(authRouter);
  app.use(usersRouter);
  app.use(officialsRouter);
  app.use(notificationsRouter);
  app.use(settingsRouter);
  app.use(calendarsRouter);
  app.use(schedulingRouter);
  app.use(roomsRouter);
  app.use(holidaysRouter);
  app.use(appointmentsRouter);
  app.use(tasksRouter);
  app.use(visitsRouter);
  app.use(meetingsRouter);
  app.use(delegationsRouter);
  app.use(reportsRouter);
  app.use(auditRouter);
  app.use(adminOpsRouter);
  app.use(privacyRouter);
  app.use(searchRouter);

  // Not found & error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
