import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { badRequest } from './errors.js';

export const parseBody = <T extends z.ZodTypeAny>(schema: T, request: FastifyRequest): z.infer<T> => {
  const result = schema.safeParse(request.body ?? {});
  if (!result.success) throw badRequest('Validation failed', result.error.flatten());
  return result.data;
};

export const parseQuery = <T extends z.ZodTypeAny>(schema: T, request: FastifyRequest): z.infer<T> => {
  const result = schema.safeParse(request.query ?? {});
  if (!result.success) throw badRequest('Invalid query parameters', result.error.flatten());
  return result.data;
};

export const idParam = z.object({ id: z.string().min(1) });

export const parseParams = <T extends z.ZodTypeAny>(schema: T, request: FastifyRequest): z.infer<T> => {
  const result = schema.safeParse(request.params ?? {});
  if (!result.success) throw badRequest('Invalid path parameters', result.error.flatten());
  return result.data;
};

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const paginate = <T>(data: T[], total: number, page: number, pageSize: number): Page<T> => ({
  data,
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

export const skipTake = (page: number, pageSize: number) => ({
  skip: (page - 1) * pageSize,
  take: pageSize,
});

/** Optional-string helper: treats "" from a form as "clear this field". */
export const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullish();

export const optionalDate = z
  .union([z.coerce.date(), z.literal(''), z.null()])
  .transform((value) => (value === '' || value === null ? null : (value as Date)))
  .optional();

export const decimalInput = z.union([z.coerce.number(), z.string()]);
