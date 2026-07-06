import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY: z.string().min(1),
  FIREBASE_STORAGE_BUCKET: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-flash-latest'),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  ADMIN_EMAILS: z.string().optional().default(''),
  PORT: z.coerce.number().default(8080)
});

export const env = envSchema.parse(process.env);
