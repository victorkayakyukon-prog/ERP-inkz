import { createReadStream } from 'node:fs';
import { extname } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { authenticate, currentUser, requirePermission } from '../../lib/auth.js';
import { idParam, parseParams, parseQuery } from '../../lib/http.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { ALLOWED_EXTENSIONS, isPreviewable, storage } from '../../lib/storage.js';
import { recordAudit } from '../../lib/audit.js';

const linkSchema = z.object({
  jobId: z.string().optional(),
  companyId: z.string().optional(),
  quoteId: z.string().optional(),
  installId: z.string().optional(),
  kind: z.enum(['attachment', 'artwork', 'proof', 'install_photo']).default('attachment'),
});

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  /**
   * Multipart upload. Attach a file to a job, company, quote or install by
   * passing the id as a query parameter, e.g. POST /api/files?jobId=...
   */
  app.post('/', async (request) => {
    const links = parseQuery(linkSchema, request);
    const actor = currentUser(request);
    const parts = request.files();
    const saved = [];

    for await (const part of parts) {
      const extension = extname(part.filename).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        throw badRequest(
          `${part.filename}: ${extension || 'files without an extension'} is not an accepted format`,
        );
      }
      const folder = links.jobId
        ? `jobs/${links.jobId}`
        : links.quoteId
          ? `quotes/${links.quoteId}`
          : links.companyId
            ? `companies/${links.companyId}`
            : links.installId
              ? `installs/${links.installId}`
              : 'misc';

      const stored = await storage.save(part.file, part.filename, folder);
      const asset = await prisma.fileAsset.create({
        data: {
          filename: stored.filename,
          originalName: part.filename,
          mimeType: part.mimetype,
          size: stored.size,
          storageKey: stored.storageKey,
          kind: links.kind,
          uploadedById: actor.id,
          jobId: links.jobId ?? null,
          companyId: links.companyId ?? null,
          quoteId: links.quoteId ?? null,
          installId: links.installId ?? null,
        },
        include: { uploadedBy: { select: { id: true, name: true } } },
      });
      saved.push({ ...asset, previewable: isPreviewable(asset.mimeType) });
    }

    if (!saved.length) throw badRequest('No file was uploaded');
    if (links.jobId) {
      await recordAudit({
        entity: 'Job', entityId: links.jobId, action: 'update', userId: actor.id,
        summary: `Uploaded ${saved.length} file(s): ${saved.map((f) => f.originalName).join(', ')}`,
      });
    }
    return saved;
  });

  app.get('/', async (request) => {
    const query = parseQuery(linkSchema.partial(), request);
    if (!query.jobId && !query.companyId && !query.quoteId && !query.installId) {
      throw badRequest('Specify jobId, companyId, quoteId or installId');
    }
    const files = await prisma.fileAsset.findMany({
      where: {
        ...(query.jobId ? { jobId: query.jobId } : {}),
        ...(query.companyId ? { companyId: query.companyId } : {}),
        ...(query.quoteId ? { quoteId: query.quoteId } : {}),
        ...(query.installId ? { installId: query.installId } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return files.map((file) => ({ ...file, previewable: isPreviewable(file.mimeType) }));
  });

  /**
   * Streams the file. Images render inline so the browser can be used as the
   * thumbnail source; everything else downloads with its original name.
   */
  app.get('/:id/content', async (request, reply) => {
    const { id } = parseParams(idParam, request);
    const file = await prisma.fileAsset.findUnique({ where: { id } });
    if (!file) throw notFound('File not found');

    const path = storage.localPath(file.storageKey);
    if (!path) throw badRequest('This storage driver cannot stream files directly');

    const disposition = isPreviewable(file.mimeType) ? 'inline' : 'attachment';
    reply.header('Content-Type', file.mimeType);
    reply.header(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(file.originalName)}"`,
    );
    return reply.send(createReadStream(path));
  });

  app.delete('/:id', { preHandler: requirePermission('job:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const file = await prisma.fileAsset.findUnique({ where: { id } });
    if (!file) throw notFound('File not found');
    await storage.remove(file.storageKey).catch(() => undefined);
    await prisma.fileAsset.delete({ where: { id } });
    return { ok: true };
  });
}
