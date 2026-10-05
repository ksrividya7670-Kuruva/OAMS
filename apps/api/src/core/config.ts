import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_URL: z.string().url().default('http://localhost:4000'),
  WEB_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('postgres://oams_user:oams_password@localhost:5432/oams_db'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_FROM: z.string().default('"OAMS Appointment" <apointments@smru.edu.in>'),
  SENDER_NAME: z.string().default('OAMS Appointment'),
  SENDER_EMAIL: z.string().default('apointments@smru.edu.in'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.coerce.boolean().optional(),
  POWER_AUTOMATE_WEBHOOK_URL: z.string().url().optional(),
  POWER_AUTOMATE_SECRET: z.string().optional(),
  ADMIN_EMAIL: z.string().default('apointments@smru.edu.in'),
  OFFICIAL_EMAIL: z.string().default('apointments@smru.edu.in'),
  OAMS_APP_NAME: z.string().default('OAMS SMRU - Official Appointment Management System'),
  JWT_SECRET: z
    .string()
    .min(32)
    .default('super-secret-development-key-that-is-at-least-32-bytes-long'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  throw new Error('Invalid environment configuration');
}

export const config = parsed.data;
