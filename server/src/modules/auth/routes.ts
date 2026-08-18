import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { parseBody, parseParams, idParam } from '../../lib/http.js';
import { authenticate, currentUser, hashPassword, requirePermission, verifyPassword } from '../../lib/auth.js';
import { unauthorized, badRequest, notFound } from '../../lib/errors.js';
import { ROLE_PERMISSIONS } from '../../lib/rbac.js';
import { recordAudit } from '../../lib/audit.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['ADMIN', 'MANAGER', 'SALES', 'PRODUCTION', 'INSTALLER']),
  phone: z.string().optional(),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/login', async (request) => {
    const { email, password } = parseBody(loginSchema, request);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      throw unauthorized('Incorrect email or password');
    }
    const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
    const token = app.jwt.sign(payload);
    await recordAudit({
      entity: 'User', entityId: user.id, action: 'login', userId: user.id,
      summary: `${user.name} signed in`,
    });
    return { token, user: { ...payload, permissions: ROLE_PERMISSIONS[user.role] } };
  });

  app.get('/me', { preHandler: authenticate }, async (request) => {
    const auth = currentUser(request);
    const user = await prisma.user.findUnique({
      where: { id: auth.id },
      select: { id: true, email: true, name: true, role: true, phone: true, active: true },
    });
    if (!user || !user.active) throw unauthorized('Account is no longer active');
    return { ...user, permissions: ROLE_PERMISSIONS[user.role] };
  });

  app.post('/change-password', { preHandler: authenticate }, async (request) => {
    const body = parseBody(
      z.object({ currentPassword: z.string(), newPassword: z.string().min(8) }),
      request,
    );
    const auth = currentUser(request);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.id } });
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      throw badRequest('Current password is incorrect');
    }
    await prisma.user.update({
      where: { id: auth.id },
      data: { passwordHash: await hashPassword(body.newPassword) },
    });
    return { ok: true };
  });

  // --- user administration -------------------------------------------------

  app.get('/users', { preHandler: [authenticate] }, async () => {
    // Every role needs the roster for assignment dropdowns; secrets stay out.
    return prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, role: true, phone: true, active: true },
      orderBy: { name: 'asc' },
    });
  });

  app.post('/users', { preHandler: [authenticate, requirePermission('user:manage')] }, async (request) => {
    const body = parseBody(userSchema, request);
    const actor = currentUser(request);
    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        name: body.name,
        role: body.role,
        phone: body.phone,
        passwordHash: await hashPassword(body.password),
      },
      select: { id: true, name: true, email: true, role: true, phone: true, active: true },
    });
    await recordAudit({
      entity: 'User', entityId: user.id, action: 'create', userId: actor.id,
      summary: `Created user ${user.name} (${user.role})`,
    });
    return user;
  });

  app.patch('/users/:id', { preHandler: [authenticate, requirePermission('user:manage')] }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(userSchema.partial(), request);
    const actor = currentUser(request);
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw notFound('User not found');

    const user = await prisma.user.update({
      where: { id },
      data: {
        email: body.email?.toLowerCase(),
        name: body.name,
        role: body.role,
        phone: body.phone,
        ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
      },
      select: { id: true, name: true, email: true, role: true, phone: true, active: true },
    });
    await recordAudit({
      entity: 'User', entityId: id, action: 'update', userId: actor.id,
      summary: `Updated user ${user.name}`,
    });
    return user;
  });

  app.post('/users/:id/deactivate', { preHandler: [authenticate, requirePermission('user:manage')] }, async (request) => {
    const { id } = parseParams(idParam, request);
    const actor = currentUser(request);
    if (id === actor.id) throw badRequest('You cannot deactivate your own account');
    const user = await prisma.user.update({ where: { id }, data: { active: false } });
    await recordAudit({
      entity: 'User', entityId: id, action: 'update', userId: actor.id,
      summary: `Deactivated user ${user.name}`,
    });
    return { ok: true };
  });
}
