import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required env var ${name}`);
  return value;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  storageDriver: (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3',
  nodeEnv: process.env.NODE_ENV ?? 'development',
};
