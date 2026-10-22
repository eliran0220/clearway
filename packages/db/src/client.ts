import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/** HTTP-based Postgres client: no connection pool to manage, which suits Lambda. */
export function createDb(url: string | undefined = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and add the Neon connection string.');
  return drizzle({ client: neon(url), schema });
}

export type Db = ReturnType<typeof createDb>;
