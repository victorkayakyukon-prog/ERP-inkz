import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { env } from './lib/env.js';
import { HttpError } from './lib/errors.js';
import { serialize } from './lib/serialize.js';
import type { AuthUser } from './lib/auth.js';

import { authRoutes } from './modules/auth/routes.js';
import { crmRoutes } from './modules/crm/routes.js';
import { quoteRoutes } from './modules/quotes/routes.js';
import { jobRoutes } from './modules/jobs/routes.js';
import { productionRoutes } from './modules/production/routes.js';
import { inventoryRoutes } from './modules/inventory/routes.js';
import { invoicingRoutes } from './modules/invoicing/routes.js';
import { reportingRoutes } from './modules/reporting/routes.js';
import { fileRoutes } from './modules/files/routes.js';
import { searchRoutes } from './modules/search/routes.js';
import { settingsRoutes } from './modules/settings/routes.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.nodeEnv === 'test' ? false : { level: process.env.LOG_LEVEL ?? 'info' },
    bodyLimit: 10 * 1024 * 1024,
  });

  await app.register(cors, { origin: env.corsOrigin, credentials: true });
  await app.register(jwt, { secret: env.jwtSecret, sign: { expiresIn: '12h' } });
  await app.register(multipart, { limits: { fileSize: 200 * 1024 * 1024, files: 10 } });

  // Decimal -> number on every response, so route handlers never think about it.
  app.addHook('preSerialization', async (_request, _reply, payload) => serialize(payload));

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        details: error.details ?? undefined,
      });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: 'Validation failed', details: error.flatten() });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
        return reply.status(409).send({ error: `A record with that ${target} already exists` });
      }
      if (error.code === 'P2025') return reply.status(404).send({ error: 'Not found' });
      if (error.code === 'P2003') {
        return reply.status(409).send({ error: 'Referenced record is missing or still in use' });
      }
    }
    request.log.error(error);
    const fallback = error as { statusCode?: number; message?: string };
    const status = fallback.statusCode && fallback.statusCode < 500 ? fallback.statusCode : 500;
    return reply.status(status).send({
      error:
        env.nodeEnv === 'production' && status >= 500
          ? 'Internal server error'
          : fallback.message ?? 'Unexpected error',
    });
  });

  app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(crmRoutes, { prefix: '/api' });
  await app.register(quoteRoutes, { prefix: '/api/quotes' });
  await app.register(jobRoutes, { prefix: '/api/jobs' });
  await app.register(productionRoutes, { prefix: '/api' });
  await app.register(inventoryRoutes, { prefix: '/api' });
  await app.register(invoicingRoutes, { prefix: '/api' });
  await app.register(reportingRoutes, { prefix: '/api/reports' });
  await app.register(fileRoutes, { prefix: '/api/files' });
  await app.register(searchRoutes, { prefix: '/api/search' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });

  return app;
}
