import bcrypt from 'bcryptjs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@prisma/client';
import { forbidden, unauthorized } from './errors.js';
import { assertPermission, type Permission, roleHas } from './rbac.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** Fastify preHandler: requires a valid bearer token. */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw unauthorized('Invalid or expired session');
  }
}

/** Fastify preHandler factory: requires a permission on top of authentication. */
export function requirePermission(...permissions: Permission[]) {
  return async function guard(request: FastifyRequest): Promise<void> {
    const user = request.user;
    if (!user) throw unauthorized();
    for (const permission of permissions) assertPermission(user.role, permission);
  };
}

export function requireRole(...roles: Role[]) {
  return async function guard(request: FastifyRequest): Promise<void> {
    const user = request.user;
    if (!user) throw unauthorized();
    if (!roles.includes(user.role)) throw forbidden(`Requires role: ${roles.join(' or ')}`);
  };
}

export const currentUser = (request: FastifyRequest): AuthUser => {
  if (!request.user) throw unauthorized();
  return request.user;
};

export const canSeePricing = (request: FastifyRequest): boolean =>
  !!request.user && roleHas(request.user.role, 'pricing:read');
