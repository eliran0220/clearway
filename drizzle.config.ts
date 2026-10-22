import { defineConfig } from 'drizzle-kit';

// Run drizzle-kit from the repo root. Reads DATABASE_URL from .env when present.
try {
  process.loadEnvFile('.env');
} catch {
  // no .env file: rely on the environment (CI sets DATABASE_URL directly)
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/db/src/schema.ts',
  out: './packages/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
