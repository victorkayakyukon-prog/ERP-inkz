import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { env } from './env.js';

/**
 * File storage behind a tiny interface so the S3 driver can be dropped in
 * without touching the upload routes. See docs/INTEGRATIONS.md.
 */
export interface StoredFile {
  storageKey: string;
  filename: string;
  size: number;
}

export interface StorageDriver {
  save(stream: Readable, originalName: string, folder: string): Promise<StoredFile>;
  localPath(storageKey: string): string | null;
  remove(storageKey: string): Promise<void>;
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);

/** Formats a sign shop actually receives from designers. */
export const ALLOWED_EXTENSIONS = new Set([
  '.ai', '.pdf', '.eps', '.svg', '.psd', '.cdr',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic',
  '.zip', '.dxf', '.plt', '.txt', '.csv',
]);

export const isPreviewable = (mimeType: string): boolean => IMAGE_TYPES.has(mimeType);

class LocalStorage implements StorageDriver {
  constructor(private readonly root: string) {}

  async save(stream: Readable, originalName: string, folder: string): Promise<StoredFile> {
    const ext = extname(originalName).toLowerCase();
    const filename = `${randomUUID()}${ext}`;
    const storageKey = `${folder}/${filename}`;
    const target = join(this.root, storageKey);
    await mkdir(dirname(target), { recursive: true });
    await pipeline(stream, createWriteStream(target));
    const { size } = await stat(target);
    return { storageKey, filename, size };
  }

  localPath(storageKey: string): string {
    // Resolve and confine to the upload root so a crafted key cannot escape it.
    const full = resolve(this.root, storageKey);
    const root = resolve(this.root);
    if (!full.startsWith(root + '/')) throw new Error('Invalid storage key');
    return full;
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.localPath(storageKey), { force: true });
  }
}

/**
 * S3-compatible driver — intentionally unimplemented. Wiring it up means
 * adding @aws-sdk/client-s3 and filling these three methods in; nothing else
 * in the codebase touches the filesystem directly.
 */
class S3Storage implements StorageDriver {
  async save(): Promise<StoredFile> {
    throw new Error('TODO: S3 storage driver is not implemented — set STORAGE_DRIVER=local');
  }
  localPath(): null {
    return null;
  }
  async remove(): Promise<void> {
    throw new Error('TODO: S3 storage driver is not implemented — set STORAGE_DRIVER=local');
  }
}

export const storage: StorageDriver =
  env.storageDriver === 's3' ? new S3Storage() : new LocalStorage(env.uploadDir);

export const uploadRoot = resolve(env.uploadDir);
